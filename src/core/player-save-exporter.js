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
