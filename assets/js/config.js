// assets/js/config.js
(function(){
  const existing = window.PS_CONFIG || {};
  const envA = window.__ENV__ || {};
  const envB = window.CLOUDFLARE_ENV || {};
  const envC = window.ENV || {};

  const readLocal = (k) => {
    try { return localStorage.getItem(k) || ''; } catch { return ''; }
  };

  const first = (...vals) => {
    for(const v of vals){
      const s = String(v || '').trim();
      if(s) return s;
    }
    return '';
  };

  window.PS_CONFIG = {
    STORAGE_KEY: first(existing.STORAGE_KEY, 'primeSessionTrading_v4.5'),

    // Unterstützte URL/Key-Varianten inkl. Staging/Prod-Deployments.
    SUPABASE_URL: first(
      existing.SUPABASE_URL,
      envA.SUPABASE_URL,
      envB.SUPABASE_URL,
      envC.SUPABASE_URL,
      envA.SUPABASE_PROJECT_URL,
      envB.SUPABASE_PROJECT_URL,
      envA.PUBLIC_SUPABASE_URL,
      envB.PUBLIC_SUPABASE_URL,
      envA.NEXT_PUBLIC_SUPABASE_URL,
      envB.NEXT_PUBLIC_SUPABASE_URL,
      envA.VITE_SUPABASE_URL,
      envB.VITE_SUPABASE_URL,
      readLocal('PS_SUPABASE_URL')
    ),

    SUPABASE_ANON_KEY: first(
      existing.SUPABASE_ANON_KEY,
      envA.SUPABASE_ANON_KEY,
      envB.SUPABASE_ANON_KEY,
      envC.SUPABASE_ANON_KEY,
      envA.SUPABASE_KEY,
      envB.SUPABASE_KEY,
      envA.SUPABASE_PUBLISHABLE_KEY,
      envB.SUPABASE_PUBLISHABLE_KEY,
      envA.PUBLIC_SUPABASE_ANON_KEY,
      envB.PUBLIC_SUPABASE_ANON_KEY,
      envA.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      envB.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      envA.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      envB.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      envA.VITE_SUPABASE_ANON_KEY,
      envB.VITE_SUPABASE_ANON_KEY,
      readLocal('PS_SUPABASE_ANON_KEY')
    ),

    ADMIN_USERNAME: first(
      existing.ADMIN_USERNAME,
      envA.ADMIN_USERNAME,
      envB.ADMIN_USERNAME,
      envC.ADMIN_USERNAME,
      'admin'
    ),

    ADMIN_EMAIL: first(
      existing.ADMIN_EMAIL,
      envA.ADMIN_EMAIL,
      envB.ADMIN_EMAIL,
      envC.ADMIN_EMAIL,
      'codinglobe@gmail.com'
    )
  };
})();
