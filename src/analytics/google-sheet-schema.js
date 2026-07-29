(function(global){
  "use strict";
  var REQUIRED_HEADERS_V1 = [
    "Time","Product","Event","DeviceId","SessionId","Version","Pet","Task","Source","Build","Platform","Browser"
  ];
  var TRAFFIC_HEADERS_V2 = ["FirstSource","CurrentLaunch","Campaign","Referrer"];
  var DATE_HEADERS_V21 = ["TimestampLocal","Date","LocalTime","Week","Month"];
  function normalize(headers){
    return Array.isArray(headers) ? headers.map(function(h){return String(h || "").trim();}) : [];
  }
  function ensureAnalyticsHeaders(headers){
    var next = normalize(headers);
    REQUIRED_HEADERS_V1.concat(TRAFFIC_HEADERS_V2,DATE_HEADERS_V21).forEach(function(h){
      if(next.indexOf(h) < 0)next.push(h);
    });
    return next;
  }
  function mapRowByHeader(headers,payload){
    var safeHeaders = ensureAnalyticsHeaders(headers);
    payload = payload || {};
    return safeHeaders.map(function(h){return payload[h] == null ? "" : payload[h];});
  }
  var api = {
    requiredHeadersV1: REQUIRED_HEADERS_V1,
    trafficHeadersV2: TRAFFIC_HEADERS_V2,
    dateHeadersV21: DATE_HEADERS_V21,
    ensureAnalyticsHeaders: ensureAnalyticsHeaders,
    mapRowByHeader: mapRowByHeader
  };
  global.MaggieAnalyticsSheetSchema = api;
  if(global.PetHabitPlatform)global.PetHabitPlatform.AnalyticsSheetSchema = api;
})(typeof window !== "undefined" ? window : globalThis);
