(function(global){
  const ns=global.PetHabitPlatform=global.PetHabitPlatform||{};
  const existing=global.FEATURE_FLAGS||{};
  ns.FeatureFlags={
    adventure:existing.adventure===true,
    cloudSave:existing.cloudSave===true||global.FEATURE_CLOUD_SAVE===true,
    googleLogin:existing.googleLogin!==false
  };
  ns.isFeatureEnabled=(name,opts={})=>{
    if(name==="adventure"&&opts.developerMode)return true;
    return !!ns.FeatureFlags[name];
  };
})(typeof window!=="undefined"?window:globalThis);
