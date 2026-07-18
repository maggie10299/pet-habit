(function(global){
  const ns=global.PetHabitPlatform=global.PetHabitPlatform||{};
  class AppBoot{
    constructor({featureFlags,platformAdapter,localRepository,analyticsAdapter}={}){
      this.flags=featureFlags||ns.FeatureFlags||{cloudSave:false};
      this.platform=platformAdapter||new ns.WebPlatformAdapter();
      this.local=localRepository||new ns.LocalRepository();
      this.analytics=analyticsAdapter||new ns.AnalyticsAdapter();
      this.steps=[];
    }
    step(name){this.steps.push({name,at:ns.nowIso()});}
    async run(){
      this.step("boot_start");
      this.step("local_repository_ready");
      this.step("local_migration_checked");
      const active=this.local.getFamily();
      this.step("active_player_ready");
      this.step("platform_ready");
      this.step("auth_checked");
      let selectedRepository="local_only";
      let cloud=null;
      const authRepository=(this.flags.googleLogin&&ns.SupabaseCloudRepository)
        ?new ns.SupabaseCloudRepository({writeEnabled:false})
        :null;
      if(this.flags.cloudSave){
        const supabase=new ns.SupabaseCloudRepository();
        if(supabase.ready){cloud=supabase;selectedRepository="supabase";}
        else if(ns.Environment&&ns.Environment.developerMode){cloud=new ns.MockCloudRepository(global.localStorage,"mock_cloud_offline");selectedRepository="local_only_missing_config";}
        else{cloud={constructor:{name:"LocalOnlyRepository"},savePlayerSave:async()=>ns.err("cloud_disabled","Cloud Save is not ready",false)};selectedRepository="local_only_missing_config";}
      }else{
        if(ns.Environment&&ns.Environment.developerMode){
          cloud=new ns.MockCloudRepository(global.localStorage);
          selectedRepository="mock_cloud";
        }else{
          cloud={constructor:{name:"LocalOnlyRepository"},savePlayerSave:async()=>ns.err("cloud_disabled","Cloud Save is disabled",false)};
          selectedRepository="local_only";
        }
      }
      this.step("cloud_repository_selected");
      const pending=new ns.PendingOperations();
      const saveManager=new ns.SaveManager({localRepository:this.local,pendingOperations:pending,platformAdapter:this.platform,analyticsAdapter:this.analytics});
      const mappingManager=new ns.CloudMappingManager();
      const authManager=new ns.SupabaseAuthManager({repository:authRepository||cloud,analyticsAdapter:this.analytics});
      if(authManager.initializeAuth)await authManager.initializeAuth();
      else{
        authManager.startAuthListener&&authManager.startAuthListener();
        await authManager.restoreSession();
      }
      this.step("auth_session_checked");
      const migrationManager=new ns.CloudMigrationManager({localRepository:this.local,cloudRepository:cloud,saveManager,mappingManager});
      const syncManager=new ns.SyncManager({pendingOperations:pending,localRepository:this.local,cloudRepository:cloud,platformAdapter:this.platform,analyticsAdapter:this.analytics,saveManager});
      syncManager.start();
      this.step("sync_manager_started");
      this.step("app_ready");
      return ns.ok({steps:this.steps,active:active.data,selectedRepository,platform:this.platform,localRepository:this.local,pendingOperations:pending,cloudRepository:cloud,saveManager,syncManager,authManager,mappingManager,migrationManager});
    }
  }
  ns.AppBoot=AppBoot;
})(typeof window!=="undefined"?window:globalThis);
