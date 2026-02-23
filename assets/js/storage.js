// assets/js/storage.js (KOMPLETT ERSETZEN)
(function(){
  window.PS = window.PS || {};
  const STORAGE_KEY = (window.PS_CONFIG?.STORAGE_KEY) || 'primeSessionTrading_v4.5';
  const CLOUD_TABLE = 'app_data';
  const ADMIN_GLOBAL_SOURCE = 'supabase.app_data';

  let pushTimer = null;
  let pushing = false;

  // Live sync
  let liveStarted = false;
  let liveTimer = null;
  const LIVE_INTERVAL_MS = 8000; // alle 8s check (schnell genug, aber nicht nervös)
  const EPS_MS = 1200;           // kleine Zeit-Toleranz gegen “timestamp jitter”

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
      _meta: {
        updatedAt: nowIso(),
        cloudSyncedAt: '',
        cloudPulledAt: '',
        adminDataModel: 'global-cloud',
        migrationNote: 'Lokale profiles-Snapshots sind per-user und keine vollständige Admin-Basis.'
      }
    };
  }

  function touch(data){
    data._meta = data._meta || {};
    data._meta.updatedAt = nowIso();
    return data;
  }

  function setMetaPulled(data, remoteUpdatedIso){
    data._meta = data._meta || {};
    data._meta.updatedAt = remoteUpdatedIso || data._meta.updatedAt || nowIso();
    data._meta.cloudSyncedAt = remoteUpdatedIso || data._meta.cloudSyncedAt || '';
    data._meta.cloudPulledAt = nowIso();
  }

  function hasMeaningfulData(data, username){
    try{
      const u = username || data.currentUser || 'guest';
      const prof = data?.profiles?.[u];
      if(!prof) return false;
      const c = (prof.calculatorTrades?.length||0);
      const j = (prof.journalTrades?.length||0);
      const t = (prof.tickets?.length||0);
      return (c + j + t) > 0;
    } catch { return false; }
  }

  function isFreshEmptyLocal(data){
    const synced = String(data?._meta?.cloudSyncedAt || '').trim();
    if(synced) return false;
    return !hasMeaningfulData(data, data.currentUser);
  }

  function backupLocal(tag){
    try{
      const snap = localStorage.getItem(STORAGE_KEY);
      if(!snap) return;
      const k = `${STORAGE_KEY}__backup__${new Date().toISOString().replaceAll(':','-')}__${tag||'auto'}`;
      localStorage.setItem(k, snap);
    } catch {}
  }

  function load(){
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? safeParse(raw) : null;
    const data = parsed || baseData();

    data.profiles = data.profiles || {};
    data.profiles.guest = data.profiles.guest || mkProfile(false,'');

    if(data.currentUser && data.currentUser !== 'guest'){
      data.profiles[data.currentUser] = data.profiles[data.currentUser] || mkProfile(false,'');
    }

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
    // WICHTIG: Cloud-Sync bleibt strikt per User.
    // Diese Nutzlast darf NIE als globale Admin-Quelle interpretiert werden,
    // da hier absichtlich nur `guest` + der aktuelle User verbleiben.
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

  function normalizeAdminCloudRows(rows){
    const users = [];

    for(const row of (rows||[])){
      const rowData = row?.data;
      if(!rowData || typeof rowData !== 'object') continue;

      const profiles = rowData.profiles || {};
      const currentUser = String(rowData.currentUser || '').trim();

      const seen = new Set();
      const pushUser = (username, profile) => {
        const u = String(username || '').trim();
        if(!u || u==='guest' || seen.has(u)) return;
        seen.add(u);
        users.push({
          user: u,
          userId: row.user_id,
          updatedAt: row.updated_at || '',
          profile: JSON.parse(JSON.stringify(profile || mkProfile(false,'')))
        });
      };

      if(currentUser && profiles[currentUser]){
        pushUser(currentUser, profiles[currentUser]);
      }

      for(const [u, p] of Object.entries(profiles)){
        pushUser(u, p);
      }
    }

    return users;
  }

  async function getAdminGlobalSnapshot(){
    const supabase = await getSupabase();
    const user = await getUser();
    if(!supabase || !user){
      return {
        ok: false,
        source: ADMIN_GLOBAL_SOURCE,
        reason: 'auth_or_supabase_missing',
        message: 'Globale Admin-Daten sind nicht verfügbar (kein Supabase/Auth-Kontext).',
        users: []
      };
    }

    const { data: rows, error } = await supabase
      .from(CLOUD_TABLE)
      .select('user_id, data, updated_at')
      .order('updated_at', { ascending:false });

    if(error){
      return {
        ok: false,
        source: ADMIN_GLOBAL_SOURCE,
        reason: 'backend_query_failed',
        message: `Globale Admin-Daten konnten nicht geladen werden: ${error.message || 'Backend-Query fehlgeschlagen.'}`,
        users: []
      };
    }

    const users = normalizeAdminCloudRows(rows);
    return {
      ok: true,
      source: ADMIN_GLOBAL_SOURCE,
      warning: users.length
        ? ''
        : 'Keine globalen Cloud-Daten gefunden. Lokale Alt-Daten werden absichtlich nicht als vollständige Nutzerbasis verwendet.',
      users
    };
  }

  async function saveAdminUserProfile({ userId, username, profile }){
    const supabase = await getSupabase();
    if(!supabase) throw new Error('Supabase nicht verfügbar.');
    if(!userId) throw new Error('userId fehlt.');
    if(!username) throw new Error('username fehlt.');

    const { data: row, error } = await supabase
      .from(CLOUD_TABLE)
      .select('data')
      .eq('user_id', userId)
      .maybeSingle();

    if(error) throw error;

    const base = (row?.data && typeof row.data === 'object') ? row.data : baseData();
    base.currentUser = username;
    base.profiles = base.profiles || {};
    base.profiles.guest = base.profiles.guest || mkProfile(false,'');
    base.profiles[username] = JSON.parse(JSON.stringify(profile || mkProfile(false,'')));
    touch(base);

    const { error: upErr } = await supabase
      .from(CLOUD_TABLE)
      .upsert({ user_id: userId, data: base, updated_at: nowIso() }, { onConflict: 'user_id' });

    if(upErr) throw upErr;
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

  // Debug: Pull erzwingen
  async function cloudPullNow(){
    const user = await getUser();
    if(!user) return null;
    const remote = await cloudFetch(user.id);
    if(remote?.data){
      backupLocal('before_pull');
      const d = remote.data;
      setMetaPulled(d, remote.updated_at);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
      return d;
    }
    return null;
  }

  // Nach Login: remote darf nicht durch “frisches leeres local” überschrieben werden
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
    const localSynced  = Date.parse(local?._meta?.cloudSyncedAt || '') || 0;
    const remoteUpdated = remote?.updated_at ? Date.parse(remote.updated_at) : 0;
    const remoteHas = !!(remote?.data && hasMeaningfulData(remote.data, u));
    const localFreshEmpty = isFreshEmptyLocal(local);

    if(remote?.data && remoteHas && localFreshEmpty){
      backupLocal('fresh_empty_local_remote_wins');
      local = remote.data;

      local.currentUser = u;
      local.profiles = local.profiles || {};
      local.profiles.guest = local.profiles.guest || mkProfile(false,'');
      local.profiles[u] = local.profiles[u] || mkProfile(false, email || user.email || '');
      local.profiles[u].email = email || user.email || local.profiles[u].email || '';

      setMetaPulled(local, remote.updated_at);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
      return;
    }

    if(remote?.data && remoteUpdated >= localUpdated){
      backupLocal('remote_wins');
      local = remote.data;

      local.currentUser = u;
      local.profiles = local.profiles || {};
      local.profiles.guest = local.profiles.guest || mkProfile(false,'');
      local.profiles[u] = local.profiles[u] || mkProfile(false, email || user.email || '');
      local.profiles[u].email = email || user.email || local.profiles[u].email || '';

      setMetaPulled(local, remote.updated_at);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
      return;
    }

    // local wins -> push
    touch(local);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
    await cloudUpsert(user.id, local);

    local._meta = local._meta || {};
    local._meta.cloudSyncedAt = nowIso();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
  }

  // ✅ LIVE SYNC: wenn Cloud neuer ist → Pull, wenn Local unsynced → Push
  async function cloudReconcileNow(){
    const user = await getUser();
    if(!user) return;

    const remote = await cloudFetch(user.id);
    if(!remote) return;

    const remoteUpdated = remote.updated_at ? Date.parse(remote.updated_at) : 0;
    const remoteData = remote.data;

    const local = load();
    const localUpdated = Date.parse(local?._meta?.updatedAt || '') || 0;
    const localSynced  = Date.parse(local?._meta?.cloudSyncedAt || '') || 0;

    // 1) Wenn local Änderungen hat, die noch nicht hochgeladen wurden -> push
    if(localUpdated > localSynced + EPS_MS){
      await cloudPushNow(local);
      return;
    }

    // 2) Wenn remote neuer ist -> pull
    if(remoteData && remoteUpdated > localUpdated + EPS_MS){
      backupLocal('live_pull');
      const d = remoteData;
      setMetaPulled(d, remote.updated_at);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
      return;
    }
  }

  function startCloudLiveSync(){
    if(liveStarted) return;
    liveStarted = true;

    // Interval Poll
    liveTimer = setInterval(()=> { cloudReconcileNow().catch(()=>{}); }, LIVE_INTERVAL_MS);

    // Pull sobald Tab wieder aktiv ist (damit “normal” sofort die Inkognito-Änderung bekommt)
    window.addEventListener('focus', ()=> { cloudReconcileNow().catch(()=>{}); });
    document.addEventListener('visibilitychange', ()=> {
      if(document.visibilityState === 'visible'){
        cloudReconcileNow().catch(()=>{});
      }
    });
  }

  // Auto-start (auf allen Seiten), schadet nicht wenn nicht eingeloggt
  setTimeout(()=> startCloudLiveSync(), 1200);


  function getProfile(data, user){
    return data?.profiles?.[user] || null;
  }

  function setImpersonate(data, userOrNull){
    data.impersonateUser = userOrNull || null;
    return true;
  }

  function deleteUser(data, username){
    if(!username || username==='admin' || username==='guest') return false;
    if(!data?.profiles?.[username]) return false;
    delete data.profiles[username];
    save(data);
    return true;
  }

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
    getProfile,
    setImpersonate,
    deleteUser,
    defaultSettings,
    defaultTpScheme,

    cloudSyncAfterAuth,
    cloudPushNow,
    cloudPullNow,
    cloudReconcileNow,
    startCloudLiveSync,

    exportJSON,
    importJSONFile
    ,getAdminGlobalSnapshot
    ,saveAdminUserProfile
  };
})();
