// assets/js/storage.js (KOMPLETT ERSETZEN)
window.PS = window.PS || {};
PS.storage = PS.storage || {};

PS.storage.KEY_CANDIDATES = [
  'primeSessionTrading_v4.5',
  'primeSessionTrading_v4.4',
  'primeSessionTrading_v4.3',
  'primeSessionTrading_v2.0',
  'primeSessionTrading_v2'
];

PS.storage.KEY = null;

PS.storage.defaultTpScheme = function(){
  return { tpCount: 4, tpPercents: [30,25,20,15], runnerPercent: 10 };
};

PS.storage.mkProfile = function(hash, isAdmin=false, email=''){
  return {
    hash,
    flag: !!isAdmin,
    active: true,
    email: email || '',
    settings: {
      // ✅ neu, aber kompatibel
      theme: 'dark',

      defaultTimeframe: '30m',
      defaultRiskPercent: 0.50,
      defaultLeverage: 10,
      defaultOrders: 5,
      defaultScaleMode: 'flat',
      defaultSingleEntry: false,
      showChartLink: false,
      tpScheme: PS.storage.defaultTpScheme()
    },
    calculatorTrades: [],
    journalTrades: [],
    tickets: [],
    stats: { pnlGross:0, pnlNet:0, fees:0, trades:0, closed:0, wins:0, losses:0 },

    // optional (für online)
    lastLoginAt: '',
    lastSeenAt: '',
    lastSeen: ''
  };
};

PS.storage.save = function(data){
  localStorage.setItem(PS.storage.KEY, JSON.stringify(data));
};

PS.storage.exportJson = function(obj, filename){
  const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
};

PS.storage.migrate = function(data){
  data.version = data.version || 'X';
  data.currentUser = data.currentUser || 'guest';
  if(typeof data.impersonateUser === 'undefined') data.impersonateUser = null;

  data.ui = data.ui || {};
  if(!data.ui.theme) data.ui.theme = 'dark';           // fallback (z.B. Login-Seite)
  if(typeof data.ui.impersonationEdit !== 'boolean') data.ui.impersonationEdit = false;
  if(!data.ui.sessionId) data.ui.sessionId = '';

  data.profiles = data.profiles || {};

  for(const [u,p] of Object.entries(data.profiles)){
    if(!p) continue;

    if(typeof p.active !== 'boolean') p.active = true;
    if(typeof p.flag !== 'boolean') p.flag = false;
    if(typeof p.email !== 'string') p.email = '';

    p.settings = p.settings || {};

    // ✅ Theme pro User (fallback auf globales ui.theme)
    if(!p.settings.theme) p.settings.theme = (data.ui.theme === 'light') ? 'light' : 'dark';

    if(!p.settings.defaultTimeframe) p.settings.defaultTimeframe = '30m';
    if(typeof p.settings.defaultRiskPercent !== 'number') p.settings.defaultRiskPercent = 0.50;
    if(typeof p.settings.defaultLeverage !== 'number') p.settings.defaultLeverage = 10;
    if(typeof p.settings.defaultOrders !== 'number') p.settings.defaultOrders = 5;
    if(!p.settings.defaultScaleMode) p.settings.defaultScaleMode = 'flat';
    if(typeof p.settings.defaultSingleEntry !== 'boolean') p.settings.defaultSingleEntry = false;

    if(typeof p.settings.showChartLink !== 'boolean') p.settings.showChartLink = false;
    if(!p.settings.tpScheme) p.settings.tpScheme = PS.storage.defaultTpScheme();

    if(!Array.isArray(p.calculatorTrades)) p.calculatorTrades = [];
    if(!Array.isArray(p.journalTrades)) p.journalTrades = [];
    if(!Array.isArray(p.tickets)) p.tickets = [];

    // Tickets normalisieren
    p.tickets = p.tickets.map(tk=>{
      if(typeof tk === 'string'){
        const now = new Date().toISOString();
        return { id:'tk_'+Date.now(), title:tk, type:'wish', status:'open', createdAt:now, updatedAt:now, messages:[] };
      }
      tk.type = tk.type || 'wish';
      tk.status = tk.status || 'open';
      tk.createdAt = tk.createdAt || new Date().toISOString();
      tk.updatedAt = tk.updatedAt || tk.createdAt;
      tk.messages = Array.isArray(tk.messages) ? tk.messages : [];
      tk.messages = tk.messages.map(m=>{
        m.id = m.id || ('m_'+Date.now()+'_'+Math.random().toString(16).slice(2));
        m.from = m.from || 'user';
        m.text = m.text || '';
        m.createdAt = m.createdAt || tk.createdAt;
        m.attachments = Array.isArray(m.attachments) ? m.attachments : [];
        return m;
      });
      return tk;
    });

    if(typeof p.lastLoginAt !== 'string') p.lastLoginAt = '';
    if(typeof p.lastSeenAt !== 'string') p.lastSeenAt = '';
    if(typeof p.lastSeen !== 'string') p.lastSeen = '';
  }

  if(!data.profiles.guest) data.profiles.guest = PS.storage.mkProfile(null,false,'');

  // ✅ Admin sicherstellen (und NIE inaktiv, NIE light)
  const adminHash = PS.utils.sha256('admin123');
  if(!data.profiles.admin){
    data.profiles.admin = PS.storage.mkProfile(adminHash, true, 'codinglobe@gmail.com');
  }
  data.profiles.admin.flag = true;
  data.profiles.admin.active = true;
  if(!data.profiles.admin.hash) data.profiles.admin.hash = adminHash;
  if(!data.profiles.admin.email) data.profiles.admin.email = 'codinglobe@gmail.com';
  data.profiles.admin.settings = data.profiles.admin.settings || {};
  data.profiles.admin.settings.theme = 'dark';
};

