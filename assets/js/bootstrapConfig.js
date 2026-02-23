// assets/js/bootstrapConfig.js
(function () {
  const KEY_ALIASES = {
    SUPABASE_URL: [
      'SUPABASE_URL',
      'PS_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'VITE_SUPABASE_URL'
    ],
    SUPABASE_ANON_KEY: [
      'SUPABASE_ANON_KEY',
      'PS_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'VITE_SUPABASE_ANON_KEY'
    ],
    ADMIN_USERNAME: ['ADMIN_USERNAME'],
    ADMIN_EMAIL: ['ADMIN_EMAIL']
  };

  function pickValue(obj, keys) {
    if (!obj) return '';
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
    return '';
  }

  function mergeRuntimeConfig(target, source) {
    if (!source || typeof source !== 'object') return;
    for (const [targetKey, aliases] of Object.entries(KEY_ALIASES)) {
      const value = pickValue(source, aliases);
      if (value && !target[targetKey]) target[targetKey] = value;
    }
  }

  async function loadConfigJson() {
    try {
      const res = await fetch('./config.json', { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  window.PS_CONFIG = window.PS_CONFIG || {};

  window.PS = window.PS || {};
  window.PS.configReady = (async () => {
    // Optional runtime file for cloud/static hosting.
    const runtimeJson = await loadConfigJson();
    mergeRuntimeConfig(window.PS_CONFIG, runtimeJson);
    return window.PS_CONFIG;
  })();
})();
