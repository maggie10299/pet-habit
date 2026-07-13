(function(global){
  const ns=global.PetHabitPlatform=global.PetHabitPlatform||{};
  const FAMILY_KEY="petHabitFamily_v1";
  const rewardKey=(playerId)=>"petHabitRewardLedger_"+(playerId||"solo");
  const adventureKey=(playerId)=>"petHabitAdventureKeys_"+(playerId||"solo");
  const googleBindingKey=(localSaveId)=>"petHabitGoogleLocalBinding_"+(localSaveId||"unknown");
  const roomDecorKey=(playerId)=>playerId?"roomDecorPos_hk_"+playerId:"roomDecorPos_hk";
  class LocalRepository extends (ns.RepositoryContract||class{}){
    constructor(storage){super();this.storage=storage||global.localStorage;}
    readJson(key,fallback=null){return ns.safeJsonParse(this.storage.getItem(key),fallback);}
    writeJson(key,value){
      try{this.storage.setItem(key,JSON.stringify(value));return ns.ok(value);}
      catch(e){return ns.err(e&&e.name==="QuotaExceededError"?"quota_exceeded":"local_write_failed",String(e&&e.message||e),false);}
    }
    getFamily(){return ns.ok(this.readJson(FAMILY_KEY,null));}
    saveFamily(family){return this.writeJson(FAMILY_KEY,family);}
    getPlayers(){
      const family=this.readJson(FAMILY_KEY,null);
      return ns.ok(family&&Array.isArray(family.players)?family.players:[]);
    }
    getPlayer(playerId){
      const players=this.getPlayers().data||[];
      return ns.ok(players.find(p=>p.id===playerId)||null);
    }
    savePlayer(player){
      const family=this.readJson(FAMILY_KEY,null);
      if(!family||!Array.isArray(family.players))return ns.err("family_missing","Family not found",false);
      const next={...family,players:family.players.map(p=>p.id===player.id?{...p,...player}:p)};
      return this.saveFamily(next);
    }
    getPlayerSave(playerId){
      const player=this.getPlayer(playerId).data;
      const key=(player&&player.storageKey)||"habitKingdom";
      return ns.ok({storageKey:key,save:this.readJson(key,{})});
    }
    savePlayerSave(playerId,save,expectedRevision){
      const player=this.getPlayer(playerId).data;
      const key=(player&&player.storageKey)||"habitKingdom";
      const current=this.readJson(key,{});
      const currentRevision=Number((current&&current.platformMetadata&&current.platformMetadata.saveRevision)||0);
      if(expectedRevision!=null&&expectedRevision!==currentRevision){
        return ns.err("local_revision_conflict","Local revision changed",false,{currentRevision,expectedRevision});
      }
      return this.writeJson(key,save);
    }
    getRewardLedger(playerId){return ns.ok(this.readJson(rewardKey(playerId),[]));}
    grantRewardOnce(input){
      const playerId=input&&input.playerId;
      const grantId=input&&input.grantId;
      if(!grantId)return ns.err("invalid_grant","grantId required",false);
      const ledger=this.readJson(rewardKey(playerId),[]);
      if(ledger.some(r=>r.grantId===grantId))return ns.ok({status:"duplicate",ledger});
      const row={...input,createdAt:ns.nowIso()};
      const next=[...ledger,row];
      const written=this.writeJson(rewardKey(playerId),next);
      return written.ok?ns.ok({status:"granted",row,ledger:next}):written;
    }
    getAdventureKeys(playerId){return ns.ok(this.readJson(adventureKey(playerId),[]));}
    grantAdventureKeyOnce(input){
      const playerId=input&&input.playerId;
      const grantId=input&&input.grantId;
      if(!grantId)return ns.err("invalid_grant","grantId required",false);
      const grantKey="petHabitAdventureKeyGrant_"+grantId;
      const keys=this.readJson(adventureKey(playerId),[]);
      if(this.storage.getItem(grantKey)==="true")return ns.ok({status:"duplicate",keys});
      const key={id:ns.makeId("key"),source:input.source,grantId,earnedAt:ns.nowIso(),expiresAt:input.expiresAt};
      const next=[...keys,key].slice(0,5);
      const written=this.writeJson(adventureKey(playerId),next);
      if(!written.ok)return written;
      this.storage.setItem(grantKey,"true");
      return ns.ok({status:next.length===keys.length?"skipped_full":"granted",key,keys:next});
    }
    consumeAdventureKey(input){
      const playerId=input&&input.playerId;
      const keyId=input&&input.keyId;
      const keys=this.readJson(adventureKey(playerId),[]);
      const next=keys.filter(k=>k.id!==keyId);
      if(next.length===keys.length)return ns.ok({status:"not_available",keys});
      const written=this.writeJson(adventureKey(playerId),next);
      return written.ok?ns.ok({status:"consumed",keys:next}):written;
    }
    getDeviceLink(deviceId){return ns.ok(this.readJson("petHabitDeviceLink_"+deviceId,null));}
    upsertDeviceLink(input){return this.writeJson("petHabitDeviceLink_"+input.deviceId,{...input,updatedAt:ns.nowIso()});}
    requestAccountDeletion(input){
      const key="petHabitAccountDeletionRequests_v1";
      const rows=this.readJson(key,[]);
      const row={...input,id:ns.makeId("delete"),requestedAt:ns.nowIso(),status:"local_requested"};
      const written=this.writeJson(key,[...rows,row]);
      return written.ok?ns.ok(row):written;
    }
    getRoomDecor(playerId){return ns.ok(this.readJson(roomDecorKey(playerId),{}));}
    saveRoomDecor(playerId,pos){return this.writeJson(roomDecorKey(playerId),pos||{});}
    getGoogleLocalBinding(localSaveId){return ns.ok(this.readJson(googleBindingKey(localSaveId),null));}
  }
  ns.LocalRepository=LocalRepository;
})(typeof window!=="undefined"?window:globalThis);