PS.storage._detectKey = function(){
  for(const k of PS.storage.KEY_CANDIDATES){
    if(localStorage.getItem(k)) return k;
  }
  return PS.storage.KEY_CANDIDATES[0];
};

PS.storage.load = function(){
  PS.storage.KEY = PS.storage._detectKey();
  const raw = localStorage.getItem(PS.storage.KEY);
  if(raw){
    try{
      const data = JSON.parse(raw);
      PS.storage.migrate(data);

      // ✅ hard enforce on load (falls alt kaputt gespeichert)
      if(data?.profiles?.admin){
        data.profiles.admin.flag = true;
        data.profiles.admin.active = true;
        data.profiles.admin.settings = data.profiles.admin.settings || {};
        data.profiles.admin.settings.theme = 'dark';
      }

      PS.storage.save(data);
      return data;
    }catch{}
  }

  const adminHash = PS.utils.sha256('admin123');
  const data = {
    version:'X',
    currentUser:'guest',
    impersonateUser:null,
    ui:{ theme:'dark', impersonationEdit:false, sessionId:'' },
    profiles:{
      guest: PS.storage.mkProfile(null,false,''),
      admin: { ...PS.storage.mkProfile(adminHash,true,'codinglobe@gmail.com'), flag:true, active:true }
    }
  };
  data.profiles.admin.settings.theme = 'dark';
  PS.storage.save(data);
  return data;
};

PS.storage.getProfile = (data, user)=> data?.profiles?.[user] || null;

// ----------------------------
// ✅ Backward compatible APIs (damit Login/Profile/Altcode nicht bricht)
// ----------------------------

// Altcode setzt oft nur global theme:
PS.storage.setTheme = function(data, theme){
  data.ui = data.ui || {};
  data.ui.theme = (theme === 'light') ? 'light' : 'dark';

  // wenn eingeloggt, auch im User-Profil speichern (pro User)
  const u = data.currentUser || 'guest';
  if(u !== 'guest' && data.profiles?.[u]){
    if(u === 'admin'){
      data.profiles.admin.settings = data.profiles.admin.settings || {};
      data.profiles.admin.settings.theme = 'dark';
      data.ui.theme = 'dark';
    }else{
      data.profiles[u].settings = data.profiles[u].settings || {};
      data.profiles[u].settings.theme = data.ui.theme;
    }
  }

  PS.storage.save(data);
};

// neuer Helper: explizit pro User
PS.storage.setThemeForUser = function(data, username, theme){
  if(!data?.profiles?.[username]) return false;
  if(username === 'admin') theme = 'dark';

  data.profiles[username].settings = data.profiles[username].settings || {};
  data.profiles[username].settings.theme = (theme === 'light') ? 'light' : 'dark';

  // global fallback für Login-Seite aktualisieren
  data.ui = data.ui || {};
  data.ui.theme = data.profiles[username].settings.theme;

  PS.storage.save(data);
  return true;
};

PS.storage.setImpersonate = function(data, userOrNull){
  data.impersonateUser = userOrNull || null;
  PS.storage.save(data);
};

PS.storage.deleteUser = function(data, username){
  if(username==='admin' || username==='guest') return false;
  delete data.profiles[username];
  if(data.currentUser === username) data.currentUser = 'guest';
  if(data.impersonateUser === username) data.impersonateUser = null;
  PS.storage.save(data);
  return true;
};