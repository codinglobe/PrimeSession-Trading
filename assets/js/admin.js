// assets/js/admin.js (KOMPLETT ERSETZEN)
(function(){
  const ctx = PS.common.init();
  if(!PS.common.requireAuth(ctx)) return;

  const ADMIN_REFRESH_MS = 10_000;
  let refreshTimer = null;
  let refreshing = false;

  // Wenn Admin impersonating aktiv hat -> User-Ansicht erzwingen
  if(ctx.isAdmin && ctx.currentUser==='admin' && ctx.data.impersonateUser){
    location.href = './index.html';
    return;
  }

  if(!ctx.isAdmin || ctx.currentUser!=='admin'){
    location.href = './login.html';
    return;
  }

  const data = ctx.data;
  let globalSource = { ok:false, users:[], message:'' };

  const viewDash = document.getElementById('viewDash');
  const viewTickets = document.getElementById('viewTickets');
  const viewUsers = document.getElementById('viewUsers');

  const navDash = document.getElementById('navDash');
  const navTickets = document.getElementById('navTickets');
  const navUsers = document.getElementById('navUsers');

  const adminKpis = document.getElementById('adminKpis');
  const globalDataNotice = document.createElement('div');
  globalDataNotice.className = 'card';
  globalDataNotice.style.marginTop = '1rem';
  globalDataNotice.style.display = 'none';
  globalDataNotice.innerHTML = '<strong>Hinweis Datenquelle</strong><div class="small muted" id="globalDataNoticeText"></div>';
  document.querySelector('.nav.nav-admin')?.insertAdjacentElement('afterend', globalDataNotice);
  const globalDataNoticeText = document.getElementById('globalDataNoticeText');

  // Tickets
  const tFilter = document.getElementById('adminTicketStatus');
  const tUserSearch = document.getElementById('adminTicketUserSearch');
  const tList = document.getElementById('adminTicketList');
  const tDetail = document.getElementById('adminTicketDetail');
  let activeTicket = null; // {user, ticketId}

  // Users
  const usersBody = document.getElementById('usersBody');
  const userSearch = document.getElementById('userSearch');

  function statusLabel(s){
    s = String(s||'');
    if(s==='open') return 'Offen';
    if(s==='in_progress') return 'In Bearbeitung';
    if(s==='done') return 'Erledigt';
    if(s==='rejected') return 'Abgelehnt';
    return s.replaceAll('_',' ');
  }

  function route(){
    const h = (location.hash || '#dash').replace('#','');
    const page = (h==='tickets' || h==='users') ? h : 'dash';

    viewDash.classList.toggle('hidden', page!=='dash');
    viewTickets.classList.toggle('hidden', page!=='tickets');
    viewUsers.classList.toggle('hidden', page!=='users');

    navDash.classList.toggle('active', page==='dash');
    navTickets.classList.toggle('active', page==='tickets');
    navUsers.classList.toggle('active', page==='users');

    if(page==='dash') renderDash();
    if(page==='tickets') renderTickets();
    if(page==='users') renderUsers();
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('focus', ()=>{ refreshGlobalData({ rerender:true }).catch(()=>{}); });
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState === 'visible'){
      refreshGlobalData({ rerender:true }).catch(()=>{});
    }
  });
  init();

  async function init(){
    await loadGlobalAdminData();
    route();

    if(refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(()=>{
      refreshGlobalData({ rerender:true }).catch(()=>{});
    }, ADMIN_REFRESH_MS);
  }

  async function refreshGlobalData({ rerender=false } = {}){
    if(refreshing) return;
    refreshing = true;
    try{
      await loadGlobalAdminData();
      if(rerender) route();
    } finally {
      refreshing = false;
    }
  }

  async function loadGlobalAdminData(){
    globalSource = await PS.storage.getAdminGlobalSnapshot();
    const migrationHint = 'Migration: Frühere lokale Daten (z. B. lokale profiles-Snapshots) sind unvollständig und werden für Admin-Übersichten bewusst nicht als "alle User" verwendet.';

    if(!globalSource.ok){
      globalDataNotice.style.display = '';
      globalDataNoticeText.textContent = `${globalSource.message || 'Globale Daten nicht verfügbar.'} ${migrationHint}`;
      return;
    }

    if(globalSource.warning){
      globalDataNotice.style.display = '';
      globalDataNoticeText.textContent = `${globalSource.warning} ${migrationHint}`;
      return;
    }

    globalDataNotice.style.display = '';
    globalDataNoticeText.textContent = `Quelle: ${globalSource.source}. ${migrationHint}`;
  }

  function allUsers(includeAdmin=true){
    return (globalSource.users || []).filter(x=> includeAdmin || x.user!=='admin');
  }

  function safeNum(x){ const n=Number(x||0); return Number.isFinite(n)?n:0; }

  function renderDash(){
    let users = 0, trades = 0, tickets = 0;
    let pnlGross=0, pnlNet=0, fees=0;
    let tOpen=0,tProg=0,tDone=0,tRej=0;

    const baseUsers = allUsers(true);
    for(const {user, profile} of baseUsers){
      users++;
      trades += (profile.journalTrades||[]).length;
      tickets += (profile.tickets||[]).length;

      PS.common.computeUserStats(profile);
      pnlGross += safeNum(profile.stats?.pnlGross);
      pnlNet   += safeNum(profile.stats?.pnlNet);
      fees     += safeNum(profile.stats?.fees);

      for(const tk of (profile.tickets||[])){
        if(tk.status==='open') tOpen++;
        else if(tk.status==='in_progress') tProg++;
        else if(tk.status==='done') tDone++;
        else if(tk.status==='rejected') tRej++;
      }
    }
    if(!globalSource.ok){
      adminKpis.innerHTML = `<div class="muted">Globale Admin-KPIs sind derzeit nicht verfügbar. Bitte Backend-Verbindung/Rechte prüfen.</div>`;
      return;
    }

    adminKpis.innerHTML = [
      kpi('Users', users),
      kpi('Journal Trades', trades),
      kpi('Tickets', tickets),
      kpi('GuV brutto', PS.common.fmtUSDT8(pnlGross)),
      kpi('Fees', PS.common.fmtUSDT8(fees)),
      kpi('GuV netto', PS.common.fmtUSDT8(pnlNet)),
      kpi('Tickets Offen', tOpen),
      kpi('Tickets In Bearb.', tProg),
      kpi('Tickets Erledigt', tDone)
    ].join('');
  }

  function kpi(t,v){
    return `<div class="card"><div class="kpi-title">${PS.common.esc(t)}</div><div class="kpi-value">${PS.common.esc(String(v))}</div></div>`;
  }

  // -------- Tickets --------
  tFilter?.addEventListener('change', renderTickets);
  tUserSearch?.addEventListener('input', renderTickets);

  function collectAllTickets(){
    const out = [];
    for(const {user, profile, userId} of allUsers(true)){
      for(const tk of (profile.tickets||[])){
        out.push({ user, tk, profile, userId });
      }
    }
    out.sort((a,b)=> (b.tk.updatedAt||'').localeCompare(a.tk.updatedAt||''));
    return out;
  }

  function renderTickets(){
    const f = tFilter?.value || 'ALL';
    const q = (tUserSearch?.value||'').toLowerCase().trim();

    const all = collectAllTickets().filter(x=>{
      const okStatus = (f==='ALL') ? true : x.tk.status===f;
      if(!okStatus) return false;
      if(!q) return true;
      const email = String(x.profile?.email||'').toLowerCase();
      return x.user.toLowerCase().includes(q) || email.includes(q);
    });

    if(!all.length){
      if(tList) tList.textContent = globalSource.ok
        ? 'Keine Tickets in globaler Datenquelle.'
        : 'Keine globalen Ticket-Daten verfügbar.';
      if(tDetail) tDetail.textContent = globalSource.ok
        ? '—'
        : 'Bitte Hinweis zur Datenquelle oben prüfen.';
      return;
    }

    if(!tList || !tDetail) return;

    tList.innerHTML = all.map(x=>{
      const act = activeTicket && activeTicket.user===x.user && activeTicket.ticketId===x.tk.id;
      return `
        <div class="ticket-item ${act?'active':''}" data-u="${PS.common.esc(x.user)}" data-id="${PS.common.esc(x.tk.id)}">
          <strong>${PS.common.esc(x.tk.title)}</strong>
          <div class="ticket-meta">
            <span class="badge2">${PS.common.esc(x.user)}</span>
            <span class="badge2">${PS.common.esc(x.tk.type)}</span>
            <span class="badge2">${PS.common.esc(statusLabel(x.tk.status))}</span>
            <span class="badge2">${PS.common.esc(PS.utils.toLocaleCH(x.tk.updatedAt))}</span>
          </div>
        </div>
      `;
    }).join('');

    tList.querySelectorAll('[data-id]').forEach(el=>{
      el.addEventListener('click', ()=>{
        activeTicket = { user: el.getAttribute('data-u'), ticketId: el.getAttribute('data-id') };
        renderTickets();
      });
    });

    const fallback = all[0];
    if(!activeTicket) activeTicket = { user:fallback.user, ticketId:fallback.tk.id };

    const found = all.find(x=> x.user===activeTicket.user && x.tk.id===activeTicket.ticketId) || fallback;
    activeTicket = { user: found.user, ticketId: found.tk.id };
    renderTicketDetail(found.user, found.tk, found.userId, found.profile);
  }

  function renderTicketDetail(user, tk, userId, profile){
    const msgs = (tk.messages||[]).map(m=>{
      const who = m.from==='admin' ? 'Admin' : user;
      const attach = (m.attachments||[]).map(a=>
        `<a href="${a.dataUrl}" download="${PS.common.esc(a.name)}">📎 ${PS.common.esc(a.name)}</a>`
      ).join(' ');
      return `
        <div class="msg ${m.from==='admin'?'admin':'user'}">
          <div class="msg-head"><span>${PS.common.esc(who)}</span><span>${PS.common.esc(PS.utils.toLocaleCH(m.createdAt))}</span></div>
          <div>${PS.common.esc(m.text||'')}</div>
          ${attach ? `<div class="attach">${attach}</div>` : ''}
        </div>
      `;
    }).join('');

    tDetail.innerHTML = `
      <div class="inline" style="justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
        <div class="inline" style="gap:.5rem;flex-wrap:wrap">
          <strong>${PS.common.esc(tk.title)}</strong>
          <span class="badge2">${PS.common.esc(user)}</span>
          <span class="badge2">${PS.common.esc(tk.type)}</span>
          <span class="badge2">${PS.common.esc(statusLabel(tk.status))}</span>
        </div>
        <select id="admSetStatus">
          ${['open','in_progress','done','rejected'].map(s=>`<option value="${s}" ${tk.status===s?'selected':''}>${statusLabel(s)}</option>`).join('')}
        </select>
      </div>

      <div class="chat-box" style="margin-top:.75rem">${msgs}</div>

      <div class="reply" style="margin-top:.75rem">
        <textarea id="admReplyText" rows="3" placeholder="Admin Antwort..."></textarea>
        <div class="inline" style="justify-content:space-between;margin-top:.5rem">
          <input id="admReplyFile" type="file" accept="image/*,.pdf" />
          <button class="btn small primary" id="admSend">Senden</button>
        </div>
        <div class="small muted" id="admOut"></div>
      </div>
    `;

    document.getElementById('admSetStatus').addEventListener('change', ()=>{
      tk.status = document.getElementById('admSetStatus').value;
      tk.updatedAt = new Date().toISOString();
      persistTicketChanges(user, userId, profile);
    });

    document.getElementById('admSend').addEventListener('click', async ()=>{
      const out = document.getElementById('admOut');
      out.textContent = '';

      const text = document.getElementById('admReplyText').value.trim();
      if(!text) return (out.textContent='Text nötig.');

      let attachments = [];
      const file = document.getElementById('admReplyFile').files?.[0];
      if(file){
        if(file.size > 1_500_000) return (out.textContent='Datei zu groß (max ~1.5MB).');
        const dataUrl = await readAsDataURL(file);
        attachments.push({ name:file.name, type:file.type, dataUrl });
      }

      const now = new Date().toISOString();
      tk.messages.push({ id:'m_'+Date.now(), from:'admin', text, createdAt:now, attachments });
      tk.updatedAt = now;

      if(tk.status==='done' || tk.status==='rejected') tk.status='in_progress';

      persistTicketChanges(user, userId, profile);
    });

    async function persistTicketChanges(username, uid, prof){
      try{
        await PS.storage.saveAdminUserProfile({ userId:uid, username, profile: prof });
        await loadGlobalAdminData();
        renderTickets();
      } catch(err){
        const out = document.getElementById('admOut');
        if(out) out.textContent = `Speichern fehlgeschlagen: ${err.message || err}`;
      }
    }

    function readAsDataURL(file){
      return new Promise((resolve,reject)=>{
        const fr = new FileReader();
        fr.onload = ()=> resolve(fr.result);
        fr.onerror = reject;
        fr.readAsDataURL(file);
      });
    }
  }

  // -------- Users --------
  userSearch?.addEventListener('input', renderUsers);

  function ticketCounts(profile){
    const tks = profile.tickets||[];
    let open=0, prog=0, rej=0, done=0;
    for(const tk of tks){
      if(tk.status==='open') open++;
      else if(tk.status==='in_progress') prog++;
      else if(tk.status==='rejected') rej++;
      else if(tk.status==='done') done++;
    }
    return { total:tks.length, open, prog, rej, done };
  }

  function isOnline(user, profile){
    // Offline-App: "Online" = in diesem Browser aktuell aktiv/impersonated
    if(data.currentUser === user) return '✅';
    if(data.impersonateUser === user) return '👀';

    // optional: wenn irgendwann lastSeen gesetzt wird
    const ls = profile.lastSeen ? new Date(profile.lastSeen).getTime() : 0;
    if(ls && (Date.now()-ls) < 15*60*1000) return '🟢';
    return '—';
  }

  function renderUsers(){
    const q = (userSearch?.value||'').toLowerCase().trim();

    const users = allUsers(true)
      .sort((a,b)=> a.user.localeCompare(b.user))
      .filter(x=>{
        if(!q) return true;
        const email = String(x.profile.email||'').toLowerCase();
        return x.user.toLowerCase().includes(q) || email.includes(q);
      });

    if(!globalSource.ok){
      if(usersBody) usersBody.innerHTML = '<tr><td colspan="14" class="muted">Globale User-Daten nicht verfügbar. Bitte Hinweis zur Datenquelle prüfen.</td></tr>';
      return;
    }

    if(!usersBody) return;

    usersBody.innerHTML = users.map(x=>{
      const prof = x.profile;
      PS.common.computeUserStats(prof);

      const stats = prof.stats || {};
      const tcnt = ticketCounts(prof);

      const active = prof.active !== false;
      const online = isOnline(x.user, prof);

      const isAdmin = x.user==='admin';
      const canDelete = !isAdmin;
      const canToggle = !isAdmin;

      return `
        <tr>
          <td>${PS.common.esc(x.user)}</td>
          <td>${PS.common.esc(prof.email||'')}</td>
          <td>${active ? '✅' : '❌'}</td>
          <td>${PS.common.esc(online)}</td>
          <td>${Number((prof.journalTrades||[]).length)}</td>
          <td>${PS.common.esc(PS.common.fmtUSDT8(stats.pnlGross||0))}</td>
          <td>${PS.common.esc(PS.common.fmtUSDT8(stats.fees||0))}</td>
          <td>${PS.common.esc(PS.common.fmtUSDT8(stats.pnlNet||0))}</td>
          <td>${tcnt.total}</td>
          <td>${tcnt.open}</td>
          <td>${tcnt.prog}</td>
          <td>${tcnt.rej}</td>
          <td>${tcnt.done}</td>
          <td class="inline" style="gap:.35rem;flex-wrap:wrap">
            <button class="btn small primary" data-imp="${PS.common.esc(x.user)}" ${isAdmin?'disabled':''}>Einloggen als</button>
            <button class="btn small" data-toggle="${PS.common.esc(x.user)}" ${!canToggle?'disabled':''}>${active?'Inaktiv setzen':'Aktiv setzen'}</button>
            <button class="btn small danger" data-del="${PS.common.esc(x.user)}" ${!canDelete?'disabled':''}>Löschen</button>
          </td>
        </tr>
      `;
    }).join('');

    usersBody.querySelectorAll('[data-imp]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const u = btn.getAttribute('data-imp');
        if(u==='admin') return;
        PS.storage.setImpersonate(data, u);
        data.ui.impersonationEdit = false; // default readonly
        PS.storage.save(data);
        location.href = './index.html';
      });
    });

	usersBody.querySelectorAll('[data-toggle]').forEach(btn=>{
	  btn.addEventListener('click', ()=>{
		const u = btn.getAttribute('data-toggle');
		if(u==='admin') return; // admin nie inaktiv
		const row = (globalSource.users||[]).find(x=> x.user===u);
		const prof = row?.profile;
		if(!prof) return;

		const isActive = (prof.active !== false);
		prof.active = !isActive; // ✅ sauber toggeln

		PS.storage.saveAdminUserProfile({ userId: row.userId, username: u, profile: prof })
		  .then(async ()=>{ await loadGlobalAdminData(); renderUsers(); })
		  .catch(()=>{});
	  });
	});

    usersBody.querySelectorAll('[data-del]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const u = btn.getAttribute('data-del');
        if(u==='admin') return;
        alert('Löschen ist im globalen Admin-Modell noch nicht aktiviert.');
      });
    });
  }
})();
