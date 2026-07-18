(function(global){
  const ns=global.PetHabitPlatform=global.PetHabitPlatform||{};
  const STATE_KEY="petHabitCloudSaveV1_state";
  const SNAPSHOT_INDEX_KEY="petHabitCloudSaveV1_localSnapshots";
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
    loadState(){const saved=readJson(this.storage,STATE_KEY,null);if(saved&&typeof saved==="object")this.state={...this.state,...saved};return this.state;}
    saveState(){try{writeJson(this.storage,STATE_KEY,this.state);}catch(e){}this.notify();}
    subscribe(fn){if(typeof fn!=="function")return ()=>{};this.subscribers.push(fn);try{fn(this.getStatus());}catch(e){}return()=>{this.subscribers=this.subscribers.filter(x=>x!==fn);};}
    notify(){const s=this.getStatus();this.subscribers.slice().forEach(fn=>{try{fn(s);}catch(e){}});}
    getAuthStatus(){return this.auth&&this.auth.getStatus?this.auth.getStatus():null;}
    isSignedIn(){const s=this.getAuthStatus();return !!(s&&s.status==="signed_in"&&s.sessionPresent);}
    getStatus(){return {...this.state,online:this.platform.isOnline(),signedIn:this.isSignedIn(),busy:this.state.status===STATUS.SAVING||this.state.status===STATUS.RESTORING||this.state.status===STATUS.CHECKING};}
    setStatus(status,patch={}){this.state={...this.state,...patch,status};this.saveState();}
    track(event,params={}){try{if(global.MaggieAnalytics&&global.MaggieAnalytics.track)global.MaggieAnalytics.track(event,{...params,game_version:global.APP_VERSION||global.VERSION||"",schema_version:String(global.APP_SCHEMA_VERSION||2),online_state:this.platform.isOnline()?"online":"offline"});}catch(e){}}
    async ensureSignedIn(){
      if(this.isSignedIn())return ns.ok(true);
      this.setStatus(STATUS.NOT_SIGNED_IN,{dirty:false,initialCheckDone:false});
      return ns.err("not_signed_in","請先登入 Google",false);
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
    createLocalSnapshot(source){
      const exported=this.exportLocal();
      if(!exported.ok)return exported;
      const snapshot={snapshot_id:"local_snap_"+Date.now()+"_"+Math.random().toString(36).slice(2,8),source,created_at:ns.nowIso(),save_version:this.state.metadata&&this.state.metadata.save_version||0,schema_version:String(global.APP_SCHEMA_VERSION||2),game_version:global.APP_VERSION||global.VERSION||"",checksum:exported.data.checksum,device_id:this.platform.getDeviceId(),save_data:exported.data};
      const index=readJson(this.storage,SNAPSHOT_INDEX_KEY,[]);
      index.unshift(snapshot);
      const trimmed=index.slice(0,5);
      writeJson(this.storage,SNAPSHOT_INDEX_KEY,trimmed);
      if(global.backupLocalStorageSnapshot)try{global.backupLocalStorageSnapshot(source);}catch(e){}
      return ns.ok(snapshot);
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
        const local=this.exportLocal();if(!local.ok){this.setStatus(STATUS.FAILED,{lastError:local.error});return local;}
        const localMeaningful=this.exporter.isMeaningfulPlayerSave(local.data);
        const meta=await this.cloud.getCloudSaveMetadata();
        if(!meta.ok){this.setStatus(STATUS.FAILED,{lastError:meta.error});this.track("cloud_sync_initial_check_completed",{result:"failed",error_code:meta.error&&meta.error.code});return meta;}
        const cloudMeta=meta.data||null;
        if(!cloudMeta&&localMeaningful){
          this.setStatus(STATUS.NEEDS_INITIAL_BACKUP,{initialCheckDone:true,metadata:null,baselineChecksum:""});
          const res=await this.manualBackup({source:"initial_cloud_backup"});
          if(res.ok)this.track("cloud_sync_initial_check_completed",{result:"initial_backup_created"});
          return res;
        }
        if(cloudMeta&&!localMeaningful){
          this.setStatus(STATUS.CLOUD_AVAILABLE,{initialCheckDone:true,metadata:cloudMeta,dirty:false,baselineChecksum:cloudMeta.checksum||""});
          this.track("cloud_sync_initial_check_completed",{result:"cloud_available"});
          return ns.ok({mode:"cloud_available",metadata:cloudMeta});
        }
        if(cloudMeta&&localMeaningful){
          const same=(cloudMeta.checksum&&cloudMeta.checksum===local.data.checksum);
          if(same){
            this.setStatus(STATUS.SYNCED,{initialCheckDone:true,metadata:cloudMeta,dirty:false,baselineChecksum:cloudMeta.checksum,lastSyncedAt:cloudMeta.updated_at||ns.nowIso()});
            this.track("cloud_sync_initial_check_completed",{result:"same"});
            return ns.ok({mode:"same",metadata:cloudMeta});
          }
          this.setStatus(STATUS.CONFLICT,{initialCheckDone:true,conflict:true,dirty:true,metadata:cloudMeta,localSummary:this.exporter.summarize(local.data)});
          this.track("cloud_save_conflict_detected",{source:"initial_check",conflict_type:"local_and_cloud_differ"});
          return ns.err("cloud_save_conflict","偵測到兩份不同的遊戲進度",false,{metadata:cloudMeta});
        }
        this.setStatus(STATUS.NEEDS_INITIAL_BACKUP,{initialCheckDone:true,dirty:false});
        this.track("cloud_sync_initial_check_completed",{result:"empty"});
        return ns.ok({mode:"empty"});
      });
    }
    markSaveDirty(reason){
      if(!this.isSignedIn())return ns.ok({status:"local_only"});
      this.state.dirty=true;this.state.lastDirtyAt=ns.nowIso();
      if(this.state.conflict||this.state.status===STATUS.CONFLICT||this.state.status===STATUS.WAITING_CHOICE){this.saveState();return ns.ok({status:"paused_conflict"});}
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
          this.timer=setTimeout(()=>this.flushAutoSave(),delay);
        }
      }
      return res;
    }
    async manualBackup(opts={}){this.track("cloud_manual_save_started");const res=await this.backupNow(opts.source||"manual_backup");if(res.ok)this.track("cloud_manual_save_succeeded");else this.track("cloud_manual_save_failed",{error_code:res.error&&res.error.code});return res;}
    async backupNow(source){
      const execute=async()=>{
        const signed=await this.ensureSignedIn();if(!signed.ok)return signed;
        if(!this.platform.isOnline()){this.setStatus(STATUS.WAITING_NETWORK,{dirty:true});return ns.err("offline","等待連線",true);}
        const local=this.exportLocal();if(!local.ok)return local;
        if(!this.exporter.isMeaningfulPlayerSave(local.data)){this.track("cloud_save_empty_blocked");return ns.err("empty_save_blocked","空白存檔不會覆蓋雲端資料",false);}
        const remote=await this.cloud.getCloudSaveMetadata();
        if(!remote.ok)return remote;
        const cloudMeta=remote.data||null;
        if(cloudMeta&&this.state.baselineChecksum&&cloudMeta.checksum!==this.state.baselineChecksum&&cloudMeta.checksum!==local.data.checksum){
          this.setStatus(STATUS.CONFLICT,{conflict:true,metadata:cloudMeta,localSummary:this.exporter.summarize(local.data)});
          this.track("cloud_save_conflict_detected",{source,conflict_type:"remote_changed"});
          return ns.err("cloud_save_conflict","雲端有較新的遊戲進度",false,{metadata:cloudMeta});
        }
        const snap=this.createLocalSnapshot(source);if(!snap.ok)return snap;
        await this.createCloudSnapshot(source,cloudMeta);
        this.setStatus(STATUS.SAVING,{lastError:null});
        const uploaded=await this.cloud.upsertCloudSave({saveData:local.data,checksum:local.data.checksum,schemaVersion:local.data.schemaVersion,gameVersion:local.data.gameVersion,deviceId:this.platform.getDeviceId(),expectedSaveVersion:cloudMeta&&cloudMeta.save_version||0});
        if(!uploaded.ok){this.state.retryCount=Math.min(this.maxRetries,(this.state.retryCount||0)+1);this.setStatus(STATUS.FAILED,{dirty:true,lastError:uploaded.error,retryCount:this.state.retryCount});return uploaded;}
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
        this.track("cloud_restore_started");
        const signed=await this.ensureSignedIn();if(!signed.ok)return signed;
        const meta=await this.cloud.getCloudSaveMetadata();if(!meta.ok)return meta;
        if(!meta.data)return ns.err("cloud_save_missing","雲端沒有存檔",false);
        const snap=this.createLocalSnapshot("before_restore");if(!snap.ok)return snap;
        this.setStatus(STATUS.RESTORING,{lastError:null});
        const remote=await this.cloud.getCloudSave();if(!remote.ok){this.setStatus(STATUS.FAILED,{lastError:remote.error});this.track("cloud_restore_failed",{error_code:remote.error&&remote.error.code});return remote;}
        const save=remote.data&&remote.data.save_data||remote.data&&remote.data.saveData||remote.data;
        const checksum=this.exporter.calculatePlayerSaveChecksum(save||{});
        if(remote.data&&remote.data.checksum&&remote.data.checksum!==checksum){
          const err=ns.err("checksum_mismatch","雲端存檔驗證失敗",false);
          this.setStatus(STATUS.FAILED,{lastError:err.error});this.track("cloud_restore_failed",{error_code:"checksum_mismatch"});return err;
        }
        const imported=this.exporter.importPlayerSave(save);
        if(!imported.ok){this.setStatus(STATUS.FAILED,{lastError:imported.error});this.track("cloud_restore_failed",{error_code:imported.error&&imported.error.code});return imported;}
        this.setStatus(STATUS.SYNCED,{dirty:false,conflict:false,initialCheckDone:true,metadata:meta.data,baselineChecksum:remote.data&&remote.data.checksum||checksum,lastSyncedAt:meta.data.updated_at||ns.nowIso(),lastError:null});
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
