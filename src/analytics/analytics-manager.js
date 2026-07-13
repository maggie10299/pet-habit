(function(global){
  const ns=global.PetHabitPlatform=global.PetHabitPlatform||{};
  class AnalyticsAdapter{
    track(event,payload={}){
      try{
        if(global.MaggieAnalytics&&typeof global.MaggieAnalytics.track==="function")global.MaggieAnalytics.track(event,payload);
        else if(global.trackGameEvent)global.trackGameEvent(event,payload);
      }catch(e){}
    }
    cloudSyncStart(payload){this.track("cloud_sync_start",payload);}
    cloudSyncSuccess(payload){this.track("cloud_sync_success",payload);}
    cloudSyncFail(payload){this.track("cloud_sync_fail",payload);}
    cloudSyncRetry(payload){this.track("cloud_sync_retry",payload);}
    cloudSyncConflict(payload){this.track("cloud_sync_conflict",payload);}
    pendingCreated(payload){this.track("pending_operation_created",payload);}
    pendingCompleted(payload){this.track("pending_operation_completed",payload);}
    pendingFailed(payload){this.track("pending_operation_failed",payload);}
  }
  ns.AnalyticsAdapter=AnalyticsAdapter;
})(typeof window!=="undefined"?window:globalThis);
