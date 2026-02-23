import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

window.PS = window.PS || {};

await (window.PS.configReady || Promise.resolve());

const url = window.PS_CONFIG?.SUPABASE_URL;
const key = window.PS_CONFIG?.SUPABASE_ANON_KEY;

if (!url || !key || String(url).includes('HIER_')) {
  console.warn('Supabase nicht konfiguriert (PS_CONFIG).');
  window.PS.supabase = null;
} else {
  window.PS.supabase = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

window.PS.supabaseReady = Promise.resolve(window.PS.supabase);
