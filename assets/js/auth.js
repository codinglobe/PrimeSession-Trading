// assets/js/auth.js
(function(){
  const data = PS.storage.load();
  PS.common.applyTheme(data);
  PS.common.applyImpressum();

  const supabaseWait = async () => {
    await (window.PS.supabaseReady || Promise.resolve());
    if(!window.PS.supabase) throw new Error('Supabase nicht konfiguriert (PS_CONFIG).');
    return window.PS.supabase;
  };

  function showSupabaseConfigHint(targetEl){
    if(!targetEl) return;
    targetEl.textContent = "Supabase ist nicht konfiguriert. Cloud: 'config.json' (aus 'config.json.example') mit SUPABASE_URL + SUPABASE_ANON_KEY bereitstellen. Lokal: 'config.local.example.js' nach 'config.local.js' kopieren.";
  }

  const modeLogin = document.getElementById('modeLogin');
  const modeRegister = document.getElementById('modeRegister');

  const loginWrap = document.getElementById('loginWrap');
  const regWrap = document.getElementById('regWrap');

  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  const loginUser = document.getElementById('loginUser');  // Email
  const loginPass = document.getElementById('loginPass');

  const regEmail = document.getElementById('regEmail');
  const regUser = document.getElementById('regUser');      // Username (Display)
  const regPass = document.getElementById('regPass');

  const authMsg = document.getElementById('authMsg');
  const loginHelpForm = document.getElementById('loginHelpForm');
  const helpUserOrEmail = document.getElementById('helpUserOrEmail');
  const helpMsg = document.getElementById('helpMsg');
  const helpMsgOut = document.getElementById('helpMsgOut');

  function showMode(m){
    authMsg.textContent = '';
    if(m==='register'){
      loginWrap.classList.add('hidden');
      regWrap.classList.remove('hidden');
      modeRegister.classList.add('primary');
      modeLogin.classList.remove('primary');
    }else{
      regWrap.classList.add('hidden');
      loginWrap.classList.remove('hidden');
      modeLogin.classList.add('primary');
      modeRegister.classList.remove('primary');
    }
  }
  showMode('login');

  modeLogin?.addEventListener('click', ()=> showMode('login'));
  modeRegister?.addEventListener('click', ()=> showMode('register'));

  function isEmail(x){
    const s = String(x||'').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  function findUserByIdent(dataModel, ident){
    const id = String(ident||'').trim().toLowerCase();
    if(!id) return null;

    for(const u of Object.keys(dataModel?.profiles||{})){
      if(u.toLowerCase() === id) return u;
    }
    for(const [u, prof] of Object.entries(dataModel?.profiles||{})){
      if(u === 'guest') continue;
      const em = String(prof?.email||'').trim().toLowerCase();
      if(em && em === id) return u;
    }
    return null;
  }

  async function tryAdminLogin(identifier, password){
    const adminUser = String(window.PS_CONFIG?.ADMIN_USERNAME || 'admin').trim();
    const adminEmail = String(window.PS_CONFIG?.ADMIN_EMAIL || '').trim().toLowerCase();
    const ident = String(identifier || '').trim().toLowerCase();
    const isAdminIdent = ident === adminUser.toLowerCase() || (adminEmail && ident === adminEmail);

    if(!isAdminIdent) return { handled:false };
    if(!window.PS.supabase || !adminEmail){
      return {
        handled:true,
        ok:false,
        msg:'Admin-Login benötigt Supabase + ADMIN_EMAIL Konfiguration.'
      };
    }

    const { data: authRes, error } = await window.PS.supabase.auth.signInWithPassword({
      email: adminEmail,
      password
    });

    if(error || !authRes?.user){
      return {
        handled:true,
        ok:false,
        msg:'Admin Login fehlgeschlagen (Supabase Email/Passwort).'
      };
    }

    await PS.storage.cloudSyncAfterAuth({ username: 'admin', email: adminEmail });

    const d = PS.storage.load();
    d.currentUser = 'admin';
    d.impersonateUser = null;
    d.profiles = d.profiles || {};
    d.profiles.admin = d.profiles.admin || PS.storage.mkProfile(true, adminEmail);
    d.profiles.admin.email = adminEmail;
    d.profiles.admin.flag = true;
    d.profiles.admin.active = true;
    d.profiles.admin.lastLoginAt = new Date().toISOString();
    PS.storage.save(d, { cloud:false });
    return { handled:true, ok:true };
  }

  loginForm?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    authMsg.textContent = '';

    try {
      const identifier = (loginUser.value||'').trim();
      const password = (loginPass.value||'').trim();
      if(!identifier || !password) return (authMsg.textContent='Email/Password fehlt.');

      const adminAttempt = await tryAdminLogin(identifier, password);
      if(adminAttempt?.handled){
        if(adminAttempt.ok){
          location.href = './admin.html#dash';
        } else {
          authMsg.textContent = adminAttempt.msg || 'Admin Login fehlgeschlagen.';
        }
        return;
      }

      if(!isEmail(identifier)) return (authMsg.textContent='Bitte mit Email einloggen (Admin via Username möglich).');

      const supabase = await supabaseWait();

      const { data: res, error } = await supabase.auth.signInWithPassword({ email: identifier, password });
      if(error) return (authMsg.textContent='Login fehlgeschlagen (Email/Passwort).');

      const user = res?.user;
      const username = user?.user_metadata?.username || (identifier.split('@')[0]);

      await PS.storage.cloudSyncAfterAuth({ username, email: identifier });

      location.href = './index.html';
    } catch(err){
      if(String(err?.message||'').includes('Supabase nicht konfiguriert')){
        showSupabaseConfigHint(authMsg);
      } else {
        authMsg.textContent = 'Login fehlgeschlagen.';
      }
    }
  });

  registerForm?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    authMsg.textContent = '';

    try {
      const email = (regEmail.value||'').trim();
      const username = (regUser.value||'').trim();
      const password = (regPass.value||'').trim();

      if(!email || !isEmail(email)) return (authMsg.textContent='Email ungültig.');
      if(!username || username.length < 3) return (authMsg.textContent='Username min. 3 Zeichen.');
      if(!password || password.length < 6) return (authMsg.textContent='Passwort min. 6 Zeichen.');

      const supabase = await supabaseWait();

      const { data: res, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } }
      });

      if(error) return (authMsg.textContent='Registrierung fehlgeschlagen.');

      // Wenn Email-Confirm an ist, gibt es evtl. keine Session sofort:
      if(!res?.session){
        authMsg.textContent = '✅ User erstellt. Bitte Email bestätigen, dann einloggen.';
        return;
      }

      await PS.storage.cloudSyncAfterAuth({ username, email });
      location.href = './index.html';
    } catch(err){
      if(String(err?.message||'').includes('Supabase nicht konfiguriert')){
        showSupabaseConfigHint(authMsg);
      } else {
        authMsg.textContent = 'Registrierung fehlgeschlagen.';
      }
    }
  });

  loginHelpForm?.addEventListener('submit', (e)=>{
    e.preventDefault();
    helpMsgOut.textContent = '';

    const ident = (helpUserOrEmail.value||'').trim();
    const msg = (helpMsg.value||'').trim();

    if(!ident) return (helpMsgOut.textContent='Username oder Email fehlt.');
    if(!msg) return (helpMsgOut.textContent='Nachricht fehlt.');

    const user = findUserByIdent(data, ident);
    if(!user) return (helpMsgOut.textContent='Kein User gefunden (Username/Email).');

    const profile = data.profiles?.[user];
    if(!profile) return (helpMsgOut.textContent='Profil konnte nicht geladen werden.');

    profile.tickets = profile.tickets || [];
    const nowIso = new Date().toISOString();
    const baseId = Date.now();

    profile.tickets.unshift({
      id: `tk_${baseId}_${Math.random().toString(16).slice(2)}`,
      title: 'Login Hilfe',
      type: 'login_help',
      status: 'open',
      createdAt: nowIso,
      updatedAt: nowIso,
      messages: [
        {
          id: `m_${baseId}`,
          from: 'user',
          text: msg,
          createdAt: nowIso,
          attachments: []
        }
      ]
    });

    PS.storage.save(data);
    helpMsgOut.textContent = `✅ Ticket erstellt für User: ${user}`;
    helpUserOrEmail.value = '';
    helpMsg.value = '';
  });
})();
