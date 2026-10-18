(function(global){
  const ns=global.PetHabitAdventure=global.PetHabitAdventure||{};
  const STORAGE_PREFIX="petHabitForestMiniGames_";
  const GAME_TYPES=[
    {type:"memory",id:"memory_v1",label:"動物記憶翻翻樂",emoji:"🧠",available:true,status:"ready"},
    {type:"sudoku",id:"sudoku_v1",label:"森林符文數獨",emoji:"🍄",available:true,status:"ready"}
  ];
  const DEFAULT_PROGRESS={
    lastPlayedGame:null,
    memoryMatchCompletedCount:0,
    mazeCompletedCount:0,
    sudokuCompletedCount:0,
    currentAdventure:null
  };
  const safeParse=(raw,fallback)=>{
    try{
      if(!raw)return fallback;
      const parsed=JSON.parse(raw);
      return parsed&&typeof parsed==="object"?parsed:fallback;
    }catch(e){return fallback;}
  };
  const clone=(value)=>JSON.parse(JSON.stringify(value));
  const keyFor=(playerId)=>STORAGE_PREFIX+(playerId||"solo");
  const normalize=(value)=>{
    const next={...DEFAULT_PROGRESS,...(value&&typeof value==="object"?value:{})};
    next.memoryMatchCompletedCount=Math.max(0,Number(next.memoryMatchCompletedCount||0));
    next.mazeCompletedCount=Math.max(0,Number(next.mazeCompletedCount||0));
    next.sudokuCompletedCount=Math.max(0,Number(next.sudokuCompletedCount||0));
    return next;
  };
  const readProgress=(playerId,storage=global.localStorage)=>normalize(safeParse(storage&&storage.getItem(keyFor(playerId)),DEFAULT_PROGRESS));
  const writeProgress=(playerId,progress,storage=global.localStorage)=>{
    const normalized=normalize(progress);
    storage&&storage.setItem(keyFor(playerId),JSON.stringify(normalized));
    return normalized;
  };
  const tierFromCount=(count)=>{
    const n=Math.max(0,Number(count||0));
    if(n>=100)return 4;
    if(n>=50)return 3;
    if(n>=20)return 2;
    return 1;
  };
  const getCountKey=(gameType)=>gameType==="maze"?"mazeCompletedCount":gameType==="sudoku"?"sudokuCompletedCount":"memoryMatchCompletedCount";
  const getCompletedCount=(progress,gameType)=>Number((progress||{})[getCountKey(gameType)]||0);
  const getTier=(progress,gameType)=>tierFromCount(getCompletedCount(progress,gameType));
  const getPlayableGames=({maze=true,memory=true,sudoku=true}={})=>GAME_TYPES.filter(g=>({maze,memory,sudoku})[g.type]===true);
  const randomIndex=(length,seed)=>{
    if(length<=1)return 0;
    if(seed==null)return Math.floor(Math.random()*length);
    const text=String(seed);
    let h=2166136261;
    for(let i=0;i<text.length;i++){
      h^=text.charCodeAt(i);
      h=Math.imul(h,16777619);
    }
    return (h>>>0)%length;
  };
  const selectGame=(progress,playable,seed)=>{
    const pool=Array.isArray(playable)?playable.filter(g=>g&&g.type):[];
    if(!pool.length)return null;
    if(pool.length===1)return pool[0];
    const last=(progress&&progress.lastPlayedGame)||"";
    const candidates=pool.filter(g=>g.type!==last);
    const finalPool=candidates.length?candidates:pool;
    return finalPool[randomIndex(finalPool.length,seed)]||finalPool[0];
  };
  const startAdventure=(playerId,gameType,session,{keyId,storage=global.localStorage}={})=>{
    const progress=readProgress(playerId,storage);
    const adventure={
      id:"forest_run_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,8),
      gameType,
      keyId:keyId||"",
      startedAt:new Date().toISOString(),
      completed:false,
      rewardClaimed:false,
      session:clone(session)
    };
    return writeProgress(playerId,{...progress,currentAdventure:adventure},storage);
  };
  const updateSession=(playerId,session,storage=global.localStorage)=>{
    const progress=readProgress(playerId,storage);
    if(!progress.currentAdventure)return progress;
    return writeProgress(playerId,{...progress,currentAdventure:{...progress.currentAdventure,session:clone(session)}},storage);
  };
  const completeAdventure=(playerId,gameType,session,reward,storage=global.localStorage)=>{
    const progress=readProgress(playerId,storage);
    const key=getCountKey(gameType);
    const current=progress.currentAdventure||{};
    if(current.completed)return progress;
    const next={
      ...progress,
      [key]:Number(progress[key]||0)+1,
      lastPlayedGame:gameType,
      currentAdventure:{
        ...current,
        gameType,
        completed:true,
        completedAt:new Date().toISOString(),
        rewardClaimed:false,
        reward:reward?{id:reward.id,emoji:reward.emoji,label:reward.label,qty:reward.qty||1}:null,
        session:clone(session)
      }
    };
    return writeProgress(playerId,next,storage);
  };
  const markRewardClaimed=(playerId,storage=global.localStorage)=>{
    const progress=readProgress(playerId,storage);
    if(!progress.currentAdventure)return progress;
    return writeProgress(playerId,{...progress,currentAdventure:{...progress.currentAdventure,rewardClaimed:true,completed:true}},storage);
  };
  const clearCurrentAdventure=(playerId,storage=global.localStorage)=>{
    const progress=readProgress(playerId,storage);
    return writeProgress(playerId,{...progress,currentAdventure:null},storage);
  };

  ns.ForestMiniGamePoolV1={
    STORAGE_PREFIX,
    GAME_TYPES,
    keyFor,
    normalize,
    readProgress,
    writeProgress,
    tierFromCount,
    getCompletedCount,
    getTier,
    getPlayableGames,
    selectGame,
    startAdventure,
    updateSession,
    completeAdventure,
    markRewardClaimed,
    clearCurrentAdventure
  };
})(typeof window!=="undefined"?window:globalThis);
