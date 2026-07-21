(function(global){
  const ns=global.PetHabitPlatform=global.PetHabitPlatform||{};
  const state={ready:false,result:null,error:null};
  ns.PlatformFoundationState=state;
  ns.bootstrapPlatformFoundation=async function(options={}){
    try{
      const flags={...(ns.FeatureFlags||{}),...(options.featureFlags||{})};
      const boot=new ns.AppBoot({featureFlags:flags});
      const result=await boot.run();
      state.ready=true;state.result=result;state.error=null;
      return result;
    }catch(e){
      state.ready=false;state.error={code:"boot_failed",message:String(e&&e.message||e)};
      return ns.err("boot_failed",state.error.message,true);
    }
  };
  ns.getSyncDebugState=function(){
    const result=state.result&&state.result.data;
    const pending=result&&result.pendingOperations;
      const sync=result&&result.syncManager;
      const save=result&&result.saveManager;
      const platform=result&&result.platform;
      const auth=result&&result.authManager;
      const cloudSave=result&&result.cloudSaveManager;
      const cloud=result&&result.cloudRepository;
      const mapping=result&&result.mappingManager;
      const activePlayerId=result&&result.active&&result.active.activePlayerId;
      const analytics=global.MaggieAnalytics&&global.MaggieAnalytics.getDebugState?global.MaggieAnalytics.getDebugState():null;
      const perf=global.__PET_HABIT_PERF||null;
      return {
        ready:state.ready,
        error:state.error,
        appEnv:ns.Environment&&ns.Environment.appEnv,
        supabaseConfigured:!!(ns.Environment&&ns.Environment.supabaseUrl&&ns.Environment.supabasePublishableKey),
        supabaseKeyPreview:ns.Environment&&ns.Environment.supabasePublishableKey?String(ns.Environment.supabasePublishableKey).slice(0,14)+"…":"",
        sdkLoaded:!!(global.supabase&&global.supabase.createClient),
        clientReady:!!(cloud&&cloud.ready),
        authStatus:auth&&auth.getStatus?auth.getStatus():null,
        cloudSaveStatus:cloudSave&&cloudSave.getStatus?cloudSave.getStatus():null,
        cloudWriteEnabled:!!(cloud&&cloud.writeEnabled),
        cloudAccount:mapping&&mapping.getAccount?mapping.getAccount().data:null,
        deviceId:platform&&platform.getDeviceId?platform.getDeviceId():"",
        activePlayerId:activePlayerId||"",
        cloudRevision:save&&save.getCloudRevision&&activePlayerId?save.getCloudRevision(activePlayerId):0,
        selectedRepository:result&&result.selectedRepository||"not_ready",
      analytics:analytics,
      perf:perf,
      trafficSource:ns.TrafficSource&&ns.TrafficSource.getDebugState?ns.TrafficSource.getDebugState():null,
      syncStatus:save&&save.getSyncStatus?save.getSyncStatus():"unknown",
      syncManager:sync&&sync.getStatus?sync.getStatus():null,
      pending:pending&&pending.counts?pending.counts():null,
      featureFlags:ns.FeatureFlags,
      bootSteps:result&&result.steps||[]
    };
  };
  ns.setMockCloudMode=function(mode){
    try{
      global.localStorage&&global.localStorage.setItem("petHabitMockCloudMode",mode);
      const cloud=state.result&&state.result.data&&state.result.data.cloudRepository;
      if(cloud&&cloud.setMode)cloud.setMode(mode);
      return ns.ok({mode});
    }catch(e){return ns.err("mock_mode_failed",String(e&&e.message||e),false);}
  };
  ns.syncNow=function(){
    const sync=state.result&&state.result.data&&state.result.data.syncManager;
    return sync&&sync.syncNow?sync.syncNow():Promise.resolve(ns.err("sync_not_ready","Sync manager not ready",true));
  };
  ns.restoreAuthSession=function(){
    const auth=state.result&&state.result.data&&state.result.data.authManager;
    return auth&&auth.restoreSession?auth.restoreSession():Promise.resolve(ns.err("auth_not_ready","Auth manager not ready",true));
  };
  ns.signInWithSupabaseGoogle=function(){
    const auth=state.result&&state.result.data&&state.result.data.authManager;
    return auth&&auth.signInWithGoogle?auth.signInWithGoogle():Promise.resolve(ns.err("auth_not_ready","Auth manager not ready",true));
  };
  ns.getSupabaseAuthBindingPayload=function(){
    const auth=state.result&&state.result.data&&state.result.data.authManager;
    return auth&&auth.getLocalBindingPayload?auth.getLocalBindingPayload():null;
  };
  ns.subscribeAuthState=function(callback){
    const auth=state.result&&state.result.data&&state.result.data.authManager;
    if(auth&&auth.subscribe)return auth.subscribe(callback);
    return function(){};
  };
  ns.signOutSupabase=function(){
    const auth=state.result&&state.result.data&&state.result.data.authManager;
    return auth&&auth.signOut?auth.signOut():Promise.resolve(ns.err("auth_not_ready","Auth manager not ready",true));
  };
  ns.getCloudSaveStatus=function(){
    const mgr=state.result&&state.result.data&&state.result.data.cloudSaveManager;
    return mgr&&mgr.getStatus?mgr.getStatus():{status:"not_ready"};
  };
  ns.subscribeCloudSaveState=function(callback){
    const mgr=state.result&&state.result.data&&state.result.data.cloudSaveManager;
    if(mgr&&mgr.subscribe)return mgr.subscribe(callback);
    return function(){};
  };
  ns.initialCloudSaveCheck=function(){
    const mgr=state.result&&state.result.data&&state.result.data.cloudSaveManager;
    return mgr&&mgr.initialCheck?mgr.initialCheck():Promise.resolve(ns.err("cloud_save_not_ready","Cloud Save 尚未準備好",true));
  };
  ns.markCloudSaveDirty=function(reason){
    const mgr=state.result&&state.result.data&&state.result.data.cloudSaveManager;
    return mgr&&mgr.markSaveDirty?mgr.markSaveDirty(reason):ns.err("cloud_save_not_ready","Cloud Save 尚未準備好",true);
  };
  ns.manualCloudBackup=function(){
    const mgr=state.result&&state.result.data&&state.result.data.cloudSaveManager;
    try{console.log("[CloudSave] platform_manualCloudBackup_called",{ready:!!mgr,has_manual:!!(mgr&&mgr.manualBackup),boot_ready:!!state.ready});}catch(e){}
    return mgr&&mgr.manualBackup?mgr.manualBackup({source:"manual_backup"}):Promise.resolve(ns.err("cloud_save_not_ready","Cloud Save 尚未準備好",true));
  };
  ns.prepareCloudBackup=function(){
    const mgr=state.result&&state.result.data&&state.result.data.cloudSaveManager;
    return mgr&&mgr.prepareFirstBackup?mgr.prepareFirstBackup():Promise.resolve(ns.err("cloud_save_not_ready","Cloud Save 尚未準備好",true));
  };
  ns.selectCloudBackupCandidate=function(candidateId){
    const mgr=state.result&&state.result.data&&state.result.data.cloudSaveManager;
    return mgr&&mgr.selectLocalCandidate?mgr.selectLocalCandidate(candidateId):ns.err("cloud_save_not_ready","Cloud Save 尚未準備好",true);
  };
  ns.confirmCloudBackupCandidate=function(candidateId){
    const mgr=state.result&&state.result.data&&state.result.data.cloudSaveManager;
    return mgr&&mgr.confirmFirstBackup?mgr.confirmFirstBackup(candidateId):Promise.resolve(ns.err("cloud_save_not_ready","Cloud Save 尚未準備好",true));
  };
  ns.restoreCloudSave=function(){
    const mgr=state.result&&state.result.data&&state.result.data.cloudSaveManager;
    return mgr&&mgr.restoreFromCloud?mgr.restoreFromCloud():Promise.resolve(ns.err("cloud_save_not_ready","Cloud Save 尚未準備好",true));
  };
  ns.resolveCloudSaveConflict=function(choice){
    const mgr=state.result&&state.result.data&&state.result.data.cloudSaveManager;
    return mgr&&mgr.resolveConflict?mgr.resolveConflict(choice):Promise.resolve(ns.err("cloud_save_not_ready","Cloud Save 尚未準備好",true));
  };
  ns.prepareCloudMigrationPlan=function(){
    const mgr=state.result&&state.result.data&&state.result.data.migrationManager;
    return mgr&&mgr.prepareMigrationPlan?mgr.prepareMigrationPlan():Promise.resolve(ns.err("migration_not_ready","Migration manager not ready",true));
  };
})(typeof window!=="undefined"?window:globalThis);
