(function(global){
  "use strict";

  var VERSION = "traffic-source-v2.2.0";
  var FIRST_SOURCE_KEY = "analytics.firstSource";
  var ALLOWED = ["facebook","instagram","threads","website","pwa","direct","unknown"];
  var SOURCE_VALUES = ALLOWED.slice();
  var state = {
    initialized:false,
    currentLaunch:"browser",
    sessionSource:"",
    campaign:"",
    sanitizedReferrer:"",
    firstSource:"",
    reason:"not_initialized",
    sessionReason:"not_initialized",
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
    if(v === "official")v = "website";
    if(v === "qr" || v === "qrcode")v = "unknown";
    if(v === "line")v = "unknown";
    return ALLOWED.indexOf(v) >= 0 ? v : "";
  }

  function detectLaunch(){
    try{
      if(global.matchMedia && global.matchMedia("(display-mode: standalone)").matches)return "pwa";
      if(global.navigator && global.navigator.standalone === true)return "pwa";
    }catch(e){}
    return "browser";
  }

  function classifyReferrer(raw){
    if(!raw)return {source:"direct", reason:"no_referrer"};
    try{
      var url = new URL(raw);
      var host = String(url.hostname || "").toLowerCase();
      if(["facebook.com","www.facebook.com","m.facebook.com","l.facebook.com","lm.facebook.com"].indexOf(host)>=0 || /\.facebook\.com$/.test(host))return {source:"facebook",reason:"referrer_domain"};
      if(["instagram.com","www.instagram.com","l.instagram.com"].indexOf(host)>=0 || /\.instagram\.com$/.test(host))return {source:"instagram",reason:"referrer_domain"};
      if(["threads.net","www.threads.net","threads.com","www.threads.com"].indexOf(host)>=0 || /\.threads\.net$/.test(host) || /\.threads\.com$/.test(host))return {source:"threads",reason:"referrer_domain"};
      if(["maggielab.tw","www.maggielab.tw","maggie10299.github.io","maggielab.github.io"].indexOf(host)>=0)return {source:"website",reason:"referrer_domain"};
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
      return url.toString().replace(/\/$/,"").slice(0,300);
    }catch(e){return "";}
  }

  function explicitSource(){
    var source = normalizeAllowedSource(getSearchParam("source"));
    if(source)return {source:source,reason:"source_allowlist"};
    var rawSource = getSearchParam("source");
    if(rawSource)return {source:"unknown",reason:"source_unknown"};
    var utm = normalizeAllowedSource(getSearchParam("utm_source"));
    if(utm)return {source:utm,reason:"utm_source_allowlist"};
    var rawUtm = getSearchParam("utm_source");
    if(rawUtm)return {source:"unknown",reason:"utm_source_unknown"};
    return null;
  }

  function determineSessionSource(){
    var explicit = explicitSource();
    if(explicit)return explicit;
    var ref = classifyReferrer(global.document && global.document.referrer || "");
    if(ref.source && ref.source !== "direct")return ref;
    var launch = detectLaunch();
    if(launch === "pwa")return {source:"pwa",reason:"standalone_launch"};
    return ref.source === "unknown" ? ref : {source:"direct",reason:"direct_launch"};
  }

  function normalizeStoredFirstSource(existing){
    var normalized = normalizeAllowedSource(existing);
    return normalized || "";
  }

  function initializeTrafficSource(){
    var session = determineSessionSource();
    state.sessionSource = session.source;
    state.sessionReason = session.reason;
    var existing = normalizeStoredFirstSource(safeGet(FIRST_SOURCE_KEY));
    state.firstSourceExisted = !!existing;
    if(existing){
      state.firstSource = existing;
      state.reason = "existing_localStorage";
    }else{
      state.firstSource = session.source;
      state.reason = session.reason;
      safeSet(FIRST_SOURCE_KEY,state.firstSource);
    }
    state.currentLaunch = detectLaunch();
    state.campaign = sanitizeCampaign(getSearchParam("utm_campaign") || getSearchParam("campaign"));
    state.sanitizedReferrer = sanitizeReferrer(global.document && global.document.referrer || "");
    state.initialized = true;
    return getTrafficContext();
  }

  function ensure(){if(!state.initialized)initializeTrafficSource();}
  function getFirstSource(){ensure();return state.firstSource || "unknown";}
  function getSessionSource(){ensure();return state.sessionSource || "direct";}
  function getCurrentLaunch(){state.currentLaunch = detectLaunch();return state.currentLaunch;}
  function getCampaign(){ensure();return state.campaign || "";}
  function getSanitizedReferrer(){ensure();return state.sanitizedReferrer || "";}
  function getTrafficContext(){
    ensure();
    return {
      Source: getSessionSource(),
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
      Source: getSessionSource(),
      FirstSource: state.firstSource || "unknown",
      CurrentLaunch: getCurrentLaunch(),
      Campaign: state.campaign || "",
      Referrer: state.sanitizedReferrer || "",
      firstSourceKeyExists: !!safeGet(FIRST_SOURCE_KEY),
      reason: state.reason,
      sessionReason: state.sessionReason
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
    getSessionSource: getSessionSource,
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
      normalizeAllowedSource: normalizeAllowedSource,
      determineSessionSource: determineSessionSource
    }
  };

  global.MaggieTrafficSource = api;
  if(global.PetHabitPlatform){
    global.PetHabitPlatform.TrafficSource = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
