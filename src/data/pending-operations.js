(function(global){
  const ns=global.PetHabitPlatform=global.PetHabitPlatform||{};
  const KEY="petHabitPendingOperations_v1";
  class PendingOperations{
    constructor(storage){this.storage=storage||global.localStorage;}
    read(){return ns.safeJsonParse(this.storage.getItem(KEY),[])||[];}
    write(rows){try{this.storage.setItem(KEY,JSON.stringify(rows));return ns.ok(rows);}catch(e){return ns.err("pending_write_failed",String(e&&e.message||e),true);}}
    create(input){
      const rows=this.read();
      const operationId=input.operationId||ns.makeId("op");
      if(rows.some(o=>o.operationId===operationId))return ns.ok(rows.find(o=>o.operationId===operationId));
      const now=ns.nowIso();
      const op={
        operationId,
        playerId:input.playerId||(input.payload&&input.payload.playerId)||null,
        entityType:input.entityType,
        entityId:input.entityId,
        operationType:input.operationType,
        payload:input.payload||{},
        baseRevision:input.baseRevision==null?((input.payload&&input.payload.expectedRevision)!=null?input.payload.expectedRevision:0):input.baseRevision,
        createdAt:now,
        updatedAt:now,
        retryCount:0,
        nextRetryAt:now,
        status:"pending"
      };
      const written=this.write([...rows,op]);
      return written.ok?ns.ok(op):written;
    }
    update(operationId,patch){
      const rows=this.read();
      const next=rows.map(o=>o.operationId===operationId?{...o,...patch,updatedAt:ns.nowIso()}:o);
      return this.write(next);
    }
    listRunnable(now=new Date()){
      const t=now.getTime();
      return this.read().filter(o=>["pending","failed"].includes(o.status)&&(!o.nextRetryAt||new Date(o.nextRetryAt).getTime()<=t)).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
    }
    counts(){
      const rows=this.read();
      return {
        pending:rows.filter(o=>o.status==="pending").length,
        syncing:rows.filter(o=>o.status==="syncing").length,
        failed:rows.filter(o=>o.status==="failed").length,
        completed:rows.filter(o=>o.status==="completed").length,
        conflict:rows.filter(o=>o.status==="conflict").length,
        total:rows.length
      };
    }
    cleanupCompleted(maxAgeMs=7*86400000){
      const cutoff=Date.now()-maxAgeMs;
      return this.write(this.read().filter(o=>o.status!=="completed"||new Date(o.updatedAt||o.createdAt).getTime()>cutoff));
    }
    static key(){return KEY;}
  }
  ns.PendingOperations=PendingOperations;
})(typeof window!=="undefined"?window:globalThis);
