// assets/js/config.js
window.PS_CONFIG = {
  STORAGE_KEY: 'primeSessionTrading_v4.5',

  // Cloudflare Variables/Secrets (oder kompatibles Runtime-Objekt):
  // NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_URL:
    window.__ENV__?.NEXT_PUBLIC_SUPABASE_URL ||
    window.CLOUDFLARE_ENV?.NEXT_PUBLIC_SUPABASE_URL ||
    '',
  SUPABASE_ANON_KEY:
    window.__ENV__?.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    window.CLOUDFLARE_ENV?.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '',

  ADMIN_USERNAME:
    window.__ENV__?.ADMIN_USERNAME ||
    window.CLOUDFLARE_ENV?.ADMIN_USERNAME ||
    'admin',
  ADMIN_PASSWORD:
    window.__ENV__?.ADMIN_PASSWORD ||
    window.CLOUDFLARE_ENV?.ADMIN_PASSWORD ||
    'admin123'
};
