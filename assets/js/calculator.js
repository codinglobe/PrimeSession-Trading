// assets/js/calculator.js (KOMPLETT ERSETZEN)
(function(){
  const ctx = PS.common.init();
  if(!PS.common.requireAuth(ctx)) return;
  if(PS.common.isPureAdmin(ctx)){ location.href='./admin.html#dash'; return; }

  const p = ctx.profile;
  p.calculatorTrades = p.calculatorTrades || [];
  p.journalTrades = p.journalTrades || [];

  const PREC = PS.common.precision;

  const pickEl = (...ids)=>{
    for(const id of ids){
      const el = document.getElementById(id);
      if(el) return el;
    }
    return null;
  };

  const els = {
    symbol: pickEl('symbol','coinPair'),
    timeframe: pickEl('timeframe'),
    title: pickEl('title','tradeTitle'),
    setupTime: pickEl('setupTime'),
    balance: pickEl('balance'),
    leverage: pickEl('leverage'),
    stopLoss: pickEl('stopLoss'),

    lower: pickEl('lowerPrice'),
    upper: pickEl('upperPrice'),

    modeScaledBtn: pickEl('modeScaledBtn'),
    modeSingleBtn: pickEl('modeSingleBtn'),
    entryModeSel: pickEl('entryMode','entryModeSelect'),

    singleWrap: pickEl('singleWrap'),
    zoneWrap: pickEl('zoneWrap'),
    singleEntryPrice: pickEl('singleEntryPrice'),

    orderCount: pickEl('orderCount'),
    orderCountGroup: pickEl('orderCountGroup'),
    scaleButtons: pickEl('scaleButtons'),

    chartRow: pickEl('chartRow'),
    chartLink: pickEl('chartLink'),

    results: pickEl('results'),
    ordersBox: pickEl('ordersBox'),
    ordersBody: pickEl('ordersBody'),
    singleBox: pickEl('singleBox'),
    singleSummary: pickEl('singleSummary'),

    riskButtons: pickEl('riskButtons'),
    riskManualToggle: pickEl('riskManualToggle','riskManualBtn'),
    riskPercent: pickEl('riskPercent','riskManualValue'),

    saveTrade: pickEl('saveTrade'),
    calcTrades: pickEl('calcTrades'),

    hideCalcBtn: pickEl('hideCalcBtn'),
    showCalcBtn: pickEl('showCalcBtn'),
    calcPanel: pickEl('calcPanel')
  };

  const settings = p.settings || {};
  p.settings = settings;
  const state = {
    mode: (settings.defaultSingleEntry ? 'single' : 'scaled'),
    scaleMode: settings.defaultScaleMode || 'flat',
    riskManual: false,
    riskValue: settings.defaultRiskPercent ?? 0.50,

    // groups
    symOpen: new Set(),
    tfOpen: new Set(),
    _groupInit: false,

    // per trade UI
    tpOpen: new Set(),
    entriesOpen: new Set(),
    orderOpen: new Set(),

    // focus restore after render
    focusAfter: null,

    computed: null
  };

  // defaults
  if(els.leverage) els.leverage.value = String(settings.defaultLeverage ?? 10);
  if(els.orderCount) els.orderCount.value = String(settings.defaultOrders ?? 5);
  if(els.timeframe) els.timeframe.value = settings.defaultTimeframe || '30m';
  if(els.setupTime) els.setupTime.value = toDtLocalNoSeconds(new Date());
  if(els.balance){
    const savedBal = Number(settings.lastCalculatorBalance);
    if(Number.isFinite(savedBal) && savedBal>0){
      els.balance.value = PS.utils.formatCHNumber(savedBal, 2);
    }
  }
  if(els.chartRow) els.chartRow.classList.toggle('hidden', !settings.showChartLink);

  if(els.riskPercent){
    els.riskPercent.classList.add('hidden');
    els.riskPercent.value = '';
  }

  setMode(state.mode, true);
  renderRiskButtons();
  renderScaleButtons();
  calcAndRender();
  renderSaved();
  PS.utils.normalizeNumericInputs(document);

  // hide/show calc panel
  if(els.hideCalcBtn && els.showCalcBtn && els.calcPanel){
    els.hideCalcBtn.addEventListener('click', ()=>{
      els.calcPanel.classList.add('hidden');
      els.hideCalcBtn.classList.add('hidden');
      els.showCalcBtn.classList.remove('hidden');
    });
    els.showCalcBtn.addEventListener('click', ()=>{
      els.calcPanel.classList.remove('hidden');
      els.showCalcBtn.classList.add('hidden');
      els.hideCalcBtn.classList.remove('hidden');
    });
  }

  // risk manual
  els.riskManualToggle?.addEventListener('click', ()=>{
    state.riskManual = !state.riskManual;

    if(state.riskManual){
      if(els.riskPercent){
        els.riskPercent.classList.remove('hidden');
        els.riskPercent.value = PS.utils.formatCHNumber(state.riskValue, 2);
      }
      els.riskManualToggle.textContent = 'Auto';
    }else{
      if(els.riskPercent){
        els.riskPercent.classList.add('hidden');
        els.riskPercent.value = '';
      }
      state.riskValue = settings.defaultRiskPercent ?? 0.50;
      els.riskManualToggle.textContent = 'Manuell';
    }

    renderRiskButtons();
    calcAndRender();
  });

  els.riskPercent?.addEventListener('input', PS.utils.debounce(()=>{
    if(!state.riskManual) return;
    const v = PS.utils.parseCHNumber(els.riskPercent.value);
    if(v>0) state.riskValue = v;
    renderRiskButtons();
    calcAndRender();
  }, 150));

  // entry mode
  els.modeScaledBtn?.addEventListener('click', ()=> setMode('scaled'));
  els.modeSingleBtn?.addEventListener('click', ()=> setMode('single'));
  if(els.entryModeSel){
    els.entryModeSel.value = state.mode;
    els.entryModeSel.addEventListener('change', ()=> setMode(els.entryModeSel.value==='single'?'single':'scaled'));
  }

  // inputs -> calc
  const onChange = PS.utils.debounce(calcAndRender, 220);
  [els.symbol,els.timeframe,els.title,els.setupTime,els.balance,els.leverage,els.stopLoss,els.lower,els.upper,els.orderCount,els.chartLink,els.singleEntryPrice]
    .filter(Boolean).forEach(inp => inp.addEventListener('input', onChange));

  const saveBalanceInput = PS.utils.debounce(()=>{
    if(!els.balance) return;
    const raw = String(els.balance.value||'').trim();
    if(!raw){
      delete settings.lastCalculatorBalance;
      PS.storage.save(ctx.data);
      return;
    }
    const val = PS.utils.parseCHNumber(raw);
    if(Number.isFinite(val) && val>0){
      settings.lastCalculatorBalance = val;
      PS.storage.save(ctx.data);
    }
  }, 250);
  els.balance?.addEventListener('input', saveBalanceInput);

  els.saveTrade?.addEventListener('click', saveTrade);

  // ---------- helpers ----------
  function getPMap(symbol){ return PREC[symbol] || {price:2, qty:3}; }
  function stepQty(pmap){ return Math.pow(10, -(pmap.qty||0)); }
  function nowIso(){ return new Date().toISOString(); }
  function keyOrder(tradeId, oi){ return `${tradeId}|${oi}`; }
  function keySym(sym){ return `S|${sym}`; }
  function keyTF(sym,tf){ return `T|${sym}|${tf}`; }

  function setMode(mode, initial=false){
    state.mode = (mode==='single') ? 'single' : 'scaled';
    const isSingle = state.mode==='single';

    if(els.modeSingleBtn) els.modeSingleBtn.classList.toggle('primary', isSingle);
    if(els.modeScaledBtn) els.modeScaledBtn.classList.toggle('primary', !isSingle);
    if(els.entryModeSel) els.entryModeSel.value = state.mode;

    if(els.singleWrap) els.singleWrap.classList.toggle('hidden', !isSingle);
    if(els.zoneWrap) els.zoneWrap.classList.toggle('hidden', isSingle);
    if(els.orderCountGroup) els.orderCountGroup.classList.toggle('hidden', isSingle);
    if(els.ordersBox) els.ordersBox.classList.toggle('hidden', isSingle);
    if(els.singleBox) els.singleBox.classList.toggle('hidden', !isSingle);

    if(!initial){
      renderScaleButtons();
      calcAndRender();
    }
  }

  function parseInputs(){
    const symbol = els.symbol?.value || 'BTCUSDT';
    const pmap = getPMap(symbol);
    return {
      symbol, pmap,
      timeframe: els.timeframe?.value || (settings.defaultTimeframe || '30m'),
      title: (els.title?.value||'').trim(),
      setupTimeISO: dtLocalToISO(els.setupTime?.value),
      balance: PS.utils.parseCHNumber(els.balance?.value),
      leverage: Number(els.leverage?.value)||0,
      riskPercent: Number(state.riskValue)||0,
      sl: PS.utils.parseCHNumber(els.stopLoss?.value),
      lower: PS.utils.parseCHNumber(els.lower?.value),
      upper: PS.utils.parseCHNumber(els.upper?.value),
      orderCount: Math.max(3, Math.min(20, Number(els.orderCount?.value)||0)),
      chartLink: (els.chartLink?.value||'').trim(),
      singleEntryPrice: PS.utils.parseCHNumber(els.singleEntryPrice?.value)
    };
  }

  function inferDirectionFromZoneAndSL(lower, upper, sl){
    const lo = Math.min(lower, upper), hi = Math.max(lower, upper);
    if(sl < lo) return 'LONG';
    if(sl > hi) return 'SHORT';
    return (upper > sl) ? 'LONG' : 'SHORT';
  }
  function inferDirectionFromEntryAndSL(entry, sl){
    if(!entry || !sl) return 'UNKNOWN';
    return (entry > sl) ? 'LONG' : 'SHORT';
  }
  function currentDirection(){
    const i = parseInputs();
    if(state.mode==='single') return inferDirectionFromEntryAndSL(i.singleEntryPrice, i.sl);
    if(i.lower && i.upper && i.sl) return inferDirectionFromZoneAndSL(i.lower,i.upper,i.sl);
    return 'UNKNOWN';
  }

  function renderRiskButtons(){
    if(!els.riskButtons) return;
    const quick = [0.20,0.25,0.50,0.75,1.00];
    const cur = Number(state.riskValue)||0;
    els.riskButtons.innerHTML = quick.map(v =>
      `<button class="btn small ${(Math.abs(cur-v)<1e-9 && !state.riskManual)?'primary':''}" data-risk="${v}">
        ${PS.utils.formatCHNumber(v,2)}%
      </button>`
    ).join('');
    els.riskButtons.querySelectorAll('button').forEach(b=>{
      b.addEventListener('click', ()=>{
        state.riskManual = false;
        if(els.riskPercent){ els.riskPercent.classList.add('hidden'); els.riskPercent.value=''; }
        if(els.riskManualToggle) els.riskManualToggle.textContent = 'Manuell';
        state.riskValue = Number(b.dataset.risk);
        renderRiskButtons();
        calcAndRender();
      });
    });
  }

  function renderScaleButtons(){
    if(!els.scaleButtons) return;
    const dir = currentDirection();
    const recLong = (dir==='LONG');
    const recShort = (dir==='SHORT');
    const items = [
      {k:'flat', t:'Flat'},
      {k:'aufsteigend', t:`Aufsteigend${recLong?' (Empfehlung)':''}`},
      {k:'absteigend', t:`Absteigend${recShort?' (Empfehlung)':''}`}
    ];
    els.scaleButtons.innerHTML = items.map(x =>
      `<button class="btn small ${state.scaleMode===x.k?'primary':''}" data-scale="${x.k}">${x.t}</button>`
    ).join('');
    els.scaleButtons.querySelectorAll('button').forEach(b=>{
      b.addEventListener('click', ()=>{
        state.scaleMode = b.dataset.scale;
        renderScaleButtons();
        calcAndRender();
      });
    });
  }

  function buildPriceLadderDirectional(lower, upper, n, dir){
    const lo = Math.min(lower, upper), hi = Math.max(lower, upper);
    if(n<=1) return [hi];
    const step = (hi-lo)/(n-1);
    const arr=[];
    if(dir==='LONG'){ for(let i=0;i<n;i++) arr.push(hi - step*i); }
    else { for(let i=0;i<n;i++) arr.push(lo + step*i); }
    return arr;
  }

  function buildWeights(n, mode){
    const rBase=1.20, rMode=1.55;
    const base = Array.from({length:n},(_,i)=>Math.pow(rBase,(n-1-i)));
    let mod;
    if(mode==='flat') mod = Array.from({length:n},()=>1);
    else if(mode==='aufsteigend') mod = Array.from({length:n},(_,i)=>Math.pow(rMode,i));
    else mod = Array.from({length:n},(_,i)=>Math.pow(rMode,(n-1-i)));
    return base.map((b,i)=>b*mod[i]);
  }

  function quantizePercents5(weights){
    const n = weights.length;
    const minPer = 5;
    const base = Array.from({length:n}, ()=>minPer);
    let remaining = 100 - (minPer*n);
    if(remaining < 0){
      const each = Math.floor((100/n)/5)*5 || 0;
      const out = Array.from({length:n}, ()=>each);
      let diff = 100 - out.reduce((a,b)=>a+b,0);
      let i=0; while(diff>0){ out[i%n]+=5; diff-=5; i++; }
      return out;
    }
    const units = Math.round(remaining/5);
    const sumW = weights.reduce((a,b)=>a+b,0) || 1;
    const rawUnits = weights.map(w => units*(w/sumW));
    const floors = rawUnits.map(x=>Math.floor(x));
    let used = floors.reduce((a,b)=>a+b,0);
    let left = units-used;
    const rema = rawUnits.map((x,i)=>({i,r:x-floors[i]})).sort((a,b)=>b.r-a.r);
    const extra = floors.slice();
    for(let k=0;k<left;k++) extra[rema[k%rema.length].i]+=1;
    return base.map((b,i)=>b+extra[i]*5);
  }

  function allocateQtyByPercentsMin(totalQty, percents, pmap){
    const dec = pmap.qty||0;
    const step = stepQty(pmap);

    let qtys = percents.map(p => PS.utils.roundTo(totalQty*(p/100), dec));
    for(let i=0;i<qtys.length;i++) if(qtys[i] < step) qtys[i] = step;

    const sum = ()=> qtys.reduce((a,b)=>a+b,0);
    let diff = PS.utils.roundTo(totalQty - sum(), dec);

    let iter=0;
    while(Math.abs(diff) >= step-1e-12 && iter < 20000){
      let idx=0;
      for(let i=1;i<qtys.length;i++) if(qtys[i] > qtys[idx]) idx=i;

      if(diff < 0){
        if(qtys[idx]-step >= step){
          qtys[idx] = PS.utils.roundTo(qtys[idx]-step, dec);
          diff = PS.utils.roundTo(diff+step, dec);
        }else{
          let found=false;
          for(let j=0;j<qtys.length;j++){
            if(qtys[j]-step >= step){
              qtys[j]=PS.utils.roundTo(qtys[j]-step,dec);
              diff=PS.utils.roundTo(diff+step,dec);
              found=true; break;
            }
          }
          if(!found) break;
        }
      } else {
        qtys[idx] = PS.utils.roundTo(qtys[idx]+step, dec);
        diff = PS.utils.roundTo(diff-step, dec);
      }
      iter++;
    }
    return qtys;
  }

  function weightedAvgOrders(orders){
    let q=0,w=0;
    for(const o of orders){ q += Number(o.qty||0); w += Number(o.qty||0)*Number(o.price||0); }
    return q>0 ? (w/q) : 0;
  }

  function calcAndRender(){
    renderRiskButtons();
    renderScaleButtons();

    const i = parseInputs();
    const pmap = i.pmap;

    if(els.ordersBody) els.ordersBody.innerHTML = '';
    if(els.singleSummary) els.singleSummary.textContent = '';
    if(els.results) els.results.innerHTML = '';
    state.computed = null;

    if(!i.balance || !i.sl || !i.leverage || !i.riskPercent){
      renderCards({dir:'—', risk:0, qty:0, avg:0, notional:0, margin:0, hint:''});
      return;
    }

    const riskAmount = i.balance * (i.riskPercent/100);

    if(state.mode==='single'){
      const entry = i.singleEntryPrice;
      const dir = inferDirectionFromEntryAndSL(entry, i.sl);
      if(!entry){
        renderCards({dir, risk:riskAmount, qty:0, avg:0, notional:0, margin:0, hint:''});
        return;
      }
      const stopDist = Math.abs(entry - i.sl);
      const qty = stopDist>0 ? (riskAmount / stopDist) : 0;
      const notional = qty*entry;
      const margin = notional / i.leverage;

      renderCards({dir, risk:riskAmount, qty, avg:entry, notional, margin, hint:''});
      if(els.singleSummary){
        els.singleSummary.textContent =
          `Entry ${PS.utils.formatCHNumber(entry,pmap.price)} | Qty ${PS.utils.formatCHNumber(qty,pmap.qty)} | Risk ${PS.common.fmtUSDT8(riskAmount)}`;
      }
      state.computed = { ...i, direction:dir, riskAmount, entryQty:qty, avgEntry:entry, orders:[] };
      return;
    }

    if(!i.lower || !i.upper || !i.orderCount){
      const dir = inferDirectionFromZoneAndSL(i.lower,i.upper,i.sl);
      renderCards({dir, risk:riskAmount, qty:0, avg:0, notional:0, margin:0, hint:''});
      return;
    }

    const dir = inferDirectionFromZoneAndSL(i.lower,i.upper,i.sl);

    const probe = buildPriceLadderDirectional(i.lower,i.upper,i.orderCount,dir);
    const entryRef = probe[Math.floor(probe.length/3)] || ((i.lower+i.upper)/2);
    const stopDist = Math.abs(entryRef - i.sl);
    const totalQty = stopDist>0 ? (riskAmount / stopDist) : 0;

    const step = stepQty(pmap);
    const maxPossible = Math.floor(totalQty / step);

    let usedCount = i.orderCount;
    let hint = '';

    if(maxPossible < 3){
      usedCount = Math.max(1, maxPossible);
      hint = `⚠️ Menge zu klein für min. 3 Orders (MinQty: ${PS.utils.formatCHNumber(step,pmap.qty)}). Max möglich: ${maxPossible}.`;
    } else if(usedCount > maxPossible){
      usedCount = maxPossible;
      hint = `⚠️ Menge zu klein für ${i.orderCount} Orders. Max möglich: ${maxPossible}. Orders wurden reduziert.`;
    }

    if(maxPossible >= 3) usedCount = Math.max(3, usedCount);
    if(els.orderCount && Number(els.orderCount.value) !== usedCount) els.orderCount.value = String(usedCount);

    const prices = buildPriceLadderDirectional(i.lower,i.upper,usedCount,dir);
    const weights = buildWeights(usedCount, state.scaleMode);
    const percents = quantizePercents5(weights);

    const qtys = allocateQtyByPercentsMin(totalQty, percents, pmap);

    const orders = prices.map((price, idx)=>({
      index: idx+1, price, qty: qtys[idx],
      notional: qtys[idx]*price,
      percent: percents[idx]
    }));

    const avgEntry = weightedAvgOrders(orders);
    const notional = totalQty * avgEntry;
    const margin = notional / i.leverage;

    renderCards({dir, risk:riskAmount, qty:totalQty, avg:avgEntry, notional, margin, hint});

    if(els.ordersBody){
      els.ordersBody.innerHTML = orders.map(o=>`
        <tr>
          <td>${o.index}</td>
          <td>${PS.utils.formatCHNumber(o.price,pmap.price)}</td>
          <td>${PS.utils.formatCHNumber(o.qty,pmap.qty)}</td>
          <td>${PS.common.fmtUSDT8(o.notional)}</td>
          <td>${o.percent}%</td>
        </tr>
      `).join('');
    }

    state.computed = { ...i, direction:dir, riskAmount, entryQty:totalQty, avgEntry, orders };
  }

  function renderCards({dir, risk, qty, avg, notional, margin, hint}){
    if(!els.results) return;
    const pmap = getPMap(els.symbol?.value || 'BTCUSDT');
    const cards = [
      ['Direction', dir],
      ['Risk', PS.common.fmtUSDT8(risk)],
      ['Qty', qty ? PS.utils.formatCHNumber(qty,pmap.qty) : '—'],
      ['Avg Entry', avg ? PS.utils.formatCHNumber(avg,pmap.price) : '—'],
      ['Notional', PS.common.fmtUSDT8(notional)],
      ['Margin', PS.common.fmtUSDT8(margin)]
    ];
    if(hint) cards.push(['Hinweis', hint]);

    els.results.innerHTML = cards.map(([k,v])=>`
      <div class="card">
        <div class="kpi-title">${PS.common.esc(k)}</div>
        <div class="kpi-value" style="${k==='Hinweis'?'font-size:.95rem;font-weight:850;':''}">${PS.common.esc(String(v))}</div>
      </div>
    `).join('');
  }

  // ---------- Save trade ----------
  function saveTrade(){
    const t = state.computed;
    if(!t) return alert('Bitte Werte eingeben.');
    if(!t.title) return alert('Bitte ID setzen.');

    const id = `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const trade = {
      id,
      title: t.title,
      symbol: t.symbol,
      timeframe: t.timeframe,
      direction: t.direction,
      setupConfirmedAt: t.setupTimeISO,
      chartLink: (settings.showChartLink ? t.chartLink : ''),
      sl: t.sl,
      lower: t.lower,
      upper: t.upper,
      leverage: t.leverage,
      riskPercent: t.riskPercent,
      balance: t.balance,
      mode: state.mode,
      scaleMode: state.scaleMode,
      orderCount: t.orderCount,
      singleEntryPrice: t.singleEntryPrice || 0,
      orders: (state.mode==='scaled')
        ? (t.orders||[]).map(o=>({ planPrice:o.price, planQty:o.qty, fills:[] }))
        : [{ planPrice: t.singleEntryPrice, planQty: t.entryQty, fills:[] }],
      tpScheme: JSON.parse(JSON.stringify(p.settings?.tpScheme || PS.storage.defaultTpScheme())),
      tpTargets: {},
      transferred: false,
      journalId: ''
    };

    p.calculatorTrades.push(trade);
    PS.storage.save(ctx.data);
    renderSaved();
    alert('✅ Gespeichert (nur Rechner).');
  }

  // ---------- Fill helpers ----------
  function ensureOrderShape(trade){
    trade.orders = trade.orders || [];
    for(const o of trade.orders){
      if(o.planPrice == null) o.planPrice = Number(o.price||0)||0;
      if(o.planQty == null) o.planQty = Number(o.qty||0)||0;
      o.fills = Array.isArray(o.fills) ? o.fills : [];
      o.fills = o.fills.map(f=>({
        id: f.id || ('f_'+Date.now()+'_'+Math.random().toString(16).slice(2)),
        time: f.time || nowIso(),
        price: Number(f.price||0),
        qty: Number(f.qty||0),
        fee: Number(f.fee||0)
      })).filter(f=>Number(f.qty||0)>0);
    }
  }
  function sumQty(pmap, fills){ return PS.utils.roundTo((fills||[]).reduce((s,f)=>s+Number(f.qty||0),0), pmap.qty); }
  function sumFee(fills){ return (fills||[]).reduce((s,f)=>s+Number(f.fee||0),0); }
  function wAvgPrice(pmap, fills){
    let q=0,w=0; for(const f of (fills||[])){ q+=Number(f.qty||0); w+=Number(f.qty||0)*Number(f.price||0); }
    return q>0 ? (w/q) : 0;
  }
  function remainingQty(pmap, order){
    const planned = PS.utils.roundTo(Number(order.planQty||0), pmap.qty);
    const filled = sumQty(pmap, order.fills);
    return PS.utils.roundTo(Math.max(0, planned - filled), pmap.qty);
  }
  function clampFillsToPlan(pmap, order){
    const planned = PS.utils.roundTo(Number(order.planQty||0), pmap.qty);
    let filled = sumQty(pmap, order.fills);
    if(filled <= planned + 1e-12) return;

    let over = PS.utils.roundTo(filled - planned, pmap.qty);
    for(let i=order.fills.length-1; i>=0 && over>0; i--){
      const q = Number(order.fills[i].qty||0);
      const nq = PS.utils.roundTo(q - over, pmap.qty);
      if(nq <= 0){
        over = PS.utils.roundTo(over - q, pmap.qty);
        order.fills.splice(i,1);
      }else{
        order.fills[i].qty = nq;
        over = 0;
      }
    }
  }

  function tradeFilledSnapshot(trade){
    ensureOrderShape(trade);
    const pmap = getPMap(trade.symbol);
    let totalPlanned = 0, q=0, w=0, fee=0;
    for(const o of trade.orders){
      totalPlanned += Number(o.planQty||0);
      for(const f of o.fills){
        q += Number(f.qty||0);
        w += Number(f.qty||0)*Number(f.price||0);
        fee += Number(f.fee||0);
      }
    }
    const entryQty = PS.utils.roundTo(q, pmap.qty);
    const avgEntry = entryQty>0 ? (w/entryQty) : 0;
    const filledPct = totalPlanned>0 ? (entryQty/totalPlanned)*100 : 0;
    return { entryQty, avgEntry, entryFees: fee, totalPlanned, filledPct };
  }

  function earliestFillTimeISO(trade){
    ensureOrderShape(trade);
    let min = null;
    for(const o of trade.orders){
      for(const f of (o.fills||[])){
        const ts = f.time ? new Date(f.time).getTime() : NaN;
        if(!Number.isFinite(ts)) continue;
        if(min===null || ts<min) min=ts;
      }
    }
    return min===null ? '' : new Date(min).toISOString();
  }

  function ensureJournalTrade(calcTrade){
    if(calcTrade.transferred && calcTrade.journalId){
      return p.journalTrades.find(j=>j.id===calcTrade.journalId) || p.journalTrades.find(j=>j.sourceCalcId===calcTrade.id) || null;
    }

    const snap = tradeFilledSnapshot(calcTrade);
    if(!(snap.entryQty>0)) return null;

    const openTime = earliestFillTimeISO(calcTrade) || nowIso();
    const jId = `j_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const jt = {
      id: jId,
      sourceCalcId: calcTrade.id,
      title: calcTrade.title,
      symbol: calcTrade.symbol,
      timeframe: calcTrade.timeframe,
      direction: calcTrade.direction,
      setupConfirmedAt: calcTrade.setupConfirmedAt || '',
      openTime,
      fullExitTime: '',
      entryQty: snap.entryQty,
      totalQty: snap.entryQty,
      avgEntry: snap.avgEntry,
      sl: Number(calcTrade.sl||0)||0,
      entryFees: snap.entryFees,
      tpScheme: JSON.parse(JSON.stringify(calcTrade.tpScheme || PS.storage.defaultTpScheme())),
      tpTargets: JSON.parse(JSON.stringify(calcTrade.tpTargets || {})),
      exits: [],
      status: 'open',
      chartLink: calcTrade.chartLink || '',
      ui: { selectedSlot:'' }
    };

    p.journalTrades.push(jt);
    calcTrade.transferred = true;
    calcTrade.journalId = jId;

    return jt;
  }

  function syncJournal(calcTrade){
    const jt = ensureJournalTrade(calcTrade);
    if(!jt) return;

    const snap = tradeFilledSnapshot(calcTrade);
    jt.entryQty = snap.entryQty;
    jt.totalQty = snap.entryQty;
    jt.avgEntry = snap.avgEntry;
    jt.entryFees = snap.entryFees;
    jt.sl = Number(calcTrade.sl||0)||0;

    const minFill = earliestFillTimeISO(calcTrade);
    if(minFill){
      if(!jt.openTime) jt.openTime = minFill;
      else{
        const old = new Date(jt.openTime).getTime();
        const neu = new Date(minFill).getTime();
        if(Number.isFinite(neu) && (!Number.isFinite(old) || neu < old)) jt.openTime = minFill;
      }
    }

    jt.tpTargets = JSON.parse(JSON.stringify(calcTrade.tpTargets||{}));
    jt.tpScheme  = JSON.parse(JSON.stringify(calcTrade.tpScheme || jt.tpScheme || PS.storage.defaultTpScheme()));
  }

  function getSlotsFromScheme(scheme){
    const s = scheme || PS.storage.defaultTpScheme();
    const n = Number(s.tpCount||4);
    const slots=[];
    for(let i=1;i<=n;i++) slots.push(`TP${i}`);
    if(Number(s.runnerPercent||0)>0) slots.push('RUNNER');
    return slots;
  }

  // ---------- Render saved (grouped) ----------
  function renderSaved(){
    if(!els.calcTrades) return;
    const list = p.calculatorTrades || [];
    if(!list.length){
      els.calcTrades.innerHTML = `<p class="muted">Keine Trades gespeichert.</p>`;
      return;
    }

    // group sym->tf
    const map = new Map();
    for(const t of list){
      const sym = (t.symbol||'').toUpperCase();
      const tf = (t.timeframe||'');
      if(!map.has(sym)) map.set(sym, new Map());
      const m2 = map.get(sym);
      if(!m2.has(tf)) m2.set(tf, []);
      m2.get(tf).push(t);
    }
    for(const [, m2] of map){
      for(const [, arr] of m2) arr.sort((a,b)=> (b.setupConfirmedAt||'').localeCompare(a.setupConfirmedAt||''));
    }

    if(!state._groupInit){
      const firstSym = map.keys().next().value;
      if(firstSym){
        state.symOpen.add(keySym(firstSym));
        const firstTf = map.get(firstSym)?.keys().next().value;
        if(firstTf) state.tfOpen.add(keyTF(firstSym, firstTf));
      }
      state._groupInit = true;
    }

    const syms = Array.from(map.keys()).sort();
    let html = '';

    for(const sym of syms){
      const m2 = map.get(sym);
      const symKey = keySym(sym);
      const symOpen = state.symOpen.has(symKey);
      const totalSymTrades = Array.from(m2.values()).reduce((s,a)=>s+a.length,0);

      html += `
        <div class="group group-symbol" id="grp_${sym}">
          <div class="group-head">
            <button class="btn small ${symOpen?'primary':''}" type="button" data-toggle-sym="${sym}">
              ${symOpen?'−':'＋'}
            </button>
            <strong>${sym}</strong>
            <span class="pill">Trades: ${totalSymTrades}</span>
          </div>

          <div class="${symOpen?'':'hidden'} group-body">
      `;

      const tfs = Array.from(m2.keys()).sort();
      for(const tf of tfs){
        const tfKey = keyTF(sym,tf);
        const tfOpen = state.tfOpen.has(tfKey);
        const arr = m2.get(tf);

        html += `
          <div class="group group-tf">
            <div class="group-head tf">
              <button class="btn small ${tfOpen?'primary':''}" type="button" data-toggle-tf="${sym}||${tf}">
                ${tfOpen?'−':'＋'}
              </button>
              <strong>${tf}</strong>
              <span class="pill">Trades: ${arr.length}</span>
            </div>

            <div class="${tfOpen?'':'hidden'} group-body">
              ${arr.map(buildTradeCard).join('')}
            </div>
          </div>
        `;
      }

      html += `</div></div>`;
    }

    els.calcTrades.innerHTML = html;

    // group toggles
    els.calcTrades.querySelectorAll('[data-toggle-sym]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const sym = btn.getAttribute('data-toggle-sym');
        const k = keySym(sym);
        if(state.symOpen.has(k)){
          state.symOpen.delete(k);
        } else {
          state.symOpen.clear();
          state.symOpen.add(k);
        }
        renderSaved();
      });
    });
    els.calcTrades.querySelectorAll('[data-toggle-tf]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const [sym, tf] = btn.getAttribute('data-toggle-tf').split('||');
        const k = keyTF(sym, tf);
        if(state.tfOpen.has(k)){
          state.tfOpen.delete(k);
        } else {
          state.tfOpen.clear();
          state.tfOpen.add(k);
        }
        renderSaved();
      });
    });

    // per trade bindings
    for(const t of list){
      const root = document.getElementById(`calc_${t.id}`);
      if(!root) continue;

      ensureOrderShape(t);

      root.querySelector('[data-act="tp"]')?.addEventListener('click', ()=>{
        const willOpen = !state.tpOpen.has(t.id);
        state.tpOpen.clear();
        state.entriesOpen.clear();
        state.orderOpen.clear();
        if(willOpen) state.tpOpen.add(t.id);
        renderSaved();
      });

      root.querySelector('[data-act="entries"]')?.addEventListener('click', ()=>{
        const willOpen = !state.entriesOpen.has(t.id);
        state.tpOpen.clear();
        state.entriesOpen.clear();
        state.orderOpen.clear();
        if(willOpen) state.entriesOpen.add(t.id);
        renderSaved();
      });

      root.querySelector('[data-act="openJournal"]')?.addEventListener('click', ()=>{
        // ensures exists (if filled)
        syncJournal(t);
        PS.storage.save(ctx.data);
        if(t.journalId){
          ctx.data.ui = ctx.data.ui || {};
          ctx.data.ui.journalOpenTradeId = t.journalId;
          PS.storage.save(ctx.data);
        }
        location.href = './journal.html';
      });

      root.querySelector('[data-act="delete"]')?.addEventListener('click', ()=>{
        if(!confirm('Trade löschen?')) return;
        p.calculatorTrades = p.calculatorTrades.filter(x=>x.id!==t.id);
        state.tpOpen.delete(t.id); state.entriesOpen.delete(t.id);
        for(const k of Array.from(state.orderOpen)) if(k.startsWith(t.id+'|')) state.orderOpen.delete(k);
        PS.storage.save(ctx.data);
        renderSaved();
      });

      // TP save
      root.querySelector('[data-act="tpSave"]')?.addEventListener('click', ()=>{
        const trade = p.calculatorTrades.find(x=>x.id===t.id);
        if(!trade) return;
        const pmap = getPMap(trade.symbol);
        const slots = getSlotsFromScheme(trade.tpScheme);
        trade.tpTargets = trade.tpTargets || {};
        for(const slot of slots){
          const inp = root.querySelector(`[data-tp="${slot}"]`);
          if(!inp) continue;
          const val = PS.utils.parseCHNumber(inp.value);
          if(val>0) trade.tpTargets[slot]=val; else delete trade.tpTargets[slot];
          inp.value = val>0 ? PS.utils.formatCHNumber(val, pmap.price) : '';
        }
        // sync journal if exists (or if first fill already)
        syncJournal(trade);
        PS.storage.save(ctx.data);
        renderSaved();
      });

      // accordion per order
      root.querySelectorAll('[data-order-toggle]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
        const oi = Number(btn.getAttribute('data-oi'));
        const k = keyOrder(t.id, oi);
        if(state.orderOpen.has(k)){
          state.orderOpen.delete(k);
        } else {
          state.orderOpen.clear();
          state.orderOpen.add(k);
        }
        renderSaved();
      });
    });

      // existing fill edit/delete (autosave)
      root.querySelectorAll('[data-fill-row]').forEach(fr=>{
        const oi = Number(fr.getAttribute('data-oi'));
        const fid = fr.getAttribute('data-fid');
        const order = t.orders[oi];
        if(!order) return;
        const pmap = getPMap(t.symbol);
        const f = (order.fills||[]).find(x=>x.id===fid);
        if(!f) return;

        const ipT = fr.querySelector('[data-fill-time]');
        const ipP = fr.querySelector('[data-fill-price]');
        const ipQ = fr.querySelector('[data-fill-qty]');
        const ipF = fr.querySelector('[data-fill-fee]');
        const del = fr.querySelector('[data-fill-del]');

        const apply = ()=>{
          f.time = dtLocalToISO(ipT.value) || f.time || nowIso();
          f.price = PS.utils.parseCHNumber(ipP.value);
          f.qty   = PS.utils.roundTo(PS.utils.parseCHNumber(ipQ.value), pmap.qty);
          f.fee   = PS.utils.parseCHNumber(ipF.value);

          order.fills = (order.fills||[]).filter(x=>Number(x.qty||0)>0);
          clampFillsToPlan(pmap, order);

          // ✅ auto-insert/sync journal when first fill exists
          syncJournal(t);
          PS.storage.save(ctx.data);
          renderSaved();
        };

        [ipT,ipP,ipQ,ipF].forEach(inp=> inp.addEventListener('change', apply));
        del?.addEventListener('click', ()=>{
          order.fills = (order.fills||[]).filter(x=>x.id!==fid);
          syncJournal(t);
          PS.storage.save(ctx.data);
          renderSaved();
        });
      });

      // NEW row: ✅ commit only on Fee (or Enter / Plus). Qty TAB stays inside row.
      root.querySelectorAll('[data-newfill]').forEach(wrap=>{
        const btn = wrap.querySelector('[data-newfill-add]');
        if(!btn) return;

        const oi = Number(btn.getAttribute('data-oi'));
        const order = t.orders[oi];
        if(!order) return;

        const pmap = getPMap(t.symbol);

        const ipT = wrap.querySelector('[data-new-time]');
        const ipP = wrap.querySelector('[data-new-price]');
        const ipQ = wrap.querySelector('[data-new-qty]');
        const ipF = wrap.querySelector('[data-new-fee]');

        const commit = ()=>{
          const rem = remainingQty(pmap, order);
          if(rem <= 0) return;

          const time = dtLocalToISO(ipT.value) || nowIso();
          const price = PS.utils.parseCHNumber(ipP.value) || Number(order.planPrice||0);
          let qty = PS.utils.roundTo(PS.utils.parseCHNumber(ipQ.value), pmap.qty);
          const fee = PS.utils.parseCHNumber(ipF.value) || 0;

          if(!qty || qty<=0) return;
          if(qty > rem) qty = rem;

          order.fills.push({ id:'f_'+Date.now()+'_'+Math.random().toString(16).slice(2), time, price, qty, fee });
          clampFillsToPlan(pmap, order);

          // ✅ auto insert into journal on first fill + sync always
          syncJournal(t);
          PS.storage.save(ctx.data);

          // focus next new row qty after render
          state.focusAfter = { tradeId: t.id, oi, sel: 'new-qty' };
          renderSaved();
        };

        // plus button commit
        btn.addEventListener('click', commit);

        // ENTER commits (any field)
        [ipT,ipP,ipQ,ipF].forEach(inp=>{
          inp?.addEventListener('keydown', (e)=>{
            if(e.key === 'Enter'){
              e.preventDefault();
              commit();
            }
          });
        });

        // ✅ Fee change triggers commit (auto-save) -> produces next row
        ipF?.addEventListener('change', commit);
      });

      PS.utils.normalizeNumericInputs(root);
    }

    // restore focus after rerender (for tab workflow)
    if(state.focusAfter){
      const f = state.focusAfter;
      const root = document.getElementById(`calc_${f.tradeId}`);
      if(root){
        const wrap = root.querySelector(`[data-newfill][data-oi="${f.oi}"]`);
        if(wrap){
          const target = wrap.querySelector('[data-new-qty]');
          if(target){
            target.focus();
            target.select?.();
          }
        }
      }
      state.focusAfter = null;
    }
  }

  function buildTradeCard(t){
    const pmap = getPMap(t.symbol);
    ensureOrderShape(t);
    const snap = tradeFilledSnapshot(t);
    const slots = getSlotsFromScheme(t.tpScheme);

    const tpPills = slots.map(slot=>{
      const val = Number(t.tpTargets?.[slot]||0);
      return val>0 ? `<span class="pill">${slot}: ${PS.utils.formatCHNumber(val,pmap.price)}</span>` : '';
    }).filter(Boolean).join(' ');

    const tpLine = tpPills.length ? tpPills : `<span class="pill">TP: —</span>`;
    const tpFields = slots.map(slot=>{
      const val = Number(t.tpTargets?.[slot]||0);
      return `<div class="tp-field"><label>${slot}</label><input data-tp="${slot}" value="${val>0 ? PS.utils.formatCHNumber(val,pmap.price) : ''}" placeholder="Preis"></div>`;
    }).join('');

    const entryOrders = (t.orders||[]).map((o, oi)=>{
      const filled = sumQty(pmap, o.fills);
      const rem = remainingQty(pmap, o);
      const avgF = wAvgPrice(pmap, o.fills);
      const feeF = sumFee(o.fills);
      const open = state.orderOpen.has(keyOrder(t.id, oi));

      const fillsHtml = (o.fills||[]).map(f=>`
        <div class="fill-row" data-fill-row data-oi="${oi}" data-fid="${f.id}">
          <input data-fill-time type="datetime-local" step="1" value="${isoToDtLocal(f.time)}">
          <input data-fill-price type="text" value="${PS.utils.formatCHNumber(Number(f.price||0), pmap.price)}" placeholder="Preis">
          <input data-fill-qty type="text" value="${PS.utils.formatCHNumber(Number(f.qty||0), pmap.qty)}" placeholder="Menge">
          <input data-fill-fee type="text" value="${PS.utils.formatCHNumber(Number(f.fee||0), 8)}" placeholder="Fee">
          <button class="btn small danger" type="button" data-fill-del>✕</button>
        </div>
      `).join('') || `<div class="small muted">Noch keine Teilfills.</div>`;

      const newRow = rem > 0 ? `
        <div class="fill-row" data-newfill data-oi="${oi}">
          <input data-new-time type="datetime-local" step="1" value="${PS.utils.nowLocalISOSeconds()}">
          <input data-new-price type="text" value="${PS.utils.formatCHNumber(Number(o.planPrice||0), pmap.price)}" placeholder="Preis">
          <input data-new-qty type="text" value="${PS.utils.formatCHNumber(rem, pmap.qty)}" placeholder="Menge (Rest)">
          <input data-new-fee type="text" value="${PS.utils.formatCHNumber(0, 8)}" placeholder="Fee">
          <button class="btn small primary" type="button" data-newfill-add data-oi="${oi}">＋</button>
        </div>
      ` : `<div class="small muted">✅ Rest ist 0 – vollständig erfasst.</div>`;

      return `
        <div class="entry-order">
          <div class="entry-head">
            <span class="pill">#${oi+1}</span>
            <span class="pill">Plan ${PS.utils.formatCHNumber(Number(o.planPrice||0), pmap.price)} / ${PS.utils.formatCHNumber(Number(o.planQty||0), pmap.qty)}</span>
            <span class="pill">Filled ${PS.utils.formatCHNumber(filled, pmap.qty)}</span>
            <span class="pill">Avg ${filled>0 ? PS.utils.formatCHNumber(avgF, pmap.price) : '—'}</span>
            <span class="pill">Fee ${PS.common.fmtUSDT8(feeF)}</span>
            <span class="pill">Rest ${PS.utils.formatCHNumber(rem, pmap.qty)}</span>
            <button class="btn small ${open?'primary':''}" type="button" data-order-toggle data-oi="${oi}">${open?'−':'＋'}</button>
          </div>
          <div class="${open?'':'hidden'}" style="margin-top:.5rem">
            ${fillsHtml}
            ${newRow}
          </div>
        </div>
      `;
    }).join('');

    const canOpenJournal = (t.transferred && t.journalId);

    return `
      <div class="trade-item" id="calc_${t.id}">
        <div class="trade-row trade-row1">
          <div class="trade-left">
            <strong>${PS.common.esc(t.title)}</strong>
            <span class="pill">${t.symbol}</span>
            <span class="pill">${t.timeframe}</span>
            ${PS.common.dirHtml(t.direction)}
          </div>
          <div class="trade-actions">
            <button class="btn small" data-act="tp">TP Targets</button>
            <button class="btn small" data-act="entries">Entries</button>
            <button class="btn small ${canOpenJournal?'primary':''}" data-act="openJournal">Journal</button>
            <button class="btn small danger" data-act="delete">Löschen</button>
          </div>
        </div>

        <div class="trade-row trade-row2">
          <span class="pill">Setup: ${PS.common.esc(PS.utils.toLocaleCH(t.setupConfirmedAt))}</span>
          <span class="pill">SL: ${t.sl?PS.utils.formatCHNumber(Number(t.sl||0), pmap.price):'—'}</span>
          <span class="pill">Total Qty: ${PS.utils.formatCHNumber(snap.totalPlanned, pmap.qty)}</span>
          <span class="pill">Filled Qty: ${snap.entryQty>0 ? PS.utils.formatCHNumber(snap.entryQty,pmap.qty) : '—'}</span>
          <span class="pill">Filled %: ${PS.utils.formatCHNumber(snap.filledPct, 1)}%</span>
          <span class="pill">Avg Entry (filled): ${snap.entryQty>0 ? PS.utils.formatCHNumber(snap.avgEntry,pmap.price) : '—'}</span>
        </div>

        <div class="trade-row trade-row3">
          ${tpLine}
          <span class="pill">Fees (filled): ${PS.common.fmtUSDT8(snap.entryFees)}</span>
        </div>

        <div class="tp-block ${state.tpOpen.has(t.id)?'':'hidden'}">
          <div class="inline" style="justify-content:space-between;align-items:center">
            <strong>TP Targets (Edit)</strong>
            <button class="btn small primary" data-act="tpSave">Save</button>
          </div>
          <div class="tp-grid">${tpFields}</div>
        </div>

        <div class="details ${state.entriesOpen.has(t.id)?'':'hidden'}">
          <div class="card">
            <h3>Entries Splits</h3>
            <div class="small muted">Qty → Tab → Fee funktioniert jetzt ohne Fokus-Sprung. Commit erst bei Fee/Enter/Plus.</div>
            <div style="margin-top:.6rem">${entryOrders}</div>
          </div>
        </div>
      </div>
    `;
  }

  // datetime helpers
  function dtLocalToISO(v){
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
  function toDtLocalNoSeconds(date){
    const d=(date instanceof Date)?date:new Date(date);
    const pad=(n)=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
})();
