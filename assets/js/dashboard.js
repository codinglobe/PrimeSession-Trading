// assets/js/dashboard.js (KOMPLETT ERSETZEN)
(function(){
  const ctx = PS.common.init();
  if(!PS.common.requireAuth(ctx)) return;

  // Admin sieht nie User-Dashboard
  if(PS.common.isPureAdmin(ctx)){
    location.href = './admin.html#dash';
    return;
  }

  const p = ctx.profile;
  p.journalTrades = p.journalTrades || [];

  const kpiEl = document.getElementById('dashKpis');
  const calGrid = document.getElementById('calGrid');
  const calTitle = document.getElementById('calTitle');
  const dayList = document.getElementById('dayList');

  const calPrev = document.getElementById('calPrev');
  const calNext = document.getElementById('calNext');

  let view = new Date();
  view.setDate(1);

  const TZ = 'Europe/Zurich';

  const daily = computeDaily(p.journalTrades);

  renderKpis();
  renderCalendar();
  renderDayList();

  calPrev?.addEventListener('click', ()=>{
    view.setMonth(view.getMonth()-1);
    renderCalendar();
  });
  calNext?.addEventListener('click', ()=>{
    view.setMonth(view.getMonth()+1);
    renderCalendar();
  });

  function fmtUSDT8(n){ return PS.common.fmtUSDT8(n); }

  function statusIsFullClosed(t){
    const qOpen = Number(t.qtyOpen||0);
    return (String(t.status||'').startsWith('closed') && qOpen <= 1e-9 && !!t.fullExitTime);
  }

  function durationMs(t){
    if(!t.openTime || !t.fullExitTime) return 0;
    const a = new Date(t.openTime).getTime();
    const b = new Date(t.fullExitTime).getTime();
    if(!Number.isFinite(a) || !Number.isFinite(b) || b<=a) return 0;
    return b-a;
  }

  function fmtDuration(ms){
    if(!ms) return '—';
    const mins = Math.round(ms/60000);
    const h = Math.floor(mins/60);
    const m = mins%60;
    if(h<=0) return `${m}m`;
    if(h<24) return `${h}h ${m}m`;
    const d = Math.floor(h/24);
    const hh = h%24;
    return `${d}d ${hh}h`;
  }

  function toYMD(iso){
    if(!iso) return '';
    const d = new Date(iso);
    if(String(d)==='Invalid Date') return '';
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' });
    return fmt.format(d);
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

  function riskAmount(t){
    const avg = Number(t.avgEntry||0);
    const sl = Number(t.sl||0);
    const qty = Number(t.entryQty||0);
    if(!avg || !sl || !qty) return 0;
    return Math.abs((avg-sl)*qty);
  }

  function computeDaily(trades){
    const map = {};
    for(const t of trades){
      const entryFees = Number(t.entryFees||0) || 0;
      const entryQty  = Number(t.entryQty||0) || 0;
      const rAmt = riskAmount(t);

      for(const e of (t.exits||[])){
        const q = Number(e.qty||0);
        if(q<=0 || !e.time) continue;

        const ymd = toYMD(e.time);
        if(!ymd) continue;

        const gross = eventPnlGross(t,e);
        const exitFee = Number(e.fee||0) || 0;

        const entryFeeShare = (entryQty>0) ? (entryFees * (q/entryQty)) : 0;

        const net = gross - exitFee - entryFeeShare;
        const fees = exitFee + entryFeeShare;

        if(!map[ymd]) map[ymd] = { net:0, gross:0, fees:0, events:0, trades:new Set() };
        map[ymd].net += net;
        map[ymd].gross += gross;
        map[ymd].fees += fees;
        map[ymd].events += 1;
        map[ymd].trades.add(t.id || t.title || 't');
      }
    }

    const out = {};
    for(const [k,v] of Object.entries(map)){
      out[k] = {
        net: v.net,
        gross: v.gross,
        fees: v.fees,
        events: v.events,
        trades: v.trades.size
      };
    }
    return out;
  }

  function renderKpis(){
    let gross=0, fees=0, net=0;
    let rSum=0, rNetSum=0;

    let fullClosedDurSum=0, fullClosedCount=0;

    for(const t of p.journalTrades){
      gross += Number(t.realizedPnlGross||0) || 0;
      fees += Number(t.fees||0) || 0;
      net  += Number(t.realizedPnlNet||0) || 0;

      const rAmt = riskAmount(t);
      if(rAmt>0){
        rSum += rAmt;
        rNetSum += (Number(t.realizedPnlNet||0) || 0);
      }

      if(statusIsFullClosed(t)){
        const ms = durationMs(t);
        if(ms>0){
          fullClosedDurSum += ms;
          fullClosedCount++;
        }
      }
    }

    const rTotal = (rSum>0) ? (rNetSum / rSum) : 0;
    const avgHold = fullClosedCount>0 ? (fullClosedDurSum/fullClosedCount) : 0;

    kpiEl.innerHTML = `
      <span class="pill"><strong>Trades</strong> ${p.journalTrades.length}</span>
      <span class="pill"><strong>GuV brutto</strong> ${fmtUSDT8(gross)}</span>
      <span class="pill"><strong>Fees</strong> ${fmtUSDT8(fees)}</span>
      <span class="pill"><strong>GuV net</strong> ${fmtUSDT8(net)}</span>
      <span class="pill"><strong>R (total)</strong> ${PS.utils.formatCHNumber(rTotal,2)}</span>
      <span class="pill"><strong>Ø Haltedauer (Full Closed)</strong> ${fmtDuration(avgHold)}</span>
    `;
  }

  function renderCalendar(){
    calTitle.textContent = new Intl.DateTimeFormat('de-CH', { timeZone: TZ, month:'long', year:'numeric' }).format(view);

    const y = view.getFullYear();
    const m = view.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m+1, 0);

    const startDow = ((first.getDay()+6)%7); // Monday start
    const daysInMonth = last.getDate();

    const dows = ['Mo','Di','Mi','Do','Fr','Sa','So'].map(x=>`<div class="cal-dow">${x}</div>`).join('');

    let cells = '';
    for(let i=0;i<startDow;i++){
      cells += `<div class="cal-cell" style="opacity:.35"></div>`;
    }

    for(let d=1; d<=daysInMonth; d++){
      const date = new Date(y,m,d);
      const ymd = toYMD(date.toISOString());
      const dv = daily[ymd];

      let cls = 'cal-cell';
      let val = '';

      if(dv){
        const netV = dv.net;
        cls += netV>=0 ? ' pos' : ' neg';
        val = `${netV>=0?'+':''}${PS.utils.formatCHNumber(netV,2)} USDT`;
      }

      cells += `
        <div class="${cls}">
          <div class="d">${d}</div>
          ${dv ? `<div class="v">${val}</div><div class="p">${dv.trades} Trades</div>` : `<div class="p">—</div>`}
        </div>
      `;
    }

    calGrid.innerHTML = dows + cells;
  }

  function renderDayList(){
    const keys = Object.keys(daily).sort().reverse();
    if(!keys.length){
      dayList.textContent = 'Keine Tagesdaten vorhanden.';
      return;
    }

    dayList.innerHTML = keys.slice(0, 31).map(k=>{
      const dv = daily[k];
      const cls = dv.net>=0 ? 'day-row pos' : 'day-row neg';
      return `
        <div class="${cls}">
          <div class="left">
            <div class="date">${k}</div>
            <div class="meta">${dv.trades} Trades • ${dv.events} Exits • Fees ${PS.utils.formatCHNumber(dv.fees,2)} USDT</div>
          </div>
          <div class="right">${dv.net>=0?'+':''}${PS.utils.formatCHNumber(dv.net,2)} USDT</div>
        </div>
      `;
    }).join('');
  }
})();