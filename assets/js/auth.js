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

  loginForm?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    authMsg.textContent = '';

    const email = (loginUser.value||'').trim();
    const password = (loginPass.value||'').trim();
    if(!email || !password) return (authMsg.textContent='Email/Password fehlt.');
    if(!isEmail(email)) return (authMsg.textContent='Bitte mit Email einloggen.');

    const supabase = await supabaseWait();

    const { data: res, error } = await supabase.auth.signInWithPassword({ email, password });
    if(error) return (authMsg.textContent='Login fehlgeschlagen (Email/Passwort).');

    const user = res?.user;
    const username = user?.user_metadata?.username || (email.split('@')[0]);

    await PS.storage.cloudSyncAfterAuth({ username, email });

    location.href = './index.html';
  });

  registerForm?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    authMsg.textContent = '';

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
  });
})();