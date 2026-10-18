(function(){
  "use strict";

  var OWNER_GROUND_ZONES={
    home:{ownerGroundY:73,ownerMinX:22,ownerMaxX:78,defaultX:42},
    room:{ownerGroundY:74,ownerMinX:20,ownerMaxX:80,defaultX:30},
    park:{ownerGroundY:91,ownerMinX:12,ownerMaxX:88,defaultX:18}
  };

  function zoneFor(scene){
    return OWNER_GROUND_ZONES[scene]||OWNER_GROUND_ZONES.home;
  }

  function defaultOwnerPos(scene){
    var zone=zoneFor(scene);
    return {x:zone.defaultX,y:zone.ownerGroundY};
  }

  function clampOwner(scene,pos){
    var zone=zoneFor(scene);
    var x=Number(pos&&pos.x);
    if(!Number.isFinite(x))x=zone.defaultX;
    x=Math.max(zone.ownerMinX,Math.min(zone.ownerMaxX,x));
    return {x:Math.round(x*10)/10,y:Math.round(zone.ownerGroundY*10)/10};
  }

  function targetFromPointer(scene,event){
    if(!event||!event.currentTarget)return null;
    var rect=event.currentTarget.getBoundingClientRect();
    if(!rect||!rect.width||!rect.height)return null;
    var zone=zoneFor(scene);
    var rawX=(event.clientX-rect.left)/rect.width*100;
    var pos=clampOwner(scene,{x:rawX});
    var blocked=Math.abs(pos.x-rawX)>18;
    return {rawX:rawX,pos:pos,blocked:blocked,zone:zone};
  }

  function durationMs(scene,from,to){
    var a=Number(from&&from.x);
    var b=Number(to&&to.x);
    var distance=Number.isFinite(a)&&Number.isFinite(b)?Math.abs(a-b):24;
    return Math.max(400,Math.min(800,Math.round(360+distance*7)));
  }

  window.PetHabitMovement={
    OWNER_GROUND_ZONES:OWNER_GROUND_ZONES,
    zoneFor:zoneFor,
    defaultOwnerPos:defaultOwnerPos,
    clampOwner:clampOwner,
    targetFromPointer:targetFromPointer,
    durationMs:durationMs
  };
})();
