// assets/js/common.js (KOMPLETT ERSETZEN)
window.PS = window.PS || {};
PS.common = PS.common || {};

PS.common.precision = PS.common.precision || {
  'ADAUSDT': {price:4, qty:0},
  'BNBUSDT': {price:2, qty:2},
  'BTCUSDT': {price:1, qty:3},
  'ETHUSDT': {price:2, qty:3},
  'SOLUSDT': {price:2, qty:2},
  'XAGUSDT': {price:2, qty:3},
  'XAUUSDT': {price:2, qty:3},
  'XRPUSDT': {price:4, qty:1}
};

PS.common.esc = PS.common.esc || ((s)=> String(s ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c])));

PS.common.isPureAdmin = function(ctx){
  return !!ctx?.isAdmin && ctx.currentUser === 'admin' && !ctx.data?.impersonateUser;
};

PS.common.applyImpressum = function(){
  const txt = 'PrimeSession Trading (coded with love by Codinglobe) • Kontakt: codinglobe@gmail.com';
  document.querySelectorAll('.page-footer .impressum-text').forEach(el => el.textContent = txt);
};

// ✅ Backward compatible: existiert weiterhin
PS.common.applyTheme = function(data){
  try{
    const currentUser = data?.currentUser || 'guest';
    const curProf = data?.profiles?.[currentUser];
    const isAdmin = !!curProf?.flag;

    const impUser = (isAdmin && data?.impersonateUser) ? data.impersonateUser : null;
    const effUser = impUser || currentUser;
    const effProf = data?.profiles?.[effUser];

    // Admin (reiner Admin-Modus) immer dark
    let theme = 'dark';
    if(!(isAdmin && currentUser==='admin' && !impUser)){
      theme = effProf?.settings?.theme || data?.ui?.theme || 'dark';
    }
    document.documentElement.dataset.theme = (theme === 'light') ? 'light' : 'dark';
  }catch{
    document.documentElement.dataset.theme = 'dark';
  }
};

PS.common.applyThemeValue = function(theme){
  document.documentElement.dataset.theme = (theme === 'light') ? 'light' : 'dark';
};

// ✅ ab jetzt immer CH-komma (kopierbar)
PS.common.fmtUSDT8 = function(n){
  const x = Number(n||0);
  return `${PS.utils.formatCHNumber(x, 8)} USDT`;
};

PS.common.dirHtml = function(dir){
  const d = String(dir||'').toUpperCase();
  if(d==='LONG') return `<span class="dir long">LONG</span>`;
  if(d==='SHORT') return `<span class="dir short">SHORT</span>`;
  return PS.common.esc(d);
};

PS.common.computeUserStats = function(profile){
  const trades = profile?.journalTrades || [];
  let pnlGross=0, fees=0, closed=0, wins=0, losses=0;
  for(const t of trades){
    pnlGross += Number(t.realizedPnlGross||0);
    fees += Number(t.fees||0);
    if((t.status||'').startsWith('closed')){
      closed++;
      if(Number(t.realizedPnlNet||0)>0) wins++;
      if(Number(t.realizedPnlNet||0)<0) losses++;
    }
  }
  const pnlNet = pnlGross - fees;
  profile.stats = { pnlGross, pnlNet, fees, trades: trades.length, closed, wins, losses };
};

// ---------- Impersonation readonly (kompatibel) ----------
PS.common._impObs = null;

PS.common.setImpersonationReadonly = function(lock){
  const allowBtn = (btn)=>{
    const id = btn.id || '';
    if(id==='logoutBtn' || id==='impStopBtn' || id==='impEditBtn') return true;
    if(btn.classList.contains('filter-btn')) return true;
    if(btn.hasAttribute('data-open')) return true;
    if(btn.getAttribute('data-readonly-allow') === '1') return true;
    return false;
  };

  const apply = ()=>{
    document.querySelectorAll('input, textarea, select').forEach(el=>{ el.disabled = !!lock; });
    document.querySelectorAll('button').forEach(btn=>{ btn.disabled = !!lock && !allowBtn(btn); });
  };

  apply();

  if(lock){
    if(!PS.common._impObs){
      PS.common._impObs = new MutationObserver(()=>apply());
      PS.common._impObs.observe(document.body, {childList:true, subtree:true});
    }
  }else{
    if(PS.common._impObs){
      PS.common._impObs.disconnect();
      PS.common._impObs = null;
    }
  }
};

// ---------- Online heartbeat (optional, nicht breaking) ----------
function setSeen(profile){
  if(!profile) return;
  const nowIso = new Date().toISOString();
  profile.lastSeenAt = nowIso;
  profile.lastSeen = nowIso;
}

