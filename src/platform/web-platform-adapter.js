(function(global){
  const ns=global.PetHabitPlatform=global.PetHabitPlatform||{};
  class WebPlatformAdapter{
    constructor(storage){this.storage=storage||global.localStorage;}
    isOnline(){return typeof navigator==="undefined"?true:navigator.onLine!==false;}
    getDeviceId(){
      const key="petHabitDeviceId_v1";
      let id=this.storage&&this.storage.getItem(key);
      if(!id){
        id=(ns.makeId?ns.makeId("device"):"device_"+Date.now()+"_"+Math.random().toString(36).slice(2,10));
        this.storage&&this.storage.setItem(key,id);
      }
      return id;
    }
    getPlatform(){
      if(typeof navigator==="undefined")return "web";
      const ua=navigator.userAgent||"";
      if(/iPhone|iPad|iPod/i.test(ua))return "ios-web";
      if(/Android/i.test(ua))return "android-web";
      return "web";
    }
    onOnline(cb){global.addEventListener&&global.addEventListener("online",cb);return()=>global.removeEventListener&&global.removeEventListener("online",cb);}
    onOffline(cb){global.addEventListener&&global.addEventListener("offline",cb);return()=>global.removeEventListener&&global.removeEventListener("offline",cb);}
    onBeforeUnload(cb){global.addEventListener&&global.addEventListener("beforeunload",cb);return()=>global.removeEventListener&&global.removeEventListener("beforeunload",cb);}
    getAppVersion(){return (ns.Environment&&ns.Environment.appVersion)||global.APP_VERSION||global.VERSION||"dev";}
  }
  ns.WebPlatformAdapter=WebPlatformAdapter;
})(typeof window!=="undefined"?window:globalThis);
