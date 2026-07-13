(function(global){
  "use strict";

  var VERSION = "traffic-source-v2.0.0";
  var FIRST_SOURCE_KEY = "analytics.firstSource";
  var ALLOWED = ["facebook","instagram","threads","official","line","qr"];
  var SOURCE_VALUES = ALLOWED.concat(["direct","unknown"]);
  var state = {
    initialized:false,
    currentLaunch:"browser",
    campaign:"",
    sanitizedReferrer:"",
    firstSource:"",
    reason:"not_initialized",
    firstSourceExisted:false
  };

  function safeGet(key){try{return global.localStorage && global.localStorage.getItem(key);}catch(e){return null;}}
  function safeSet(key,value){try{global.localStorage && global.localStorage.setItem(key,value);}catch(e){}}
  function safeRemove(key){try{global.localStorage && global.localStorage.removeItem(key);}catch(e){}}

  function getSearchParam(name){
    try{return new URLSearchParams(global.location && global.location.search || "").get(name) || "";}catch(e){return "";}
  }

  function normalizeAllowedSource(value){
    var v = String(value || "").trim().toLowerCase();
    return ALLOWED.indexOf(v) >= 0 ? v : "";
  }

  function classifyReferrer(raw){
    if(!raw)return {source:"direct", reason:"no_referrer"};
    try{
      var url = new URL(raw);
      var host = String(url.hostname || "").toLowerCase();
      if(["facebook.com","www.facebook.com","m.facebook.com","l.facebook.com","lm.facebook.com"].indexOf(host)>=0 || /\.facebook\.com$/.test(host))return {source:"facebook",reason:"referrer_domain"};
      if(["instagram.com","www.instagram.com","l.instagram.com"].indexOf(host)>=0 || /\.instagram\.com$/.test(host))return {source:"instagram",reason:"referrer_domain"};
      if(["threads.net","www.threads.net","threads.com","www.threads.com"].indexOf(host)>=0 || /\.threads\.net$/.test(host) || /\.threads\.com$/.test(host))return {source:"threads",reason:"referrer_domain"};
      if(["maggielab.tw","www.maggielab.tw","maggie10299.github.io"].indexOf(host)>=0)return {source:"official",reason:"referrer_domain"};
      if(["line.me","liff.line.me","access.line.me"].indexOf(host)>=0 || /\.line\.me$/.test(host))return {source:"line",reason:"referrer_domain"};
      return {source:"unknown",reason:"unrecognized_referrer"};
    }catch(e){return {source:"unknown",reason:"invalid_referrer"};}
  }

  function sanitizeCampaign(raw){
    var v = "";
    try{v = decodeURIComponent(String(raw || ""));}catch(e){v = String(raw || "");}
    v = v.replace(/<[^>]*>/g,"").replace(/[\r\n\t]/g," ").trim();
    v = v.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig,"");
    return v.slice(0,80);
  }

  function sanitizeReferrer(raw){
    if(!raw)return "";
    try{
      var url = new URL(raw);
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      return url.toString().slice(0,300);
    }catch(e){return "";}
  }

  function detectLaunch(){
    try{
      if(global.matchMedia && global.matchMedia("(display-mode: standalone)").matches)return "pwa";
      if(global.navigator && global.navigator.standalone === true)return "pwa";
    }catch(e){}
    return "browser";
  }

  function determineFirstSource(){
    var utm = normalizeAllowedSource(getSearchParam("utm_source"));
    if(utm)return {source:utm,reason:"utm_source_allowlist"};
    var rawUtm = getSearchParam("utm_source");
    if(rawUtm)return {source:"unknown",reason:"utm_source_unknown"};
    return classifyReferrer(global.document && global.document.referrer || "");
  }

  function initializeTrafficSource(){
    var existing = safeGet(FIRST_SOURCE_KEY);
    state.firstSourceExisted = !!existing;
    if(existing && SOURCE_VALUES.indexOf(existing)>=0){
      state.firstSource = existing;
      state.reason = "existing_localStorage";
    }else{
      var detected = determineFirstSource();
      state.firstSource = detected.source;
      state.reason = detected.reason;
      safeSet(FIRST_SOURCE_KEY,state.firstSource);
    }
    state.currentLaunch = detectLaunch();
    state.campaign = sanitizeCampaign(getSearchParam("utm_campaign"));
    state.sanitizedReferrer = sanitizeReferrer(global.document && global.document.referrer || "");
    state.initialized = true;
    return getTrafficContext();
  }

  function ensure(){if(!state.initialized)initializeTrafficSource();}
  function getFirstSource(){ensure();return state.firstSource || "unknown";}
  function getCurrentLaunch(){state.currentLaunch = detectLaunch();return state.currentLaunch;}
  function getCampaign(){ensure();return state.campaign || "";}
  function getSanitizedReferrer(){ensure();return state.sanitizedReferrer || "";}
  function getTrafficContext(){
    ensure();
    return {
      FirstSource: state.firstSource || "unknown",
      CurrentLaunch: getCurrentLaunch(),
      Campaign: state.campaign || "",
      Referrer: state.sanitizedReferrer || ""
    };
  }
  function getDebugState(){
    ensure();
    return {
      version: VERSION,
      FirstSource: state.firstSource || "unknown",
      CurrentLaunch: getCurrentLaunch(),
      Campaign: state.campaign || "",
      Referrer: state.sanitizedReferrer || "",
      firstSourceKeyExists: !!safeGet(FIRST_SOURCE_KEY),
      reason: state.reason
    };
  }
  function resetForDeveloperTest(){
    var dev = false;
    try{dev = /[?&]dev=1\b/.test(global.location && global.location.search || "") || safeGet("petHabitDeveloperMode")==="true";}catch(e){}
    var env = (global.PetHabitPlatform && global.PetHabitPlatform.Environment && global.PetHabitPlatform.Environment.appEnv) || global.APP_ENV || "local";
    if(!dev || env === "production")return {ok:false,error:{code:"developer_mode_required",message:"Traffic source reset is only available in Developer Mode",retryable:false}};
    safeRemove(FIRST_SOURCE_KEY);
    state.initialized = false;
    return {ok:true,data:initializeTrafficSource()};
  }

  var api = {
    version: VERSION,
    initializeTrafficSource: initializeTrafficSource,
    getFirstSource: getFirstSource,
    getCurrentLaunch: getCurrentLaunch,
    getCampaign: getCampaign,
    getSanitizedReferrer: getSanitizedReferrer,
    getTrafficContext: getTrafficContext,
    getDebugState: getDebugState,
    resetForDeveloperTest: resetForDeveloperTest,
    _private:{
      classifyReferrer: classifyReferrer,
      sanitizeCampaign: sanitizeCampaign,
      sanitizeReferrer: sanitizeReferrer,
      normalizeAllowedSource: normalizeAllowedSource
    }
  };

  global.MaggieTrafficSource = api;
  if(global.PetHabitPlatform){
    global.PetHabitPlatform.TrafficSource = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
