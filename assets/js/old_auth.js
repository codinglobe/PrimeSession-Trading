// assets/js/auth.js (KOMPLETT ERSETZEN)
(function(){
  const data = PS.storage.load();
  data.profiles = data.profiles || {};
  data.users = data.users || {}; // compatibility, falls irgendwo genutzt

  PS.common.applyTheme(data);
  PS.common.applyImpressum();

  const modeLogin = document.getElementById('modeLogin');
  const modeRegister = document.getElementById('modeRegister');

  const loginWrap = document.getElementById('loginWrap');
  const regWrap = document.getElementById('regWrap');

  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  const loginUser = document.getElementById('loginUser');
  const loginPass = document.getElementById('loginPass');

  const regEmail = document.getElementById('regEmail');
  const regUser = document.getElementById('regUser');
  const regPass = document.getElementById('regPass');

  const authMsg = document.getElementById('authMsg');

  const loginHelpForm = document.getElementById('loginHelpForm');
  const helpUserOrEmail = document.getElementById('helpUserOrEmail');
  const helpMsg = document.getElementById('helpMsg');
  const helpMsgOut = document.getElementById('helpMsgOut');

  // default to login
  showMode('login');

  modeLogin?.addEventListener('click', ()=> showMode('login'));
  modeRegister?.addEventListener('click', ()=> showMode('register'));

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

  // --- robust SHA256: hex + base64 (offline, kein CryptoJS nötig) ---
  async function sha256Both(str){
    const enc = new TextEncoder().encode(String(str||''));
    const buf = await crypto.subtle.digest('SHA-256', enc);
    const bytes = new Uint8Array(buf);
    const hex = [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
    const b64 = btoa(String.fromCharCode(...bytes));
    return { hex, b64 };
  }

  function looksHex64(x){
    const s = String(x||'').trim();
    return /^[0-9a-f]{64}$/i.test(s);
  }

  async function passwordMatches(profile, pw){
    const storedHex = String(profile?.hash||'').trim();
    const storedB64 = String(profile?.hash_b64||'').trim();

    const { hex, b64 } = await sha256Both(pw);

    // akzeptiere beide Formate – egal was früher gespeichert wurde
    if(storedHex && (storedHex === hex || storedHex === b64)) return true;
    if(storedB64 && (storedB64 === b64 || storedB64 === hex)) return true;

    // fallback: falls irgendwer mal uppercase hex gespeichert hat
    if(storedHex && looksHex64(storedHex) && storedHex.toLowerCase() === hex) return true;

    return false;
  }

  loginForm?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    authMsg.textContent = '';

    const u = (loginUser.value||'').trim();
    const p = (loginPass.value||'').trim();
    if(!u || !p) return (authMsg.textContent='Username/Password fehlt.');

    const prof = data.profiles?.[u];
    if(!prof) return (authMsg.textContent='User existiert nicht.');
    if(prof.active === false) return (authMsg.textContent='Konto ist inaktiv.');

    const ok = await passwordMatches(prof, p);
    if(!ok) return (authMsg.textContent='Passwort falsch.');

    // ✅ login success
    const nowIso = new Date().toISOString();
    prof.lastLoginAt = nowIso;
    prof.lastSeenAt = nowIso;
    prof.lastSeen = nowIso; // compatibility

    data.currentUser = u;
    data.impersonateUser = null;
    data.ui = data.ui || {};
    data.ui.impersonationEdit = false;

    PS.storage.save(data);
    location.href = './index.html';
  });

  registerForm?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    authMsg.textContent = '';

    const email = (regEmail.value||'').trim();
    const u = (regUser.value||'').trim();
    const p = (regPass.value||'').trim();

    if(!email || !isEmail(email)) return (authMsg.textContent='Email ungültig.');
    if(!u || u.length < 3) return (authMsg.textContent='Username min. 3 Zeichen.');
    if(!p || p.length < 4) return (authMsg.textContent='Passwort min. 4 Zeichen.');

    if(data.profiles?.[u]) return (authMsg.textContent='Username ist bereits vergeben.');

    // email unique
    for(const [name, prof] of Object.entries(data.profiles||{})){
      if(name==='guest') continue;
      if(String(prof.email||'').toLowerCase() === email.toLowerCase()){
        return (authMsg.textContent='Email ist bereits registriert.');
      }
    }

    const { hex, b64 } = await sha256Both(p);

    // mkProfile erwartet einen hash string -> wir speichern hex als Hauptformat
    const prof = PS.storage.mkProfile(hex, false, email);
    prof.hash = hex;
    prof.hash_b64 = b64;

    const nowIso = new Date().toISOString();
    prof.lastLoginAt = nowIso; // auto-login
    prof.lastSeenAt = nowIso;
    prof.lastSeen = nowIso;

    data.profiles[u] = prof;
    data.currentUser = u;
    data.impersonateUser = null;
    data.ui = data.ui || {};
    data.ui.impersonationEdit = false;

    PS.storage.save(data);
    location.href = './index.html';
  });

  // Login-Hilfe Ticket: Username oder Email muss existieren -> Ticket bei diesem User erstellen
  loginHelpForm?.addEventListener('submit', (e)=>{
    e.preventDefault();
    helpMsgOut.textContent = '';

    const ident = (helpUserOrEmail.value||'').trim();
    const msg = (helpMsg.value||'').trim();
    if(!ident) return (helpMsgOut.textContent='Username oder Email fehlt.');
    if(!msg) return (helpMsgOut.textContent='Nachricht fehlt.');

    const user = findUserByIdent(ident);
    if(!user) return (helpMsgOut.textContent='Kein User gefunden (Username/Email).');

    const prof = data.profiles[user];
    prof.tickets = prof.tickets || [];
    const nowIso = new Date().toISOString();

    prof.tickets.unshift({
      id:'tk_'+Date.now()+'_'+Math.random().toString(16).slice(2),
      title:'Login Hilfe',
      type:'bug',
      status:'open',
      createdAt:nowIso,
      updatedAt:nowIso,
      messages:[
        { id:'m_'+Date.now(), from:'user', text:`[Login Help] ${msg}`, createdAt:nowIso, attachments:[] }
      ]
    });

    PS.storage.save(data);
    helpMsgOut.textContent = `✅ Ticket erstellt für User: ${user}`;
    helpUserOrEmail.value = '';
    helpMsg.value = '';
  });

  function isEmail(x){
    const s = String(x||'').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  function findUserByIdent(ident){
    const id = String(ident||'').trim().toLowerCase();
    if(!id) return null;

    // direct username
    for(const u of Object.keys(data.profiles||{})){
      if(u.toLowerCase() === id) return u;
    }
    // email match
    for(const [u, prof] of Object.entries(data.profiles||{})){
      if(u==='guest') continue;
      const em = String(prof.email||'').toLowerCase();
      if(em && em === id) return u;
    }
    return null;
  }
})();