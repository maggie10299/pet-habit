(function(global){
  const ns=global.PetHabitPlatform=global.PetHabitPlatform||{};
  class RepositoryContract{
    getFamily(){return ns.err("not_implemented","getFamily not implemented",false);}
    saveFamily(){return ns.err("not_implemented","saveFamily not implemented",false);}
    getPlayers(){return ns.err("not_implemented","getPlayers not implemented",false);}
    getPlayer(){return ns.err("not_implemented","getPlayer not implemented",false);}
    savePlayer(){return ns.err("not_implemented","savePlayer not implemented",false);}
    getPlayerSave(){return ns.err("not_implemented","getPlayerSave not implemented",false);}
    savePlayerSave(){return ns.err("not_implemented","savePlayerSave not implemented",false);}
    getRewardLedger(){return ns.err("not_implemented","getRewardLedger not implemented",false);}
    grantRewardOnce(){return ns.err("not_implemented","grantRewardOnce not implemented",false);}
    getAdventureKeys(){return ns.err("not_implemented","getAdventureKeys not implemented",false);}
    grantAdventureKeyOnce(){return ns.err("not_implemented","grantAdventureKeyOnce not implemented",false);}
    consumeAdventureKey(){return ns.err("not_implemented","consumeAdventureKey not implemented",false);}
    getDeviceLink(){return ns.err("not_implemented","getDeviceLink not implemented",false);}
    upsertDeviceLink(){return ns.err("not_implemented","upsertDeviceLink not implemented",false);}
    requestAccountDeletion(){return ns.err("not_implemented","requestAccountDeletion not implemented",false);}
  }
  ns.RepositoryContract=RepositoryContract;
})(typeof window!=="undefined"?window:globalThis);
