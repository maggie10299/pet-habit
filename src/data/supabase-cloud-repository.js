(function(global){
  const ns=global.PetHabitPlatform=global.PetHabitPlatform||{};
  class SupabaseCloudRepository extends (ns.RepositoryContract||class{}){
    constructor(config={}){
      super();
      this.url=config.url||(ns.Environment&&ns.Environment.supabaseUrl)||"";
      this.publishableKey=config.publishableKey||(ns.Environment&&ns.Environment.supabasePublishableKey)||"";
      this.writeEnabled=config.writeEnabled===true;
      this.configValid=!!(this.url&&this.publishableKey&&!/\/rest\/v1\/?$/i.test(this.url));
      this.clientOptions=config.clientOptions||{
        auth:{
          persistSession:true,
          autoRefreshToken:true,
          detectSessionInUrl:true,
          storage:global.localStorage
        }
      };
      this.client=config.client||this.createClient();
      this.ready=!!(this.configValid&&this.client);
    }
    createClient(){
      if(!this.configValid)return null;
      const sdk=global.supabase||global.Supabase;
      if(sdk&&typeof sdk.createClient==="function")return sdk.createClient(this.url,this.publishableKey,this.clientOptions);
      return null;
    }
    refreshClient(){
      if(!this.client)this.client=this.createClient();
      this.ready=!!(this.configValid&&this.client);
      return this.ready;
    }
    normalizeError(error,code="supabase_error",retryable=true){
      return ns.err((error&&error.code)||code,(error&&error.message)||String(error||code),retryable,{raw:error});
    }
    notReady(){
      if(this.url&&/\/rest\/v1\/?$/i.test(this.url))return ns.err("supabase_invalid_url","Use the Supabase project root URL, not /rest/v1/",false);
      return ns.err("supabase_not_configured","Supabase config/client not ready; using local-only or mock repository",true);
    }
    ensureReady(){return (this.ready||this.refreshClient())?null:this.notReady();}
    writesDisabled(){return ns.err("supabase_writes_disabled","Supabase writes are disabled until Migration, RLS, and RPC pass manual review",false);}
    requireWrite(){return this.writeEnabled?this.ensureReady():this.writesDisabled();}
    async getCurrentUser(){
      const bad=this.ensureReady();if(bad)return bad;
      try{
        const res=await this.client.auth.getUser();
        if(res.error)return this.normalizeError(res.error,"auth_get_user_failed",true);
        return ns.ok(res.data&&res.data.user||null);
      }catch(e){return ns.err("auth_get_user_failed",String(e&&e.message||e),true);}
    }
    userMeta(user){
      const meta=user&&user.user_metadata||{};
      return {displayName:meta.name||meta.full_name||null};
    }
    async rpc(name,args,retryable=true){
      const bad=this.ensureReady();if(bad)return bad;
      try{
        const res=await this.client.rpc(name,args||{});
        if(res.error)return this.normalizeError(res.error,name+"_failed",retryable);
        return ns.ok(res.data);
      }catch(e){return ns.err(name+"_failed",String(e&&e.message||e),retryable);}
    }
    async getOrCreateProfile(){
      const write=this.requireWrite();if(write)return write;
      const user=await this.getCurrentUser();if(!user.ok)return user;
      const m=this.userMeta(user.data);
      const res=await this.rpc("get_or_create_profile",{p_display_name:m.displayName||null},false);
      return res.ok?ns.ok(Array.isArray(res.data)?res.data[0]:res.data):res;
    }
    async getOrCreateFamily(name){
      const write=this.requireWrite();if(write)return write;
      const res=await this.rpc("get_or_create_family",{p_family_name:name||"我的家庭"},false);
      return res.ok?ns.ok(Array.isArray(res.data)?res.data[0]:res.data):res;
    }
    async getOrCreatePlayer(input){
      const write=this.requireWrite();if(write)return write;
      const res=await this.rpc("get_or_create_player",{
        p_family_id:input.familyId,
        p_local_player_id:input.localPlayerId,
        p_local_save_id:input.localSaveId,
        p_display_name:input.displayName,
        p_pet_name:input.petName||null
      },false);
      return res.ok?ns.ok(Array.isArray(res.data)?res.data[0]:res.data):res;
    }
    async getFamily(){
      const bad=this.ensureReady();if(bad)return bad;
      const res=await this.rpc("get_default_family",{},true);
      return res.ok?ns.ok(Array.isArray(res.data)?res.data[0]:res.data):res;
    }
    async getPlayers(familyId){
      const bad=this.ensureReady();if(bad)return bad;
      let q=this.client.from("players").select("*").order("created_at",{ascending:true});
      if(familyId)q=q.eq("family_id",familyId);
      const res=await q;
      if(res.error)return this.normalizeError(res.error,"get_players_failed",true);
      return ns.ok(res.data||[]);
    }
    async getPlayer(playerId){
      const bad=this.ensureReady();if(bad)return bad;
      const res=await this.client.from("players").select("*").eq("id",playerId).maybeSingle();
      if(res.error)return this.normalizeError(res.error,"get_player_failed",true);
      return ns.ok(res.data||null);
    }
    async getPlayerSave(playerId){
      const bad=this.ensureReady();if(bad)return bad;
      const res=await this.client.from("player_saves").select("*").eq("player_id",playerId).maybeSingle();
      if(res.error)return this.normalizeError(res.error,"get_player_save_failed",true);
      return ns.ok(res.data||null);
    }
    async savePlayerSave(playerId,save,expectedRevision=0){return this.upsertPlayerSave(playerId,save,expectedRevision);}
    async upsertPlayerSave(playerId,save,expectedRevision=0){
      const write=this.requireWrite();if(write)return write;
      const sanitized=this.sanitizeSaveForCloud(save||{});
      const meta=sanitized&&sanitized.platformMetadata||{};
      const res=await this.rpc("upsert_player_save",{
        p_player_id:playerId,
        p_schema_version:Number(meta.schemaVersion||global.APP_SCHEMA_VERSION||2),
        p_save_json:sanitized,
        p_expected_revision:Number(expectedRevision||0),
        p_device_id:meta.deviceId||"",
        p_client_updated_at:meta.localModifiedAt||ns.nowIso()
      },true);
      if(!res.ok)return res;
      const row=Array.isArray(res.data)?res.data[0]:res.data;
      if(row&&row.ok===false&&row.status==="conflict")return ns.err("revision_conflict","Cloud revision conflict",false,row);
      return ns.ok({saveRevision:row&&row.save_revision,serverUpdatedAt:row&&row.server_updated_at,status:row&&row.status});
    }
    async getSaveSummary(playerId){
      const save=await this.getPlayerSave(playerId);
      if(!save.ok)return save;
      const balance=await this.getPlayerBalance(playerId);
      if(!balance.ok)return balance;
      const s=save.data&&save.data.save_json||{};
      const b=balance.data||{};
      return ns.ok({playerId,saveRevision:save.data&&save.data.save_revision||0,pet:s.pet||s.selectedPet||"",stars:b.stars||0,apples:b.apples||0,balanceRevision:b.revision||0,serverUpdatedAt:save.data&&save.data.server_updated_at});
    }
    async getRewardLedger(playerId){
      const bad=this.ensureReady();if(bad)return bad;
      const res=await this.client.from("reward_ledger").select("*").eq("player_id",playerId).order("created_at",{ascending:false});
      if(res.error)return this.normalizeError(res.error,"get_reward_ledger_failed",true);
      return ns.ok(res.data||[]);
    }
    sanitizeSaveForCloud(save){
      const blocked=["stars","apples","apple","paidStatus","rewardEligibility","adventureKeys","adventureKeyCount","serverRevision","authUserId","familyOwnerId","admin","adminFlags","accountDeletionState"];
      const clone=JSON.parse(JSON.stringify(save||{}));
      blocked.forEach(k=>{if(Object.prototype.hasOwnProperty.call(clone,k))delete clone[k];});
      clone.platformMetadata=clone.platformMetadata||{};
      clone.platformMetadata.schemaVersion=Number(clone.platformMetadata.schemaVersion||global.APP_SCHEMA_VERSION||2);
      return clone;
    }
    async getPlayerBalance(playerId){
      const bad=this.ensureReady();if(bad)return bad;
      const res=await this.rpc("get_player_balance",{p_player_id:playerId},true);
      return res.ok?ns.ok(Array.isArray(res.data)?res.data[0]:res.data):res;
    }
    async migrateInitialPlayerBalance(input){
      const write=this.requireWrite();if(write)return write;
      const res=await this.rpc("migrate_initial_player_balance",{p_player_id:input.playerId,p_apples:Number(input.apples||0),p_stars:Number(input.stars||0),p_migration_id:input.migrationId||null},false);
      return res.ok?ns.ok(Array.isArray(res.data)?res.data[0]:res.data):res;
    }
    async claimDailyReward(input){
      const write=this.requireWrite();if(write)return write;
      const playerId=typeof input==="string"?input:input&&input.playerId;
      const res=await this.rpc("claim_daily_reward",{p_player_id:playerId},false);
      return res.ok?ns.ok(Array.isArray(res.data)?res.data[0]:res.data):res;
    }
    async spendPlayerBalance(input){
      const write=this.requireWrite();if(write)return write;
      const res=await this.rpc("spend_player_balance",{p_player_id:input.playerId,p_currency:input.currency,p_amount:Number(input.amount||0),p_reason:input.reason||"spend",p_idempotency_key:input.idempotencyKey||input.operationId||""},false);
      return res.ok?ns.ok(Array.isArray(res.data)?res.data[0]:res.data):res;
    }
    async grantRewardOnce(input){
      const write=this.requireWrite();if(write)return write;
      return ns.err("reward_rpc_removed","Generic reward grants are disabled. Use a verified reward RPC.",false);
    }
    async getAdventureKeys(playerId){
      const bad=this.ensureReady();if(bad)return bad;
      const res=await this.client.from("adventure_keys").select("*").eq("player_id",playerId).is("consumed_at",null).gt("expires_at",new Date().toISOString()).order("earned_at",{ascending:true});
      if(res.error)return this.normalizeError(res.error,"get_adventure_keys_failed",true);
      return ns.ok(res.data||[]);
    }
    async grantAdventureKeyOnce(input){
      const write=this.requireWrite();if(write)return write;
      const type=input&&input.type||input&&input.source;
      if(type==="finish_daily"){
        return ns.err("finish_daily_adventure_key_disabled","Finish-daily adventure keys are disabled until server-authoritative habit completion is available",false);
      }
      const rpcName="claim_daily_adventure_key";
      const res=await this.rpc(rpcName,{p_player_id:input.playerId},false);
      return res.ok?ns.ok(Array.isArray(res.data)?res.data[0]:res.data):res;
    }
    async consumeAdventureKey(input){
      const write=this.requireWrite();if(write)return write;
      const res=await this.rpc("consume_adventure_key",{p_player_id:input.playerId,p_key_id:input.keyId},false);
      return res.ok?ns.ok(Array.isArray(res.data)?res.data[0]:res.data):res;
    }
    async getDeviceLink(deviceId){
      const bad=this.ensureReady();if(bad)return bad;
      const res=await this.client.from("device_links").select("*").eq("device_id",deviceId).maybeSingle();
      if(res.error)return this.normalizeError(res.error,"get_device_link_failed",true);
      return ns.ok(res.data||null);
    }
    async upsertDeviceLink(input){
      const write=this.requireWrite();if(write)return write;
      const res=await this.rpc("upsert_device_link",{p_family_id:input.familyId,p_device_id:input.deviceId,p_device_name:input.deviceName||null,p_platform:input.platform||"web"},true);
      return res.ok?ns.ok({id:res.data}):res;
    }
    async requestAccountDeletion(input){
      const write=this.requireWrite();if(write)return write;
      const res=await this.rpc("request_account_deletion",{p_metadata:input&&input.metadata||{}},false);
      return res.ok?ns.ok({id:res.data,status:"pending"}):res;
    }
    async signOut(){
      const bad=this.ensureReady();if(bad)return bad;
      const res=await this.client.auth.signOut();
      if(res.error)return this.normalizeError(res.error,"sign_out_failed",true);
      return ns.ok({status:"signed_out"});
    }
    async getCloudSaveMetadata(){
      const bad=this.ensureReady();if(bad)return bad;
      const res=await this.rpc("get_player_save_metadata",{},true);
      if(!res.ok)return res;
      const row=Array.isArray(res.data)?res.data[0]:res.data;
      return ns.ok(row||null);
    }
    async getCloudSave(){
      const bad=this.ensureReady();if(bad)return bad;
      const res=await this.rpc("get_player_save",{},true);
      if(!res.ok)return res;
      const row=Array.isArray(res.data)?res.data[0]:res.data;
      return ns.ok(row||null);
    }
    async upsertCloudSave(input){
      const write=this.requireWrite();if(write)return write;
      const res=await this.rpc("upsert_player_save_v1",{
        p_save_data:input.saveData,
        p_schema_version:String(input.schemaVersion||global.APP_SCHEMA_VERSION||2),
        p_game_version:String(input.gameVersion||global.APP_VERSION||global.VERSION||""),
        p_checksum:String(input.checksum||""),
        p_device_id:String(input.deviceId||""),
        p_expected_save_version:Number(input.expectedSaveVersion||0)
      },true);
      if(!res.ok)return res;
      const row=Array.isArray(res.data)?res.data[0]:res.data;
      if(row&&row.ok===false&&row.status==="conflict")return ns.err("cloud_save_conflict","Cloud save version conflict",false,row);
      return ns.ok(row||{});
    }
    async createCloudSnapshot(input){
      const write=this.requireWrite();if(write)return write;
      const meta=input&&input.metadata||null;
      const res=await this.rpc("create_cloud_snapshot",{
        p_source:String(input.source||"manual_backup"),
        p_metadata:meta||{}
      },false);
      return res.ok?ns.ok(Array.isArray(res.data)?res.data[0]:res.data):res;
    }
  }
  ns.SupabaseCloudRepository=SupabaseCloudRepository;
})(typeof window!=="undefined"?window:globalThis);
