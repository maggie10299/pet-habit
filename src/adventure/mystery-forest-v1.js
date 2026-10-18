(function(global){
  const ns=global.PetHabitAdventure=global.PetHabitAdventure||{};
  const GAME_ID="mystery_forest_v1";
  const ANIMAL_POOL=[
    {id:"rabbit",emoji:"🐰",label:"兔子"},
    {id:"fox",emoji:"🦊",label:"狐狸"},
    {id:"bear",emoji:"🐻",label:"小熊"},
    {id:"owl",emoji:"🦉",label:"貓頭鷹"},
    {id:"squirrel",emoji:"🐿️",label:"松鼠"},
    {id:"deer",emoji:"🦌",label:"小鹿"},
    {id:"bird",emoji:"🐦",label:"小鳥"},
    {id:"hedgehog",emoji:"🦔",label:"刺蝟"}
  ];
  const hashSeed=(value)=>{
    const text=String(value||"forest");
    let h=2166136261;
    for(let i=0;i<text.length;i++){
      h^=text.charCodeAt(i);
      h=Math.imul(h,16777619);
    }
    return h>>>0;
  };
  const rngFromSeed=(seed)=>{
    let t=hashSeed(seed);
    return ()=>{
      t+=0x6D2B79F5;
      let r=Math.imul(t^(t>>>15),1|t);
      r^=r+Math.imul(r^(r>>>7),61|r);
      return ((r^(r>>>14))>>>0)/4294967296;
    };
  };
  const shuffle=(items,seed)=>{
    const out=[...items];
    const rand=rngFromSeed(seed);
    for(let i=out.length-1;i>0;i--){
      const j=Math.floor(rand()*(i+1));
      [out[i],out[j]]=[out[j],out[i]];
    }
    return out;
  };
  const pairCountForTier=(tier)=>{
    const t=Math.max(1,Math.min(4,Number(tier||1)));
    return t===1?3:t===2?4:t===3?5:6;
  };
  const createDeck=(seed,pairCount=3)=>{
    const animals=shuffle(ANIMAL_POOL,seed).slice(0,Math.max(3,Math.min(6,Number(pairCount||3))));
    return shuffle(animals.concat(animals).map((animal,index)=>({
      id:"forest_card_"+index+"_"+animal.id,
      animalId:animal.id,
      emoji:animal.emoji,
      label:animal.label,
      matched:false
    })),String(seed)+":cards");
  };
  const createSession=({seed,startedAt,pairCount,tier=1}={})=>{
    const finalSeed=seed||("mystery_"+Date.now()+"_"+Math.random().toString(36).slice(2,8));
    const finalPairCount=pairCount||pairCountForTier(tier);
    return {
      id:"mystery_"+hashSeed(finalSeed).toString(36)+"_"+Date.now().toString(36),
      gameId:GAME_ID,
      seed:finalSeed,
      phase:"play",
      tier:Math.max(1,Math.min(4,Number(tier||1))),
      pairCount:finalPairCount,
      deck:createDeck(finalSeed,finalPairCount),
      flipped:[],
      matchedAnimalIds:[],
      completed:false,
      reward:null,
      startedAt:startedAt||new Date().toISOString(),
      completedAt:null
    };
  };
  const clone=(session)=>JSON.parse(JSON.stringify(session));
  const flipCard=(session,cardId)=>{
    const next=clone(session);
    if(next.completed)return {ok:false,code:"already_completed",session:next};
    const card=next.deck.find(c=>c.id===cardId);
    if(!card)return {ok:false,code:"card_not_found",session:next};
    if(card.matched||(next.flipped||[]).includes(cardId))return {ok:false,code:"card_unavailable",session:next};
    next.flipped=[...(next.flipped||[]),cardId].slice(-2);
    if(next.flipped.length<2)return {ok:true,code:"first_flip",session:next};
    const [aId,bId]=next.flipped;
    const a=next.deck.find(c=>c.id===aId);
    const b=next.deck.find(c=>c.id===bId);
    if(a&&b&&a.animalId===b.animalId){
      next.deck=next.deck.map(c=>c.animalId===a.animalId?{...c,matched:true}:c);
      next.matchedAnimalIds=Array.from(new Set([...(next.matchedAnimalIds||[]),a.animalId]));
      next.flipped=[];
      if(next.matchedAnimalIds.length>=(next.pairCount||3)){
        next.completed=true;
        next.phase="treasure";
        next.completedAt=new Date().toISOString();
        return {ok:true,code:"game_complete",session:next,animal:a};
      }
      return {ok:true,code:"match",session:next,animal:a};
    }
    return {ok:true,code:"miss",session:next,missed:[aId,bId]};
  };
  const clearMiss=(session)=>{
    const next=clone(session);
    next.flipped=[];
    return next;
  };
  const chooseReward=(foods=[],seed)=>{
    const pool=Array.isArray(foods)?foods.filter(f=>f&&f.id):[];
    if(!pool.length)return null;
    const weighted=[];
    pool.forEach((food,index)=>{
      const weight=index<3?5:index<8?3:1;
      for(let i=0;i<weight;i++)weighted.push(food);
    });
    const rand=rngFromSeed(String(seed)+":reward");
    return weighted[Math.floor(rand()*weighted.length)]||pool[0];
  };
  const attachReward=(session,reward)=>{
    const next=clone(session);
    next.reward=reward?{id:reward.id,emoji:reward.emoji,label:reward.label,qty:1}:null;
    next.phase="reward";
    return next;
  };

  ns.MysteryForestV1={
    GAME_ID,
    ANIMAL_POOL,
    createDeck,
    createSession,
    pairCountForTier,
    flipCard,
    clearMiss,
    chooseReward,
    attachReward,
    hashSeed
  };
})(typeof window!=="undefined"?window:globalThis);