function heartbeat(ctx){
  if(!ctx || ctx.currentUser==='guest') return;
  const tick = ()=>{
    const data = ctx.data;
    const curUser = ctx.currentUser;
    const effUser = ctx.effectiveUser;

    setSeen(data?.profiles?.[curUser]);
    if(effUser && effUser !== curUser) setSeen(data?.profiles?.[effUser]);

    PS.storage.save(data);
  };
  tick();
  setInterval(tick, 60_000);
}

PS.common.init = function(){
  const data = PS.storage.load();

  // ✅ global numeric formatter (dot->comma + blur-format + initial normalize)
  PS.utils.installNumericInputFormatter();

  // Theme + footer
  PS.common.applyTheme(data);
  PS.common.applyImpressum();

  const currentUser = data.currentUser || 'guest';
  const currentProfile = data.profiles?.[currentUser] || null;
  const isAdmin = !!currentProfile?.flag;

  const impersonateUser = (isAdmin && data.impersonateUser) ? data.impersonateUser : null;
  const effectiveUser = impersonateUser || currentUser;
  const profile = data.profiles?.[effectiveUser] || null;

  const ctx = { data, currentUser, effectiveUser, profile, isAdmin };

  // user label
  const userLabel = document.getElementById('userLabel');
  if(userLabel) userLabel.textContent = `👤 ${effectiveUser}`;

  // logout
  const logoutBtn = document.getElementById('logoutBtn');
  if(logoutBtn) logoutBtn.classList.toggle('hidden', currentUser==='guest');
  if(logoutBtn) logoutBtn.addEventListener('click', ()=>{
    data.currentUser='guest';
    data.impersonateUser=null;
    data.ui = data.ui || {};
    data.ui.impersonationEdit=false;
    PS.storage.save(data);
    location.href='./login.html';
  });

  // nav switching
  const navUser = document.querySelector('.nav-user');
  const navAdmin = document.querySelector('.nav-admin');
  if(isAdmin && currentUser==='admin' && !impersonateUser){
    if(navUser) navUser.classList.add('hidden');
    if(navAdmin) navAdmin.classList.remove('hidden');
  }else{
    if(navAdmin) navAdmin.classList.add('hidden');
    if(navUser) navUser.classList.remove('hidden');
  }

  // impersonation banner
  const imp = document.getElementById('impersonationBanner');
  if(imp){
    if(impersonateUser){
      imp.classList.remove('hidden');
      data.ui = data.ui || {};
      const editOn = !!data.ui.impersonationEdit;
      imp.innerHTML = `
        ⚠️ Eingeloggt bei: <strong>${PS.common.esc(impersonateUser)}</strong>
        <span style="margin-left:.5rem"></span>
        <button class="btn small" id="impStopBtn">Impersonation stoppen</button>
        <button class="btn small ${editOn?'primary':''}" id="impEditBtn">${editOn?'Edit: AN':'Edit: AUS'}</button>
      `;

      document.getElementById('impStopBtn')?.addEventListener('click', ()=>{
        data.impersonateUser = null;
        data.ui.impersonationEdit = false;
        PS.storage.save(data);
        location.href = './admin.html#users';
      });

      document.getElementById('impEditBtn')?.addEventListener('click', ()=>{
        data.ui.impersonationEdit = !data.ui.impersonationEdit;
        PS.storage.save(data);
        PS.common.setImpersonationReadonly(!data.ui.impersonationEdit);
        const b = document.getElementById('impEditBtn');
        if(b){
          b.textContent = data.ui.impersonationEdit ? 'Edit: AN' : 'Edit: AUS';
          b.classList.toggle('primary', data.ui.impersonationEdit);
        }
      });

      PS.common.setImpersonationReadonly(!editOn);
    }else{
      imp.classList.add('hidden');
      PS.common.setImpersonationReadonly(false);
    }
  }

  heartbeat(ctx);
  return ctx;
};

PS.common.requireAuth = function(ctx){
  if(!ctx?.profile){ location.href='./login.html'; return false; }
  if(ctx.currentUser==='guest'){ location.href='./login.html'; return false; }

  const cp = ctx.data?.profiles?.[ctx.currentUser];
  if(cp && cp.active === false){
    ctx.data.currentUser='guest';
    ctx.data.impersonateUser=null;
    ctx.data.ui = ctx.data.ui || {};
    ctx.data.ui.impersonationEdit=false;
    PS.storage.save(ctx.data);
    location.href='./login.html';
    return false;
  }
  return true;
};