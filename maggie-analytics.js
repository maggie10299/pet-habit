(function(global){
  "use strict";

  var DEFAULT_ENDPOINT = "https://script.google.com/macros/s/AKfycbwFuPv3IoIuv0ZcxRsQNVLO3K2J6WKkqqkK3CUox318AxB9bVrBoZl2L8NmWRQMsS4/exec";
  var SCHEMA_VERSION = "maggie_analytics_v2.2";
  var VALID_SOURCES = ["facebook","instagram","threads","website","pwa","direct","unknown"];
  var SOURCE_KEY = "maggie_first_source";
  var FIRST_VISIT_KEY = "maggie_first_visit";
  var ANALYTICS_INSTALL_KEY = "analytics.installId";
  var SESSION_ID_KEY = "analytics.sessionId";
  var SESSION_STARTED_KEY = "analytics.sessionStartedAt";
  var SESSION_LAST_SEEN_KEY = "analytics.sessionLastSeenAt";
  var SESSION_TIMEOUT_MS = 30 * 60 * 1000;
  var FORBIDDEN_KEYS = /^(familyId|family_id|childId|child_id|playerId|player_id|auth\.uid|authUid|authUserId|auth_user_id|googleSub|google_sub|sub|email|mail|childName|child_name|playerName|player_name|nickname|displayName|display_name|deviceLinkId|device_link_id|deviceId|device_id)$/i;

  var config = {
    endpoint: DEFAULT_ENDPOINT,
    product: "",
    version: "",
    build: "",
    enabled: true
  };
  var debugState = {
    endpointUrl: DEFAULT_ENDPOINT,
    lastAnalyticsStatus: "idle",
    lastAnalyticsResponse: "",
    lastAnalyticsError: "",
    lastRequestDeviceIdPresent: false,
    analyticsSchemaVersion: SCHEMA_VERSION
  };

  function safeLocalGet(key){
    try{return global.localStorage.getItem(key);}catch(e){return null;}
  }

  function safeLocalSet(key,value){
    try{global.localStorage.setItem(key,value);}catch(e){}
  }
  function safeSessionGet(key){
    try{return global.sessionStorage && global.sessionStorage.getItem(key);}catch(e){return null;}
  }
  function safeSessionSet(key,value){
    try{global.sessionStorage && global.sessionStorage.setItem(key,value);}catch(e){}
  }

  function resolveSource(){
    var q = "";
    try{q = new URLSearchParams(global.location.search).get("source") || "";}catch(e){}
    q = String(q || "").toLowerCase();
    if(q === "official")q = "website";
    if(q === "qr" || q === "qrcode" || q === "line")q = "unknown";
    if(VALID_SOURCES.indexOf(q) >= 0)return q;
    return "direct";
  }

  function getSource(){
    if(global.MaggieTrafficSource && global.MaggieTrafficSource.getSessionSource){
      var sessionSource = global.MaggieTrafficSource.getSessionSource();
      return VALID_SOURCES.indexOf(sessionSource) >= 0 ? sessionSource : "unknown";
    }
    var source = safeLocalGet(SOURCE_KEY);
    if(!source){
      source = resolveSource();
      safeLocalSet(SOURCE_KEY,source);
    }
    if(VALID_SOURCES.indexOf(source) < 0)return "direct";
    return source;
  }

  function trafficContext(){
    try{
      if(global.MaggieTrafficSource && global.MaggieTrafficSource.getTrafficContext){
        return global.MaggieTrafficSource.getTrafficContext();
      }
    }catch(e){}
    return {FirstSource:"unknown",CurrentLaunch:"browser",Campaign:"",Referrer:""};
  }

  function sanitizeAnalyticsPayload(params){
    var blocked = /diary|journal|wish|願望|日記|note|text|content|description|body|message/i;
    var out = {};
    params = params || {};
    Object.keys(params).forEach(function(key){
      var value = params[key];
      if(FORBIDDEN_KEYS.test(key)){
        return;
      }else if(blocked.test(key)){
        out[key] = "[redacted]";
      }else if(key === "task" && typeof value === "string" && !/^[a-z0-9_-]{1,40}$/i.test(value)){
        out[key] = "[redacted]";
      }else if(typeof value === "string"){
        out[key] = value.replace(/[\r\n\t]/g," ").slice(0,300);
      }else if(value && typeof value === "object" && !Array.isArray(value)){
        out[key] = sanitizeAnalyticsPayload(value);
      }else{
        out[key] = value;
      }
    });
    return out;
  }

  function getFirstVisit(){
    var first = safeLocalGet(FIRST_VISIT_KEY);
    if(!first){
      first = new Date().toISOString();
      safeLocalSet(FIRST_VISIT_KEY,first);
    }
    return first;
  }

  function getAnalyticsInstallId(){
    var id = safeLocalGet(ANALYTICS_INSTALL_KEY);
    if(!id){
      if(global.crypto && typeof global.crypto.randomUUID === "function"){
        id = "ai_" + global.crypto.randomUUID();
      }else{
        var bytes = "";
        try{
          var arr = new Uint32Array(4);
          global.crypto && global.crypto.getRandomValues && global.crypto.getRandomValues(arr);
          bytes = Array.prototype.map.call(arr,function(n){return n.toString(36);}).join("");
        }catch(e){
          bytes = Date.now().toString(36) + Math.random().toString(36).substring(2,14);
        }
        id = "ai_" + bytes;
      }
      safeLocalSet(ANALYTICS_INSTALL_KEY,id);
    }
    return id;
  }

  function makeId(prefix){
    var id = "";
    if(global.crypto && typeof global.crypto.randomUUID === "function"){
      id = global.crypto.randomUUID();
    }else{
      try{
        var arr = new Uint32Array(4);
        global.crypto && global.crypto.getRandomValues && global.crypto.getRandomValues(arr);
        id = Array.prototype.map.call(arr,function(n){return n.toString(36);}).join("");
      }catch(e){
        id = Date.now().toString(36) + Math.random().toString(36).substring(2,14);
      }
    }
    return prefix + id;
  }

  function getSessionId(){
    var now = Date.now();
    var id = safeSessionGet(SESSION_ID_KEY) || safeLocalGet(SESSION_ID_KEY);
    var last = Number(safeSessionGet(SESSION_LAST_SEEN_KEY) || safeLocalGet(SESSION_LAST_SEEN_KEY) || 0);
    if(!id || !last || (now - last) > SESSION_TIMEOUT_MS){
      id = makeId("as_");
      var started = new Date(now).toISOString();
      safeSessionSet(SESSION_ID_KEY,id);
      safeSessionSet(SESSION_STARTED_KEY,started);
      safeLocalSet(SESSION_ID_KEY,id);
      safeLocalSet(SESSION_STARTED_KEY,started);
    }
    var seen = String(now);
    safeSessionSet(SESSION_LAST_SEEN_KEY,seen);
    safeLocalSet(SESSION_LAST_SEEN_KEY,seen);
    return id;
  }

  function idPreview(id){
    id = String(id || "");
    return id ? id.slice(0,4) + "…" : "";
  }

  function platform(){
    var ua = String(global.navigator && global.navigator.userAgent || "");
    var p = String(global.navigator && global.navigator.platform || "");
    if(/iPad/i.test(ua) || /iPad/i.test(p) || (p === "MacIntel" && global.navigator && global.navigator.maxTouchPoints > 1))return "iPad";
    if(/iPhone|iPod/i.test(ua) || /iPhone|iPod/i.test(p))return "iPhone";
    if(/Android/i.test(ua))return "Android";
    if(/Mac/i.test(p) || /Mac OS X/i.test(ua))return "Mac";
    if(/Win/i.test(p) || /Windows/i.test(ua))return "Windows";
    return "Other";
  }

  function browser(){
    var ua = String(global.navigator && global.navigator.userAgent || "");
    if(/Line\//i.test(ua))return "LINE";
    if(/FBAN|FBAV|FB_IAB|FBIOS|FB4A/i.test(ua))return "Facebook";
    if(/Instagram/i.test(ua))return "Instagram";
    if(/CriOS|Chrome|Chromium/i.test(ua) && !/Edg/i.test(ua))return "Chrome";
    if(/Safari/i.test(ua) && !/Chrome|CriOS|Chromium|Android/i.test(ua))return "Safari";
    return "Other";
  }

  function init(options){
    options = options || {};
    config.endpoint = options.endpoint || config.endpoint || DEFAULT_ENDPOINT;
    debugState.endpointUrl = config.endpoint;
    config.product = options.product || config.product;
    config.version = options.version || config.version;
    config.build = options.build || config.build;
    if(typeof options.enabled === "boolean")config.enabled = options.enabled;
    try{global.MaggieTrafficSource && global.MaggieTrafficSource.initializeTrafficSource && global.MaggieTrafficSource.initializeTrafficSource();}catch(e){}
    getSource();
    getFirstVisit();
    getAnalyticsInstallId();
    getSessionId();
    return api;
  }

  function track(event,params){
    if(!config.enabled || !event)return;
    params = sanitizeAnalyticsPayload(params || {});
    var traffic = trafficContext();
    var installId = getAnalyticsInstallId();
    var sessionId = getSessionId();
    var payload = {
      product: config.product,
      timestamp: new Date().toISOString(),
      event: event,
      analyticsInstallId: installId,
      DeviceId: installId,
      SessionId: sessionId,
      version: config.version,
      firstVisit: getFirstVisit(),
      platform: params.platform || platform(),
      browser: params.browser || browser(),
      payload: params,
      pet: params.pet || "",
      task: params.task || "",
      source: (traffic.Source && VALID_SOURCES.indexOf(traffic.Source)>=0) ? traffic.Source : getSource(),
      build: params.build || config.build || "",
      FirstSource: traffic.FirstSource,
      CurrentLaunch: traffic.CurrentLaunch,
      Campaign: traffic.Campaign,
      Referrer: traffic.Referrer
    };
    try{
      debugState.endpointUrl = config.endpoint;
      debugState.lastAnalyticsStatus = "sending";
      debugState.lastAnalyticsResponse = "";
      debugState.lastAnalyticsError = "";
      debugState.lastRequestDeviceIdPresent = !!payload.DeviceId;
      global.fetch(config.endpoint,{
        method:"POST",
        mode:"no-cors",
        cache:"no-store",
        headers:{"Content-Type":"text/plain;charset=utf-8"},
        body:JSON.stringify(payload),
        keepalive:true
      }).then(function(response){
        debugState.lastAnalyticsStatus = "sent";
        debugState.lastAnalyticsResponse = response && response.type ? response.type : "no-cors";
      }).catch(function(err){
        debugState.lastAnalyticsStatus = "failed";
        debugState.lastAnalyticsError = String(err && err.message || err || "fetch_failed").slice(0,120);
      });
    }catch(e){
      debugState.lastAnalyticsStatus = "failed";
      debugState.lastAnalyticsError = String(e && e.message || e || "fetch_failed").slice(0,120);
    }
  }

  function trackReturnOnce(){
    var today = new Date().toLocaleDateString("zh-TW");
    var key = "maggie_return_product_sent_" + (config.product || "product");
    var first = getFirstVisit();
    var firstDay = "";
    try{firstDay = new Date(first).toLocaleDateString("zh-TW");}catch(e){}
    if(firstDay && firstDay === today)return;
    if(safeLocalGet(key) === today)return;
    safeLocalSet(key,today);
    track("return_product");
  }

  function getDebugState(){
    var installId = safeLocalGet(ANALYTICS_INSTALL_KEY);
    return {
      analyticsInstallIdPresent: !!installId,
      analyticsInstallIdPreview: idPreview(installId),
      sessionIdPresent: !!safeSessionGet(SESSION_ID_KEY) || !!safeLocalGet(SESSION_ID_KEY),
      requestDeviceIdPresent: !!debugState.lastRequestDeviceIdPresent,
      endpointUrl: debugState.endpointUrl || config.endpoint,
      lastAnalyticsStatus: debugState.lastAnalyticsStatus,
      lastAnalyticsResponse: debugState.lastAnalyticsResponse,
      lastAnalyticsError: debugState.lastAnalyticsError,
      analyticsSchemaVersion: debugState.analyticsSchemaVersion
    };
  }

  var api = {
    init:init,
    track:track,
    trackReturnOnce:trackReturnOnce,
    getSource:getSource,
    getDeviceId:getAnalyticsInstallId,
    getAnalyticsInstallId:getAnalyticsInstallId,
    getSessionId:getSessionId,
    getFirstVisit:getFirstVisit,
    getDebugState:getDebugState
  };

  global.MaggieAnalytics = api;
  global.trackGameEvent = function(event,params){track(event,params || {});};
})(window);
