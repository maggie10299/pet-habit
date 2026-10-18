(function(global){
  const ns=global.PetHabitAdventure=global.PetHabitAdventure||{};
  const GAME_ID="sudoku_v1";
  const THEMES=[
    {id:"plants",label:"森林植物",symbols:["🍄","🌿","🌼","🍃"]},
    {id:"animal",label:"小動物足跡",symbols:["🐾","🦋","🐿️","🪶"]},
    {id:"moon",label:"星月森林",symbols:["⭐","🌙","✨","☁️"]},
    {id:"flowers",label:"花朵小徑",symbols:["🌸","🌻","🍀","🫐"]},
    {id:"camp",label:"探險營火",symbols:["⛺","🪵","🔥","💧"]}
  ];
  const SOLUTIONS=[
    [0,1,2,3,2,3,0,1,1,0,3,2,3,2,1,0],
    [0,2,1,3,1,3,0,2,2,0,3,1,3,1,2,0],
    [1,0,3,2,3,2,1,0,0,1,2,3,2,3,0,1],
    [2,3,0,1,0,1,2,3,3,2,1,0,1,0,3,2],
    [3,1,2,0,2,0,3,1,1,3,0,2,0,2,1,3]
  ];
  const hashSeed=(value)=>{
    const text=String(value||"sudoku");
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
  const blanksForTier=(tier)=>{
    const t=Math.max(1,Math.min(4,Number(tier||1)));
    return t===1?6:t===2?7:t===3?8:9;
  };
  const clone=(value)=>JSON.parse(JSON.stringify(value));
  const isValidSolution=(solution)=>{
    if(!Array.isArray(solution)||solution.length!==16)return false;
    const validGroup=(indexes)=>{
      const seen=new Set(indexes.map(i=>solution[i]));
      return seen.size===4&&[0,1,2,3].every(v=>seen.has(v));
    };
    for(let r=0;r<4;r++)if(!validGroup([r*4,r*4+1,r*4+2,r*4+3]))return false;
    for(let c=0;c<4;c++)if(!validGroup([c,4+c,8+c,12+c]))return false;
    return validGroup([0,1,4,5])&&validGroup([2,3,6,7])&&validGroup([8,9,12,13])&&validGroup([10,11,14,15]);
  };
  const createPuzzle=({seed,tier=1,startedAt}={})=>{
    const finalSeed=seed||("sudoku_"+Date.now()+"_"+Math.random().toString(36).slice(2,8));
    const theme=THEMES[hashSeed(finalSeed+":theme")%THEMES.length];
    const base=SOLUTIONS[hashSeed(finalSeed+":solution")%SOLUTIONS.length];
    const perm=shuffle([0,1,2,3],finalSeed+":symbols");
    const solution=base.map(v=>perm[v]);
    const blankCount=blanksForTier(tier);
    const blankIndexes=shuffle(Array.from({length:16},(_,i)=>i),finalSeed+":blanks").slice(0,blankCount);
    const givens=solution.map((value,index)=>blankIndexes.includes(index)?null:value);
    return {
      id:"sudoku_"+hashSeed(finalSeed).toString(36)+"_"+Date.now().toString(36),
      gameId:GAME_ID,
      seed:finalSeed,
      tier:Math.max(1,Math.min(4,Number(tier||1))),
      themeId:theme.id,
      themeLabel:theme.label,
      symbols:theme.symbols,
      solution,
      givens,
      entries:Array(16).fill(null),
      selectedCell:null,
      completed:false,
      reward:null,
      startedAt:startedAt||new Date().toISOString(),
      completedAt:null
    };
  };
  const getCellValue=(session,index)=>{
    if(!session)return null;
    return session.givens&&session.givens[index]!=null?session.givens[index]:(session.entries||[])[index];
  };
  const groupIndexesFor=(index)=>{
    const r=Math.floor(index/4),c=index%4;
    const br=Math.floor(r/2)*2,bc=Math.floor(c/2)*2;
    return {
      row:[r*4,r*4+1,r*4+2,r*4+3],
      col:[c,4+c,8+c,12+c],
      box:[br*4+bc,br*4+bc+1,(br+1)*4+bc,(br+1)*4+bc+1]
    };
  };
  const duplicateGroups=(session,index,value)=>{
    if(value==null)return [];
    const groups=groupIndexesFor(index);
    return Object.keys(groups).filter(name=>groups[name].some(i=>i!==index&&getCellValue(session,i)===value));
  };
  const placeSymbol=(session,index,value)=>{
    const next=clone(session);
    if(next.completed)return {ok:false,code:"already_completed",session:next};
    if(index<0||index>15)return {ok:false,code:"cell_not_found",session:next};
    if(next.givens[index]!=null)return {ok:false,code:"given_cell",session:next};
    next.entries[index]=value;
    next.selectedCell=index;
    const duplicates=duplicateGroups(next,index,value);
    const filled=next.givens.every((given,i)=>given!=null||next.entries[i]!=null);
    const correct=filled&&next.solution.every((value,i)=>getCellValue(next,i)===value);
    if(correct){
      next.completed=true;
      next.completedAt=new Date().toISOString();
      return {ok:true,code:"complete",session:next,duplicates};
    }
    return {ok:true,code:duplicates.length?"duplicate":"placed",session:next,duplicates};
  };
  const attachReward=(session,reward)=>{
    const next=clone(session);
    next.reward=reward?{id:reward.id,emoji:reward.emoji,label:reward.label,qty:1}:null;
    return next;
  };

  ns.ForestSudokuV1={
    GAME_ID,
    THEMES,
    SOLUTIONS,
    hashSeed,
    createPuzzle,
    isValidSolution,
    getCellValue,
    groupIndexesFor,
    duplicateGroups,
    placeSymbol,
    attachReward,
    blanksForTier
  };
})(typeof window!=="undefined"?window:globalThis);
