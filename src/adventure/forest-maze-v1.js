(function(global){
  const ns=global.PetHabitAdventure=global.PetHabitAdventure||{};
  const GAME_ID="maze_v1";
  const SYMBOL_POOL=["🍄","🦋","🍃","🫐","🌙","🐾"];
  const NODES={
    entrance:{
      id:"entrance",
      title:"森林入口",
      emoji:"🌲",
      text:"未來會在這裡製作真正可移動的森林迷宮。",
      choices:[{id:"future_walking_maze",label:"未來移動迷宮（未開放）",to:"fork"}]
    },
    fork:{
      id:"fork",
      title:"兩條小路",
      emoji:"🪧",
      text:"木牌上畫著葉子和水滴。要往哪邊走呢？",
      choices:[
        {id:"leaf_path",label:"走向葉子小路",to:"tree_hollow"},
        {id:"water_path",label:"走向水滴小路",to:"creek"}
      ]
    },
    creek:{
      id:"creek",
      title:"叮咚小溪",
      emoji:"💧",
      text:"小溪旁有亮亮的石頭，遠處好像有一扇古老石門。",
      choices:[
        {id:"to_gate",label:"靠近亮亮的石門",to:"rune_gate"},
        {id:"back_fork",label:"回到兩條小路",to:"fork"}
      ]
    },
    tree_hollow:{
      id:"tree_hollow",
      title:"老樹樹洞",
      emoji:"🪵",
      text:"樹洞裡傳來溫暖的香氣，旁邊還有一條窄窄的小路。",
      choices:[
        {id:"small_path",label:"鑽進窄窄小路",to:"dead_end"},
        {id:"moss_path",label:"走向青苔小路",to:"rune_gate"}
      ]
    },
    dead_end:{
      id:"dead_end",
      title:"莓果小角落",
      emoji:"🫐",
      text:"這裡是安靜的莓果角落，沒有路了，但有一陣甜甜的味道。",
      deadEnd:true,
      choices:[{id:"return_tree",label:"回到老樹樹洞",to:"tree_hollow"}]
    },
    rune_gate:{
      id:"rune_gate",
      title:"記憶符文門",
      emoji:"🪨",
      text:"石門上有六個小符文。找出一樣的圖案，門就會打開。",
      puzzle:true,
      choices:[{id:"open_runes",label:"打開記憶符文門",action:"puzzle"}]
    },
    treasure:{
      id:"treasure",
      title:"森林寶箱",
      emoji:"🎁",
      text:"你找到藏在森林深處的小寶箱了！裡面有亮晶晶的回憶。",
      choices:[{id:"to_exit",label:"帶著回憶走向出口",to:"exit"}]
    },
    exit:{
      id:"exit",
      title:"森林出口",
      emoji:"🌤️",
      text:"陽光又出現了。你和小夥伴一起走出了森林迷宮！",
      complete:true,
      choices:[]
    }
  };

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
  const createMemoryDeck=(seed)=>{
    const symbols=shuffle(SYMBOL_POOL,seed).slice(0,3);
    return shuffle(symbols.concat(symbols).map((symbol,index)=>({
      id:"rune_"+index+"_"+symbol.charCodeAt(0),
      symbol,
      matched:false
    })),String(seed)+":deck");
  };
  const createSession=({seed,startedAt}={})=>{
    const finalSeed=seed||("forest_"+Date.now()+"_"+Math.random().toString(36).slice(2,8));
    return {
      id:"forest_"+hashSeed(finalSeed).toString(36)+"_"+Date.now().toString(36),
      gameId:GAME_ID,
      seed:finalSeed,
      nodeId:"entrance",
      mode:"scene",
      gateUnlocked:false,
      completed:false,
      abandoned:false,
      path:["entrance"],
      deck:createMemoryDeck(finalSeed),
      flipped:[],
      matchedSymbols:[],
      startedAt:startedAt||new Date().toISOString(),
      completedAt:null
    };
  };
  const clone=(session)=>JSON.parse(JSON.stringify(session));
  const getNode=(session)=>NODES[(session&&session.nodeId)||"entrance"]||NODES.entrance;
  const getChoices=(session)=>{
    const node=getNode(session);
    if(node.id==="rune_gate"&&session&&session.gateUnlocked){
      return [{id:"gate_open",label:"走進打開的石門",to:"treasure"}];
    }
    const choices=[...(node.choices||[])];
    if(node.id==="fork"&&hashSeed(session&&session.seed)%2===1)return choices.reverse();
    return choices;
  };
  const move=(session,choiceId)=>{
    const next=clone(session);
    if(next.completed||next.abandoned)return {ok:false,code:"already_finished",session:next};
    const choice=getChoices(next).find(c=>c.id===choiceId);
    if(!choice)return {ok:false,code:"choice_not_found",session:next};
    if(choice.action==="puzzle"){
      next.mode="puzzle";
      return {ok:true,code:"puzzle",session:next};
    }
    if(!NODES[choice.to])return {ok:false,code:"node_not_found",session:next};
    next.nodeId=choice.to;
    next.mode="scene";
    next.path=[...(next.path||[]),choice.to];
    if(NODES[choice.to].complete){
      next.completed=true;
      next.completedAt=new Date().toISOString();
    }
    return {ok:true,code:next.completed?"complete":"moved",session:next,node:NODES[choice.to]};
  };
  const flipCard=(session,cardId)=>{
    const next=clone(session);
    if(next.mode!=="puzzle")next.mode="puzzle";
    const card=next.deck.find(c=>c.id===cardId);
    if(!card)return {ok:false,code:"card_not_found",session:next};
    if(card.matched||(next.flipped||[]).includes(cardId))return {ok:false,code:"card_unavailable",session:next};
    next.flipped=[...(next.flipped||[]),cardId].slice(-2);
    if(next.flipped.length<2)return {ok:true,code:"first_flip",session:next};
    const [aId,bId]=next.flipped;
    const a=next.deck.find(c=>c.id===aId);
    const b=next.deck.find(c=>c.id===bId);
    if(a&&b&&a.symbol===b.symbol){
      next.deck=next.deck.map(c=>c.symbol===a.symbol?{...c,matched:true}:c);
      next.matchedSymbols=Array.from(new Set([...(next.matchedSymbols||[]),a.symbol]));
      next.flipped=[];
      if(next.matchedSymbols.length>=3){
        next.gateUnlocked=true;
        next.mode="scene";
        return {ok:true,code:"puzzle_complete",session:next};
      }
      return {ok:true,code:"match",session:next};
    }
    return {ok:true,code:"miss",session:next,missed:[aId,bId]};
  };
  const clearMiss=(session)=>{
    const next=clone(session);
    next.flipped=[];
    return next;
  };
  const abandon=(session)=>{
    const next=clone(session);
    next.abandoned=true;
    next.mode="scene";
    next.abandonedAt=new Date().toISOString();
    return next;
  };

  ns.ForestMazeV1={
    GAME_ID,
    NODES,
    SYMBOL_POOL,
    createSession,
    createMemoryDeck,
    getNode,
    getChoices,
    move,
    flipCard,
    clearMiss,
    abandon,
    hashSeed
  };
})(typeof window!=="undefined"?window:globalThis);
