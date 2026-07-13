(function(global){
  const ns=global.PetHabitPlatform=global.PetHabitPlatform||{};
  const meta=(typeof document!=="undefined"&&document.querySelector('meta[name="pet-habit-env"]'))||null;
  const rawEnv=(global.APP_ENV||(meta&&meta.getAttribute("content"))||"local").replace(/^development$/,"local");
  const env=["local","staging","production"].indexOf(rawEnv)>=0?rawEnv:"local";
  ns.Environment={
    appEnv:env,
    developerMode:/[?&]dev=1\b/.test((global.location&&global.location.search)||""),
    appVersion:global.APP_VERSION||global.VERSION||"v1.1-platform-foundation-dev",
    buildId:global.APP_BUILD_ID||"local-dev",
    supabaseUrl:global.SUPABASE_URL||"",
    supabasePublishableKey:global.SUPABASE_PUBLISHABLE_KEY||global.SUPABASE_ANON_KEY||"",
    analyticsEndpoint:global.MAGGIE_ANALYTICS_ENDPOINT||"",
    googleWebClientId:global.GOOGLE_CLIENT_ID||"1062294435800-gq20r09217187ja98c1liqctsqvq5gal.apps.googleusercontent.com",
    redirectAllowlist:[
      "https://maggie10299.github.io/pet-habit/",
      "http://localhost:5173/pet-habit/",
      "http://127.0.0.1:5173/pet-habit/"
    ]
  };
})(typeof window!=="undefined"?window:globalThis);
