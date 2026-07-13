(function(global){
  const ns=global.PetHabitPlatform=global.PetHabitPlatform||{};
  class ConflictManager{
    constructor(saveManager){this.saveManager=saveManager;}
    buildSaveSummary(save){
      const s=save||{};const p=s.profile||{};
      const tasks=Array.isArray(s.tasks)?s.tasks:[];
      const events=s.officialEventProgress||{};
      return {
        playerName:p.kidName||p.name||"小主人",
        stars:Number(s.points||0),
        pet:p.petName||p.petType||"",
        lastModifiedAt:(s.platformMetadata&&s.platformMetadata.localModifiedAt)||s.updatedAt||"",
        taskCount:tasks.length,
        eventCount:Object.keys(events).length
      };
    }
    compareLocalAndCloud(local,cloud){return {local:this.buildSaveSummary(local),cloud:this.buildSaveSummary(cloud),requiresChoice:true};}
    createConflictSnapshot(){return this.saveManager&&this.saveManager.createLocalSnapshot?this.saveManager.createLocalSnapshot("conflict-before-resolution"):ns.err("snapshot_unavailable","Snapshot unavailable",false);}
    resolveUseLocal(){this.createConflictSnapshot();return ns.ok({choice:"local"});}
    resolveUseCloud(){this.createConflictSnapshot();return ns.ok({choice:"cloud"});}
    cancelResolution(){return ns.ok({choice:"cancel"});}
  }
  ns.ConflictManager=ConflictManager;
})(typeof window!=="undefined"?window:globalThis);
