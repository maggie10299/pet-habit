(function(global){
  const ns=global.PetHabitPlatform=global.PetHabitPlatform||{};
  const ACCOUNT_KEY="petHabitCloudAccount_v1";
  const PLAYER_MAP_KEY="petHabitCloudPlayerMap_v1";
  const SYNC_META_KEY="petHabitCloudSyncMeta_v1";
  class CloudMappingManager{
    constructor(storage){this.storage=storage||global.localStorage;}
    readJson(key,fallback){try{return ns.safeJsonParse(this.storage.getItem(key),fallback);}catch(e){return fallback;}}
    writeJson(key,value){
      try{this.storage.setItem(key,JSON.stringify(value));return ns.ok(value);}
      catch(e){return ns.err("storage_write_failed",String(e&&e.message||e),true,{key});}
    }
    getAccount(){return ns.ok(this.readJson(ACCOUNT_KEY,null));}
    setAccount(account){return this.writeJson(ACCOUNT_KEY,{mappingVersion:1,...(account||{}),updatedAt:ns.nowIso()});}
    getPlayerMap(){return ns.ok(this.readJson(PLAYER_MAP_KEY,{}));}
    validateAccount(authUserId){
      const account=this.getAccount().data;
      if(!account)return ns.ok({status:"missing"});
      if(account.authUserId&&authUserId&&account.authUserId!==authUserId){
        return ns.err("cloud_mapping_auth_mismatch","Cloud mapping belongs to a different Google/Supabase account",false,{mappedAuthUserId:account.authUserId,currentAuthUserId:authUserId});
      }
      return ns.ok(account);
    }
    setPlayerMapping(inputOrLocalPlayerId,localSaveId,cloudPlayerId,cloudFamilyId){
      const input=typeof inputOrLocalPlayerId==="object"?inputOrLocalPlayerId:{localPlayerId:inputOrLocalPlayerId,localSaveId,cloudPlayerId,cloudFamilyId};
      const map=this.getPlayerMap().data||{};
      const row={mappingVersion:1,authUserId:input.authUserId||"",familyId:input.familyId||input.cloudFamilyId||"",localPlayerId:input.localPlayerId,localSaveId:input.localSaveId,cloudPlayerId:input.cloudPlayerId,updatedAt:ns.nowIso()};
      map[input.localPlayerId]=row;
      if(input.localSaveId)map["save:"+input.localSaveId]=row;
      return this.writeJson(PLAYER_MAP_KEY,map);
    }
    getPlayerMapping(localPlayerIdOrSaveId,authUserId){
      const map=this.getPlayerMap().data||{};
      const row=map[localPlayerIdOrSaveId]||map["save:"+localPlayerIdOrSaveId]||null;
      if(row&&row.authUserId&&authUserId&&row.authUserId!==authUserId){
        return ns.err("cloud_mapping_auth_mismatch","Player mapping belongs to a different account",false,{mappedAuthUserId:row.authUserId,currentAuthUserId:authUserId});
      }
      return ns.ok(row);
    }
    getSyncMeta(){return ns.ok(this.readJson(SYNC_META_KEY,{}));}
    setSyncMeta(playerId,patch){
      const meta=this.getSyncMeta().data||{};
      meta[playerId]={...(meta[playerId]||{}),...(patch||{}),updatedAt:ns.nowIso()};
      return this.writeJson(SYNC_META_KEY,meta);
    }
    static keys(){return {ACCOUNT_KEY,PLAYER_MAP_KEY,SYNC_META_KEY};}
  }
  ns.CloudMappingManager=CloudMappingManager;
})(typeof window!=="undefined"?window:globalThis);
