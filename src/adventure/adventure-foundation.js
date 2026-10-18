(function(global){
  const ns=global.PetHabitAdventure=global.PetHabitAdventure||{};
  const KEY_MAX=5;
  const KEY_TTL_DAYS=3;
  const OPEN_MINUTES=5*60;
  const CLOSE_MINUTES=20*60+30;
  const APP_TIMEZONE_OFFSET_MINUTES=8*60;
  const DEFAULT_GAMES=[
    {id:"memory_v1",label:"動物記憶翻翻樂",emoji:"🧠",available:true,status:"ready"},
    {id:"sudoku_v1",label:"森林符文數獨",emoji:"🍄",available:true,status:"ready"},
    {id:"maze_v1",label:"森林迷宮",emoji:"🌲",available:false,status:"future_walking_maze"},
    {id:"whack_v1",label:"敲敲樂",emoji:"✨",available:false,status:"coming_soon"}
  ];
  const toAppDate=(date=new Date())=>new Date(new Date(date).getTime()+APP_TIMEZONE_OFFSET_MINUTES*60000);
  const makeYmd=(date=new Date())=>{
    const d=toAppDate(date);
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  };
  const addDaysISO=(date,days)=>{
    const d=new Date(date);
    d.setDate(d.getDate()+days);
    return d.toISOString();
  };
  const isOpenAt=(date=new Date())=>{
    const d=toAppDate(date);
    const mins=d.getUTCHours()*60+d.getUTCMinutes();
    return mins>=OPEN_MINUTES&&mins<CLOSE_MINUTES;
  };
  const getAvailability=(date=new Date())=>{
    const open=isOpenAt(date);
    return {
      open,
      mode:open?"open":"view_only",
      message:open?"可以開始探險":"今天探險結束囉！大家都回帳篷休息了，明天再一起出發吧！"
    };
  };
  const normalizeKeys=(keys,now=new Date())=>{
    const t=new Date(now).getTime();
    const rows=Array.isArray(keys)?keys:[];
    const active=rows
      .filter(k=>k&&k.id&&k.expiresAt&&new Date(k.expiresAt).getTime()>t)
      .sort((a,b)=>new Date(a.expiresAt)-new Date(b.expiresAt))
      .slice(0,KEY_MAX);
    return {
      keys:active,
      expiredCount:Math.max(0,rows.length-active.length),
      remainingCount:active.length
    };
  };
  const grantKeyOnce=({keys=[],ledger={},playerId="solo",source="daily_login",grantId,date=new Date()}={})=>{
    const normalized=normalizeKeys(keys,date).keys;
    const finalGrantId=grantId||source+":"+(playerId||"solo")+":"+makeYmd(date);
    const nextLedger={...(ledger||{})};
    if(nextLedger[finalGrantId]){
      return {granted:false,result:"skipped_duplicate",reason:"duplicate",grantId:finalGrantId,keys:normalized,ledger:nextLedger};
    }
    nextLedger[finalGrantId]=true;
    if(normalized.length>=KEY_MAX){
      return {granted:false,result:"skipped_full",reason:"full",grantId:finalGrantId,keys:normalized,ledger:nextLedger};
    }
    const key={
      id:"key_"+new Date(date).getTime()+"_"+Math.random().toString(36).slice(2,7),
      earnedAt:new Date(date).toISOString(),
      expiresAt:addDaysISO(date,KEY_TTL_DAYS),
      source,
      grantId:finalGrantId
    };
    const next=normalizeKeys([...normalized,key],date).keys;
    return {granted:true,result:"granted",reason:"granted",grantId:finalGrantId,key,keys:next,ledger:nextLedger};
  };
  const consumeOldestKey=(keys=[],now=new Date())=>{
    const normalized=normalizeKeys(keys,now).keys;
    if(!normalized.length)return {consumed:false,result:"no_key",keys:normalized};
    const [key,...rest]=normalized;
    return {consumed:true,result:"consumed",key,keys:rest};
  };
  const validateStart=({featureEnabled=false,date=new Date(),game=null,keys=[],alreadyStarting=false}={})=>{
    if(!featureEnabled)return {ok:false,code:"feature_disabled",message:"探險營地尚未開放"};
    if(alreadyStarting)return {ok:false,code:"already_starting",message:"正在準備探險，請等一下"};
    if(!isOpenAt(date))return {ok:false,code:"night_closed",message:getAvailability(date).message};
    if(!game||game.available!==true)return {ok:false,code:"game_unavailable",message:"這個小冒險還在準備中"};
    const normalized=normalizeKeys(keys,date);
    if(normalized.keys.length<=0)return {ok:false,code:"no_key",message:"需要 1 把神秘鑰匙才能開始"};
    return {ok:true,code:"ready",message:"可以開始探險",keys:normalized.keys};
  };
  const startAdventure=({featureEnabled=false,date=new Date(),game=null,keys=[],alreadyStarting=false}={})=>{
    const check=validateStart({featureEnabled,date,game,keys,alreadyStarting});
    if(!check.ok)return {...check,consumed:false,keys:normalizeKeys(keys,date).keys};
    const consumed=consumeOldestKey(check.keys,date);
    return {
      ok:consumed.consumed,
      code:consumed.consumed?"started":"consume_failed",
      message:consumed.consumed?"探險開始":"鑰匙使用失敗",
      consumed:consumed.consumed,
      key:consumed.key,
      keys:consumed.keys,
      gameId:game.id
    };
  };
  ns.KEY_MAX=KEY_MAX;
  ns.KEY_TTL_DAYS=KEY_TTL_DAYS;
  ns.OPEN_MINUTES=OPEN_MINUTES;
  ns.CLOSE_MINUTES=CLOSE_MINUTES;
  ns.APP_TIMEZONE_OFFSET_MINUTES=APP_TIMEZONE_OFFSET_MINUTES;
  ns.toAppDate=toAppDate;
  ns.DEFAULT_GAMES=DEFAULT_GAMES;
  ns.makeYmd=makeYmd;
  ns.addDaysISO=addDaysISO;
  ns.isOpenAt=isOpenAt;
  ns.getAvailability=getAvailability;
  ns.normalizeKeys=normalizeKeys;
  ns.grantKeyOnce=grantKeyOnce;
  ns.consumeOldestKey=consumeOldestKey;
  ns.validateStart=validateStart;
  ns.startAdventure=startAdventure;
})(typeof window!=="undefined"?window:globalThis);
