// assets/js/journal.js (KOMPLETT ERSETZEN)
(function(){
  const ctx = PS.common.init();
  if(!PS.common.requireAuth(ctx)) return;
  if(PS.common.isPureAdmin(ctx)){ location.href='./admin.html#dash'; return; }

  const p = ctx.profile;
  p.journalTrades = p.journalTrades || [];
  const trades = p.journalTrades;

  const headEl = document.getElementById('journalHead');
  const bodyEl = document.getElementById('journalBody');
  const emptyEl = document.getElementById('journalEmpty');
  const sumEl = document.getElementById('journalSummary');

  const filterState = { symbol:new Set(), timeframe:new Set(), status:new Set(), direction:new Set() };
  const openDetails = new Set();
  let outsideCloseBound = false;

  // open a specific trade once (from calculator "Journal" button)
  ctx.data.ui = ctx.data.ui || {};
  const openOnce = ctx.data.ui.journalOpenTradeId || '';
  if(openOnce){
    openDetails.add(openOnce);
    ctx.data.ui.journalOpenTradeId = '';
    PS.storage.save(ctx.data);
  }

  normalize();
  render();

  function getPrec(sym){ return PS.common.precision[sym] || {price:2, qty:3}; }
  function qStep(sym){ return Math.pow(10, -(getPrec(sym).qty||0)); }
  function rQty(sym,n){ return PS.utils.roundTo(Number(n||0), getPrec(sym).qty); }
  function fmtUSDT8(n){ return PS.common.fmtUSDT8(n); }
  function uniq(arr){ return Array.from(new Set(arr.filter(Boolean))); }
  function esc(s){ return PS.common.esc(s); }

  function statusLabel(s){
    s = String(s||'');
    if(s === 'open') return 'Offen';
    if(s === 'closed_sl') return 'Closed – Stop Loss';
    if(s === 'closed_breakeven') return 'Closed – Break-even';
    if(s === 'closed_manuell') return 'Closed – Manuell';
    if(s === 'closed_runner') return 'Closed – Runner';
    const m = s.match(/^closed_tp(\d+)$/);
    if(m) return `Closed – TP${m[1]}`;
    if(s === 'closed_full') return 'Closed – Full Close';
    return s.replaceAll('_',' ');
  }

  function getSlots(t){
    const s = t.tpScheme || PS.storage.defaultTpScheme();
    const n = Number(s.tpCount||4);
    const slots=[];
    for(let i=1;i<=n;i++) slots.push(`TP${i}`);
    if(Number(s.runnerPercent||0)>0) slots.push('RUNNER');
    return slots;
  }

  function tpQtyMapAll(t){
    const s = t.tpScheme || PS.storage.defaultTpScheme();
    const baseQty = Number(t.entryQty||0) || 0;
    const map = {};
    if(baseQty<=0) return map;

    const n = Number(s.tpCount||4);
    const tpPerc = (s.tpPercents||[]).slice(0,n).map(x=>Number(x||0));
    const runPerc = Number(s.runnerPercent||0);

    const items = [];
    for(let i=1;i<=n;i++) items.push({slot:`TP${i}`, pct: tpPerc[i-1]||0});
    if(runPerc>0) items.push({slot:'RUNNER', pct: runPerc});

    const sumPct = items.reduce((a,b)=>a+b.pct,0);
    if(sumPct<=0) return map;

    const pmap = getPrec(t.symbol);
    const step = Math.pow(10, -(pmap.qty||0));

    let sumQ=0;
    for(const it of items){
      const q = rQty(t.symbol, baseQty*(it.pct/sumPct));
      map[it.slot]=q;
      sumQ += q;
    }
    let diff = rQty(t.symbol, baseQty - sumQ);
    let iter=0;
    while(Math.abs(diff) >= step-1e-12 && iter < 20000){
      const it = items[iter % items.length];
      map[it.slot] = rQty(t.symbol, map[it.slot] + (diff>0 ? step : -step));
      diff = rQty(t.symbol, diff + (diff>0 ? -step : step));
      iter++;
    }
    return map;
  }

  function computeRiskAmount(t){
    return Math.abs((Number(t.avgEntry||0) - Number(t.sl||0)) * (Number(t.entryQty||0)));
  }

  function eventPnlGross(t, e){
    if(e.pnlGross !== null && e.pnlGross !== undefined && String(e.pnlGross).trim() !== ''){
      const m = Number(e.pnlGross);
      if(Number.isFinite(m)) return m;
    }
    const price = (e.price==null || String(e.price).trim()==='') ? null : Number(e.price);
    if(price==null || !Number.isFinite(price)) return 0;
    const avg = Number(t.avgEntry||0) || 0;
    const q = Number(e.qty||0) || 0;
    const isLong = String(t.direction||'LONG').toUpperCase()==='LONG';
    return isLong ? ((price-avg)*q) : ((avg-price)*q);
  }

  function computeDerived(t){
    let realizedQty=0, exitFees=0, pnlGross=0;
    let wsumClose=0, wqty=0;

    for(const e of (t.exits||[])){
      const q = Number(e.qty||0);
      if(q<=0) continue;
      realizedQty += q;
      exitFees += Number(e.fee||0) || 0;
      pnlGross += eventPnlGross(t,e);

      const price = (e.price==null || String(e.price).trim()==='') ? null : Number(e.price);
      if(price!=null && Number.isFinite(price)){
        wsumClose += price*q; wqty += q;
      }
    }

    t.realizedQty = realizedQty;
    t.avgClose = wqty>0 ? (wsumClose/wqty) : 0;

    t.fees = (Number(t.entryFees||0)||0) + exitFees;
    t.realizedPnlGross = pnlGross;
    t.realizedPnlNet = pnlGross - t.fees;

    t.qtyOpen = Math.max(0, (Number(t.entryQty||0) - realizedQty));

    t.riskAmount = computeRiskAmount(t);
    t.rMultiple = (t.riskAmount>0) ? (t.realizedPnlNet / t.riskAmount) : 0;
  }

  function lastExitTimeISO(t){
    const list = (t.exits||[]).filter(e => (Number(e.qty)||0)>0 && e.time);
    if(!list.length) return '';
    let max = 0;
    for(const e of list){
      const ts = new Date(e.time).getTime();
      if(Number.isFinite(ts) && ts>max) max = ts;
    }
    return max ? new Date(max).toISOString() : '';
  }

  function autoStatusAndExitTime(t){
    const total = Number(t.entryQty||0);
    if(!total){ t.status='open'; t.fullExitTime=''; return; }

    const closed = (Number(t.qtyOpen||0) <= Math.max(1e-9, total*0.0001));
    if(!closed){
      t.status='open';
      t.fullExitTime='';
      return;
    }

    const last = lastExitTimeISO(t);
    if(last) t.fullExitTime = last;

    const sorted = (t.exits||[]).slice().filter(e=> (Number(e.qty)||0)>0 && e.time)
      .sort((a,b)=> new Date(a.time)-new Date(b.time));
    const lastE = sorted[sorted.length-1];
    const lastSlot = lastE?.slot || '';

    if(lastSlot === 'SL'){ t.status='closed_sl'; return; }

    const tpEvents = sorted.filter(e => /^TP\d+$/.test(String(e.slot||'')));
    if(tpEvents.length){
      const tpLast = tpEvents[tpEvents.length-1].slot;
      const n = Number(String(tpLast).replace('TP','')) || 1;
      t.status = `closed_tp${n}`;
      return;
    }

    if(lastSlot==='RUNNER'){ t.status='closed_runner'; return; }
    if(lastSlot==='BE'){ t.status='closed_breakeven'; return; }
    if(lastSlot==='FULL'){ t.status='closed_full'; return; }
    t.status='closed_manuell';
  }

  function bookedQtyPerSlot(t, slot){
    let s=0;
    for(const e of (t.exits||[])){
      if(e.slot!==slot) continue;
      s += Number(e.qty||0);
    }
    return rQty(t.symbol, s);
  }

  function remainingForSlot(t, slot){
    const step = qStep(t.symbol);
    if(/^TP\d+$/.test(slot) || slot==='RUNNER'){
      const planned = tpQtyMapAll(t);
      const pQty = Number(planned?.[slot]||0);
      const bQty = Number(bookedQtyPerSlot(t, slot)||0);
      const rem = rQty(t.symbol, Math.max(0, pQty - bQty));
      return rem >= step-1e-12 ? rem : 0;
    }
    return rQty(t.symbol, Number(t.qtyOpen||0));
  }

  function normalize(){
    for(const t of trades){
      t.id = t.id || ('j_'+Date.now()+'_'+Math.random().toString(16).slice(2));
      t.title = t.title || '(ohne ID)';
      t.symbol = (t.symbol || 'BTCUSDT').toUpperCase();
      t.timeframe = t.timeframe || '30m';
      t.direction = (t.direction || 'LONG').toUpperCase();

      t.tpScheme = t.tpScheme || PS.storage.defaultTpScheme();
      t.tpTargets = t.tpTargets || {};
      t.exits = t.exits || [];

      t.entryQty = Number(t.entryQty||0)||0;
      t.avgEntry = Number(t.avgEntry||0)||0;
      t.sl = Number(t.sl||0)||0;
      t.entryFees = Number(t.entryFees||0)||0;

      t.openTime = t.openTime || '';
      t.fullExitTime = t.fullExitTime || '';
      t.status = t.status || 'open';
      t.ui = t.ui || { selectedSlot: '' };

      computeDerived(t);
      autoStatusAndExitTime(t);
    }
    PS.storage.save(ctx.data);
  }

  function avgR(){
    const rs = trades.map(t=>Number(t.rMultiple||0)).filter(x=>Number.isFinite(x));
    if(!rs.length) return '—';
    return PS.utils.formatCHNumber(rs.reduce((a,b)=>a+b,0)/rs.length, 2);
  }

  function render(){
    const pnlGross = trades.reduce((s,t)=> s+Number(t.realizedPnlGross||0), 0);
    const fees = trades.reduce((s,t)=> s+Number(t.fees||0), 0);
    const pnlNet = pnlGross - fees;
    const closed = trades.filter(t=>(t.status||'').startsWith('closed')).length;

    sumEl.innerHTML = `
      <div class="kpi-bar">
        <span class="pill"><strong>Trades</strong> ${trades.length}</span>
        <span class="pill"><strong>Closed</strong> ${closed}</span>
        <span class="pill"><strong>GuV brutto</strong> ${fmtUSDT8(pnlGross)}</span>
        <span class="pill"><strong>Fees</strong> ${fmtUSDT8(fees)}</span>
        <span class="pill"><strong>GuV net</strong> ${fmtUSDT8(pnlNet)}</span>
        <span class="pill"><strong>R (avg)</strong> ${esc(avgR())}</span>
      </div>
    `;

    if(!trades.length){
      emptyEl.textContent = 'Noch keine Trades im Journal.';
      headEl.innerHTML = '';
      bodyEl.innerHTML = '';
      return;
    }
    emptyEl.textContent = '';

    const symbols = uniq(trades.map(t=>t.symbol)).sort();
    const tfs = uniq(trades.map(t=>t.timeframe)).sort();
    const dirs = uniq(trades.map(t=>t.direction)).sort();
    const sts = uniq(trades.map(t=>t.status)).sort();

    const maxTp = Math.max(...trades.map(t=> Number(t.tpScheme?.tpCount||4)));
    const hasRunner = trades.some(t=> Number(t.tpScheme?.runnerPercent||0) > 0);

    headEl.innerHTML = `
      <tr>
        <th>ID</th>
        ${thFilter('Symbol','symbol',symbols)}
        ${thFilter('TF','timeframe',tfs)}
        ${thFilter('Status','status',sts, true)}
        ${thFilter('Dir','direction',dirs)}
        <th>Qty</th>
        <th>Qty Open</th>
        <th>Avg</th>
        <th>SL</th>
        ${tpHeads(maxTp, hasRunner)}
        <th>R</th>
        <th>GuV net</th>
        <th>Fees</th>
        <th>Open Time</th>
        <th>Full Exit</th>
        <th>Aktion</th>
      </tr>
    `;

    bindFilterUI();
    renderRows(maxTp, hasRunner);
  }

  function tpHeads(maxTp, hasRunner){
    let h='';
    for(let i=1;i<=maxTp;i++) h += `<th>TP${i}</th>`;
    if(hasRunner) h += `<th>Runner</th>`;
    return h;
  }

  function thFilter(title, key, values, isStatus=false){
    return `
      <th>
        <div class="thcell">
          <span class="thtitle">${esc(title)}</span>
          <div class="thfilter-wrap" data-key="${esc(key)}">
            <button class="filter-btn" type="button" aria-label="Filter" data-btn="${esc(key)}"></button>
            ${renderFilterPopup(key, values, isStatus)}
          </div>
        </div>
      </th>
    `;
  }

  function renderFilterPopup(key, values, isStatus){
    const set = filterState[key];
    const isAll = set.size===0;
    let html = `
      <div class="filter-pop" data-pop="${esc(key)}">
        <div class="pop-head">
          <div class="pop-title">${esc(key.toUpperCase())}</div>
          <button class="btn small link" type="button" data-clear="${esc(key)}">Clear</button>
        </div>
        <label><input type="checkbox" data-fkey="${esc(key)}" data-v="__ALL__" ${isAll?'checked':''}> ALL</label>
    `;
    for(const v of values){
      const checked = (!isAll && set.has(v)) ? 'checked' : '';
      const labelText = isStatus ? statusLabel(v) : v;
      html += `<label><input type="checkbox" data-fkey="${esc(key)}" data-v="${esc(v)}" ${checked}> ${esc(labelText)}</label>`;
    }
    html += `</div>`;
    return html;
  }

  function closeAllFilterPops(){
    headEl.querySelectorAll('.thfilter-wrap.open').forEach(w=>w.classList.remove('open'));
  }

  function bindFilterUI(){
    headEl.querySelectorAll('.filter-btn').forEach(btn=>{
      const wrap = btn.closest('.thfilter-wrap');
      const key = btn.getAttribute('data-btn');

      btn.classList.toggle('active', filterState[key].size>0);

      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        headEl.querySelectorAll('.thfilter-wrap.open').forEach(w=>{ if(w!==wrap) w.classList.remove('open'); });
        wrap.classList.toggle('open');

        if(wrap.classList.contains('open')){
          const pop = wrap.querySelector('.filter-pop');
          if(pop){
            pop.style.setProperty('--shift','0px');
            const rect = pop.getBoundingClientRect();
            const overflow = rect.right - (window.innerWidth - 8);
            if(overflow > 0) pop.style.setProperty('--shift', `${-overflow}px`);
          }
        }
      });
    });

    headEl.querySelectorAll('[data-clear]').forEach(b=>{
      b.addEventListener('click', (e)=>{
        e.stopPropagation();
        const key = b.getAttribute('data-clear');
        filterState[key].clear();
        render();
      });
    });

    headEl.querySelectorAll('input[type="checkbox"][data-fkey]').forEach(cb=>{
      cb.addEventListener('change', (e)=>{
        e.stopPropagation();
        const key = cb.getAttribute('data-fkey');
        const val = cb.getAttribute('data-v');
        const set = filterState[key];

        if(val==='__ALL__'){ set.clear(); render(); return; }

        const allCb = headEl.querySelector(`input[data-fkey="${CSS.escape(key)}"][data-v="__ALL__"]`);
        if(allCb) allCb.checked = false;

        if(cb.checked) set.add(val);
        else set.delete(val);

        render();
      });
    });

    if(!outsideCloseBound){
      outsideCloseBound = true;
      document.addEventListener('click', ()=> closeAllFilterPops());
      window.addEventListener('scroll', ()=> closeAllFilterPops(), { passive:true });
      window.addEventListener('resize', ()=> closeAllFilterPops());
    }
  }

  function passesFilter(key, value){
    const set = filterState[key];
    if(set.size===0) return true;
    return set.has(value);
  }

  function tpCell(t, slot, pmap){
    const planned = tpQtyMapAll(t);
    const pQty = Number(planned?.[slot]||0);
    if(pQty<=0) return `<div class="tp-cell"><div class="tp-price">—</div><div class="tp-qty">—</div></div>`;

    const booked = Number(bookedQtyPerSlot(t, slot)||0);
    const step = qStep(t.symbol);
    const hit = booked >= (pQty - step);

    if(hit){
      return `<div class="tp-cell hit"><div class="tp-price">✓</div><div class="tp-qty"></div></div>`;
    }

    const price = Number(t.tpTargets?.[slot]||0);
    const priceTxt = price>0 ? PS.utils.formatCHNumber(price,pmap.price) : '—';
    const qtyTxt   = PS.utils.formatCHNumber(pQty,pmap.qty);
    return `<div class="tp-cell"><div class="tp-price">${priceTxt}</div><div class="tp-qty">${qtyTxt}</div></div>`;
  }

  function renderRows(maxTp, hasRunner){
    const rows = trades.filter(t=>{
      if(!passesFilter('symbol', t.symbol)) return false;
      if(!passesFilter('timeframe', t.timeframe)) return false;
      if(!passesFilter('status', t.status)) return false;
      if(!passesFilter('direction', t.direction)) return false;
      return true;
    }).sort((a,b)=> (b.openTime||'').localeCompare(a.openTime||''));

    bodyEl.innerHTML = rows.map(t=>{
      const pmap = getPrec(t.symbol);

      let tpCells='';
      for(let i=1;i<=maxTp;i++) tpCells += `<td>${tpCell(t, `TP${i}`, pmap)}</td>`;
      if(hasRunner) tpCells += `<td>${tpCell(t, 'RUNNER', pmap)}</td>`;

      const r = Number(t.rMultiple||0);

      const slBooked = bookedQtyPerSlot(t,'SL') > 0;
      const slTxt = slBooked ? '✕' : (t.sl ? PS.utils.formatCHNumber(t.sl,pmap.price) : '—');

      const isOpen = openDetails.has(t.id);

      return `
        <tr>
          <td>${esc(t.title)}</td>
          <td>${esc(t.symbol)}</td>
          <td>${esc(t.timeframe)}</td>
          <td>${esc(statusLabel(t.status))}</td>
          <td>${PS.common.dirHtml(t.direction)}</td>
          <td>${PS.utils.formatCHNumber(t.entryQty, pmap.qty)}</td>
          <td>${PS.utils.formatCHNumber(t.qtyOpen, pmap.qty)}</td>
          <td>${t.avgEntry?PS.utils.formatCHNumber(t.avgEntry, pmap.price):'—'}</td>
          <td>${slTxt}</td>
          ${tpCells}
          <td>${PS.utils.formatCHNumber(r, 2)}</td>
          <td>${fmtUSDT8(t.realizedPnlNet||0)}</td>
          <td>${fmtUSDT8(t.fees||0)}</td>
          <td>${esc(PS.utils.toLocaleCH(t.openTime))}</td>
          <td>${esc(PS.utils.toLocaleCH(t.fullExitTime))}</td>
          <td><button class="btn small" data-open="${t.id}">${isOpen?'Schliessen':'Details'}</button></td>
        </tr>

        <tr class="details-row ${isOpen?'':'hidden'}" id="d_${t.id}">
          <td colspan="${17 + maxTp + (hasRunner?1:0)}">
            ${detailsHtml(t)}
          </td>
        </tr>
      `;
    }).join('');

    bodyEl.querySelectorAll('[data-open]').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        closeAllFilterPops();
        const id = btn.getAttribute('data-open');
        if(openDetails.has(id)) openDetails.delete(id); else openDetails.add(id);
        render();
      });
    });

    rows.forEach(t=>{
      const row = document.getElementById(`d_${t.id}`);
      if(row) bindDetails(t,row);
    });

    PS.utils.normalizeNumericInputs(document);
  }

  function detailsHtml(t){
    const pmap = getPrec(t.symbol);
    const slots = getSlots(t);
    const allSlots = [...slots, 'SL','BE','FULL','MANUAL'];

    if(!t.ui) t.ui = { selectedSlot: '' };
    if(!t.ui.selectedSlot || !allSlots.includes(t.ui.selectedSlot)){
      let pick = allSlots.find(s=> remainingForSlot(t,s) > 0);
      t.ui.selectedSlot = pick || allSlots[0];
    }

    const tpInputs = slots.map(s=>{
      const val = Number(t.tpTargets?.[s]||0);
      return `
        <div class="input-group">
          <label>${esc(s)}</label>
          <input data-tp="${esc(s)}" value="${val>0 ? PS.utils.formatCHNumber(val,pmap.price) : ''}" placeholder="Preis">
        </div>
      `;
    }).join('');

    const slotOptions = allSlots.map(s=>{
      const lbl = (s==='BE')?'BREAKEVEN':s;
      return `<option value="${s}" ${s===t.ui.selectedSlot?'selected':''}>${lbl}</option>`;
    }).join('');

    return `
      <div class="details">
        <div class="tp-edit">
          <div class="inline" style="justify-content:space-between;align-items:center">
            <strong>TP Targets (Auto-Save)</strong>
            <span class="small muted">Änderung = gespeichert</span>
          </div>
          <div class="tp-grid">${tpInputs}</div>
        </div>

        <div class="exit-editor">
          <div class="exit-head">
            <div class="left">
              <strong>Exit Eingabe</strong>
              <span class="pill">Trade Remaining ${PS.utils.formatCHNumber(Number(t.qtyOpen||0), pmap.qty)}</span>
            </div>
            <div class="right">
              <label class="small">Slot</label>
              <select data-slot-select>${slotOptions}</select>
            </div>
          </div>

          <div class="exit-table-wrap" data-exit-wrap></div>
        </div>
      </div>
    `;
  }

  function bindDetails(t, row){
    const box = row.querySelector('.details');

    // TP autosave
    const slots = getSlots(t);
    for(const s of slots){
      const inp = box.querySelector(`[data-tp="${CSS.escape(s)}"]`);
      if(!inp) continue;
      inp.addEventListener('change', ()=>{
        t.tpTargets = t.tpTargets || {};
        const v = PS.utils.parseCHNumber(inp.value);
        if(v>0) t.tpTargets[s]=v; else delete t.tpTargets[s];
        PS.storage.save(ctx.data);
        openDetails.add(t.id);
        render();
      });
    }

    const slotSel = box.querySelector('[data-slot-select]');
    const wrap = box.querySelector('[data-exit-wrap]');

    const rebuild = ()=>{
      t.ui.selectedSlot = slotSel.value;
      PS.storage.save(ctx.data);
      renderExitTable(t, wrap, t.ui.selectedSlot);
    };

    slotSel.addEventListener('change', rebuild);
    renderExitTable(t, wrap, t.ui.selectedSlot);

    PS.utils.normalizeNumericInputs(row);
  }

  function renderExitTable(t, wrap, slot){
    const pmap = getPrec(t.symbol);
    const step = qStep(t.symbol);

    const rows = (t.exits||[]).filter(e=>e.slot===slot).slice().sort((a,b)=>new Date(a.time)-new Date(b.time));
    const rem = remainingForSlot(t, slot);

    const defPrice = ()=>{
      if(/^TP\d+$/.test(slot) || slot==='RUNNER'){
        const tp = Number(t.tpTargets?.[slot]||0);
        return tp>0 ? PS.utils.formatCHNumber(tp,pmap.price) : '';
      }
      if(slot==='SL') return t.sl ? PS.utils.formatCHNumber(t.sl,pmap.price) : '';
      if(slot==='BE') return t.avgEntry ? PS.utils.formatCHNumber(t.avgEntry,pmap.price) : '';
      return '';
    };

    wrap.innerHTML = `
      <div class="exit-table">
        <div class="thead">
          <div>Time</div><div>Price</div><div>Qty</div><div>Fee</div><div>GuV gross</div><div></div>
        </div>

        ${rows.map(e=>`
          <div class="trow" data-eid="${e.id}">
            <input data-time type="datetime-local" step="1" value="${isoToDtLocal(e.time)}">
            <input data-price type="text" value="${e.price==null?'':PS.utils.formatCHNumber(e.price,pmap.price)}" placeholder="Preis">
            <input data-qty type="text" value="${PS.utils.formatCHNumber(e.qty,pmap.qty)}" placeholder="Menge">
            <input data-fee type="text" value="${PS.utils.formatCHNumber(e.fee||0,8)}" placeholder="Fee">
            <input data-pnl type="text" value="${(e.pnlGross===''||e.pnlGross==null)?'':PS.utils.formatCHNumber(Number(e.pnlGross),8)}" placeholder="optional">
            <button class="btn small danger" data-del>✕</button>
          </div>
        `).join('')}

        ${rem>0 ? `
          <div class="trow new" data-new>
            <input data-time type="datetime-local" step="1" value="${PS.utils.nowLocalISOSeconds()}">
            <input data-price type="text" value="${defPrice()}" placeholder="Preis">
            <input data-qty type="text" value="${PS.utils.formatCHNumber(rem,pmap.qty)}" placeholder="Menge (Rest)">
            <input data-fee type="text" value="${PS.utils.formatCHNumber(0,8)}" placeholder="Fee">
            <input data-pnl type="text" value="" placeholder="optional">
            <div class="hint">Auto</div>
          </div>
        ` : `<div class="done">✅ Rest ist 0 – Slot vollständig gebucht.</div>`}
      </div>
    `;

    // existing rows autosave
    wrap.querySelectorAll('[data-eid]').forEach(r=>{
      const eid = r.getAttribute('data-eid');
      const e = (t.exits||[]).find(x=>x.id===eid);
      if(!e) return;

      const ipT = r.querySelector('[data-time]');
      const ipP = r.querySelector('[data-price]');
      const ipQ = r.querySelector('[data-qty]');
      const ipF = r.querySelector('[data-fee]');
      const ipN = r.querySelector('[data-pnl]');
      const del = r.querySelector('[data-del]');

      const apply = ()=>{
        e.time = fromDtLocal(ipT.value) || e.time || new Date().toISOString();
        e.price = (ipP.value||'').trim()==='' ? null : PS.utils.parseCHNumber(ipP.value);
        e.qty = PS.utils.roundTo(PS.utils.parseCHNumber(ipQ.value), pmap.qty);
        e.fee = PS.utils.parseCHNumber(ipF.value) || 0;
        e.pnlGross = (ipN.value||'').trim()==='' ? '' : PS.utils.parseCHNumber(ipN.value);

        if(e.qty <= 0) t.exits = (t.exits||[]).filter(x=>x.id!==eid);

        computeDerived(t);
        autoStatusAndExitTime(t);
        PS.storage.save(ctx.data);
        openDetails.add(t.id);
        render();
      };

      [ipT,ipP,ipQ,ipF,ipN].forEach(inp=> inp.addEventListener('change', apply));
      del.addEventListener('click', ()=>{
        t.exits = (t.exits||[]).filter(x=>x.id!==eid);
        computeDerived(t);
        autoStatusAndExitTime(t);
        PS.storage.save(ctx.data);
        openDetails.add(t.id);
        render();
      });
    });

    // new row: commit on fee (or Enter) -> avoids Tab jump Qty->Fee
    const newRow = wrap.querySelector('[data-new]');
    if(newRow){
      const ipT = newRow.querySelector('[data-time]');
      const ipP = newRow.querySelector('[data-price]');
      const ipQ = newRow.querySelector('[data-qty]');
      const ipF = newRow.querySelector('[data-fee]');
      const ipN = newRow.querySelector('[data-pnl]');

      const commit = ()=>{
        let remNow = remainingForSlot(t, slot);
        if(remNow <= 0) return;

        let qty = PS.utils.roundTo(PS.utils.parseCHNumber(ipQ.value), pmap.qty);
        if(!qty || qty<=0) return;
        if(qty > remNow) qty = remNow;
        if(qty < step-1e-12) return;

        const time = fromDtLocal(ipT.value) || new Date().toISOString();
        const price = (ipP.value||'').trim()==='' ? null : PS.utils.parseCHNumber(ipP.value);
        const fee = PS.utils.parseCHNumber(ipF.value) || 0;
        const pnl = (ipN.value||'').trim()==='' ? '' : PS.utils.parseCHNumber(ipN.value);

        t.exits.push({ id:'e_'+Date.now()+'_'+Math.random().toString(16).slice(2), slot, time, qty, price, fee, pnlGross:pnl });

        computeDerived(t);
        autoStatusAndExitTime(t);
        PS.storage.save(ctx.data);

        openDetails.add(t.id);
        render();
      };

      // Enter commits
      [ipT,ipP,ipQ,ipF,ipN].forEach(inp=>{
        inp?.addEventListener('keydown', (e)=>{
          if(e.key==='Enter'){
            e.preventDefault();
            commit();
          }
        });
      });

      // Fee change commits (auto)
      ipF.addEventListener('change', commit);
      // optional: pnl change also commits if user uses it as last field
      ipN.addEventListener('change', commit);
    }

    PS.utils.normalizeNumericInputs(wrap);
  }

  function fromDtLocal(v){
    if(!v) return '';
    const d=new Date(v);
    if(String(d)==='Invalid Date') return '';
    return d.toISOString();
  }
  function isoToDtLocal(iso){
    if(!iso) return '';
    const d=new Date(iso);
    if(String(d)==='Invalid Date') return '';
    const pad=(n)=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
})();