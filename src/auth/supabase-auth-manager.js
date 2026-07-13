(function(global){
  const ns=global.PetHabitPlatform=global.PetHabitPlatform||{};
  const AUTH_STATUS={
    SIGNED_OUT:"signed_out",
    SIGNING_IN:"signing_in",
    SIGNED_IN:"signed_in",
    SESSION_EXPIRED:"session_expired",
    AUTH_FAILED:"auth_failed",
    LOCAL_ONLY:"local_only"
  };
  class SupabaseAuthManager{
    constructor({repository,analyticsAdapter}={}){
      this.repository=repository||new ns.SupabaseCloudRepository();
      this.analytics=analyticsAdapter||new ns.AnalyticsAdapter();
      this.status=AUTH_STATUS.LOCAL_ONLY;
      this.session=null;
      this.user=null;
      this.unsubscribe=null;
      this.lastEvent=null;
    }
    getStatus(){return {status:this.status,user:this.safeUser(),hasSession:!!this.session};}
    safeUser(){
      if(!this.user)return null;
      return {id:this.user.id,name:this.user.user_metadata&&this.user.user_metadata.name||""};
    }
    async restoreSession(){
      if(this.repository.refreshClient)this.repository.refreshClient();
      if(!this.repository.client||!this.repository.client.auth){this.status=AUTH_STATUS.LOCAL_ONLY;return ns.ok(this.getStatus());}
      try{
        const res=await this.repository.client.auth.getSession();
        const session=res&&res.data&&res.data.session;
        if(session&&session.user){this.session=session;this.user=session.user;this.status=AUTH_STATUS.SIGNED_IN;}
        else{this.status=AUTH_STATUS.SIGNED_OUT;}
        return ns.ok(this.getStatus());
      }catch(e){this.status=AUTH_STATUS.SESSION_EXPIRED;return ns.err("auth_session_restore_failed",String(e&&e.message||e),true);}
    }
    startAuthListener(callback){
      if(this.repository.refreshClient)this.repository.refreshClient();
      if(!this.repository.client||!this.repository.client.auth||!this.repository.client.auth.onAuthStateChange){
        this.status=AUTH_STATUS.LOCAL_ONLY;
        return ns.err("auth_listener_unavailable","Supabase auth listener unavailable; local-only mode remains active",true);
      }
      if(this.unsubscribe)return ns.ok({status:"already_listening"});
      try{
        const res=this.repository.client.auth.onAuthStateChange((event,session)=>{
          this.lastEvent=event;
          this.session=session||null;
          this.user=session&&session.user||null;
          if(event==="SIGNED_IN"||event==="TOKEN_REFRESHED"){
            this.status=AUTH_STATUS.SIGNED_IN;
          }else if(event==="SIGNED_OUT"){
            this.status=AUTH_STATUS.SIGNED_OUT;
          }else if(event==="USER_DELETED"){
            this.status=AUTH_STATUS.SESSION_EXPIRED;
          }
          if(typeof callback==="function")callback({event,status:this.getStatus()});
        });
        this.unsubscribe=res&&res.data&&res.data.subscription&&res.data.subscription.unsubscribe||res&&res.unsubscribe||null;
        return ns.ok({status:"listening"});
      }catch(e){return ns.err("auth_listener_failed",String(e&&e.message||e),true);}
    }
    stopAuthListener(){
      try{
        if(this.unsubscribe){this.unsubscribe();this.unsubscribe=null;}
        return ns.ok({status:"stopped"});
      }catch(e){return ns.err("auth_listener_stop_failed",String(e&&e.message||e),true);}
    }
    getRedirectTo(){
      return "https://maggie10299.github.io/pet-habit/";
    }
    async signInWithGoogle(){
      if(this.repository.refreshClient)this.repository.refreshClient();
      if(!this.repository.client||!this.repository.client.auth){
        this.status=AUTH_STATUS.LOCAL_ONLY;
        return ns.err("auth_unavailable","Google 登入尚未準備完成，請重新整理後再試一次。遊戲資料仍安全保存在這台裝置。",true);
      }
      this.status=AUTH_STATUS.SIGNING_IN;
      try{
        const res=await this.repository.client.auth.signInWithOAuth({
          provider:"google",
          options:{redirectTo:this.getRedirectTo()}
        });
        if(res&&res.error){this.status=AUTH_STATUS.AUTH_FAILED;return this.repository.normalizeError(res.error,"auth_google_login_failed");}
        return ns.ok({status:this.status,redirect:true});
      }catch(e){this.status=AUTH_STATUS.AUTH_FAILED;return ns.err("auth_google_login_failed",String(e&&e.message||e),true);}
    }
    async signOut(){
      if(this.repository.refreshClient)this.repository.refreshClient();
      if(!this.repository.client||!this.repository.client.auth){this.status=AUTH_STATUS.LOCAL_ONLY;return ns.ok(this.getStatus());}
      try{
        const res=await this.repository.client.auth.signOut();
        if(res&&res.error)return this.repository.normalizeError(res.error,"auth_signout_failed");
        this.session=null;this.user=null;this.status=AUTH_STATUS.SIGNED_OUT;
        this.analytics.track("google_logout",{result:"local_data_kept"});
        return ns.ok(this.getStatus());
      }catch(e){return ns.err("auth_signout_failed",String(e&&e.message||e),true);}
    }
  }
  ns.AUTH_STATUS=AUTH_STATUS;
  ns.SupabaseAuthManager=SupabaseAuthManager;
})(typeof window!=="undefined"?window:globalThis);
