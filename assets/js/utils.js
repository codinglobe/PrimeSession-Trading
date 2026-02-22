// assets/js/utils.js (KOMPLETT ERSETZEN)
window.PS = window.PS || {};
PS.utils = PS.utils || {};

/* ---------------------------
   debounce / rounding
--------------------------- */
PS.utils.debounce = function(fn, ms){
  let t=null;
  return function(...args){
    clearTimeout(t);
    t=setTimeout(()=>fn.apply(this,args), ms);
  };
};

PS.utils.roundTo = function(n, decimals=2){
  const x = Number(n);
  if(!Number.isFinite(x)) return 0;
  const d = Math.max(0, Math.floor(Number(decimals)||0));
  const p = Math.pow(10, d);
  return Math.round(x*p)/p;
};

/* ---------------------------
   PARSE: accepts
   - 1'234,56 (CH)
   - 1234.56  (dot)
   - 1.234,56 (DE)
   - 1,234.56 (EN)
--------------------------- */
PS.utils.parseCHNumber = function(str){
  if(str === null || str === undefined) return 0;
  let s = String(str).trim();
  if(!s) return 0;

  s = s.replace(/\s+/g,'').replace(/’/g,"'");
  const sign = s.startsWith('-') ? -1 : 1;
  s = s.replace(/^[+-]/,'');

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  // remove apostrophes (thousands)
  s = s.replace(/'/g,'');

  if(hasComma && hasDot){
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if(lastComma > lastDot){
      // comma decimal
      s = s.replace(/\./g,'');
      s = s.replace(',', '.');
    }else{
      // dot decimal
      s = s.replace(/,/g,'');
    }
  } else if(hasComma){
    // comma decimal
    s = s.replace(/\./g,'');
    s = s.replace(',', '.');
  } else {
    // dot decimal or integer
    s = s.replace(/,/g,'');
  }

  // keep only last dot as decimal if multiple
  const parts = s.split('.');
  if(parts.length > 2){
    const dec = parts.pop();
    s = parts.join('') + '.' + dec;
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? sign*n : 0;
};

/* ---------------------------
   FORMAT: manual de-CH output
   thousands: apostrophe
   decimal: comma
--------------------------- */
PS.utils.formatCHNumber = function(num, decimals=2){
  const n = Number(num);
  if(!Number.isFinite(n)) return '';

  const d = Math.max(0, Math.floor(Number(decimals)||0));
  const neg = n < 0;
  const abs = Math.abs(n);

  const rounded = PS.utils.roundTo(abs, d);
  const fixed = d>0 ? rounded.toFixed(d) : String(Math.round(rounded));

  const [intPartRaw, decPartRaw] = fixed.split('.');
  const intPart = intPartRaw.replace(/\B(?=(\d{3})+(?!\d))/g, "'");

  if(d>0){
    return (neg?'-':'') + intPart + ',' + (decPartRaw || '').padEnd(d,'0');
  }
  return (neg?'-':'') + intPart;
};

PS.utils.toLocaleCH = function(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(String(d)==='Invalid Date') return '';
  // keep existing behaviour, but CH-style:
  const pad = (n)=>String(n).padStart(2,'0');
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

PS.utils.nowLocalISOSeconds = function(){
  const d = new Date();
  const pad = (n)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/* ---------------------------
   SHA256
--------------------------- */
PS.utils.sha256 = function(str){
  try{
    if(window.CryptoJS) return CryptoJS.SHA256(String(str)).toString();
  }catch{}
  return sha256Fallback(String(str));
};

// small sync fallback (same as before)
function sha256Fallback(ascii) {
  function rightRotate(value, amount) { return (value>>>amount) | (value<<(32-amount)); }
  const mathPow = Math.pow, maxWord = mathPow(2, 32);
  let result = '';
  const words = [];
  const asciiBitLength = ascii.length*8;
  const hash = sha256Fallback.h = sha256Fallback.h || [];
  const k = sha256Fallback.k = sha256Fallback.k || [];
  let primeCounter = k.length;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (mathPow(candidate, .5)*maxWord)|0;
      k[primeCounter++] = (mathPow(candidate, 1/3)*maxWord)|0;
    }
  }
  ascii += '\x80';
  while (ascii.length%64 - 56) ascii += '\x00';
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    words[i>>2] |= j << ((3 - i)%4)*8;
  }
  words[words.length] = ((asciiBitLength/maxWord)|0);
  words[words.length] = (asciiBitLength);
  for (let j = 0; j < words.length;) {
    const w = words.slice(j, j += 16);
    const oldHash = hash.slice(0);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 = (hash[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e&hash[5])^((~e)&hash[6]))
        + k[i]
        + (w[i] = (i < 16) ? w[i] : (
          w[i - 16]
          + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15>>>3))
          + w[i - 7]
          + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2>>>10))
        )|0)
      )|0;
      const temp2 = ((rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
        + ((a&hash[1])^(a&hash[2])^(hash[1]&hash[2]))
      )|0;
      hash.unshift((temp1 + temp2)|0);
      hash[4] = (hash[4] + temp1)|0;
      hash.pop();
    }
    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i])|0;
  }
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += ((b < 16) ? 0 : '') + b.toString(16);
    }
  }
  return result;
}

