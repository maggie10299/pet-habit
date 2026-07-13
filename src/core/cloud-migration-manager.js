(function(global){
  const ns=global.PetHabitPlatform=global.PetHabitPlatform||{};
  const clone=(value)=>JSON.parse(JSON.stringify(value||{}));
  const arr=(value)=>Array.isArray(value)?value:[];
  const ids=(value)=>arr(value).map(x=>String((x&&x.id)||(x&&x.key)||(x&&x.itemId)||(x&&x.date)||"")).filter(Boolean).sort();
  const completedToday=(save)=>{
    const today=new Date().toISOString().slice(0,10);
    const checked=save&&save.checked||save&&save.completed||save&&save.taskCompletions||{};
    if(Array.isArray(checked))return checked.filter(x=>String(x&&x.date||"").slice(0,10)===today).map(x=>String(x.id||x.taskId||"")).filter(Boolean).sort();
    return Object.keys(checked||{}).filter(k=>{
      const v=checked[k];
      if(v===true)return true;
      if(v&&String(v.date||v.completedAt||"").slice(0,10)===today)return true;
      return false;
    }).sort();
  };
  const summary=(save,balance,row)=>{
    const s=save||{};
    const tasks=arr(s.tasks).length?arr(s.tasks):arr(s.habits);
    const purchases=s.purchases||s.owned||s.ownedItems||{};
    const outfit=s.outfit||s.currentOutfit||s.equippedOutfit||s.closet||{};
    const room=s.roomDecor||s.roomDecorations||s.roomItems||s.furniture||{};
    const eventProgress=s.officialEventProgress||s.events||s.eventProgress||{};
    const diary=arr(s.diary).length?arr(s.diary):arr(s.diaryEntries);
    const wishes=arr(s.wishes).length?arr(s.wishes):arr(s.wishlist);
    const meta=s.platformMetadata||{};
    return {
      playerIdentity:String((meta&&meta.playerId)||(row&&row.player_id)||(row&&row.playerId)||""),
      pet:String(s.pet||s.selectedPet||""),
      taskCount:tasks.length,
      todayCompletionState:completedToday(s).join("|"),
      purchases:Array.isArray(purchases)?ids(purchases).join("|"):Object.keys(purchases||{}).sort().join("|"),
      outfit:JSON.stringify(outfit||{}),
      roomDecoration:Array.isArray(room)?ids(room).join("|"):Object.keys(room||{}).sort().join("|"),
      eventProgress:Object.keys(eventProgress||{}).sort().join("|"),
      diaryCount:diary.length,
      wishCount:wishes.length,
      schemaVersion:Number(meta.schemaVersion||s.schemaVersion||global.APP_SCHEMA_VERSION||2),
      saveRevision:Number((row&&row.save_revision)||(meta&&meta.saveRevision)||0),
      balance:`${Number(balance&&balance.stars||s.stars||0)}:${Number(balance&&balance.apples||s.apples||s.apple||0)}`
    };
  };
  class CloudMigrationManager{
    constructor({localRepository,cloudRepository,saveManager,mappingManager}={}){
      this.local=localRepository||new ns.LocalRepository();
      this.cloud=cloudRepository||new ns.SupabaseCloudRepository();
      this.saveManager=saveManager||new ns.SaveManager({localRepository:this.local});
      this.mapping=mappingManager||new ns.CloudMappingManager();
      this.stateKey="petHabitCloudMigrationState_v1";
    }
    readState(){return ns.safeJsonParse(global.localStorage&&global.localStorage.getItem(this.stateKey),null);}
    writeState(state){
      try{global.localStorage&&global.localStorage.setItem(this.stateKey,JSON.stringify(state));return ns.ok(state);}
      catch(e){return ns.err("migration_state_write_failed",String(e&&e.message||e),true);}
    }
    createSnapshot(reason){
      if(this.saveManager&&this.saveManager.createLocalSnapshot)return this.saveManager.createLocalSnapshot(reason||"cloud-migration");
      return ns.err("snapshot_unavailable","Snapshot helper unavailable",false);
    }
    validateLocalFamily(){
      const family=this.local.getFamily().data;
      if(!family)return ns.err("local_family_missing","No local family found",false);
      const players=Array.isArray(family.players)?family.players:[];
      if(players.length>3)return ns.err("player_limit_exceeded","Local family has more than 3 players",false);
      for(const p of players){
        if(!p.id)return ns.err("invalid_player","Player id missing",false);
        const save=this.local.getPlayerSave(p.id);
        if(!save.ok||!save.data)return ns.err("invalid_player_save","Player save missing",false,{playerId:p.id});
      }
      return ns.ok({family,players});
    }
    buildSaveForCloud(localSave,playerId){
      const save=clone((localSave&&localSave.save)||localSave||{});
      const meta=save.platformMetadata||{};
      save.platformMetadata={
        ...meta,
        schemaVersion:Number(meta.schemaVersion||global.APP_SCHEMA_VERSION||2),
        saveRevision:Number(meta.saveRevision||0),
        localModifiedAt:meta.localModifiedAt||ns.nowIso(),
        deviceId:(this.saveManager.platform&&this.saveManager.platform.getDeviceId&&this.saveManager.platform.getDeviceId())||"",
        playerId
      };
      return save;
    }
    extractBalance(save){
      const s=save||{};
      return {stars:Number(s.stars||0),apples:Number(s.apples||s.apple||0)};
    }
    async prepareMigrationPlan(){
      const snapshot=this.createSnapshot("before-cloud-migration");
      const local=this.validateLocalFamily();
      if(!local.ok)return local;
      if(!snapshot.ok||!snapshot.data||!snapshot.data.key)return ns.err("migration_snapshot_required","Migration snapshot failed; cloud migration stopped before any upload",false,{snapshot});
      const auth=await (this.cloud.getCurrentUser?this.cloud.getCurrentUser():Promise.resolve(ns.ok(null)));
      const authUserId=auth.ok&&auth.data&&auth.data.id||"";
      const plan={migrationId:ns.makeId("migration"),authUserId,snapshotKey:snapshot.data.key,startedAt:ns.nowIso(),family:local.data.family,playerCount:local.data.players.length,status:"planned",players:[]};
      for(const p of local.data.players){
        const localSave=this.local.getPlayerSave(p.id).data;
        plan.players.push({localPlayer:p,localSaveId:p.localSaveId||p.localSaveId_hk||p.storageKey||p.id,storageKey:localSave.storageKey,status:"planned",saveSummary:summary(localSave.save,this.extractBalance(localSave.save))});
      }
      this.writeState(plan);
      return ns.ok(plan);
    }
    async inspectSyncState(){
      const local=this.validateLocalFamily();
      if(!local.ok)return local;
      const family=await (this.cloud.getFamily?this.cloud.getFamily():Promise.resolve(ns.ok(null)));
      if(!family.ok)return family;
      if(local.data.players.length&&family.data)return ns.ok({mode:"mapping_or_conflict_check_required",localPlayers:local.data.players.length,cloudFamily:family.data});
      if(local.data.players.length&&!family.data)return ns.ok({mode:"local_to_cloud",localPlayers:local.data.players.length});
      if(!local.data.players.length&&family.data)return ns.ok({mode:"cloud_to_local",cloudFamily:family.data});
      return ns.ok({mode:"empty"});
    }
    async verifyUploadedPlayer({cloudPlayerId,localSave,expectedRevision}){
      const save=await this.cloud.getPlayerSave(cloudPlayerId); if(!save.ok)return save;
      const balance=await this.cloud.getPlayerBalance(cloudPlayerId); if(!balance.ok)return balance;
      const cloudSave=save.data&&save.data.save_json||{};
      const localSummary=summary(localSave,this.extractBalance(localSave),{player_id:cloudPlayerId,save_revision:expectedRevision||0});
      const cloudSummary=summary(cloudSave,balance.data,{player_id:cloudPlayerId,save_revision:save.data&&save.data.save_revision});
      const checks={};
      Object.keys(localSummary).forEach(k=>{
        if(k==="saveRevision")checks[k]=Number(cloudSummary[k])>Number(expectedRevision||0);
        else if(k==="balance")checks[k]=!!(balance.data&&balance.data.initial_balance_migrated_at);
        else checks[k]=localSummary[k]===cloudSummary[k]||k==="playerIdentity";
      });
      const ok=Object.values(checks).every(Boolean);
      return ok?ns.ok({checks,saveRevision:save.data.save_revision,balanceRevision:balance.data.revision,summary:cloudSummary}):ns.err("cloud_verify_failed","Cloud read-back verification failed",false,{checks});
    }
    async verifyLocalWrite(localPlayerId,expectedSave,expectedBalance){
      const local=this.local.getPlayerSave(localPlayerId);
      if(!local.ok)return local;
      const actual=local.data&&local.data.save||{};
      const a=summary(actual,this.extractBalance(actual));
      const b=summary(expectedSave,expectedBalance||this.extractBalance(expectedSave));
      const checks={};
      Object.keys(b).forEach(k=>{
        if(k==="saveRevision")checks[k]=true;
        else checks[k]=a[k]===b[k]||k==="playerIdentity";
      });
      return Object.values(checks).every(Boolean)?ns.ok({checks,summary:a}):ns.err("local_verify_failed","Local read-back verification failed",false,{checks});
    }
    async migrateOnePlayer(state,item,profileId,familyId){
      const cloudPlayer=await this.cloud.getOrCreatePlayer({
        familyId,
        localPlayerId:item.localPlayer.id,
        localSaveId:item.localSaveId,
        displayName:item.localPlayer.name||item.localPlayer.displayName||"小主人",
        petName:item.localPlayer.petName||""
      });
      if(!cloudPlayer.ok){item.status="failed";item.error=cloudPlayer.error;this.writeState(state);return cloudPlayer;}
      item.status="player_linked"; item.cloudPlayerId=cloudPlayer.data.id; this.writeState(state);
      this.mapping.setPlayerMapping({authUserId:state.authUserId,familyId,localPlayerId:item.localPlayer.id,localSaveId:item.localSaveId,cloudPlayerId:cloudPlayer.data.id});
      const localSave=this.local.getPlayerSave(item.localPlayer.id).data;
      const save=this.buildSaveForCloud(localSave.save,cloudPlayer.data.id);
      const existing=await this.cloud.getPlayerSave(cloudPlayer.data.id);
      if(!existing.ok){item.status="failed";item.error=existing.error;this.writeState(state);return existing;}
      const expectedRevision=existing.data?Number(existing.data.save_revision||0):0;
      const upload=await this.cloud.upsertPlayerSave(cloudPlayer.data.id,save,expectedRevision);
      if(!upload.ok){item.status=upload.error&&upload.error.code==="revision_conflict"?"conflict":"failed";item.error=upload.error;this.writeState(state);return upload;}
      item.status="save_uploaded"; item.saveRevision=upload.data.saveRevision; this.writeState(state);
      const bal=this.extractBalance(localSave.save);
      const balance=await this.cloud.migrateInitialPlayerBalance({playerId:cloudPlayer.data.id,apples:bal.apples,stars:bal.stars,migrationId:state.migrationId});
      if(!balance.ok){item.status="failed";item.error=balance.error;this.writeState(state);return balance;}
      const verified=await this.verifyUploadedPlayer({cloudPlayerId:cloudPlayer.data.id,localSave:save,expectedRevision});
      if(!verified.ok){item.status="failed";item.error=verified.error;this.writeState(state);return verified;}
      item.status="completed"; item.verifiedAt=ns.nowIso(); this.writeState(state);
      this.mapping.setSyncMeta(item.localPlayer.id,{cloudPlayerId:cloudPlayer.data.id,cloudRevision:upload.data.saveRevision,balanceRevision:verified.data.balanceRevision,status:"synced"});
      return ns.ok({localPlayerId:item.localPlayer.id,cloudPlayerId:cloudPlayer.data.id,revision:upload.data.saveRevision});
    }
    async migrateLocalToCloud({familyName}={}){
      const plan=await this.prepareMigrationPlan();
      if(!plan.ok)return plan;
      const profile=await this.cloud.getOrCreateProfile();
      if(!profile.ok)return profile;
      const family=await this.cloud.getOrCreateFamily(familyName||plan.data.family.name||"我的家庭");
      if(!family.ok)return family;
      const state={...plan.data,authUserId:profile.data.id,profileId:profile.data.id,familyId:family.data.id,status:"family_ready",players:plan.data.players.map(p=>({...p,status:"planned"}))};
      this.mapping.setAccount({authUserId:profile.data.id,profileId:profile.data.id,familyId:family.data.id,authStatus:"signed_in"});
      this.writeState(state);
      const results=[];
      for(const item of state.players){
        const res=await this.migrateOnePlayer(state,item,profile.data.id,family.data.id);
        if(!res.ok)return res;
        results.push(res.data);
      }
      const allDone=state.players.every(p=>p.status==="completed");
      state.status=allDone?"completed":"partial"; this.writeState(state);
      return allDone?ns.ok({familyId:family.data.id,players:results}):ns.err("migration_incomplete","Not all players completed",true,{state});
    }
    async resumeMigration(){
      const state=this.readState();
      if(!state)return ns.err("migration_state_missing","No resumable migration state found",false);
      const auth=await this.cloud.getCurrentUser();
      if(!auth.ok)return auth;
      const authUserId=auth.data&&auth.data.id||"";
      if(state.authUserId&&authUserId&&state.authUserId!==authUserId)return ns.err("migration_auth_mismatch","Migration belongs to a different signed-in user",false);
      if(!state.migrationId||!state.snapshotKey)return ns.err("migration_state_invalid","Migration state missing migrationId or snapshotKey",false);
      if(state.status==="completed"){
        const verified=state.players.every(p=>p.status==="completed"&&p.cloudPlayerId);
        return verified?ns.ok({status:"already_completed",state}):ns.err("migration_state_invalid","Completed state is missing verified players",false,{state});
      }
      const profile=state.profileId?ns.ok({id:state.profileId}):await this.cloud.getOrCreateProfile();
      if(!profile.ok)return profile;
      const family=state.familyId?ns.ok({id:state.familyId}):await this.cloud.getOrCreateFamily(state.family&&state.family.name||"我的家庭");
      if(!family.ok)return family;
      state.authUserId=state.authUserId||authUserId||profile.data.id;
      state.profileId=profile.data.id;
      state.familyId=family.data.id;
      this.writeState(state);
      const results=[];
      for(const item of state.players||[]){
        if(item.status==="conflict")return ns.err("migration_conflict_requires_parent_choice","Conflict state cannot be auto-resumed",false,{item});
        if(item.status==="completed"){
          const map=this.mapping.getPlayerMapping(item.localPlayer&&item.localPlayer.id,state.authUserId);
          const cloudId=(map.ok&&map.data&&map.data.cloudPlayerId)||item.cloudPlayerId;
          if(!cloudId)return ns.err("migration_completed_mapping_missing","Completed player mapping missing",false,{item});
          const save=await this.cloud.getPlayerSave(cloudId);
          if(!save.ok||!save.data)return ns.err("migration_completed_verify_failed","Completed player cloud save missing",true,{item});
          results.push({localPlayerId:item.localPlayer.id,cloudPlayerId:cloudId,skipped:true,revision:save.data.save_revision});
          continue;
        }
        const res=await this.migrateOnePlayer(state,item,profile.data.id,family.data.id);
        if(!res.ok)return res;
        results.push(res.data);
      }
      const allDone=(state.players||[]).every(p=>p.status==="completed");
      state.status=allDone?"completed":"partial"; this.writeState(state);
      return allDone?ns.ok({familyId:state.familyId,players:results,resumed:true}):ns.err("migration_incomplete","Not all players completed",true,{state});
    }
    async downloadCloudToLocal(){
      const snapshot=this.createSnapshot("before-cloud-download");
      if(!snapshot.ok||!snapshot.data||!snapshot.data.key)return ns.err("migration_snapshot_required","Snapshot failed; cloud download stopped",false,{snapshot});
      const auth=await this.cloud.getCurrentUser(); if(!auth.ok)return auth;
      const authUserId=auth.data&&auth.data.id;
      const family=await this.cloud.getFamily(); if(!family.ok)return family;
      if(!family.data||!family.data.id)return ns.err("cloud_family_missing","No default cloud family found",false,{snapshotKey:snapshot.data.key});
      const players=await this.cloud.getPlayers(family.data.id); if(!players.ok)return players;
      const cloudPlayers=arr(players.data).slice(0,3);
      if(arr(players.data).length>3)return ns.err("cloud_player_limit_exceeded","Cloud family has more than 3 players",false);
      const localFamily={id:"cloud_"+family.data.id,name:family.data.family_name||family.data.name||"我的家庭",createdAt:family.data.created_at||ns.nowIso(),players:cloudPlayers.map(p=>({id:"cloud_"+p.id,name:p.display_name||"小主人",storageKey:"habitKingdom_cloud_"+p.id,localSaveId:p.local_save_id||"cloud_"+p.id,cloudPlayerId:p.id}))};
      const familyWrite=this.local.saveFamily(localFamily); if(!familyWrite.ok)return familyWrite;
      this.mapping.setAccount({authUserId,profileId:authUserId,familyId:family.data.id,authStatus:"signed_in"});
      const results=[];
      for(const lp of localFamily.players){
        const cloudSave=await this.cloud.getPlayerSave(lp.cloudPlayerId); if(!cloudSave.ok)return cloudSave;
        if(!cloudSave.data)return ns.err("cloud_player_save_missing","Cloud player save missing",false,{cloudPlayerId:lp.cloudPlayerId});
        const balance=await this.cloud.getPlayerBalance(lp.cloudPlayerId); if(!balance.ok)return balance;
        const save=clone(cloudSave.data.save_json||{});
        save.stars=Number(balance.data&&balance.data.stars||save.stars||0);
        save.apples=Number(balance.data&&balance.data.apples||save.apples||save.apple||0);
        save.platformMetadata={...(save.platformMetadata||{}),cloudPlayerId:lp.cloudPlayerId,cloudRevision:Number(cloudSave.data.save_revision||0),balanceRevision:Number(balance.data&&balance.data.revision||0),downloadedAt:ns.nowIso()};
        const written=this.local.savePlayerSave(lp.id,save,null); if(!written.ok)return written;
        const verified=this.verifyLocalWrite(lp.id,save,balance.data); if(!verified.ok)return verified;
        this.mapping.setPlayerMapping({authUserId,familyId:family.data.id,localPlayerId:lp.id,localSaveId:lp.localSaveId,cloudPlayerId:lp.cloudPlayerId});
        this.mapping.setSyncMeta(lp.id,{cloudPlayerId:lp.cloudPlayerId,cloudRevision:cloudSave.data.save_revision,balanceRevision:balance.data&&balance.data.revision,status:"downloaded"});
        results.push({localPlayerId:lp.id,cloudPlayerId:lp.cloudPlayerId});
      }
      return ns.ok({snapshotKey:snapshot.data.key,familyId:family.data.id,players:results});
    }
    async enterConflictResolution(details){
      const snapshot=this.createSnapshot("before-conflict-resolution");
      if(!snapshot.ok||!snapshot.data||!snapshot.data.key)return ns.err("migration_snapshot_required","Snapshot failed; conflict resolution stopped",false,{snapshot});
      return ns.err("conflict_resolution_required","Local and cloud saves differ; parent must choose local/cloud/cancel",false,{snapshotKey:snapshot.data.key,details});
    }
  }
  ns.CloudMigrationManager=CloudMigrationManager;
})(typeof window!=="undefined"?window:globalThis);
