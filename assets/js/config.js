// assets/js/config.js
const existing = window.PS_CONFIG || {};

window.PS_CONFIG = {
  STORAGE_KEY: 'primeSessionTrading_v4.5',

  // Cloudflare Variables/Secrets (oder kompatibles Runtime-Objekt):
  // NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_URL:
    existing.SUPABASE_URL ||
    window.__ENV__?.SUPABASE_URL ||
    window.CLOUDFLARE_ENV?.SUPABASE_URL ||
    window.__ENV__?.PUBLIC_SUPABASE_URL ||
    window.CLOUDFLARE_ENV?.PUBLIC_SUPABASE_URL ||
    window.__ENV__?.NEXT_PUBLIC_SUPABASE_URL ||
    window.CLOUDFLARE_ENV?.NEXT_PUBLIC_SUPABASE_URL ||
    '',
  SUPABASE_ANON_KEY:
    existing.SUPABASE_ANON_KEY ||
    window.__ENV__?.SUPABASE_ANON_KEY ||
    window.CLOUDFLARE_ENV?.SUPABASE_ANON_KEY ||
    window.__ENV__?.PUBLIC_SUPABASE_ANON_KEY ||
    window.CLOUDFLARE_ENV?.PUBLIC_SUPABASE_ANON_KEY ||
    window.__ENV__?.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    window.CLOUDFLARE_ENV?.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '',

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
