(function(global){
  "use strict";
  // Presentation geometry only. Positions stay in roomDecorPos_hk_<playerId>.
  function visualFor(item,compact){
    var v=item&&item.roomVisual;
    if(!v)return null;
    var size=compact?v.compact:v.wide;
    var legacySide=(compact?Math.round(item.roomSize*.86):item.roomSize)*item.scale;
    var offsetY=v.kind==="large"?legacySide*v.legacyFoot-size[1]/2:0;
    return {width:size[0],height:size[1],bounds:v.bounds,kind:v.kind,offsetY:offsetY};
  }
  function clampDrag(input){
    var width=input.width,height=input.height,box=input.box,art=input.art;
    var dx=(art.width-box.width)/2,dy=(art.height-box.height)/2;
    var offsetY=art.offsetY||0;
    var minX=8+dx,maxX=width-8-box.width-dx;
    // The top toolbar is a real pixel safe area; floors use the existing plane.
    var minY=66+dy-offsetY,maxY=height-12-box.height-dy-offsetY;
    if(art.kind==="wall")maxY=Math.min(maxY,height*.54-box.height-dy-offsetY);
    if(art.kind==="large"){
      minY=Math.max(minY,height*.61-box.height-dy-offsetY);
      maxY=Math.min(maxY,height*.68-box.height-dy-offsetY);
    }
    if(art.kind==="floor"||art.kind==="small")minY=Math.max(minY,height*.77-box.height-dy);
    var x=Math.max(minX,Math.min(Math.max(minX,maxX),input.x));
    var y=Math.max(minY,Math.min(Math.max(minY,maxY),input.y));
    // Small cushions leave the existing central pet action area clear.
    if(art.kind==="small"){
      var center=x+box.width/2;
      if(center>width*.24&&center<width*.78)x=(center<width*.51?width*.22:width*.82)-box.width/2;
      x=Math.max(minX,Math.min(Math.max(minX,maxX),x));
    }
    return {left:(x/width*100).toFixed(1)+"%",top:(y/height*100).toFixed(1)+"%"};
  }
  global.PetHabitRoomComposition={visualFor:visualFor,clampDrag:clampDrag};
})(typeof window!=="undefined"?window:globalThis);
