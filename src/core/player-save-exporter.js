(function(global){
  const ns=global.PetHabitPlatform=global.PetHabitPlatform||{};
  const FAMILY_KEY="petHabitFamily_v1";
  const EXCLUDED_KEY_RE=[
    /^sb-.*-auth-token$/,
    /^supabase\./,
    /^analytics\./,
    /^MaggieAnalytics/,
    /^petHabitAnalytics/,
    /^petHabitGoogleLocalBinding_/,
    /^petHabitMockCloudMode$/,
    /^petHabitPendingOperations_v1$/,
    /^petHabitCloudSaveV1_/,
    /^petHabitSafeSnapshotIndex$/,
    /^petHabitSafeSnapshot_/,
    /^petHabitRestorePointer$/,
    /^petHabitLastRestoreAt$/,
    /^petHabitRestoreError$/,
    /^petHabitMigrationError$/,
    /^petHabitLastMigrationSnapshot$/,
    /^petHabitDeveloperMode$/
  ];
  function safeParse(raw,fallback){try{return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}}
  function isExcludedKey(key){return EXCLUDED_KEY_RE.some(re=>re.test(String(key||"")));}
  function sha256Like(input){
    const text=String(input||"");
    let h1=0x811c9dc5,h2=0x01000193;
    for(let i=0;i<text.length;i++){
      const c=text.charCodeAt(i);
      h1^=c; h1=Math.imul(h1,0x01000193)>>>0;
      h2=(h2+c+((h2<<5)>>>0)+(h2>>>2))>>>0;
    }
    return ("00000000"+h1.toString(16)).slice(-8)+("00000000"+h2.toString(16)).slice(-8)+"-"+text.length;
  }
  function stableStringify(value){
    if(value===null||typeof value!=="object")return JSON.stringify(value);
    if(Array.isArray(value))return "["+value.map(stableStringify).join(",")+"]";
    return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+stableStringify(value[k])).join(",")+"}";
  }
  function countOwned(value){
    if(Array.isArray(value))return value.length;
    if(value&&typeof value==="object")return Object.keys(value).filter(k=>value[k]!==false&&value[k]!=null).length;
    return 0;
  }
  function playerDisplayName(player,save){
    return (player&&player.name)||(save&&save.profile&&save.profile.name)||(save&&save.childName)||(save&&save.name)||"小主人";
  }
  function petSummary(save){
    const profile=save&&save.profile||{};
    const type=profile.petType||save&&save.pet||save&&save.selectedPet||"pet";
    const name=profile.petName||save&&save.petName||"小寵物";
    return {type,name};
  }
  function taskCount(save){return Array.isArray(save&&save.tasks)?save.tasks.length:0;}
  function appleCount(save){return Number(save&&save.apples||save&&save.apple||0)||0;}
  function clothingCount(save){
    const owned=save&&save.owned||{};
    const wardrobe=save&&save.wardrobe||{};
    return countOwned(owned.clothes||owned.outfits||wardrobe.owned||owned);
  }
  function lastPlayedAt(save,rawFallback){
    return (save&&save.lastPlayedAt)||(save&&save.updatedAt)||(save&&save.lastLogin)||rawFallback||"";
  }
  function parseTime(value){
    const t=Date.parse(value||"");
    return Number.isFinite(t)?t:0;
  }
  function daysSince(value){
    const t=parseTime(value);
    if(!t)return null;
    return Math.floor((Date.now()-t)/86400000);
  }
  function isDefaultFamilyName(name){
    const n=String(name||"").trim();
    return !n||["我的家庭","小主人","寶貝家庭","Maggie Family"].includes(n);
  }
  function hasPet(save){
    return !!(save&&(save.profile&&save.profile.petType||save.pet||save.selectedPet));
  }
  function isMeaningfulSaveObject(save){
    if(!save||typeof save!=="object")return false;
    const hasTasks=taskCount(save)>0;
    const hasProgress=Number(save.points||save.stars||0)>0||appleCount(save)>0||Object.keys(save.checked||{}).length>0;
    const hasCollection=countOwned(save.owned)>0||countOwned(save.equipped)>0||countOwned(save.backpack)>0;
    const hasDiary=(Array.isArray(save.diary)&&save.diary.length>0)||(Array.isArray(save.wishes)&&save.wishes.length>0);
    return hasPet(save)&&(hasTasks||hasProgress||hasCollection||hasDiary);
  }
  class PlayerSaveExporter{
    constructor({storage,platformAdapter}={}){
      this.storage=storage||global.localStorage;
      this.platform=platformAdapter||new ns.WebPlatformAdapter();
    }
    readRaw(key){try{return this.storage&&this.storage.getItem(key);}catch(e){return null;}}
    writeRaw(key,value){try{this.storage&&this.storage.setItem(key,value);return ns.ok(true);}catch(e){return ns.err("local_write_failed",String(e&&e.message||e),false);}}
    removeRaw(key){try{this.storage&&this.storage.removeItem(key);return ns.ok(true);}catch(e){return ns.err("local_remove_failed",String(e&&e.message||e),false);}}
    listStorageKeys(){
      const keys=[];
      try{for(let i=0;i<(this.storage&&this.storage.length||0);i++){const k=this.storage.key(i);if(k)keys.push(k);}}catch(e){}
      return keys.sort();
    }
    readFamily(){return safeParse(this.readRaw(FAMILY_KEY),null);}
    readPlayerSave(player){return safeParse(this.readRaw(player&&player.storageKey||"habitKingdom"),{});}
    getPlayerRawLastPlayed(player){
      const id=player&&player.id;
      return this.readRaw(id?"lastLogin_hk_"+id:"lastLogin_hk")||this.readRaw("lastLogin_hk")||"";
    }
    buildCandidate({candidateId,sourceType,family,players,storageKeys,suspectedTest=false,notes=[]}){
      const summaries=players.map(p=>{
        const pet=petSummary(p.save);
        return {
          playerName:playerDisplayName(p.player,p.save),
          petName:pet.name,
          petType:pet.type,
          apples:appleCount(p.save),
          taskCount:taskCount(p.save),
          clothingCount:clothingCount(p.save),
          lastPlayedAt:lastPlayedAt(p.save,this.getPlayerRawLastPlayed(p.player))
        };
      });
      const latestPlayedAt=summaries.map(s=>s.lastPlayedAt).filter(Boolean).sort().pop()||"";
      const familyName=(family&&family.name)||summaries.map(s=>s.playerName).filter(Boolean).join("、")||"我的家庭";
      const safeSummary={
        familyName,
        playerName:summaries.length===1?(summaries[0].playerName||"小主人"):familyName,
        petName:summaries.length===1?(summaries[0].petName||"小寵物"):(summaries.map(s=>s.petName).filter(Boolean).join("、")||"小寵物"),
        petType:summaries.length===1?(summaries[0].petType||"pet"):"family",
        playerCount:summaries.length,
        petCount:summaries.filter(s=>s.petName||s.petType).length,
        apples:summaries.reduce((n,s)=>n+(Number(s.apples)||0),0),
        taskCount:summaries.reduce((n,s)=>n+(Number(s.taskCount)||0),0),
        clothingCount:summaries.reduce((n,s)=>n+(Number(s.clothingCount)||0),0),
        lastPlayedAt:latestPlayedAt
      };
      const suspectedReasons=[...(notes||[])];
      if(sourceType&&sourceType!=="family_v1")suspectedReasons.push("legacy_or_unbound_storage");
      if((storageKeys||[]).some(k=>k==="habitKingdom"))suspectedReasons.push("legacy_storage_namespace");
      if(sourceType==="orphan_player")suspectedReasons.push("missing_family_binding");
      if(sourceType!=="family_v1"&&isDefaultFamilyName(familyName))suspectedReasons.push("default_family_name");
      const oldDays=daysSince(latestPlayedAt);
      if(oldDays!=null&&oldDays>=30)suspectedReasons.push("old_last_played_"+oldDays+"_days");
      const uniqueSuspectedReasons=Array.from(new Set(suspectedReasons.filter(Boolean)));
      const sectionCount=[
        players.length>0,
        storageKeys.length>0,
        summaries.some(s=>s.taskCount>0),
        summaries.some(s=>s.apples>0),
        summaries.some(s=>s.clothingCount>0)
      ].filter(Boolean).length;
      const fingerprint=this.calculatePlayerSaveChecksum({
        sourceType,
        familyId:family&&family.id||"",
        activePlayerId:family&&family.activePlayerId||players[0]&&players[0].player&&players[0].player.id||"",
        storageKeys,
        summaries,
        rawChecksums:players.map(p=>this.calculatePlayerSaveChecksum(p.save||{}))
      });
      return {candidateId,sourceType,family,players,storageKeys,summary:safeSummary,playerSummaries:summaries,fingerprint,suspectedTest:!!suspectedTest||uniqueSuspectedReasons.length>0,recognizedSectionCount:sectionCount,notes,suspectedReasons:uniqueSuspectedReasons};
    }
    discoverLocalSaveCandidates(){
      const candidates=[];
      const usedKeys=new Set();
      const family=this.readFamily();
      if(family&&Array.isArray(family.players)){
        const players=[];
        const storageKeys=[FAMILY_KEY];
        const notes=[];
        family.players.forEach(p=>{
          const key=p&&p.storageKey;
          const raw=key&&this.readRaw(key);
          const save=safeParse(raw,null);
          if(raw&&isMeaningfulSaveObject(save)){
            players.push({player:p,save,storageKey:key});
            storageKeys.push(key);
            usedKeys.add(key);
          }else if(key){
            notes.push("missing_or_incomplete_player_save");
          }
        });
        if(players.length){
          const cleanFamily={...family,players:players.map(p=>p.player),activePlayerId:family.activePlayerId||players[0].player.id};
          candidates.push(this.buildCandidate({
            candidateId:"family_current",
            sourceType:"family_v1",
            family:cleanFamily,
            players,
            storageKeys:Array.from(new Set(storageKeys)),
            suspectedTest:notes.length>0,
            notes
          }));
        }
      }
      const legacyRaw=this.readRaw("habitKingdom");
      const legacy=safeParse(legacyRaw,null);
      if(legacyRaw&&isMeaningfulSaveObject(legacy)&&!usedKeys.has("habitKingdom")){
        const p={id:"legacy",name:legacy.profile&&legacy.profile.name||legacy.childName||"小主人",storageKey:"habitKingdom",localSaveId:"legacy"};
        candidates.push(this.buildCandidate({
          candidateId:"legacy_habitKingdom",
          sourceType:"legacy_single",
          family:{id:"local_legacy_family",activePlayerId:"legacy",players:[p]},
          players:[{player:p,save:legacy,storageKey:"habitKingdom"}],
          storageKeys:["habitKingdom"],
          suspectedTest:true,
          notes:legacy.profile?["legacy_storage_namespace"]:["legacy_storage_namespace","missing_profile"]
        }));
        usedKeys.add("habitKingdom");
      }
      this.listStorageKeys().forEach(k=>{
        if(usedKeys.has(k)||isExcludedKey(k))return;
        if(!/^habitKingdom_player_/.test(k))return;
        const save=safeParse(this.readRaw(k),null);
        if(!isMeaningfulSaveObject(save))return;
        const id=k.replace(/^habitKingdom_player_/,"")||("candidate_"+candidates.length);
        const p={id,name:save.profile&&save.profile.name||save.childName||"小主人",storageKey:k,localSaveId:id};
        candidates.push(this.buildCandidate({
          candidateId:"orphan_"+id,
          sourceType:"orphan_player",
          family:{id:"local_orphan_family_"+id,activePlayerId:id,players:[p]},
          players:[{player:p,save,storageKey:k}],
          storageKeys:[k],
          suspectedTest:true,
          notes:["orphan_player_save"]
        }));
      });
      try{console.log("[CloudSave] local_candidates_scanned",{candidate_count:candidates.length,recognized_section_count:candidates.reduce((n,c)=>n+(c.recognizedSectionCount||0),0)});}catch(e){}
      return ns.ok(candidates);
    }
    getCandidateById(candidateId){
      const list=this.discoverLocalSaveCandidates();
      if(!list.ok)return list;
      const candidates=list.data||[];
      if(!candidateId&&candidates.length===1)return ns.ok(candidates[0]);
      const found=candidates.find(c=>c.candidateId===candidateId);
      return found?ns.ok(found):ns.err("local_candidate_not_found","找不到指定的遊戲進度",false,{candidate_count:candidates.length});
    }
    exportCandidateSave(candidate,familyId){
      if(!candidate||!candidate.players||!candidate.players.length)return ns.err("no_local_data","沒有可備份的遊戲進度",false);
      const localStorageData={};
      const cleanFamily={...(candidate.family||{}),id:(candidate.family&&candidate.family.id)||familyId||"local_family",family_id:familyId||"",activePlayerId:(candidate.family&&candidate.family.activePlayerId)||candidate.players[0].player.id,players:candidate.players.map(p=>p.player)};
      localStorageData[FAMILY_KEY]=JSON.stringify(cleanFamily);
      candidate.players.forEach(p=>{
        if(p.storageKey)localStorageData[p.storageKey]=JSON.stringify(p.save||{});
      });
      candidate.storageKeys.forEach(k=>{
        if(k===FAMILY_KEY||Object.prototype.hasOwnProperty.call(localStorageData,k))return;
        const raw=this.readRaw(k);
        if(raw!=null)localStorageData[k]=raw;
      });
      const players=candidate.players.map(p=>({
        id:p.player.id,
        name:p.player.name||"",
        storageKey:p.storageKey||p.player.storageKey||"",
        localSaveId:p.player.localSaveId||"",
        themeId:p.player.themeId||"",
        save:p.save||{}
      }));
      const primary=players[0]&&players[0].save||{};
      const save={
        format:"pet_habit_cloud_save_v1",
        schemaVersion:String(global.APP_SCHEMA_VERSION||2),
        gameVersion:String(global.APP_VERSION||global.VERSION||"unknown"),
        exportedAt:ns.nowIso(),
        deviceId:this.platform.getDeviceId(),
        family:cleanFamily,
        activePlayerId:cleanFamily.activePlayerId||"",
        players,
        player:players[0]||null,
        pets:players.map(p=>({playerId:p.id,pet:petSummary(p.save)})),
        habits:players.map(p=>({playerId:p.id,tasks:Array.isArray(p.save.tasks)?p.save.tasks:[]})),
        economy:players.map(p=>({playerId:p.id,stars:Number(p.save.stars||p.save.points||0)||0,apples:appleCount(p.save)})),
        wardrobe:players.map(p=>({playerId:p.id,owned:p.save.owned||{},equipped:p.save.equipped||{}})),
        pet_accessories:primary.petAccessories||primary.pet_accessories||{},
        rooms:primary.rooms||primary.room||{},
        furniture_positions:primary.furniturePositions||primary.roomDecorPositions||{},
        backpack:primary.backpack||{},
        achievements:primary.achievements||[],
        diary:primary.diary||[],
        wishes:primary.wishes||[],
        challenges:primary.challenges||primary.bonusTasks||[],
        parent_settings:{approvalMode:primary.approvalMode||"",pinConfigured:!!(primary.profile&&primary.profile.pin)},
        tutorials:primary.tutorials||{},
        seasonal_events:primary.officialEventProgress||primary.seasonal_events||{},
        reward_ledger:safeParse(this.readRaw("petHabitRewardLedger_"+cleanFamily.activePlayerId),[])||[],
        adventure_foundation:primary.adventureFoundation||{},
        scene_state:primary.sceneState||{},
        metadata:{
          local_last_modified_at:candidate.summary&&candidate.summary.lastPlayedAt||ns.nowIso(),
          source_device_id:this.platform.getDeviceId(),
          active_local_save_fingerprint:candidate.fingerprint,
          localCandidateId:candidate.candidateId,
          family_id:familyId||""
        },
        localStorage:localStorageData
      };
      save.checksum=this.calculatePlayerSaveChecksum(save);
      return ns.ok(save);
    }
    collectIncludedKeys(family){
      const allow=new Set([FAMILY_KEY,"habitKingdom","lastLogin_hk","lastStreak_hk","musicOn_hk","weather_hk"]);
      (family&&Array.isArray(family.players)?family.players:[]).forEach(p=>{
        if(p&&p.storageKey)allow.add(p.storageKey);
        const id=p&&p.id;
        if(id){
          [
            "lastLogin_hk","lastStreak_hk","musicOn_hk","weather_hk","parkPetPan_hk","parkKidPan_hk",
            "outingScene_hk","roomDecorPos_hk","allDoneCelebrate_hk","founderGift_v1_claimed",
            "petHabitRewardLedger","petHabitAdventureKeys","roomToolTip_desk","roomToolTip_focus",
            "roomToolTip_diary","roomToolTip_wish"
          ].forEach(base=>allow.add(base+"_"+id));
          this.listStorageKeys().forEach(k=>{
            if(k.includes("_"+id)||k.includes(id+"_")||k.endsWith(id)){
              if(!isExcludedKey(k))allow.add(k);
            }
          });
        }
      });
      this.listStorageKeys().forEach(k=>{
        if(isExcludedKey(k))return;
        if(/^petHabit(Gift|RewardLedger|AdventureKeys|AdventureKeyGrant|Hint_)/.test(k))allow.add(k);
      });
      return Array.from(allow).filter(k=>this.readRaw(k)!==null&&!isExcludedKey(k)).sort();
    }
    exportPlayerSave(){
      const selectedCandidateId=this.selectedCandidateId||"";
      const candidates=this.discoverLocalSaveCandidates();
      if(!candidates.ok)return candidates;
      if(!candidates.data.length)return ns.err("no_local_data","沒有可備份的遊戲進度",false);
      if(candidates.data.length>1&&!selectedCandidateId)return ns.err("multiple_local_candidates","找到多份遊戲進度，請由家長選擇",false,{candidate_count:candidates.data.length,candidates:candidates.data.map(c=>({candidateId:c.candidateId,summary:c.summary,suspectedTest:c.suspectedTest,recognizedSectionCount:c.recognizedSectionCount}))});
      const chosen=selectedCandidateId?candidates.data.find(c=>c.candidateId===selectedCandidateId):candidates.data[0];
      if(!chosen)return ns.err("local_candidate_not_found","找不到指定的遊戲進度",false,{candidate_count:candidates.data.length});
      return this.exportCandidateSave(chosen,this.familyId||"");
    }
    exportPlayerSaveLegacy(){
      const family=this.readFamily();
      const keys=this.collectIncludedKeys(family);
      const localStorageData={};
      keys.forEach(k=>{localStorageData[k]=this.readRaw(k);});
      const players=(family&&Array.isArray(family.players)?family.players:[]).map(p=>({
        id:p.id,
        name:p.name||"",
        storageKey:p.storageKey||"",
        localSaveId:p.localSaveId||"",
        themeId:p.themeId||"",
        save:this.readPlayerSave(p)
      }));
      const save={
        format:"pet_habit_cloud_save_v1",
        schemaVersion:String(global.APP_SCHEMA_VERSION||2),
        gameVersion:String(global.APP_VERSION||global.VERSION||"unknown"),
        exportedAt:ns.nowIso(),
        deviceId:this.platform.getDeviceId(),
        family,
        activePlayerId:family&&family.activePlayerId||"",
        players,
        localStorage:localStorageData
      };
      save.checksum=this.calculatePlayerSaveChecksum(save);
      return ns.ok(save);
    }
    validatePlayerSave(save){
      if(!save||typeof save!=="object")return ns.err("save_invalid","存檔格式不正確",false);
      if(save.format!=="pet_habit_cloud_save_v1")return ns.err("save_format_invalid","雲端存檔格式不相容",false);
      if(!save.family||!Array.isArray(save.family.players)||save.family.players.length<1||save.family.players.length>3)return ns.err("family_invalid","家庭資料不完整",false);
      if(!save.localStorage||typeof save.localStorage!=="object")return ns.err("local_storage_missing","存檔缺少本機資料",false);
      const playerKeys=save.family.players.map(p=>p&&p.storageKey).filter(Boolean);
      if(!playerKeys.length||!playerKeys.every(k=>Object.prototype.hasOwnProperty.call(save.localStorage,k)))return ns.err("player_save_missing","小主人資料不完整",false);
      return ns.ok({schemaVersion:save.schemaVersion,gameVersion:save.gameVersion});
    }
    isMeaningfulPlayerSave(save){
      const valid=this.validatePlayerSave(save);
      if(!valid.ok)return false;
      const players=Array.isArray(save.players)?save.players:[];
      return players.some(p=>{
        const s=p&&p.save||{};
        const hasPet=!!(s.profile&&s.profile.petType||s.pet||s.selectedPet);
        const hasTasks=Array.isArray(s.tasks)&&s.tasks.length>0;
        const hasProgress=Number(s.points||s.stars||0)>0||Number(s.apples||0)>0||Object.keys(s.checked||{}).length>0;
        const hasCollection=Object.keys(s.owned||{}).length>0||Object.keys(s.equipped||{}).length>0||Object.keys(s.backpack||{}).length>0;
        const hasDiary=(Array.isArray(s.diary)&&s.diary.length>0)||(Array.isArray(s.wishes)&&s.wishes.length>0);
        return hasPet&&(hasTasks||hasProgress||hasCollection||hasDiary);
      });
    }
    calculatePlayerSaveChecksum(save){
      const clone=JSON.parse(JSON.stringify(save||{}));
      delete clone.checksum;
      return sha256Like(stableStringify(clone));
    }
    summarize(save){
      const players=Array.isArray(save&&save.players)?save.players:[];
      return {
        playerCount:players.length,
        activePlayerId:save&&save.activePlayerId||"",
        updatedAt:save&&save.exportedAt||"",
        checksum:save&&save.checksum||this.calculatePlayerSaveChecksum(save||{}),
        schemaVersion:save&&save.schemaVersion||"",
        gameVersion:save&&save.gameVersion||""
      };
    }
    migratePlayerSave(save){
      const valid=this.validatePlayerSave(save);
      if(!valid.ok)return valid;
      return ns.ok({...save,schemaVersion:String(global.APP_SCHEMA_VERSION||save.schemaVersion||2)});
    }
    importPlayerSave(save){
      const migrated=this.migratePlayerSave(save);
      if(!migrated.ok)return migrated;
      const next=migrated.data;
      const valid=this.validatePlayerSave(next);
      if(!valid.ok)return valid;
      try{
        Object.keys(next.localStorage||{}).forEach(k=>{
          if(!isExcludedKey(k))this.storage.setItem(k,String(next.localStorage[k]));
        });
        return ns.ok(this.summarize(next));
      }catch(e){return ns.err("import_failed",String(e&&e.message||e),false);}
    }
  }
  ns.PlayerSaveExporter=PlayerSaveExporter;
})(typeof window!=="undefined"?window:globalThis);
