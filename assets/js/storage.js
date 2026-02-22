// assets/js/storage.js
(function(){
  window.PS = window.PS || {};
  const STORAGE_KEY = (window.PS_CONFIG?.STORAGE_KEY) || 'primeSessionTrading_v4.5';
  const CLOUD_TABLE = 'app_data';

  let pushTimer = null;
  let pushing = false;

  function safeParse(s){ try { return JSON.parse(s); } catch { return null; } }
  function nowIso(){ return new Date().toISOString(); }

  function defaultTpScheme(){
    return { tpCount: 4, tpPercents: [30,25,20,15], runnerPercent: 10 };
  }
  function defaultSettings(){
    return {
      theme: 'dark',
      defaultTimeframe: '30m',
      defaultLeverage: 10,
      defaultOrders: 5,
      defaultRiskPercent: 0.50,
      defaultScaleMode: 'flat',
      showChartLink: true,
      tpScheme: defaultTpScheme()
    };
  }
  function mkProfile(isAdmin=false, email=''){
    return {
      flag: !!isAdmin,
      active: true,
      email: email || '',
      settings: defaultSettings(),
      calculatorTrades: [],
      journalTrades: [],
      tickets: [],
      stats: {},
      lastLoginAt: '',
      lastSeenAt: ''
    };
  }

  function baseData(){
    return {
      version: '4.5',
      currentUser: 'guest',
      impersonateUser: null,
      ui: {},
      profiles: { guest: mkProfile(false,'') },
      _meta: { updatedAt: nowIso(), cloudSyncedAt: '' }
    };
  }

  function touch(data){
    data._meta = data._meta || {};
    data._meta.updatedAt = nowIso();
    return data;
  }

  function load(){
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? safeParse(raw) : null;
    const data = parsed || baseData();

    data.profiles = data.profiles || {};
    data.profiles.guest = data.profiles.guest || mkProfile(false,'');

    // ensure current profile exists
    if(data.currentUser && data.currentUser !== 'guest'){
      data.profiles[data.currentUser] = data.profiles[data.currentUser] || mkProfile(false,'');
    }

    // normalize
    for(const [u, prof] of Object.entries(data.profiles)){
      prof.settings = prof.settings || defaultSettings();
      prof.settings.tpScheme = prof.settings.tpScheme || defaultTpScheme();
      prof.calculatorTrades = prof.calculatorTrades || [];
      prof.journalTrades = prof.journalTrades || [];
      prof.tickets = prof.tickets || [];
      prof.stats = prof.stats || {};
      if(prof.active === undefined) prof.active = true;
      if(prof.flag === undefined) prof.flag = false;
    }

    if(!parsed) save(data, { cloud:false });
    return data;
  }

  function sanitizeForCloud(data){
    // pro Supabase-Account speichern wir nur guest + currentUser
    const u = data.currentUser || 'guest';
    const out = JSON.parse(JSON.stringify(data));
    out.profiles = out.profiles || {};
    const keep = {};
    keep.guest = out.profiles.guest || mkProfile(false,'');
    if(u !== 'guest'){
      keep[u] = out.profiles[u] || mkProfile(false,'');
    }
    out.profiles = keep;
    return out;
  }

  function save(data, { cloud=true } = {}){
    touch(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if(cloud) scheduleCloudPush(data);
  }

  async function getSupabase(){
    await (window.PS.supabaseReady || Promise.resolve());
    return window.PS.supabase || null;
  }
  async function getUser(){
    const supabase = await getSupabase();
    if(!supabase) return null;
    const { data, error } = await supabase.auth.getUser();
    if(error) return null;
    return data?.user || null;
  }

  async function cloudFetch(userId){
    const supabase = await getSupabase();
    if(!supabase) return null;

    const { data, error } = await supabase
      .from(CLOUD_TABLE)
      .select('data, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if(error) return null;
    return data || null;
  }

  async function cloudUpsert(userId, data){
    const supabase = await getSupabase();
    if(!supabase) return;

    const payload = sanitizeForCloud(data);

    await supabase
      .from(CLOUD_TABLE)
      .upsert({ user_id: userId, data: payload, updated_at: nowIso() }, { onConflict: 'user_id' });
  }

  function scheduleCloudPush(data){
    clearTimeout(pushTimer);
    pushTimer = setTimeout(()=> cloudPushNow(data), 800);
  }

  async function cloudPushNow(data){
    if(pushing) return;
    pushing = true;
    try{
      const user = await getUser();
      if(!user) return;
      await cloudUpsert(user.id, data);

      data._meta = data._meta || {};
      data._meta.cloudSyncedAt = nowIso();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } finally {
      pushing = false;
    }
  }

  async function cloudSyncAfterAuth({ username, email }){
    const user = await getUser();
    if(!user) return;

    let local = load();

    const u = username || (user.email ? user.email.split('@')[0] : 'user');
    local.currentUser = u;
    local.profiles = local.profiles || {};
    local.profiles[u] = local.profiles[u] || mkProfile(false, email || user.email || '');
    local.profiles[u].email = email || user.email || local.profiles[u].email || '';

    const remote = await cloudFetch(user.id);

    const localUpdated = Date.parse(local?._meta?.updatedAt || '') || 0;
    const remoteUpdated = remote?.updated_at ? Date.parse(remote.updated_at) : 0;

    if(remote && remote.data && remoteUpdated >= localUpdated){
      // remote wins
      local = remote.data;

      // ensure profile exists
      local.currentUser = u;
      local.profiles = local.profiles || {};
      local.profiles.guest = local.profiles.guest || mkProfile(false,'');
      local.profiles[u] = local.profiles[u] || mkProfile(false, email || user.email || '');
      local.profiles[u].email = email || user.email || local.profiles[u].email || '';

      touch(local);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
    } else {
      // local wins -> push
      touch(local);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
      await cloudUpsert(user.id, local);
    }
  }

  // JSON Backup (download)
  function exportJSON(){
    const data = load();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `PrimeSessionTrading-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importJSONFile(file){
    const text = await file.text();
    const obj = safeParse(text);
    if(!obj) throw new Error('Ungültige JSON Datei.');
    save(obj, { cloud:true });
  }

  PS.storage = {
    STORAGE_KEY,
    load,
    save,

    mkProfile: (hashIgnored, isAdmin=false, email='') => mkProfile(isAdmin,email), // compatibility
    defaultSettings,
    defaultTpScheme,

    cloudSyncAfterAuth,
    cloudPushNow,

    exportJSON,
    importJSONFile
  };
})();