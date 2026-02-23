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

<<<<<<< codex/configure-supabase-settings
  function detectEnvName(configJson) {
    const queryEnv = new URLSearchParams(window.location.search).get('ps_env') || '';
    const forced = String(queryEnv).trim();
    if (forced) {
      try { localStorage.setItem(ENV_STORAGE_KEY, forced); } catch {}
      return forced;
    }

    const stored = (() => {
      try { return localStorage.getItem(ENV_STORAGE_KEY) || ''; } catch { return ''; }
    })();
    if (stored) return stored;

    const fromConfig = String(configJson?.defaultEnvironment || '').trim();
    if (fromConfig) return fromConfig;

    const host = String(window.location.hostname || '').toLowerCase();
    if (host.includes('test') || host.includes('staging') || host.includes('dev') || host === 'localhost' || host === '127.0.0.1') {
      return 'test';
    }
    return 'production';
  }

  function applyEnvironment(configJson, target) {
    mergeRuntimeConfig(target, configJson);

    const envName = detectEnvName(configJson);
    const envMap = (configJson && typeof configJson.environments === 'object') ? configJson.environments : null;
    const envConfig = envMap ? envMap[envName] : null;

    if (envConfig) {
      mergeRuntimeConfig(target, envConfig, { overwrite: true });
    }

    target.RUNTIME_ENV = envName;
    const baseStorageKey = target.STORAGE_KEY || 'primeSessionTrading_v4.5';
    target.STORAGE_KEY = `${baseStorageKey}__${envName}`;

    window.PS = window.PS || {};
    window.PS.setRuntimeEnv = (nextEnv) => {
      const env = String(nextEnv || '').trim();
      if (!env) return;
      try { localStorage.setItem(ENV_STORAGE_KEY, env); } catch {}
      window.location.reload();
    };
  }

=======
>>>>>>> Snapshot-0001
  window.PS_CONFIG = window.PS_CONFIG || {};

  window.PS = window.PS || {};
  window.PS.configReady = (async () => {
<<<<<<< codex/configure-supabase-settings
    const runtimeJson = await loadConfigJson();
    if (runtimeJson) applyEnvironment(runtimeJson, window.PS_CONFIG);
    else {
      const envName = detectEnvName(null);
      window.PS_CONFIG.RUNTIME_ENV = envName;
      const baseStorageKey = window.PS_CONFIG.STORAGE_KEY || 'primeSessionTrading_v4.5';
      window.PS_CONFIG.STORAGE_KEY = `${baseStorageKey}__${envName}`;
    }
=======
    // Optional runtime file for cloud/static hosting.
    const runtimeJson = await loadConfigJson();
    mergeRuntimeConfig(window.PS_CONFIG, runtimeJson);
>>>>>>> Snapshot-0001
    return window.PS_CONFIG;
  })();
})();