/* ---------------------------
   Numeric input normalizer
   - user may type "." -> we convert to ","
   - on blur: format to CH (apostrophe + comma)
   - on init: normalize existing numeric inputs so page starts with comma
--------------------------- */
PS.utils.installNumericInputFormatter = function(){
  if(window.__ps_numfmt_installed) return;
  window.__ps_numfmt_installed = true;

  const isNumericish = (v)=> {
    if(!v) return false;
    if(!/[0-9]/.test(v)) return false;
    if(/[a-zA-Z]/.test(v)) return false;
    return true;
  };

  // dot -> comma while typing (only if looks numeric)
  document.addEventListener('input', (e)=>{
    const t = e.target;
    if(!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) return;

    // ignore these types
    if(t instanceof HTMLInputElement){
      const type = (t.getAttribute('type') || 'text').toLowerCase();
      if(['password','email','datetime-local','date','time','number'].includes(type)) return;
    }

    const v = t.value || '';
    if(!isNumericish(v)) return;

    // replace decimal dot(s) with comma for display
    if(v.includes('.')){
      t.value = v.replace(/\./g, ',');
    }
  }, true);

  // format on blur
  document.addEventListener('blur', (e)=>{
    const t = e.target;
    if(!(t instanceof HTMLInputElement)) return;

    const type = (t.getAttribute('type') || 'text').toLowerCase();
    if(!['text','search','tel','url'].includes(type)) return;

    const v = t.value || '';
    if(!isNumericish(v)) return;

    const decimals = guessDecimals(v);
    const n = PS.utils.parseCHNumber(v);
    t.value = PS.utils.formatCHNumber(n, decimals);
  }, true);

  // normalize existing inputs once after load
  setTimeout(()=>PS.utils.normalizeNumericInputs(document), 0);

  function guessDecimals(v){
    const s = String(v).trim();
    const idxC = s.lastIndexOf(',');
    if(idxC >= 0) return Math.min(8, s.length - idxC - 1);
    const idxD = s.lastIndexOf('.');
    if(idxD >= 0) return Math.min(8, s.length - idxD - 1);
    return 0;
  }
};

PS.utils.normalizeNumericInputs = function(root=document){
  const inputs = root.querySelectorAll('input[type="text"], input[type="search"], input[type="tel"], input:not([type])');
  inputs.forEach(inp=>{
    const v = inp.value || '';
    if(!/[0-9]/.test(v)) return;
    if(/[a-zA-Z]/.test(v)) return;
    const decimals = (()=>{
      const s = String(v).trim();
      const idxC = s.lastIndexOf(',');
      if(idxC >= 0) return Math.min(8, s.length - idxC - 1);
      const idxD = s.lastIndexOf('.');
      if(idxD >= 0) return Math.min(8, s.length - idxD - 1);
      return 0;
    })();
    const n = PS.utils.parseCHNumber(v);
    inp.value = PS.utils.formatCHNumber(n, decimals);
  });
};