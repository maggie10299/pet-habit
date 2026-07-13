(function(global){
  const ns=global.PetHabitPlatform=global.PetHabitPlatform||{};
  ns.ok=(data)=>({ok:true,data});
  ns.err=(code,message,retryable=false,details)=>({ok:false,error:{code,message,retryable,details}});
  ns.safeJsonParse=(raw,fallback=null)=>{
    try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}
  };
  ns.nowIso=()=>new Date().toISOString();
  ns.makeId=(prefix="id")=>prefix+"_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,10);
})(typeof window!=="undefined"?window:globalThis);
