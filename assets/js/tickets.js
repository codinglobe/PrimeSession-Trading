// assets/js/tickets.js (KOMPLETT ERSETZEN)
(function(){
  const ctx = PS.common.init();
  if(!PS.common.requireAuth(ctx)) return;

  // pure admin -> admin tickets (nicht user)
  if(PS.common.isPureAdmin(ctx)){
    location.href = './admin.html#tickets';
    return;
  }

  const p = ctx.profile;
  p.tickets = p.tickets || [];

  const listEl = document.getElementById('ticketList');
  const detailEl = document.getElementById('ticketDetail');
  const statusFilter = document.getElementById('ticketStatusFilter');

  const newBox = document.getElementById('newTicketBox');
  const toggleNew = document.getElementById('toggleNew');
  const cancelNew = document.getElementById('cancelNew');
  const createBtn = document.getElementById('createTicket');
  const newOut = document.getElementById('newOut');

  const newTitle = document.getElementById('newTitle');
  const newMsg = document.getElementById('newMsg');
  const newFile = document.getElementById('newFile');

  let activeId = null;

  toggleNew.addEventListener('click', ()=> newBox.classList.toggle('hidden'));
  cancelNew.addEventListener('click', ()=>{
    newBox.classList.add('hidden');
    newTitle.value=''; newMsg.value=''; newFile.value='';
    newOut.textContent='';
  });

  statusFilter.addEventListener('change', render);

  createBtn.addEventListener('click', async ()=>{
    newOut.textContent = '';
    const title = (newTitle.value||'').trim();
    const text = (newMsg.value||'').trim();
    if(!title) return (newOut.textContent='Titel fehlt.');
    if(!text) return (newOut.textContent='Nachricht fehlt.');

    const type = document.querySelector('input[name="ntype"]:checked')?.value || 'wish';

    let attachments = [];
    const file = newFile.files?.[0];
    if(file){
      // simple size guard (localStorage)
      if(file.size > 1_500_000){
        return (newOut.textContent='Datei zu groß (max ~1.5MB).');
      }
      const dataUrl = await readAsDataURL(file);
      attachments.push({ name:file.name, type:file.type, dataUrl });
    }

    const now = new Date().toISOString();
    const tk = {
      id:'tk_'+Date.now()+'_'+Math.random().toString(16).slice(2),
      title,
      type,
      status:'open',
      createdAt:now,
      updatedAt:now,
      messages:[{ id:'m_'+Date.now(), from:'user', text, createdAt:now, attachments }]
    };

    p.tickets.unshift(tk);
    PS.storage.save(ctx.data);

    activeId = tk.id;
    newTitle.value=''; newMsg.value=''; newFile.value='';
    newBox.classList.add('hidden');
    render();
  });

  render();

  function render(){
    const f = statusFilter.value;
    const tickets = (p.tickets||[])
      .slice()
      .sort((a,b)=> (b.updatedAt||'').localeCompare(a.updatedAt||''))
      .filter(tk => (f==='ALL') ? true : tk.status===f);

    if(!tickets.length){
      listEl.textContent = 'Keine Tickets.';
      detailEl.textContent = '—';
      return;
    }

    listEl.innerHTML = tickets.map(tk=>{
      const active = tk.id===activeId ? 'ticket-item active' : 'ticket-item';
      return `
        <div class="${active}" data-id="${tk.id}">
          <strong>${PS.common.esc(tk.title)}</strong>
          <div class="ticket-meta">
            <span class="badge2">${PS.common.esc(tk.type)}</span>
            <span class="badge2">${PS.common.esc(tk.status)}</span>
            <span class="badge2">${PS.common.esc(PS.utils.toLocaleCH(tk.updatedAt))}</span>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('[data-id]').forEach(x=>{
      x.addEventListener('click', ()=>{
        activeId = x.getAttribute('data-id');
        render();
      });
    });

    const active = tickets.find(x=>x.id===activeId) || tickets[0];
    activeId = active.id;
    renderDetail(active);
  }

  function renderDetail(tk){
    const msgs = (tk.messages||[]).map(m=>{
      const cls = m.from==='admin' ? 'admin' : 'user';
      const attach = (m.attachments||[]).map(a=>{
        return `<a href="${a.dataUrl}" download="${PS.common.esc(a.name)}">📎 ${PS.common.esc(a.name)}</a>`;
      }).join(' ');
      return `
        <div class="msg ${cls}">
          <div class="msg-head">
            <span>${m.from==='admin' ? 'Admin' : 'Du'}</span>
            <span>${PS.common.esc(PS.utils.toLocaleCH(m.createdAt))}</span>
          </div>
          <div>${PS.common.esc(m.text||'')}</div>
          ${attach ? `<div class="attach">${attach}</div>` : ''}
        </div>
      `;
    }).join('');

    detailEl.innerHTML = `
      <div class="inline">
        <strong>${PS.common.esc(tk.title)}</strong>
        <span class="badge2">${PS.common.esc(tk.status)}</span>
        <span class="badge2">${PS.common.esc(tk.type)}</span>
      </div>

      <div class="chat-box" style="margin-top:.75rem">${msgs}</div>

      <div class="reply">
        <textarea id="replyText" rows="3" placeholder="Antwort schreiben..."></textarea>
        <div class="inline" style="justify-content:space-between; margin-top:.5rem">
          <input id="replyFile" type="file" accept="image/*,.pdf" />
          <button class="btn small primary" id="sendReply">Senden</button>
        </div>
        <div class="small muted" id="replyOut"></div>
      </div>
    `;

    document.getElementById('sendReply').addEventListener('click', async ()=>{
      const out = document.getElementById('replyOut');
      out.textContent = '';

      const text = document.getElementById('replyText').value.trim();
      if(!text) return (out.textContent='Text nötig.');

      let attachments = [];
      const file = document.getElementById('replyFile').files?.[0];
      if(file){
        if(file.size > 1_500_000) return (out.textContent='Datei zu groß (max ~1.5MB).');
        const dataUrl = await readAsDataURL(file);
        attachments.push({ name:file.name, type:file.type, dataUrl });
      }

      const now = new Date().toISOString();
      tk.messages.push({ id:'m_'+Date.now(), from:'user', text, createdAt:now, attachments });
      tk.updatedAt = now;

      // wenn erledigt/abgelehnt, beim Antworten wieder öffnen
      if(tk.status==='done' || tk.status==='rejected') tk.status='open';

      PS.storage.save(ctx.data);
      render();
    });
  }

  function readAsDataURL(file){
    return new Promise((resolve,reject)=>{
      const fr = new FileReader();
      fr.onload = ()=> resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }
})();