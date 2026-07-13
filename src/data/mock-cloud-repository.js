(function(global){
  const ns=global.PetHabitPlatform=global.PetHabitPlatform||{};
  const KEY="petHabitMockCloud_v1";
  class MockCloudRepository extends (ns.RepositoryContract||class{}){
    constructor(storage,mode){super();this.storage=storage||global.localStorage;this.mode=mode||this.storage.getItem("petHabitMockCloudMode")||"mock_cloud_success";}
    setMode(mode){this.mode=mode;this.storage.setItem("petHabitMockCloudMode",mode);}
    delay(){return new Promise(r=>setTimeout(r,80));}
    async respond(data){
      if(this.mode==="mock_cloud_offline")return ns.err("offline","Mock cloud offline",true);
      if(this.mode==="mock_cloud_timeout"){await new Promise(r=>setTimeout(r,350));return ns.err("timeout","Mock cloud timeout",true);}
      if(this.mode==="mock_cloud_server_error")return ns.err("server_error","Mock server error",true);
      if(this.mode==="mock_cloud_conflict")return ns.err("revision_conflict","Mock revision conflict",false,{cloud:{summary:"mock conflict"}});
      if(this.mode==="mock_cloud_duplicate")return ns.ok({status:"duplicate",duplicate:true});
      await this.delay();
      return ns.ok(data);
    }
    read(){return ns.safeJsonParse(this.storage.getItem(KEY),{families:{},players:{},saves:{},operations:{},rewardLedger:{},adventureKeys:{},devices:{}});}
    write(db){this.storage.setItem(KEY,JSON.stringify(db));}
    async getFamily(){return this.respond(this.read().family||null);}
    async saveFamily(family){const db=this.read();db.family=family;this.write(db);return this.respond(family);}
    async getPlayers(){return this.respond(Object.values(this.read().players||{}));}
    async getPlayer(playerId){return this.respond((this.read().players||{})[playerId]||null);}
    async savePlayer(player){const db=this.read();db.players=db.players||{};db.players[player.id]=player;this.write(db);return this.respond(player);}
    async getPlayerSave(playerId){return this.respond((this.read().saves||{})[playerId]||null);}
    async savePlayerSave(playerId,save,expectedRevision=0){
      if(this.mode==="mock_cloud_conflict")return this.respond(null);
      if(this.mode==="mock_cloud_duplicate")return this.respond({status:"duplicate",duplicate:true,saveRevision:expectedRevision});
      const db=this.read();db.saves=db.saves||{};
      const current=db.saves[playerId];
      const currentRevision=Number(current&&current.saveRevision||0);
      if(current&&currentRevision!==expectedRevision)return ns.err("revision_conflict","Cloud revision conflict",false,{currentRevision,expectedRevision});
      const next={save,saveRevision:currentRevision+1,serverUpdatedAt:ns.nowIso()};
      db.saves[playerId]=next;this.write(db);return this.respond(next);
    }
    async getRewardLedger(playerId){return this.respond((this.read().rewardLedger||{})[playerId]||[]);}
    async grantRewardOnce(input){const db=this.read();db.rewardLedger=db.rewardLedger||{};const rows=db.rewardLedger[input.playerId]||[];if(rows.some(r=>r.grantId===input.grantId))return this.respond({status:"duplicate"});const row={...input,createdAt:ns.nowIso()};db.rewardLedger[input.playerId]=[...rows,row];this.write(db);return this.respond({status:"granted",row});}
    async getAdventureKeys(playerId){return this.respond((this.read().adventureKeys||{})[playerId]||[]);}
    async grantAdventureKeyOnce(input){const db=this.read();db.adventureKeys=db.adventureKeys||{};const rows=db.adventureKeys[input.playerId]||[];if(rows.some(k=>k.grantId===input.grantId))return this.respond({status:"duplicate",keys:rows});const key={...input,id:ns.makeId("cloud_key"),earnedAt:ns.nowIso()};db.adventureKeys[input.playerId]=[...rows,key].slice(0,5);this.write(db);return this.respond({status:"granted",key,keys:db.adventureKeys[input.playerId]});}
    async consumeAdventureKey(input){return this.respond({status:"not_implemented_mock",input});}
    async getDeviceLink(deviceId){return this.respond((this.read().devices||{})[deviceId]||null);}
    async upsertDeviceLink(input){const db=this.read();db.devices=db.devices||{};db.devices[input.deviceId]={...input,updatedAt:ns.nowIso()};this.write(db);return this.respond(db.devices[input.deviceId]);}
    async requestAccountDeletion(input){return this.respond({id:ns.makeId("delete"),...input,status:"mock_requested"});}
  }
  ns.MockCloudRepository=MockCloudRepository;
})(typeof window!=="undefined"?window:globalThis);
