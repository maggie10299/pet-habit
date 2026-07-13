(function(global){
  const ns=global.PetHabitPlatform=global.PetHabitPlatform||{};
  class SaveManager{
    constructor({localRepository,pendingOperations,platformAdapter,analyticsAdapter}={}){
      this.local=localRepository||new ns.LocalRepository();
      this.pending=pendingOperations||new ns.PendingOperations();
      this.platform=platformAdapter||new ns.WebPlatformAdapter();
      this.analytics=analyticsAdapter||new ns.AnalyticsAdapter();
      this.syncStatus="local_only";
    }
    revisionKey(playerId){return "petHabitSyncRevision_"+(playerId||"solo");}
    getCloudRevision(playerId){
      const raw=global.localStorage&&global.localStorage.getItem(this.revisionKey(playerId));
      const parsed=Number(raw||0);
      return Number.isFinite(parsed)?parsed:0;
    }
    setCloudRevision(playerId,revision){
      const next=Number(revision||0);
      if(global.localStorage)global.localStorage.setItem(this.revisionKey(playerId),String(Number.isFinite(next)?next:0));
      return ns.ok(next);
    }
    loadActivePlayer(){
      const fam=this.local.getFamily().data;
      const activeId=fam&&fam.activePlayerId;
      const player=activeId?this.local.getPlayer(activeId).data:null;
      const save=activeId?this.local.getPlayerSave(activeId).data:null;
      return ns.ok({family:fam,player,save});
    }
    addMetadata(save,playerId){
      const current=save||{};
      const old=current.platformMetadata||{};
      const cloudRevision=this.getCloudRevision(playerId);
      return {...current,platformMetadata:{
        schemaVersion:old.schemaVersion||global.APP_SCHEMA_VERSION||2,
        saveRevision:cloudRevision,
        localModifiedAt:ns.nowIso(),
        deviceId:this.platform.getDeviceId(),
        playerId,
        syncStatus:this.syncStatus
      }};
    }
    saveActivePlayer(save,opts={}){
      const active=this.loadActivePlayer().data;
      if(!active||!active.player)return ns.err("active_player_missing","No active player",false);
      return this.savePlayer(active.player.id,save,opts);
    }
    savePlayer(playerId,save,opts={}){
      const withMeta=this.addMetadata(save,playerId);
      const expected=opts.expectedRevision==null?this.getCloudRevision(playerId):opts.expectedRevision;
      const localExpected=opts.localExpectedRevision==null?null:opts.localExpectedRevision;
      const localResult=this.local.savePlayerSave(playerId,withMeta,localExpected);
      if(!localResult.ok)return localResult;
      if(opts.enqueue!==false){
        const op=this.pending.create({playerId,entityType:"player_save",entityId:playerId,operationType:"savePlayerSave",baseRevision:expected,payload:{playerId,expectedRevision:expected}});
        if(op.ok)this.analytics.pendingCreated({operationId:op.data.operationId,entityType:"player_save"});
      }
      this.markDirty();
      return ns.ok(withMeta);
    }
    saveAllPlayers(){
      const players=this.local.getPlayers().data||[];
      return ns.ok(players.map(p=>this.local.getPlayerSave(p.id).data));
    }
    createLocalSnapshot(reason){return global.backupLocalStorageSnapshot?ns.ok({key:global.backupLocalStorageSnapshot(reason||"save-manager")}):ns.err("snapshot_unavailable","backupLocalStorageSnapshot unavailable",false);}
    restoreLatestSnapshot(){return global.restoreLatestSafeSnapshot?ns.ok({restored:global.restoreLatestSafeSnapshot()}):ns.err("restore_unavailable","restoreLatestSafeSnapshot unavailable",false);}
    markDirty(){this.setSyncStatus("pending");}
    getSyncStatus(){return this.syncStatus;}
    setSyncStatus(status){this.syncStatus=status;return ns.ok(status);}
  }
  ns.SaveManager=SaveManager;
})(typeof window!=="undefined"?window:globalThis);
