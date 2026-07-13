(function(global){
  "use strict";

  var DEFAULT_ENDPOINT = "https://script.google.com/macros/s/AKfycbwFuPv3IoIuv0ZcxRsQNVLO3K2J6WKkqqkK3CUox318AxB9bVrBoZl2L8NmWRQMsS4/exec";
  var VALID_SOURCES = ["facebook","instagram","threads","official","line","qr","direct","unknown"];
  var SOURCE_KEY = "maggie_first_source";
  var FIRST_VISIT_KEY = "maggie_first_visit";
  var ANALYTICS_INSTALL_KEY = "analytics.installId";
  var FORBIDDEN_KEYS = /^(familyId|family_id|childId|child_id|playerId|player_id|auth\.uid|authUid|authUserId|auth_user_id|googleSub|google_sub|sub|email|mail|childName|child_name|playerName|player_name|nickname|displayName|display_name|deviceLinkId|device_link_id|deviceId|device_id)$/i;

  var config = {
    endpoint: DEFAULT_ENDPOINT,
    product: "",
    version: "",
    build: "",
    enabled: true
  };

  function safeLocalGet(key){
    try{return global.localStorage.getItem(key);}catch(e){return null;}
  }

  function safeLocalSet(key,value){
    try{global.localStorage.setItem(key,value);}catch(e){}
  }

  function resolveSource(){
    var q = "";
    try{q = new URLSearchParams(global.location.search).get("source") || "";}catch(e){}
    q = String(q || "").toLowerCase();
    if(VALID_SOURCES.indexOf(q) >= 0)return q;
    return "direct";
  }

  function getSource(){
    if(global.MaggieTrafficSource && global.MaggieTrafficSource.getFirstSource){
      return global.MaggieTrafficSource.getFirstSource();
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

  function platform(){
    return (global.navigator && global.navigator.platform) || "";
  }

  function browser(){
    return (global.navigator && global.navigator.userAgent) || "";
  }

  function init(options){
    options = options || {};
    config.endpoint = options.endpoint || config.endpoint || DEFAULT_ENDPOINT;
    config.product = options.product || config.product;
    config.version = options.version || config.version;
    config.build = options.build || config.build;
    if(typeof options.enabled === "boolean")config.enabled = options.enabled;
    try{global.MaggieTrafficSource && global.MaggieTrafficSource.initializeTrafficSource && global.MaggieTrafficSource.initializeTrafficSource();}catch(e){}
    getSource();
    getFirstVisit();
    getAnalyticsInstallId();
    return api;
  }

  function track(event,params){
    if(!config.enabled || !event)return;
    params = sanitizeAnalyticsPayload(params || {});
    var traffic = trafficContext();
    var payload = {
      product: config.product,
      timestamp: new Date().toISOString(),
      event: event,
      analyticsInstallId: getAnalyticsInstallId(),
      version: config.version,
      firstVisit: getFirstVisit(),
      platform: params.platform || platform(),
      browser: params.browser || browser(),
      payload: params,
      pet: params.pet || "",
      task: params.task || "",
      source: getSource(),
      build: params.build || config.build || "",
      FirstSource: traffic.FirstSource,
      CurrentLaunch: traffic.CurrentLaunch,
      Campaign: traffic.Campaign,
      Referrer: traffic.Referrer
    };
    try{
      global.fetch(config.endpoint,{
        method:"POST",
        mode:"no-cors",
        cache:"no-store",
        headers:{"Content-Type":"text/plain;charset=utf-8"},
        body:JSON.stringify(payload),
        keepalive:true
      }).catch(function(){});
    }catch(e){}
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

  var api = {
    init:init,
    track:track,
    trackReturnOnce:trackReturnOnce,
    getSource:getSource,
    getDeviceId:getAnalyticsInstallId,
    getAnalyticsInstallId:getAnalyticsInstallId,
    getFirstVisit:getFirstVisit
  };

  global.MaggieAnalytics = api;
  global.trackGameEvent = function(event,params){track(event,params || {});};
})(window);
