(function(global){
  "use strict";

  var DEFAULT_ENDPOINT = "https://script.google.com/macros/s/AKfycbwFuPv3IoIuv0ZcxRsQNVLO3K2J6WKkqqkK3CUox318AxB9bVrBoZl2L8NmWRQMsS4/exec";
  var VALID_SOURCES = ["threads","facebook","website","line","qrcode","direct"];
  var SOURCE_KEY = "maggie_first_source";
  var FIRST_VISIT_KEY = "maggie_first_visit";
  var DEVICE_KEY = "maggie_device_id";

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
    var source = safeLocalGet(SOURCE_KEY);
    if(!source){
      source = resolveSource();
      safeLocalSet(SOURCE_KEY,source);
    }
    if(VALID_SOURCES.indexOf(source) < 0)return "direct";
    return source;
  }

  function getFirstVisit(){
    var first = safeLocalGet(FIRST_VISIT_KEY);
    if(!first){
      first = new Date().toISOString();
      safeLocalSet(FIRST_VISIT_KEY,first);
    }
    return first;
  }

  function getDeviceId(){
    var id = safeLocalGet(DEVICE_KEY);
    if(!id){
      id = "dev_" + Date.now() + "_" + Math.random().toString(36).substring(2,10);
      safeLocalSet(DEVICE_KEY,id);
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
    getSource();
    getFirstVisit();
    getDeviceId();
    return api;
  }

  function track(event,params){
    if(!config.enabled || !event)return;
    params = params || {};
    var payload = {
      product: config.product,
      timestamp: new Date().toISOString(),
      event: event,
      deviceId: getDeviceId(),
      version: config.version,
      firstVisit: getFirstVisit(),
      familyId: params.familyId || "",
      childId: params.childId || "",
      platform: params.platform || platform(),
      browser: params.browser || browser(),
      payload: params,
      pet: params.pet || "",
      task: params.task || "",
      source: getSource(),
      build: params.build || config.build || ""
    };
    try{
      global.fetch(config.endpoint,{
        method:"POST",
        mode:"no-cors",
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
    getDeviceId:getDeviceId,
    getFirstVisit:getFirstVisit
  };

  global.MaggieAnalytics = api;
  global.trackGameEvent = function(event,params){track(event,params || {});};
})(window);
