(function(global){
  const ns=global.PetHabitPlatform=global.PetHabitPlatform||{};
  class SyncManager{
    constructor({pendingOperations,localRepository,cloudRepository,platformAdapter,analyticsAdapter,saveManager}={}){
      this.pending=pendingOperations||new ns.PendingOperations();
      this.local=localRepository||new ns.LocalRepository();
      this.cloud=cloudRepository||new ns.MockCloudRepository();
      this.platform=platformAdapter||new ns.WebPlatformAdapter();
      this.analytics=analyticsAdapter||new ns.AnalyticsAdapter();
      this.saveManager=saveManager||null;
      this.running=false;this.syncing=false;this.unsub=[];
    }
    start(){if(this.running)return ns.ok({status:"already_started"});this.running=true;this.unsub.push(this.platform.onOnline(()=>this.handleOnline()));this.unsub.push(this.platform.onOffline(()=>this.handleOffline()));this.unsub.push(this.platform.onBeforeUnload(()=>this.flushBeforeUnload()));return ns.ok({status:"started"});}
    stop(){this.running=false;this.unsub.splice(0).forEach(fn=>{try{fn&&fn();}catch(e){}});return ns.ok({status:"stopped"});}
    getStatus(){return {running:this.running,syncing:this.syncing,online:this.platform.isOnline(),pending:this.pending.counts(),repository:this.cloud.constructor&&this.cloud.constructor.name};}
    retryDelay(retryCount){return Math.min(15*60*1000,Math.pow(2,Math.min(retryCount,6))*1000);}
    async syncNow(){
      if(this.syncing)return ns.ok({status:"already_syncing"});
      if(!this.platform.isOnline())return ns.err("offline","Device offline",true);
      this.syncing=true;this.analytics.cloudSyncStart(this.getStatus());
      const rows=this.pending.listRunnable();
      let completed=0,failed=0,conflict=0;
      for(const op of rows){
        this.pending.update(op.operationId,{status:"syncing"});
        const result=await this.applyOperation(op);
        if(result.ok){
          if(op.operationType==="savePlayerSave"&&this.saveManager&&this.saveManager.setCloudRevision){
            const playerId=op.payload&&op.payload.playerId||op.entityId;
            const revision=result.data&&result.data.saveRevision;
            if(revision!=null)this.saveManager.setCloudRevision(playerId,revision);
          }
          this.pending.update(op.operationId,{status:"completed"});
          this.analytics.pendingCompleted({operationId:op.operationId});
          completed++;
        }else if(result.error&&result.error.code==="revision_conflict"){
          this.pending.update(op.operationId,{status:"conflict"});
          this.analytics.cloudSyncConflict({operationId:op.operationId});
          conflict++;
        }else if(result.error&&result.error.retryable){
          const retryCount=(op.retryCount||0)+1;
          const nextRetryAt=new Date(Date.now()+this.retryDelay(retryCount)).toISOString();
          this.pending.update(op.operationId,{status:"failed",retryCount,nextRetryAt});
          this.analytics.cloudSyncRetry({operationId:op.operationId,retryCount});
          failed++;
        }else{
          this.pending.update(op.operationId,{status:"failed",retryCount:(op.retryCount||0)+1});
          this.analytics.pendingFailed({operationId:op.operationId,code:result.error&&result.error.code});
          failed++;
        }
      }
      this.pending.cleanupCompleted();
      this.syncing=false;
      if(conflict)this.analytics.cloudSyncConflict({conflict});
      else if(failed)this.analytics.cloudSyncFail({failed});
      else this.analytics.cloudSyncSuccess({completed});
      return ns.ok({completed,failed,conflict});
    }
    async applyOperation(op){
      if(op.operationType==="savePlayerSave"){
        const playerId=op.payload&&op.payload.playerId||op.entityId;
        const local=this.local.getPlayerSave(playerId);
        if(!local.ok)return local;
        const save=local.data&&local.data.save;
        const expected=(op.payload&&op.payload.expectedRevision)!=null?op.payload.expectedRevision:0;
        return await this.cloud.savePlayerSave(playerId,save,expected);
      }
      return ns.err("unsupported_operation","Unsupported operation "+op.operationType,false);
    }
    retryFailed(){return this.syncNow();}
    handleOnline(){if(this.running)this.syncNow();}
    handleOffline(){return ns.ok({status:"offline"});}
    flushBeforeUnload(){if(this.running&&!this.syncing)this.syncNow();}
  }
  ns.SyncManager=SyncManager;
})(typeof window!=="undefined"?window:globalThis);
