// assets/js/config.js
const existing = window.PS_CONFIG || {};

const env = window.__ENV__ || {};
const cfEnv = window.CLOUDFLARE_ENV || {};

function fromFirst(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

window.PS_CONFIG = {
  STORAGE_KEY: 'primeSessionTrading_v4.5',

  // Cloudflare Variables/Secrets (oder kompatibles Runtime-Objekt):
  // NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_URL:
    fromFirst(
      existing.SUPABASE_URL,
      existing.PS_SUPABASE_URL,
      window.PS_SUPABASE_URL,
      window.SUPABASE_URL,
      window.NEXT_PUBLIC_SUPABASE_URL,
      window.VITE_SUPABASE_URL,
      env.PS_SUPABASE_URL,
      cfEnv.PS_SUPABASE_URL,
      env.SUPABASE_URL,
      cfEnv.SUPABASE_URL,
      env.PUBLIC_SUPABASE_URL,
      cfEnv.PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_URL,
      cfEnv.NEXT_PUBLIC_SUPABASE_URL,
      env.VITE_SUPABASE_URL,
      cfEnv.VITE_SUPABASE_URL
    ),
  SUPABASE_ANON_KEY:
    fromFirst(
      existing.SUPABASE_ANON_KEY,
      existing.PS_SUPABASE_ANON_KEY,
      window.PS_SUPABASE_ANON_KEY,
      window.SUPABASE_ANON_KEY,
      window.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      window.VITE_SUPABASE_ANON_KEY,
      env.PS_SUPABASE_ANON_KEY,
      cfEnv.PS_SUPABASE_ANON_KEY,
      env.SUPABASE_ANON_KEY,
      cfEnv.SUPABASE_ANON_KEY,
      env.PUBLIC_SUPABASE_ANON_KEY,
      cfEnv.PUBLIC_SUPABASE_ANON_KEY,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      cfEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      env.VITE_SUPABASE_ANON_KEY,
      cfEnv.VITE_SUPABASE_ANON_KEY
    ),

  ADMIN_USERNAME:
    existing.ADMIN_USERNAME ||
    window.__ENV__?.ADMIN_USERNAME ||
    window.CLOUDFLARE_ENV?.ADMIN_USERNAME ||
    'admin',
  ADMIN_EMAIL:
    existing.ADMIN_EMAIL ||
    window.__ENV__?.ADMIN_EMAIL ||
    window.CLOUDFLARE_ENV?.ADMIN_EMAIL ||
    'codinglobe@gmail.com'
};
