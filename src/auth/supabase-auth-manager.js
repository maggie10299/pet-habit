(function(global){
  const ns=global.PetHabitPlatform=global.PetHabitPlatform||{};
  const AUTH_STATUS={
    INITIALIZING:"initializing",
    CALLBACK_PROCESSING:"callback_processing",
    SIGNED_OUT:"signed_out",
    SIGNING_IN:"signing_in",
    SIGNED_IN:"signed_in",
    SESSION_EXPIRED:"session_expired",
    AUTH_FAILED:"auth_failed",
    ERROR:"error",
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
      this.listenerStarted=false;
      this.callbackProcessing=false;
      this.callbackHandled=false;
      this.callbackError=null;
      this.expiresAt=null;
      this.authRestoreDuration=null;
      this.subscribers=[];
    }
    getStatus(){
      return {
        status:this.status,
        user:this.safeUser(),
        hasSession:!!this.session,
        sessionPresent:!!this.session,
        listenerStarted:!!this.listenerStarted,
        callbackProcessing:!!this.callbackProcessing,
        callbackHandled:!!this.callbackHandled,
        callbackError:this.callbackError,
        lastAuthEvent:this.lastEvent||"",
        expiresAt:this.expiresAt||"",
        authRestoreDuration:this.authRestoreDuration
      };
    }
    previewId(id){
      id=String(id||"");
      return id?id.slice(0,4)+"…":"";
    }
    safeUser(){
      if(!this.user)return null;
      const meta=this.user.user_metadata||{};
      return {idPreview:this.previewId(this.user.id),name:meta.name||meta.full_name||""};
    }
    getLocalBindingPayload(){
      if(!this.user||!this.user.id)return null;
      const meta=this.user.user_metadata||{};
      return {sub:this.user.id,name:meta.name||meta.full_name||"Google 使用者"};
    }
    applySession(event,session){
      this.lastEvent=event||this.lastEvent;
      this.session=session||null;
      this.user=session&&session.user||null;
      this.expiresAt=session&&session.expires_at?new Date(Number(session.expires_at)*1000).toISOString():"";
      this.callbackProcessing=false;
      if(session&&session.user){
        this.status=AUTH_STATUS.SIGNED_IN;
      }else if(event==="SIGNED_OUT"){
        this.status=AUTH_STATUS.SIGNED_OUT;
      }else if(event==="USER_DELETED"){
        this.status=AUTH_STATUS.SESSION_EXPIRED;
      }else{
        this.status=AUTH_STATUS.SIGNED_OUT;
      }
      this.notifySubscribers(event);
    }
    setTransientStatus(status,event){
      this.status=status;
      this.lastEvent=event||this.lastEvent;
      this.notifySubscribers(event);
    }
    notifySubscribers(event){
      const payload={event:event||this.lastEvent,status:this.getStatus()};
      this.subscribers.slice().forEach(fn=>{
        try{fn(payload);}catch(e){}
      });
    }
    subscribe(callback){
      if(typeof callback!=="function")return ()=>{};
      this.subscribers.push(callback);
      try{callback({event:"CURRENT_STATE",status:this.getStatus()});}catch(e){}
      return ()=>{
        this.subscribers=this.subscribers.filter(fn=>fn!==callback);
      };
    }
    async restoreSession(){
      return this.initializeAuth();
    }
    getOAuthCallbackInfo(){
      const loc=global.location||{};
      const search=String(loc.search||"");
      const hash=String(loc.hash||"");
      const params=new URLSearchParams(search.replace(/^\?/,""));
      const hashParams=new URLSearchParams(hash.replace(/^#/,""));
      const code=params.get("code")||"";
      const error=params.get("error")||hashParams.get("error")||"";
      const errorDescription=params.get("error_description")||hashParams.get("error_description")||"";
      const accessToken=hashParams.get("access_token")||"";
      return {hasCallback:!!(code||accessToken||error),hasCode:!!code,hasImplicit:!!accessToken,code,error,errorDescription};
    }
    clearOAuthCallbackUrl(){
      try{
        if(!global.history||!global.history.replaceState||!global.location)return;
        const url=new URL(global.location.href||"",global.location.origin||"https://maggie10299.github.io");
        ["code","error","error_description","state"].forEach(k=>url.searchParams.delete(k));
        url.hash="";
        const next=url.pathname+(url.search?url.search:"")+(url.hash||"");
        global.history.replaceState({},global.document&&global.document.title||"",next);
      }catch(e){}
    }
    async processOAuthCallback(info){
      info=info||this.getOAuthCallbackInfo();
      if(!info.hasCallback)return ns.ok({status:"no_callback"});
      this.callbackProcessing=true;
      this.callbackError=null;
      this.setTransientStatus(AUTH_STATUS.CALLBACK_PROCESSING,"OAUTH_CALLBACK_PROCESSING");
      if(info.error){
        this.callbackProcessing=false;
        this.callbackHandled=true;
        this.callbackError={code:info.error,message:info.errorDescription||info.error};
        this.status=AUTH_STATUS.ERROR;
        this.lastEvent="OAUTH_CALLBACK_ERROR";
        this.notifySubscribers("OAUTH_CALLBACK_ERROR");
        this.clearOAuthCallbackUrl();
        return ns.err(info.error,info.errorDescription||"Google 登入暫時失敗，請再試一次。",true);
      }
      if(info.hasCode){
        if(!this.repository.client.auth.exchangeCodeForSession){
          this.callbackProcessing=false;
          this.callbackHandled=true;
          this.callbackError={code:"exchange_unavailable",message:"Supabase SDK does not support exchangeCodeForSession"};
          this.status=AUTH_STATUS.ERROR;
          this.lastEvent="OAUTH_CALLBACK_ERROR";
          this.notifySubscribers("OAUTH_CALLBACK_ERROR");
          return ns.err("exchange_unavailable","Google 登入回跳尚未準備完成，請重新整理後再試一次。",true);
        }
        try{
          const exchanged=await this.repository.client.auth.exchangeCodeForSession(info.code);
          if(exchanged&&exchanged.error)throw exchanged.error;
          let session=exchanged&&exchanged.data&&exchanged.data.session;
          if(!session&&this.repository.client.auth.getSession){
            const confirmed=await this.repository.client.auth.getSession();
            if(confirmed&&confirmed.error)throw confirmed.error;
            session=confirmed&&confirmed.data&&confirmed.data.session;
          }
          this.callbackProcessing=false;
          this.callbackHandled=true;
          this.applySession("OAUTH_CALLBACK",session);
          this.clearOAuthCallbackUrl();
          return ns.ok(this.getStatus());
        }catch(e){
          this.callbackProcessing=false;
          this.callbackHandled=true;
          this.callbackError={code:e&&e.code||"oauth_callback_exchange_failed",message:String(e&&e.message||e)};
          this.status=AUTH_STATUS.ERROR;
          this.lastEvent="OAUTH_CALLBACK_ERROR";
          this.notifySubscribers("OAUTH_CALLBACK_ERROR");
          return ns.err(this.callbackError.code,this.callbackError.message,true);
        }
      }
      if(info.hasImplicit){
        this.lastEvent="OAUTH_CALLBACK_HASH";
        this.notifySubscribers("OAUTH_CALLBACK_HASH");
      }
      return ns.ok({status:"callback_detected"});
    }
    async initializeAuth(){
      const started=Date.now();
      if(this.repository.refreshClient)this.repository.refreshClient();
      if(!this.repository.client||!this.repository.client.auth){this.status=AUTH_STATUS.LOCAL_ONLY;this.authRestoreDuration=Date.now()-started;return ns.ok(this.getStatus());}
      try{
        this.setTransientStatus(AUTH_STATUS.INITIALIZING,"AUTH_INITIALIZING");
        const callbackInfo=this.getOAuthCallbackInfo();
        if(callbackInfo.hasCallback){
          this.callbackProcessing=true;
          this.lastEvent="OAUTH_CALLBACK_DETECTED";
        }
        this.startAuthListener();
        if(callbackInfo.hasCallback){
          const processed=await this.processOAuthCallback(callbackInfo);
          if(!processed.ok){
            this.authRestoreDuration=Date.now()-started;
            return processed;
          }
        }
        const res=await this.repository.client.auth.getSession();
        const session=res&&res.data&&res.data.session;
        if(session){
          this.applySession(callbackInfo.hasCallback&&!this.session?"OAUTH_CALLBACK":"RESTORE_SESSION",session);
        }else if(!this.session&&!this.callbackProcessing){
          this.applySession("RESTORE_SESSION",null);
        }
        this.authRestoreDuration=Date.now()-started;
        return ns.ok(this.getStatus());
      }catch(e){this.status=AUTH_STATUS.SESSION_EXPIRED;this.authRestoreDuration=Date.now()-started;return ns.err("auth_session_restore_failed",String(e&&e.message||e),true);}
    }
    startAuthListener(callback){
      if(this.repository.refreshClient)this.repository.refreshClient();
      if(!this.repository.client||!this.repository.client.auth||!this.repository.client.auth.onAuthStateChange){
        this.status=AUTH_STATUS.LOCAL_ONLY;
        return ns.err("auth_listener_unavailable","Supabase auth listener unavailable; local-only mode remains active",true);
      }
      if(this.unsubscribe){
        const unsubscribe=typeof callback==="function"?this.subscribe(callback):null;
        return ns.ok({status:"already_listening",unsubscribe});
      }
      try{
        if(typeof callback==="function")this.subscribe(callback);
        const res=this.repository.client.auth.onAuthStateChange((event,session)=>{
          if(this.callbackProcessing&&!session&&(event==="INITIAL_SESSION"||event==="SIGNED_OUT")){
            this.lastEvent=event;
            this.notifySubscribers(event);
            return;
          }
          if(event==="INITIAL_SESSION"||event==="SIGNED_IN"||event==="TOKEN_REFRESHED"||event==="USER_UPDATED"){
            this.applySession(event,session);
          }else if(event==="SIGNED_OUT"||event==="USER_DELETED"){
            this.applySession(event,null);
          }else{
            this.applySession(event,session);
          }
        });
        this.unsubscribe=res&&res.data&&res.data.subscription&&res.data.subscription.unsubscribe||res&&res.unsubscribe||null;
        this.listenerStarted=true;
        return ns.ok({status:"listening"});
      }catch(e){return ns.err("auth_listener_failed",String(e&&e.message||e),true);}
    }
    stopAuthListener(){
      try{
        if(this.unsubscribe){this.unsubscribe();this.unsubscribe=null;}
        this.listenerStarted=false;
        return ns.ok({status:"stopped"});
      }catch(e){return ns.err("auth_listener_stop_failed",String(e&&e.message||e),true);}
    }
    getRedirectTo(){
      return "https://maggie10299.github.io/pet-habit/";
    }
    cleanupStaleSupabaseAuthStorage(){
      const currentPrefix=this.repository&&this.repository.getAuthStoragePrefix?this.repository.getAuthStoragePrefix():"";
      if(!currentPrefix)return {removed:0,currentPrefix:""};
      const stores=[global.localStorage,global.sessionStorage].filter(Boolean);
      let removed=0;
      stores.forEach(store=>{
        try{
          const keys=[];
          const len=Number(store.length||0);
          if(typeof store.key==="function"){
            for(let i=0;i<len;i++){
              const k=store.key(i);
              if(k)keys.push(k);
            }
          }else if(store.map&&typeof store.map.keys==="function"){
            store.map.forEach((_,k)=>keys.push(k));
          }
          keys.forEach(key=>{
            key=String(key||"");
            if(/^sb-[a-z0-9]+-auth-token/.test(key)&&key.indexOf(currentPrefix)!==0){
              try{store.removeItem(key);removed++;}catch(e){}
            }
          });
        }catch(e){}
      });
      return {removed,currentPrefix};
    }
    async signInWithGoogle(){
      if(this.repository.refreshClient)this.repository.refreshClient();
      this.cleanupStaleSupabaseAuthStorage();
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
        this.applySession("SIGNED_OUT",null);
        this.analytics.track("google_logout",{result:"local_data_kept"});
        return ns.ok(this.getStatus());
      }catch(e){return ns.err("auth_signout_failed",String(e&&e.message||e),true);}
    }
  }
  ns.AUTH_STATUS=AUTH_STATUS;
  ns.SupabaseAuthManager=SupabaseAuthManager;
})(typeof window!=="undefined"?window:globalThis);
