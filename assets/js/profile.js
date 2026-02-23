// assets/js/profile.js (KOMPLETT ERSETZEN)
(function(){
  const ctx = PS.common.init();
  if(!PS.common.requireAuth(ctx)) return;

  if(PS.common.isPureAdmin(ctx)){
    location.href = './admin.html#users';
    return;
  }

  const data = ctx.data;
  const p = ctx.profile;

  const supabaseWait = async () => {
    await (window.PS.supabaseReady || Promise.resolve());
    if(!window.PS.supabase) throw new Error('Supabase nicht konfiguriert (PS_CONFIG).');
    return window.PS.supabase;
  };

  const setTheme = document.getElementById('setTheme');
  const setTF = document.getElementById('setTF');
  const setRisk = document.getElementById('setRisk');
  const setLev = document.getElementById('setLev');
  const setOrders = document.getElementById('setOrders');
  const setScale = document.getElementById('setScale');
  const setChartLink = document.getElementById('setChartLink');

  const tpCount = document.getElementById('tpCount');
  const runnerPct = document.getElementById('runnerPct');
  const tpGrid = document.getElementById('tpPercentsGrid');

  const curPass = document.getElementById('curPass');
  const newEmail = document.getElementById('newEmail');
  const newPass = document.getElementById('newPass');
  const newPass2 = document.getElementById('newPass2');
  const emailMsg = document.getElementById('emailMsg');
  const passMsg = document.getElementById('passMsg');

  const msg = document.getElementById('saveMsg');

  p.settings = p.settings || {};
  p.settings.tpScheme = p.settings.tpScheme || PS.storage.defaultTpScheme();
  if(typeof p.settings.showChartLink !== 'boolean') p.settings.showChartLink = false;

  // ✅ Theme pro User
  if(!p.settings.theme){
    // fallback: global ui theme
    p.settings.theme = (data?.ui?.theme === 'light') ? 'light' : 'dark';
    PS.storage.save(data);
  }
  setTheme.value = (p.settings.theme === 'light') ? 'light' : 'dark';

  setTF.value = p.settings.defaultTimeframe || '30m';
  setRisk.value = String(p.settings.defaultRiskPercent ?? 0.50);
  setLev.value = String(p.settings.defaultLeverage ?? 10);
  setOrders.value = String(p.settings.defaultOrders ?? 5);
  setScale.value = p.settings.defaultScaleMode ?? 'flat';
  setChartLink.value = String(!!p.settings.showChartLink);

  tpCount.value = String(p.settings.tpScheme.tpCount ?? 4);
  runnerPct.value = String(p.settings.tpScheme.runnerPercent ?? 10);

  renderTpInputs();

  // Theme Change: nur profile theme setzen
  setTheme.addEventListener('change', ()=>{
    p.settings.theme = (setTheme.value === 'light') ? 'light' : 'dark';
    // global fallback auch aktualisieren (für Login-Page)
    data.ui = data.ui || {};
    data.ui.theme = p.settings.theme;
    PS.storage.save(data);
    PS.common.applyThemeValue(p.settings.theme);
  });

  tpCount.addEventListener('input', renderTpInputs);

  document.getElementById('saveSettings').addEventListener('click', ()=>{
    emailMsg.textContent = '';
    passMsg.textContent = '';

    // Theme bereits im change-handler gespeichert, trotzdem sicher
    p.settings.theme = (setTheme.value === 'light') ? 'light' : 'dark';
    data.ui = data.ui || {};
    data.ui.theme = p.settings.theme;

    p.settings.defaultTimeframe = setTF.value || '30m';
    p.settings.defaultRiskPercent = PS.utils.parseCHNumber(setRisk.value) || 0.50;
    p.settings.defaultLeverage = Number(setLev.value)||10;
    p.settings.defaultOrders = Number(setOrders.value)||5;
    p.settings.defaultScaleMode = setScale.value || 'flat';
    p.settings.showChartLink = (setChartLink.value === 'true');

    const n = clampInt(Number(tpCount.value||4), 1, 6);
    const runner = PS.utils.parseCHNumber(runnerPct.value) || 0;

    const tpPerc = [];
    for(let i=1;i<=n;i++){
      const v = PS.utils.parseCHNumber(document.getElementById(`tpPct${i}`).value) || 0;
      tpPerc.push(v);
    }

    const sum = tpPerc.reduce((a,b)=>a+b,0) + runner;
    if(Math.abs(sum - 100) > 0.0001){
      alert(`TP% + Runner% muss 100 ergeben. Aktuell: ${sum}`);
      return;
    }

    p.settings.tpScheme = { tpCount:n, tpPercents:tpPerc, runnerPercent:runner };

    PS.storage.save(data);
    PS.common.applyThemeValue(p.settings.theme);

    msg.textContent = '✅ Gespeichert';
    setTimeout(()=> msg.textContent='', 1500);
  });

  // Email ändern
  document.getElementById('changeEmailBtn').addEventListener('click', async ()=>{
    emailMsg.textContent = '';
    const cp = curPass.value || '';
    if(!cp) return (emailMsg.textContent='Aktuelles Passwort fehlt.');

    const em = (newEmail.value||'').trim();
    if(!isEmail(em)) return (emailMsg.textContent='Email ungültig.');

    for(const [u, prof] of Object.entries(data.profiles||{})){
      if(u==='guest') continue;
      if(u===ctx.effectiveUser) continue;
      if(String(prof.email||'').toLowerCase() === em.toLowerCase()){
        return (emailMsg.textContent='Email ist bereits registriert.');
      }
    }

    try{
      const supabase = await supabaseWait();
      const currentEmail = String(p.email || '').trim();
      if(!currentEmail || !isEmail(currentEmail)){
        emailMsg.textContent = 'Session/Profil-Email fehlt. Bitte neu einloggen.';
        return;
      }

      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: currentEmail,
        password: cp
      });
      if(reauthError){
        emailMsg.textContent = authErrorMessage(reauthError, { fallback: 'Revalidierung fehlgeschlagen.' });
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ email: em });
      if(updateError){
        emailMsg.textContent = authErrorMessage(updateError, { fallback: 'Email-Update fehlgeschlagen.' });
        return;
      }

      p.email = em;
      PS.storage.save(data);
      emailMsg.textContent = '✅ Email geändert.';
      newEmail.value = '';
    }catch(err){
      emailMsg.textContent = String(err?.message || 'Supabase nicht verfügbar.');
    }
  });

  // Passwort ändern
  document.getElementById('changePassBtn').addEventListener('click', async ()=>{
    passMsg.textContent = '';
    const cp = curPass.value || '';
    if(!cp) return (passMsg.textContent='Aktuelles Passwort fehlt.');

    const np = newPass.value || '';
    const np2 = newPass2.value || '';
    if(np.length < 4) return (passMsg.textContent='Neues Passwort zu kurz (min 4).');
    if(np !== np2) return (passMsg.textContent='Passwörter stimmen nicht überein.');

    try{
      const supabase = await supabaseWait();
      const currentEmail = String(p.email || '').trim();
      if(!currentEmail || !isEmail(currentEmail)){
        passMsg.textContent = 'Session/Profil-Email fehlt. Bitte neu einloggen.';
        return;
      }

      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: currentEmail,
        password: cp
      });
      if(reauthError){
        passMsg.textContent = authErrorMessage(reauthError, { fallback: 'Revalidierung fehlgeschlagen.' });
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: np });
      if(updateError){
        passMsg.textContent = authErrorMessage(updateError, { fallback: 'Passwort-Update fehlgeschlagen.' });
        return;
      }

      passMsg.textContent = '✅ Passwort geändert.';
      newPass.value = ''; newPass2.value = '';
    }catch(err){
      passMsg.textContent = String(err?.message || 'Supabase nicht verfügbar.');
    }
  });

  // Deletes
  document.getElementById('delCalc').addEventListener('click', ()=>{
    if(!confirm('Rechner-Trades wirklich löschen?')) return;
    p.calculatorTrades = [];
    PS.storage.save(data);
    alert('✅ Rechner-Trades gelöscht.');
  });

  document.getElementById('delJournal').addEventListener('click', ()=>{
    if(!confirm('Journal-Trades wirklich löschen?')) return;
    p.journalTrades = [];
    PS.storage.save(data);
    alert('✅ Journal-Trades gelöscht.');
  });

  document.getElementById('delTickets').addEventListener('click', ()=>{
    if(!confirm('Tickets wirklich löschen?')) return;
    p.tickets = [];
    PS.storage.save(data);
    alert('✅ Tickets gelöscht.');
  });

  document.getElementById('closeAccount').addEventListener('click', ()=>{
    if(!confirm('Konto schließen? Du kannst dich danach nicht mehr einloggen.')) return;
    const currentProfile = PS.storage.getProfile(data, ctx.currentUser);
    if(currentProfile) currentProfile.active = false;
    data.currentUser = 'guest';
    data.impersonateUser = null;
    data.ui.impersonationEdit = false;
    PS.storage.save(data);
    location.href = './login.html';
  });

  function renderTpInputs(){
    const n = clampInt(Number(tpCount.value||4), 1, 6);
    const scheme = p.settings.tpScheme || PS.storage.defaultTpScheme();
    const existing = scheme.tpPercents || [];
    const defaults = [30,25,20,15,5,5];

    const html = [];
    for(let i=1;i<=6;i++){
      const hidden = i>n ? 'style="display:none"' : '';
      const val = (i<=n) ? (existing[i-1] ?? defaults[i-1] ?? 0) : '';
      html.push(`
        <div class="input-group" ${hidden}>
          <label>TP${i} %</label>
          <input id="tpPct${i}" value="${val}">
        </div>
      `);
    }
    tpGrid.innerHTML = html.join('');
  }

  function clampInt(v,min,max){
    v = Math.floor(Number(v||0));
    return Math.max(min, Math.min(max, v));
  }

  function isEmail(x){
    const s = String(x||'').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  function authErrorMessage(error, { fallback } = {}){
    const msg = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '').toLowerCase();

    if(msg.includes('invalid login credentials') || code === 'invalid_credentials'){
      return 'Aktuelles Passwort falsch.';
    }
    if(msg.includes('session') && (msg.includes('missing') || msg.includes('not found'))){
      return 'Session fehlt. Bitte neu einloggen.';
    }
    if(msg.includes('invalid') && msg.includes('email')){
      return 'Email ungültig.';
    }
    if(msg.includes('already') && (msg.includes('registered') || msg.includes('exists'))){
      return 'Email ist bereits registriert.';
    }
    if(msg.includes('password') && msg.includes('short')){
      return 'Neues Passwort ist zu kurz.';
    }

    return fallback || 'Aktion fehlgeschlagen.';
  }
})();
