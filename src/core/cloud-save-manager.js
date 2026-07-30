(function(global){
  const ns=global.PetHabitPlatform=global.PetHabitPlatform||{};
  const STATE_KEY="petHabitCloudSaveV1_state";
  const SNAPSHOT_INDEX_KEY="petHabitCloudSaveV1_localSnapshots";
  const BINDING_KEY="petHabitCloudSaveV1_familyBinding";
  const STATUS={
    LOCAL_ONLY:"local_only",
    CHECKING:"checking",
    NOT_SIGNED_IN:"not_signed_in",
    NEEDS_INITIAL_BACKUP:"needs_initial_backup",
    CLOUD_AVAILABLE:"cloud_available",
    SYNCED:"synced",
    DIRTY:"dirty",
    SAVING:"saving",
    RESTORING:"restoring",
    WAITING_NETWORK:"waiting_network",
    FAILED:"failed",
    CONFLICT:"conflict",
    WAITING_CHOICE:"waiting_choice"
  };
  function readJson(storage,key,fallback){try{return ns.safeJsonParse?ns.safeJsonParse(storage.getItem(key),fallback):JSON.parse(storage.getItem(key)||"null")||fallback;}catch(e){return fallback;}}
  function writeJson(storage,key,value){storage.setItem(key,JSON.stringify(value));}
  function safeErrorDetails(error){
    const src=error&&error.details&&typeof error.details==="object"?error.details:{};
    const out={};
    ["code","message","details","hint","rpc_name","operation","retry_count","source","result","status","stage"].forEach(k=>{
      if(src[k]!=null&&k!=="raw")out[k]=src[k];
    });
    return out;
  }
  function withStage(stage,result,extra={}){
    if(!result||result.ok!==false)return result;
    result.error=result.error||{code:"unknown_error",message:"未知錯誤",retryable:false};
    const details={...safeErrorDetails(result.error),...extra,stage};
    result.error.details=details;
    return result;
  }
  function cloudDebug(event,details){
    if(!global.DEVELOPER_MODE)return;
    const d=details&&typeof details==="object"?details:{};
    const safe={};
    ["stage","code","message","details","hint","rpc_name","operation","retry_count","source","result","status"].forEach(k=>{
      if(d[k]!=null)safe[k]=d[k];
    });
    try{console.log("[CloudSave] "+event,safe);}catch(e){}
  }
  function candidateTime(candidate){
    const t=Date.parse(candidate&&candidate.summary&&candidate.summary.lastPlayedAt||"");
    return Number.isFinite(t)?t:0;
  }
  class CloudSaveManager{
    constructor({cloudRepository,authManager,exporter,platformAdapter,analyticsAdapter,debounceMs=9000}={}){
      this.cloud=cloudRepository||new ns.SupabaseCloudRepository({writeEnabled:true});
      this.auth=authManager||null;
      this.exporter=exporter||new ns.PlayerSaveExporter();
      this.platform=platformAdapter||new ns.WebPlatformAdapter();
      this.analytics=analyticsAdapter||new ns.AnalyticsAdapter();
      this.debounceMs=debounceMs;
      this.storage=global.localStorage;
      this.timer=null;this.singleFlight=null;this.retryCount=0;this.maxRetries=3;
      this.subscribers=[];
      this.state={status:STATUS.LOCAL_ONLY,dirty:false,initialCheckDone:false,conflict:false,lastSyncedAt:"",lastError:null,metadata:null,baselineChecksum:"",retryCount:0};
      this.loadState();
    }
    readBinding(){return readJson(this.storage,BINDING_KEY,null);}
    writeBinding(binding){try{writeJson(this.storage,BINDING_KEY,binding);this.state.binding=binding;this.saveState();return ns.ok(binding);}catch(e){return ns.err("binding_write_failed",String(e&&e.message||e),false);}}
    loadState(){const saved=readJson(this.storage,STATE_KEY,null);if(saved&&typeof saved==="object")this.state={...this.state,...saved};return this.state;}
    saveState(){try{writeJson(this.storage,STATE_KEY,this.state);}catch(e){}this.notify();}
    subscribe(fn){if(typeof fn!=="function")return ()=>{};this.subscribers.push(fn);try{fn(this.getStatus());}catch(e){}return()=>{this.subscribers=this.subscribers.filter(x=>x!==fn);};}
    notify(){const s=this.getStatus();this.subscribers.slice().forEach(fn=>{try{fn(s);}catch(e){}});}
    getAuthStatus(){return this.auth&&this.auth.getStatus?this.auth.getStatus():null;}
    isSignedIn(){const s=this.getAuthStatus();return !!(s&&s.status==="signed_in"&&s.sessionPresent);}
    getStatus(){return {...this.state,binding:this.state.binding||this.readBinding(),hasRemote:!!this.state.metadata,online:this.platform.isOnline(),signedIn:this.isSignedIn(),busy:this.state.status===STATUS.SAVING||this.state.status===STATUS.RESTORING||this.state.status===STATUS.CHECKING};}
    setStatus(status,patch={}){this.state={...this.state,...patch,status};this.saveState();}
    track(event,params={}){try{if(global.MaggieAnalytics&&global.MaggieAnalytics.track)global.MaggieAnalytics.track(event,{...params,game_version:global.APP_VERSION||global.VERSION||"",schema_version:String(global.APP_SCHEMA_VERSION||2),online_state:this.platform.isOnline()?"online":"offline"});}catch(e){}}
    failStage(stage,result,extra={}){
      const res=withStage(stage,result,extra);
      const err=res&&res.error||{};
      const safeLog={
        stage,
        code:err.code||"unknown_error",
        message:err.message||"未知錯誤",
        details:err.details&&err.details.details,
        hint:err.details&&err.details.hint,
        rpc_name:err.details&&err.details.rpc_name,
        operation:extra.operation||"manual_backup",
        retry_count:this.state.retryCount||0
      };
      try{console.log("[CloudSave] manual_backup_failed",safeLog);}catch(e){}
      return res;
    }
    async waitForSingleFlight(maxMs=12000){
      const started=Date.now();
      while(this.singleFlight&&Date.now()-started<maxMs){
        await new Promise(resolve=>setTimeout(resolve,150));
      }
      return !this.singleFlight;
    }
    async ensureSignedIn(){
      if(this.isSignedIn()){cloudDebug("session_ok",{operation:"ensureSignedIn"});return ns.ok(true);}
      this.setStatus(STATUS.NOT_SIGNED_IN,{dirty:false,initialCheckDone:false});
      return ns.err("not_signed_in","請先登入 Google",false);
    }
    setExporterContext(candidateId,familyId){
      this.exporter.selectedCandidateId=candidateId||"";
      this.exporter.familyId=familyId||"";
    }
    scanLocalCandidates(){
      const res=this.exporter.discoverLocalSaveCandidates?this.exporter.discoverLocalSaveCandidates():ns.err("candidate_scan_unavailable","本機存檔掃描器尚未準備好",false);
      if(!res.ok)return res;
      const candidates=res.data||[];
      const latestId=candidates.reduce((best,c)=>{
        if(!best)return c;
        return candidateTime(c)>candidateTime(best)?c:best;
      },null);
      this.state.localCandidates=candidates.map(c=>({candidateId:c.candidateId,summary:{...(c.summary||{}),suspectedTest:!!c.suspectedTest,isLatestCandidate:!!(latestId&&latestId.candidateId===c.candidateId),isCurrentDeviceLatest:!!(latestId&&latestId.candidateId===c.candidateId)},playerSummaries:c.playerSummaries,suspectedTest:c.suspectedTest,recognizedSectionCount:c.recognizedSectionCount,notes:c.notes||[],suspectedReasons:c.suspectedReasons||[],isLatestCandidate:!!(latestId&&latestId.candidateId===c.candidateId),isCurrentDeviceLatest:!!(latestId&&latestId.candidateId===c.candidateId),fingerprint:c.fingerprint}));
      this.saveState();
      return ns.ok(candidates);
    }
    getSelectedCandidate(candidateId){
      const res=this.exporter.getCandidateById?this.exporter.getCandidateById(candidateId):ns.err("candidate_scan_unavailable","本機存檔掃描器尚未準備好",false);
      if(!res.ok)return res;
      return ns.ok(res.data);
    }
    async resolveFamilyBinding(candidate){
      const existing=this.readBinding();
      if(existing&&existing.family_id){
        this.setExporterContext(candidate&&candidate.candidateId,existing.family_id);
        try{console.log("[CloudSave] family_binding_resolved",{stage:"binding",has_family:true});}catch(e){}
        return ns.ok(existing);
      }
      if(!this.cloud.getOrCreateFamily)return ns.err("family_binding_missing","雲端家庭綁定尚未準備好",false);
      const familyName=candidate&&candidate.family&&candidate.family.name||"我的家庭";
      const fam=await this.cloud.getOrCreateFamily(familyName);
      if(!fam.ok)return withStage("family_binding",fam);
      const familyId=(fam.data&&fam.data.id)||fam.data&&fam.data.family_id||"";
      if(!familyId)return ns.err("family_binding_missing","無法建立雲端家庭",false);
      const binding={family_id:familyId,active_local_save_fingerprint:candidate&&candidate.fingerprint||"",schema_version:String(global.APP_SCHEMA_VERSION||2),last_synced_checksum:"",last_synced_at:"",candidate_id:candidate&&candidate.candidateId||""};
      const saved=this.writeBinding(binding);
      if(!saved.ok)return saved;
      this.setExporterContext(binding.candidate_id,binding.family_id);
      try{console.log("[CloudSave] family_binding_resolved",{stage:"binding",has_family:true});}catch(e){}
      return ns.ok(binding);
    }
    async prepareFirstBackup(){
      const signed=await this.ensureSignedIn();if(!signed.ok)return this.failStage("ensure_signed_in",signed);
      const candidates=this.scanLocalCandidates();if(!candidates.ok)return this.failStage("export_local",candidates);
      const list=candidates.data||[];
      if(!list.length){this.setStatus(STATUS.FAILED,{initialCheckDone:true,lastError:{code:"no_local_data",message:"沒有可備份的遊戲進度"},localCandidates:[]});return this.failStage("export_local",ns.err("no_local_data","沒有可備份的遊戲進度",false));}
      let remote=await this.cloud.getCloudSaveMetadata();
      if(!remote.ok)return this.failStage("metadata",remote);
      const cloudMeta=remote.data||null;
      if(cloudMeta){
        this.setStatus(STATUS.CLOUD_AVAILABLE,{initialCheckDone:true,metadata:cloudMeta,localCandidates:this.state.localCandidates,confirmationRequired:false});
        return ns.err("cloud_save_conflict","偵測到不同的遊戲進度",false,{stage:"metadata",metadata:cloudMeta});
      }
      if(list.length>1){
        this.setStatus(STATUS.NEEDS_INITIAL_BACKUP,{initialCheckDone:true,metadata:null,confirmationRequired:true,confirmationMode:"choose_candidate",localCandidates:this.state.localCandidates});
        return ns.err("multiple_local_candidates","找到多份遊戲進度，請由家長選擇",false,{candidate_count:list.length,candidates:this.state.localCandidates});
      }
      this.setStatus(STATUS.NEEDS_INITIAL_BACKUP,{initialCheckDone:true,metadata:null,confirmationRequired:true,confirmationMode:"confirm_first_backup",selectedCandidateId:list[0].candidateId,selectedCandidateSummary:list[0].summary,localCandidates:this.state.localCandidates});
      try{console.log("[CloudSave] first_backup_confirmation_opened",{candidate_count:1,recognized_section_count:list[0].recognizedSectionCount||0});}catch(e){}
      return ns.err("first_backup_confirmation_required","請先確認要保存的遊戲進度",false,{candidate:this.state.localCandidates[0]});
    }
    selectLocalCandidate(candidateId){
      const candidate=this.getSelectedCandidate(candidateId);
      if(!candidate.ok)return candidate;
      this.setStatus(STATUS.NEEDS_INITIAL_BACKUP,{confirmationRequired:true,confirmationMode:"confirm_first_backup",selectedCandidateId:candidate.data.candidateId,selectedCandidateSummary:candidate.data.summary,selectedCandidateFingerprint:candidate.data.fingerprint});
      try{console.log("[CloudSave] local_candidate_selected",{candidate_count:1,recognized_section_count:candidate.data.recognizedSectionCount||0});}catch(e){}
      return ns.ok({candidateId:candidate.data.candidateId,summary:candidate.data.summary});
    }
    async confirmFirstBackup(candidateId){
      const candidate=this.getSelectedCandidate(candidateId||this.state.selectedCandidateId);
      if(!candidate.ok)return this.failStage("export_local",candidate);
      try{console.log("[CloudSave] first_backup_confirmed",{candidate_count:1,recognized_section_count:candidate.data.recognizedSectionCount||0});}catch(e){}
      const bound=await this.resolveFamilyBinding(candidate.data);
      if(!bound.ok)return this.failStage("family_binding",bound);
      this.setExporterContext(candidate.data.candidateId,bound.data.family_id);
      this.state.confirmationRequired=false;
      this.state.selectedCandidateId=candidate.data.candidateId;
      this.state.selectedCandidateFingerprint=candidate.data.fingerprint;
      this.saveState();
      return this.backupNow("manual_confirmed_first_backup",{confirmed:true,candidate});
    }
    verifyActiveBinding(){
      const binding=this.readBinding();
      if(!binding||!binding.active_local_save_fingerprint)return ns.err("first_backup_confirmation_required","請先確認要保存的遊戲進度",false);
      const candidates=this.scanLocalCandidates();
      if(!candidates.ok)return candidates;
      const match=(candidates.data||[]).find(c=>c.fingerprint===binding.active_local_save_fingerprint);
      if(!match){
        this.setStatus(STATUS.WAITING_CHOICE,{confirmationRequired:true,confirmationMode:"binding_changed",dirty:false});
        try{console.log("[CloudSave] active_binding_changed",{stage:"binding",candidate_count:(candidates.data||[]).length});}catch(e){}
        return ns.err("active_save_binding_changed","偵測到這台裝置的遊戲進度已變更",false);
      }
      this.setExporterContext(match.candidateId,binding.family_id);
      return ns.ok({binding,candidate:match});
    }
    async runSingleFlight(label,fn){
      if(this.singleFlight)return ns.err("operation_in_progress","正在處理上一個同步動作",true);
      this.singleFlight=label;
      try{return await fn();}finally{this.singleFlight=null;}
    }
    exportLocal(){
      const save=this.exporter.exportPlayerSave();
      if(!save.ok)return save;
      const valid=this.exporter.validatePlayerSave(save.data);
      if(!valid.ok)return valid;
      return save;
    }
    createLocalSnapshot(source,preExported){
      try{
        const exported=preExported&&preExported.ok?preExported:this.exportLocal();
        if(!exported.ok)return exported;
        const snapshot={snapshot_id:"local_snap_"+Date.now()+"_"+Math.random().toString(36).slice(2,8),source,created_at:ns.nowIso(),save_version:this.state.metadata&&this.state.metadata.save_version||0,schema_version:String(global.APP_SCHEMA_VERSION||2),game_version:global.APP_VERSION||global.VERSION||"",checksum:exported.data.checksum,device_id:this.platform.getDeviceId(),save_data:exported.data};
        const index=readJson(this.storage,SNAPSHOT_INDEX_KEY,[]);
        index.unshift(snapshot);
        const trimmed=index.slice(0,5);
        writeJson(this.storage,SNAPSHOT_INDEX_KEY,trimmed);
        if(global.backupLocalStorageSnapshot)try{global.backupLocalStorageSnapshot(source);}catch(e){}
        return ns.ok(snapshot);
      }catch(e){
        return ns.err("local_snapshot_failed",String(e&&e.message||e),false);
      }
    }
    async createCloudSnapshot(source,metadata){
      if(!this.cloud.createCloudSnapshot)return ns.ok({status:"snapshot_rpc_unavailable"});
      return await this.cloud.createCloudSnapshot({source,metadata});
    }
    async initialCheck(){
      return this.runSingleFlight("initialCheck",async()=>{
        this.track("cloud_sync_initial_check_started");
        const signed=await this.ensureSignedIn();if(!signed.ok)return signed;
        this.setStatus(STATUS.CHECKING,{lastError:null});
        const candidates=this.scanLocalCandidates();
        if(!candidates.ok){this.setStatus(STATUS.FAILED,{lastError:candidates.error});return candidates;}
        const localMeaningful=(candidates.data||[]).length>0;
        const meta=await this.cloud.getCloudSaveMetadata();
        if(!meta.ok){this.setStatus(STATUS.FAILED,{lastError:meta.error});this.track("cloud_sync_initial_check_completed",{result:"failed",error_code:meta.error&&meta.error.code});return meta;}
        cloudDebug("metadata_ok",{operation:"initial_check",status:meta.data?"found":"empty"});
        const cloudMeta=meta.data||null;
        if(!cloudMeta&&localMeaningful){
          const prepared=await this.prepareFirstBackup();
          this.track("cloud_sync_initial_check_completed",{result:"confirmation_required"});
          return prepared;
        }
        if(cloudMeta&&!localMeaningful){
          this.setStatus(STATUS.CLOUD_AVAILABLE,{initialCheckDone:true,metadata:cloudMeta,dirty:false,baselineChecksum:cloudMeta.checksum||"",confirmationRequired:false});
          this.track("cloud_sync_initial_check_completed",{result:"cloud_available"});
          return ns.ok({mode:"cloud_available",metadata:cloudMeta});
        }
        if(cloudMeta&&localMeaningful){
          const binding=this.readBinding();
          if(!binding||!binding.active_local_save_fingerprint){
            this.setStatus(STATUS.CLOUD_AVAILABLE,{initialCheckDone:true,metadata:cloudMeta,dirty:false,baselineChecksum:cloudMeta.checksum||"",confirmationRequired:true,confirmationMode:"cloud_exists"});
            return ns.err("cloud_save_conflict","偵測到不同的遊戲進度",false,{metadata:cloudMeta});
          }
          const active=this.verifyActiveBinding();
          if(!active.ok)return active;
          const local=this.exportLocal();if(!local.ok)return local;
          const same=(cloudMeta.checksum&&cloudMeta.checksum===local.data.checksum);
          if(same){
            this.setStatus(STATUS.SYNCED,{initialCheckDone:true,metadata:cloudMeta,dirty:false,baselineChecksum:cloudMeta.checksum,lastSyncedAt:cloudMeta.updated_at||ns.nowIso()});
            this.track("cloud_sync_initial_check_completed",{result:"same"});
            return ns.ok({mode:"same",metadata:cloudMeta});
          }
          this.setStatus(STATUS.CONFLICT,{initialCheckDone:true,conflict:true,dirty:true,metadata:cloudMeta,localSummary:this.exporter.summarize(local.data)});
          cloudDebug("conflict_detected",{operation:"initial_check",result:"local_and_cloud_differ"});
          this.track("cloud_save_conflict_detected",{source:"initial_check",conflict_type:"local_and_cloud_differ"});
          return ns.err("cloud_save_conflict","偵測到兩份不同的遊戲進度",false,{metadata:cloudMeta});
        }
        this.setStatus(STATUS.FAILED,{initialCheckDone:true,dirty:false,confirmationRequired:false,lastError:{code:"no_local_data",message:"沒有可備份的遊戲進度"}});
        this.track("cloud_sync_initial_check_completed",{result:"empty"});
        return ns.err("no_local_data","沒有可備份的遊戲進度",false);
      });
    }
    markSaveDirty(reason){
      if(!this.isSignedIn())return ns.ok({status:"local_only"});
      this.state.dirty=true;this.state.lastDirtyAt=ns.nowIso();
      if(this.state.conflict||this.state.status===STATUS.CONFLICT||this.state.status===STATUS.WAITING_CHOICE){this.saveState();return ns.ok({status:"paused_conflict"});}
      const active=this.verifyActiveBinding();
      if(!active.ok){this.saveState();return ns.ok({status:"paused_active_binding_required"});}
      if(!this.state.initialCheckDone){this.saveState();return ns.ok({status:"paused_initial_check_required"});}
      this.setStatus(STATUS.DIRTY,{dirty:true,dirtyReason:reason||"change"});
      this.scheduleAutoSave();
      return ns.ok({status:"dirty"});
    }
    scheduleAutoSave(){
      if(this.timer)clearTimeout(this.timer);
      this.track("cloud_auto_save_scheduled",{source:"dirty"});
      this.timer=setTimeout(()=>this.flushAutoSave(),this.debounceMs);
    }
    async flushAutoSave(){
      if(!this.state.dirty)return ns.ok({status:"clean"});
      if(!this.platform.isOnline()){this.setStatus(STATUS.WAITING_NETWORK);this.track("cloud_save_waiting_for_network",{source:"auto"});return ns.err("offline","等待連線",true);}
      if(this.state.conflict)return ns.err("conflict","等待家長選擇",false);
      if(!this.state.initialCheckDone)return ns.err("initial_check_required","正在確認雲端資料",true);
      this.track("cloud_auto_save_started");
      const res=await this.backupNow("auto_backup");
      if(res.ok)this.track("cloud_auto_save_succeeded",{result:"success"});
      else{
        this.track("cloud_auto_save_failed",{result:"failed",error_code:res.error&&res.error.code});
        if(res.error&&res.error.retryable&&this.state.retryCount>0&&this.state.retryCount<=this.maxRetries){
          const delay=[5000,15000,30000][Math.min(this.state.retryCount-1,2)];
          if(this.timer)clearTimeout(this.timer);
          cloudDebug("retry_scheduled",{operation:"auto_backup",retry_count:this.state.retryCount});
          this.timer=setTimeout(()=>this.flushAutoSave(),delay);
        }
      }
      return res;
    }
    async manualBackup(opts={}){
      const source=opts.source||"manual_backup";
      try{console.log("[CloudSave] manager_manualBackup_entered",{source,initial_check_done:!!this.state.initialCheckDone,status:this.state.status,single_flight:this.singleFlight||""});}catch(e){}
      this.track("cloud_manual_save_started");
      try{
        if(this.singleFlight&&this.singleFlight!=="initialCheck"){
          cloudDebug("manual_backup_waiting",{stage:"single_flight",operation:"manual_backup",status:this.singleFlight});
          const released=await this.waitForSingleFlight();
          if(!released){
            const busy=ns.err("single_flight_busy","上一個雲端同步流程仍在進行中",true);
            this.track("cloud_manual_save_failed",{error_code:busy.error.code});
            return this.failStage("single_flight",busy);
          }
        }
        if(!this.state.initialCheckDone&&this.singleFlight!=="initialCheck"&&source!=="initial_cloud_backup"){
          const init=await this.initialCheck();
          if(!init.ok){
            this.track("cloud_manual_save_failed",{error_code:init.error&&init.error.code});
            const initCode=init.error&&init.error.code;
            const initStage=init.error&&init.error.details&&init.error.details.stage||(
              initCode==="not_signed_in"?"ensure_signed_in":
              initCode==="cloud_save_conflict"?"metadata":
              initCode==="offline"?"online_check":
              "initial_check"
            );
            return this.failStage(initStage,init);
          }
          if(this.state.status===STATUS.SYNCED||this.state.status===STATUS.CONFLICT||this.state.status===STATUS.WAITING_CHOICE){
            this.track("cloud_manual_save_succeeded",{result:"initial_check_completed"});
            return init;
          }
        }
        const res=await this.backupNow(source);
        if(res.ok)this.track("cloud_manual_save_succeeded");
        else this.track("cloud_manual_save_failed",{error_code:res.error&&res.error.code,stage:res.error&&res.error.details&&res.error.details.stage});
        return res;
      }catch(e){
        const err=ns.err("manual_backup_exception",String(e&&e.message||e),true);
        this.track("cloud_manual_save_failed",{error_code:err.error.code});
        return this.failStage("manual_backup",err);
      }
    }
    async backupNow(source,opts={}){
      const execute=async()=>{
        const signed=await this.ensureSignedIn();if(!signed.ok)return this.failStage("ensure_signed_in",signed);
        const active=opts.confirmed&&opts.candidate?ns.ok({candidate:opts.candidate.data||opts.candidate,binding:this.readBinding()}):this.verifyActiveBinding();
        if(!active.ok)return this.failStage(active.error&&active.error.code==="active_save_binding_changed"?"active_binding":"initial_check",active);
        let online=false;
        try{online=this.platform.isOnline();}catch(e){return this.failStage("online_check",ns.err("online_check_failed",String(e&&e.message||e),true));}
        if(!online){this.setStatus(STATUS.WAITING_NETWORK,{dirty:true});return this.failStage("online_check",ns.err("offline","等待連線",true));}
        let rawExport;
        try{rawExport=this.exporter.exportPlayerSave();}catch(e){rawExport=ns.err("export_local_failed",String(e&&e.message||e),false);}
        if(!rawExport.ok)return this.failStage("export_local",rawExport);
        let valid;
        try{valid=this.exporter.validatePlayerSave(rawExport.data);}catch(e){valid=ns.err("validate_save_exception",String(e&&e.message||e),false);}
        if(!valid.ok)return this.failStage("validate_save",valid);
        let meaningful=false;
        try{meaningful=this.exporter.isMeaningfulPlayerSave(rawExport.data);}catch(e){return this.failStage("meaningful_save_check",ns.err("meaningful_save_check_failed",String(e&&e.message||e),false));}
        if(!meaningful){this.track("cloud_save_empty_blocked");return this.failStage("meaningful_save_check",ns.err("empty_save_blocked","空白存檔不會覆蓋雲端資料",false));}
        let remote;
        try{remote=await this.cloud.getCloudSaveMetadata();}catch(e){remote=ns.err("get_cloud_metadata_exception",String(e&&e.message||e),true);}
        if(!remote.ok)return this.failStage("metadata",remote);
        cloudDebug("metadata_ok",{operation:"backup",status:remote.data?"found":"empty"});
        const cloudMeta=remote.data||null;
        if(cloudMeta&&this.state.baselineChecksum&&cloudMeta.checksum!==this.state.baselineChecksum&&cloudMeta.checksum!==rawExport.data.checksum){
          this.setStatus(STATUS.CONFLICT,{conflict:true,metadata:cloudMeta,localSummary:this.exporter.summarize(rawExport.data)});
          cloudDebug("conflict_detected",{operation:"backup",result:"remote_changed"});
          this.track("cloud_save_conflict_detected",{source,conflict_type:"remote_changed"});
          return this.failStage("metadata",ns.err("cloud_save_conflict","雲端有較新的遊戲進度",false,{result:"remote_changed"}));
        }
        const local=rawExport;
        const snap=this.createLocalSnapshot(source,local);if(!snap.ok)return this.failStage("local_snapshot",snap);
        cloudDebug("snapshot_started",{operation:"backup",source});
        let cloudSnap;
        try{cloudSnap=await this.createCloudSnapshot(source,cloudMeta);}catch(e){cloudSnap=ns.err("create_cloud_snapshot_exception",String(e&&e.message||e),true);}
        if(!cloudSnap.ok){
          this.state.retryCount=Math.min(this.maxRetries,(this.state.retryCount||0)+1);
          this.setStatus(STATUS.FAILED,{dirty:true,lastError:cloudSnap.error,retryCount:this.state.retryCount});
          cloudDebug("snapshot_failed",{operation:"backup",code:cloudSnap.error&&cloudSnap.error.code,message:cloudSnap.error&&cloudSnap.error.message,details:cloudSnap.error&&cloudSnap.error.details,hint:cloudSnap.error&&cloudSnap.error.hint,rpc_name:"create_cloud_snapshot",retry_count:this.state.retryCount});
          return this.failStage("cloud_snapshot",cloudSnap,{rpc_name:"create_cloud_snapshot",retry_count:this.state.retryCount});
        }
        cloudDebug("snapshot_succeeded",{operation:"backup",source});
        this.setStatus(STATUS.SAVING,{lastError:null});
        cloudDebug("upsert_started",{operation:"backup",rpc_name:"upsert_player_save_v1"});
        let uploaded;
        try{uploaded=await this.cloud.upsertCloudSave({saveData:local.data,checksum:local.data.checksum,schemaVersion:local.data.schemaVersion,gameVersion:local.data.gameVersion,deviceId:this.platform.getDeviceId(),expectedSaveVersion:cloudMeta&&cloudMeta.save_version||0});}catch(e){uploaded=ns.err("upsert_cloud_save_exception",String(e&&e.message||e),true);}
        if(!uploaded.ok){this.state.retryCount=Math.min(this.maxRetries,(this.state.retryCount||0)+1);this.setStatus(STATUS.FAILED,{dirty:true,lastError:uploaded.error,retryCount:this.state.retryCount});cloudDebug("upsert_failed",{operation:"backup",code:uploaded.error&&uploaded.error.code,message:uploaded.error&&uploaded.error.message,details:uploaded.error&&uploaded.error.details,hint:uploaded.error&&uploaded.error.hint,rpc_name:"upsert_player_save_v1",retry_count:this.state.retryCount});return this.failStage("upsert",uploaded,{rpc_name:"upsert_player_save_v1",retry_count:this.state.retryCount});}
        cloudDebug("upsert_succeeded",{operation:"backup",rpc_name:"upsert_player_save_v1"});
        const meta=uploaded.data&&uploaded.data.metadata||uploaded.data||{};
        this.retryCount=0;
        this.setStatus(STATUS.SYNCED,{dirty:false,conflict:false,initialCheckDone:true,metadata:meta,baselineChecksum:local.data.checksum,lastSyncedAt:meta.updated_at||ns.nowIso(),retryCount:0,lastError:null});
        return ns.ok({metadata:meta});
      };
      if(this.singleFlight==="initialCheck")return execute();
      return this.runSingleFlight("backup",execute);
    }
    async restoreFromCloud({force=false}={}){
      return this.runSingleFlight("restore",async()=>{
        cloudDebug("restore_started",{operation:"restore"});
        this.track("cloud_restore_started");
        const signed=await this.ensureSignedIn();if(!signed.ok)return signed;
        const meta=await this.cloud.getCloudSaveMetadata();if(!meta.ok)return meta;
        if(!meta.data)return ns.err("cloud_save_missing","雲端沒有存檔",false);
        const snap=this.createLocalSnapshot("before_restore");if(!snap.ok)return snap;
        this.setStatus(STATUS.RESTORING,{lastError:null});
        const remote=await this.cloud.getCloudSave();if(!remote.ok){this.setStatus(STATUS.FAILED,{lastError:remote.error});cloudDebug("restore_failed",{operation:"restore",code:remote.error&&remote.error.code,message:remote.error&&remote.error.message});this.track("cloud_restore_failed",{error_code:remote.error&&remote.error.code});return remote;}
        const save=remote.data&&remote.data.save_data||remote.data&&remote.data.saveData||remote.data;
        const checksum=this.exporter.calculatePlayerSaveChecksum(save||{});
        if(remote.data&&remote.data.checksum&&remote.data.checksum!==checksum){
          const err=ns.err("checksum_mismatch","雲端存檔驗證失敗",false);
          this.setStatus(STATUS.FAILED,{lastError:err.error});cloudDebug("restore_failed",{operation:"restore",code:"checksum_mismatch"});this.track("cloud_restore_failed",{error_code:"checksum_mismatch"});return err;
        }
        const imported=this.exporter.importPlayerSave(save);
        if(!imported.ok){this.setStatus(STATUS.FAILED,{lastError:imported.error});cloudDebug("restore_failed",{operation:"restore",code:imported.error&&imported.error.code,message:imported.error&&imported.error.message});this.track("cloud_restore_failed",{error_code:imported.error&&imported.error.code});return imported;}
        this.setStatus(STATUS.SYNCED,{dirty:false,conflict:false,initialCheckDone:true,metadata:meta.data,baselineChecksum:remote.data&&remote.data.checksum||checksum,lastSyncedAt:meta.data.updated_at||ns.nowIso(),lastError:null});
        cloudDebug("restore_succeeded",{operation:"restore"});
        this.track("cloud_restore_succeeded");
        return ns.ok(imported.data);
      });
    }
    async resolveConflict(choice){
      if(choice==="local"){
        const confirmSnap=this.createLocalSnapshot("before_force_overwrite");if(!confirmSnap.ok)return confirmSnap;
        const res=await this.backupNow("before_conflict_resolution");
        if(res.ok){this.track("cloud_save_conflict_resolved",{result:"local"});}
        return res;
      }
      if(choice==="cloud"){
        const res=await this.restoreFromCloud({force:true});
        if(res.ok){this.track("cloud_save_conflict_resolved",{result:"cloud"});}
        return res;
      }
      this.setStatus(STATUS.WAITING_CHOICE,{conflict:true});
      return ns.ok({status:"waiting_choice"});
    }
    handleOnline(){if(this.state.dirty&&this.isSignedIn())setTimeout(()=>this.flushAutoSave(),5000);}
    handleOffline(){if(this.state.dirty)this.setStatus(STATUS.WAITING_NETWORK);}
    start(){
      this.platform.onOnline(()=>this.handleOnline());
      this.platform.onOffline(()=>this.handleOffline());
      if(global.document&&global.document.addEventListener){
        global.document.addEventListener("visibilitychange",()=>{
          if(global.document.visibilityState==="hidden"&&this.state.dirty&&this.isSignedIn()&&!this.singleFlight){
            this.flushAutoSave();
          }
        });
      }
      setInterval(()=>{if(this.state.dirty&&this.isSignedIn()&&!this.singleFlight)this.flushAutoSave();},60000);
      return ns.ok({status:"started"});
    }
    stop(){if(this.timer)clearTimeout(this.timer);this.timer=null;return ns.ok({status:"stopped"});}
  }
  ns.CLOUD_SAVE_STATUS=STATUS;
  ns.CloudSaveManager=CloudSaveManager;
})(typeof window!=="undefined"?window:globalThis);
