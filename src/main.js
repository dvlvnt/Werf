import '@fontsource-variable/archivo/wdth.css';
import './style.css';
import { animate } from 'motion';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { StatusBar, Style } from '@capacitor/status-bar';
import { cleanGrid } from './prep.js';
import { analyze, mapsUrl } from './parse.js';
import { t, setLang, getLang, locale, LANGS } from './i18n.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* yok */ } };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* dolu */ } },
};

const askName = ls.get('werf.name', null) === null;
setLang(ls.get('werf.lang', 'en'));
let name = ls.get('werf.name', 'Levent');
let current = null; // { url, words, W, H, colorOf }

/* ---------- ikonlar ---------- */
const I = {
  pin: (s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 00-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z"/></svg>`,
  edit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>',
  image: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>',
  arrow: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M8 7h9v9"/></svg>',
  logo: `<svg width="34" height="34" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 3C15 3 8 10 8 19c0 11.5 16 26 16 26s16-14.5 16-26C40 10 33 3 24 3z" fill="#FF6A13"/><g stroke="#1C1F22" stroke-width="2.6" stroke-linecap="round"><path d="M17 12v15M31 12v15M17 14h14M17 25h14M17 25l14-11"/></g></svg>`,
};

/* ---------- topoğrafik zemin ---------- */
function topo() {
  const W = 540;
  const H = 1200;
  let paths = '';
  const centers = [[90, 180], [470, 620], [160, 1040]];
  centers.forEach(([cx, cy], ci) => {
    for (let r = 40; r < 420; r += 34) {
      let d = '';
      for (let a = 0; a <= 64; a++) {
        const t = (a / 64) * Math.PI * 2;
        const k = r * (1 + 0.13 * Math.sin(3 * t + ci + r / 90) + 0.07 * Math.cos(5 * t - r / 60));
        const x = cx + Math.cos(t) * k * 1.15;
        const y = cy + Math.sin(t) * k * 0.85;
        d += `${a ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      paths += `<path d="${d}Z"/>`;
    }
  });
  return `<svg class="topo" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${paths}</svg>`;
}
document.body.insertAdjacentHTML('afterbegin', topo());

/* ---------- iskelet ---------- */
const app = document.getElementById('app');
app.innerHTML = `
  <header class="top">
    <button class="mark" id="homeBtn" aria-label="${t('home')}">${I.logo}<span class="word">Werf</span></button>
    <button class="who" id="who" aria-label="${t('whoLabel')}"><span class="lang-tag" id="langTag"></span><span id="whoName"></span></button>
  </header>
  <main id="view"></main>
  <input type="file" id="file" accept="image/*" hidden />
  <div class="toast" id="toast" role="status"></div>
`;
const $ = (id) => document.getElementById(id);
// Android'de Google Haritalar uygulamasını doğrudan arama ile açar (geo: bağlantısı)
const NATIVE = Capacitor.isNativePlatform();
const mapHref = (q) => (NATIVE ? `geo:0,0?q=${encodeURIComponent(q)}` : mapsUrl(q));
const routeHref = (qs) => `https://www.google.com/maps/dir//${qs.map((q) => encodeURIComponent(q)).join('/')}`;
$('homeBtn').addEventListener('click', () => { current = null; home(); window.scrollTo(0, 0); });
const renderWho = () => { $('whoName').textContent = name; $('langTag').textContent = getLang().toUpperCase(); $('homeBtn').setAttribute('aria-label', t('home')); $('who').setAttribute('aria-label', t('whoLabel')); };
renderWho();

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  animate(t, { opacity: [0, 1], y: [12, 0] }, { duration: 0.2 });
  clearTimeout(toast.t);
  toast.t = setTimeout(() => animate(t, { opacity: 0 }, { duration: 0.3 }), 1600);
}

/* ---------- geçmiş ---------- */
const cap = (x) => x.charAt(0).toLocaleUpperCase(locale()) + x.slice(1);
const wd = (d) => cap(new Intl.DateTimeFormat(locale(), { weekday: 'long' }).format(d));
const dm = (d, y) => new Intl.DateTimeFormat(locale(), y ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'long' }).format(d);
function dateOf(entry) {
  const m = entry.date && entry.date.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return new Date(y, +m[2] - 1, +m[1], 12);
  }
  return new Date(entry.ts || Date.now());
}
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
function dayTitle(d) {
  const today = new Date();
  const tom = new Date(); tom.setDate(today.getDate() + 1);
  const yes = new Date(); yes.setDate(today.getDate() - 1);
  const sub = `${wd(d)}, ${dm(d)}`;
  if (dayKey(d) === dayKey(today)) return { main: t('today'), sub };
  if (dayKey(d) === dayKey(tom)) return { main: t('tomorrow'), sub };
  if (dayKey(d) === dayKey(yes)) return { main: t('yesterday'), sub };
  return { main: wd(d), sub: dm(d, true) };
}

let days = ls.get('werf.history', null);
if (!days) {
  const old = ls.get('werf.last', null);
  days = old ? [{ date: old.date, stops: old.stops || [{ company: old.company, street: old.street, city: old.city, query: old.query, label: '' }], ts: old.ts || Date.now() }] : [];
  ls.set('werf.history', days);
}
function remember(entry) {
  const k = dayKey(dateOf(entry));
  days = days.filter((h) => dayKey(dateOf(h)) !== k);
  days.push(entry);
  days.sort((a, b) => dateOf(b) - dateOf(a) || b.ts - a.ts);
  days = days.slice(0, 120);
  ls.set('werf.history', days);
}

function historyHTML() {
  if (!days.length) return '';
  return `<section class="hist" id="hist">
    <h3>${t('history')}</h3>
    ${days.map((h, i) => {
      const t = dayTitle(dateOf(h));
      const open = i === 0;
      return `<div class="day ${open ? 'open' : ''}">
        <button class="day-h" data-day="${i}" aria-expanded="${open}">
          <span class="day-t"><b>${esc(t.main)}</b><span>${esc(t.sub)}</span></span>
          <span class="day-c">${h.stops.length}</span>
          <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="day-b"><div class="day-in">
          ${h.stops.map((s, j) => `<a class="site" href="${esc(mapHref(s.query))}" target="_blank" rel="noopener">
            <div>${h.stops.length > 1 ? `<i class="mini-n">${j + 1}</i>` : ''}<b>${esc(s.street)}</b><span>${esc(s.company && s.city && s.company.endsWith(s.city) ? s.company : [s.company, s.city].filter(Boolean).join(', '))}</span></div>${I.arrow}
          </a>`).join('')}
        </div></div>
      </div>`;
    }).join('')}
  </section>`;
}

function bindHistory() {
  const hist = $('hist');
  if (!hist) return;
  hist.addEventListener('click', (e) => {
    const b = e.target.closest('.day-h');
    if (!b) return;
    const day = b.parentElement;
    const body = day.querySelector('.day-b');
    const open = !day.classList.contains('open');
    day.classList.toggle('open', open);
    b.setAttribute('aria-expanded', open);
    const h = body.firstElementChild.offsetHeight;
    if (reduced) { body.style.height = open ? 'auto' : '0px'; return; }
    animate(body, { height: open ? [0, h] : [h, 0] }, { type: 'spring', stiffness: 300, damping: 32 }).then(() => { body.style.height = open ? 'auto' : '0px'; });
    animate(b.querySelector('.chev'), { rotate: open ? 180 : 0 }, { duration: 0.25 });
    if (open) animate(day.querySelectorAll('.site'), { opacity: [0, 1], x: [-12, 0] }, { delay: (i) => i * 0.06, duration: 0.3 });
  });
  hist.querySelectorAll('.day').forEach((d) => {
    const body = d.querySelector('.day-b');
    body.style.height = d.classList.contains('open') ? 'auto' : '0px';
    if (d.classList.contains('open')) d.querySelector('.chev').style.transform = 'rotate(180deg)';
  });
}

/* ---------- ana ekran ---------- */
let introDone = false;
function home() {
  $('view').innerHTML = `
    <button class="drop" id="pick">
      <div class="ico">${I.image}</div>
      <h1>${t('dropTitle')}</h1>
      <p>${esc(t('dropText', { name }))}</p>
    </button>
    ${historyHTML()}`;
  $('pick').addEventListener('click', () => $('file').click());
  bindHistory();
  if (reduced) { if (!introDone) { introDone = true; if (askName) setTimeout(() => openNameSheet(true), 100); } return; }
  if (!introDone) {
    introDone = true;
    const reveal = () => {
      document.querySelectorAll('.intro').forEach((x) => x.remove());
      document.querySelectorAll('.who, .mark .word, .mark svg, .drop, .hist, .drop .ico, .drop h1, .drop p').forEach((el) => { el.style.opacity = ''; });
      document.querySelectorAll('.topo path').forEach((p) => { p.style.strokeDashoffset = '0'; });
    };
    const guard = setTimeout(reveal, 4000);
    intro().catch(reveal).finally(() => { clearTimeout(guard); if (askName) setTimeout(() => openNameSheet(true), 250); });
    return;
  }
  animate('.drop .ico', { y: [-30, 0], rotate: [-12, 0], opacity: [0, 1] }, { type: 'spring', stiffness: 260, damping: 14 });
  animate('.drop h1, .drop p, .hist', { opacity: [0, 1], y: [14, 0] }, { delay: 0.12, duration: 0.4 });
}

/* açılış: harita çizgileri çizilir, iğne düşer, rota çizgisi karta iner */
async function intro() {
  const topoPaths = [...document.querySelectorAll('.topo path')];
  topoPaths.forEach((p) => { p.setAttribute('pathLength', '1'); p.style.strokeDasharray = '1'; p.style.strokeDashoffset = '1'; });
  const hide = ['.who', '.mark .word', '.drop', '.hist'];
  hide.forEach((s) => document.querySelectorAll(s).forEach((el) => { el.style.opacity = 0; }));
  const pin = document.querySelector('.mark svg');
  pin.style.opacity = 0;

  // ortada büyük iğne
  const stage = document.createElement('div');
  stage.className = 'intro';
  stage.innerHTML = `<div class="intro-pin">${I.logo.replace('width="34" height="34"', 'width="120" height="120"')}</div><div class="intro-ring"></div><div class="intro-ring r2"></div>`;
  document.body.appendChild(stage);
  const bigPin = stage.querySelector('.intro-pin');
  const rings = stage.querySelectorAll('.intro-ring');

  const n = topoPaths.length;
  requestAnimationFrame(() => requestAnimationFrame(() => topoPaths.forEach((p, i) => {
    p.style.transition = `stroke-dashoffset 1.1s ease-out ${(i / n) * 0.9}s`;
    p.style.strokeDashoffset = '0';
  })));
  await animate(bigPin, { y: [-window.innerHeight * 0.6, 0], scaleY: [1.25, 1], opacity: [0, 1] }, { type: 'spring', stiffness: 260, damping: 15, delay: 0.25 });
  buzz([18, 40, 10]);
  animate(bigPin, { scaleX: [1.25, 1], scaleY: [0.8, 1] }, { type: 'spring', stiffness: 600, damping: 12 });
  rings.forEach((r, i) => animate(r, { opacity: [0.9, 0], scale: [0.3, 3.2] }, { duration: 1, delay: i * 0.18, ease: 'easeOut' }));
  await new Promise((r) => setTimeout(r, 450));

  // iğne logonun yerine uçar
  const from = bigPin.getBoundingClientRect();
  const to = pin.getBoundingClientRect();
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const sc = to.width / from.width;
  await animate(bigPin, { x: [0, dx], y: [0, dy], scale: [1, sc] }, { duration: 0.6, ease: [0.7, 0, 0.2, 1] });
  pin.style.opacity = 1;
  stage.remove();
  animate(pin, { scale: [1.3, 1] }, { type: 'spring', stiffness: 500, damping: 14 });

  const word = document.querySelector('.mark .word');
  word.style.opacity = 1;
  animate(word, { clipPath: ['inset(0 100% 0 0)', 'inset(0 0% 0 0)'], x: [-10, 0] }, { duration: 0.5, ease: 'easeOut' });
  animate('.who', { opacity: [0, 1], x: [20, 0] }, { duration: 0.4, delay: 0.15 });
  const drop = document.querySelector('.drop');
  animate(drop, { opacity: [0, 1], y: [40, 0], scale: [0.96, 1] }, { type: 'spring', stiffness: 200, damping: 22, delay: 0.2 });
  animate('.drop .ico', { scale: [0, 1], rotate: [-25, 0] }, { type: 'spring', stiffness: 320, damping: 13, delay: 0.42 });
  animate('.drop h1, .drop p', { opacity: [0, 1], y: [12, 0] }, { delay: (i) => 0.5 + i * 0.08, duration: 0.4 });
  const hist = document.querySelector('.hist');
  if (hist) {
    hist.style.opacity = 1;
    animate(hist.querySelectorAll('h3, .day'), { opacity: [0, 1], y: [18, 0] }, { delay: (i) => 0.65 + i * 0.07, duration: 0.4 });
  }
}

/* ---------- OCR ---------- */
let workerP = null;
let onProgress = () => {};
let onStage = () => {};
let lastStage = 'starting';
const STAGES = {
  'loading tesseract core': 'st_core',
  'initializing tesseract': 'st_init',
  'initialized tesseract': 'st_ready',
  'loading language traineddata': 'st_lang',
  'loaded language traineddata': 'st_langok',
  'initializing api': 'st_prep',
  'initialized api': 'st_ok',
  'recognizing text': 'st_read',
};
// Telefonun çekirdek sayısına göre 1-3 okuyucu paralel çalışır
const POOL = Math.min(3, Math.max(1, Math.floor((navigator.hardwareConcurrency || 2) / 2)));
const prog = {};
function getWorkers() {
  if (!workerP) {
    workerP = import('tesseract.js').then(({ createWorker }) => {
      const base = new URL('ocr/', location.href).href;
      const make = (k) => createWorker('eng', 1, {
        workerPath: `${base}worker.min.js`,
        corePath: base,
        langPath: base.replace(/\/$/, ''),
        gzip: false,
        workerBlobURL: false,
        cacheMethod: 'none',
        logger: (m) => {
          lastStage = m.status;
          onStage(STAGES[m.status] ? t(STAGES[m.status]) : m.status);
          if (m.status === 'recognizing text') {
            prog[k] = m.progress;
            const vals = Object.values(prog);
            onProgress(0.15 + (vals.reduce((x, y) => x + y, 0) / Math.max(1, vals.length)) * 0.85);
          }
        },
        errorHandler: (e) => { lastStage = `hata: ${e}`; },
      }).then(async (w) => {
        await w.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' });
        return w;
      });
      return Promise.all(Array.from({ length: POOL }, (_, k) => make(k)));
    });
    workerP.catch(() => { workerP = null; });
  }
  return workerP;
}

// Boş kenarları kırp, resmi boş satırlardan parçalara böl
function plan(clean, W, H, parts) {
  let x0 = W;
  let x1 = 0;
  let y0 = H;
  let y1 = 0;
  const blank = new Uint8Array(H);
  for (let y = 0; y < H; y++) {
    let any = false;
    const row = y * W;
    for (let x = 0; x < W; x++) {
      if (clean[row + x] < 200) { any = true; if (x < x0) x0 = x; if (x > x1) x1 = x; }
    }
    if (any) { if (y < y0) y0 = y; y1 = y; } else blank[y] = 1;
  }
  if (y1 <= y0) return [{ x: 0, y: 0, w: W, h: H }];
  x0 = Math.max(0, x0 - 6); x1 = Math.min(W - 1, x1 + 6); y0 = Math.max(0, y0 - 6); y1 = Math.min(H - 1, y1 + 6);
  const cuts = [y0];
  for (let k = 1; k < parts; k++) {
    const target = y0 + Math.round(((y1 - y0) * k) / parts);
    let best = -1;
    for (let d = 0; d < (y1 - y0) / (parts * 2); d++) {
      if (blank[target + d]) { best = target + d; break; }
      if (blank[target - d]) { best = target - d; break; }
    }
    if (best > cuts[cuts.length - 1] + 20) cuts.push(best);
  }
  cuts.push(y1 + 1);
  const out = [];
  for (let k = 0; k < cuts.length - 1; k++) out.push({ x: x0, y: cuts[k], w: x1 - x0 + 1, h: cuts[k + 1] - cuts[k] });
  return out;
}

function loadImg(url) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
}

function classify(d) {
  let green = 0;
  let ink = 0;
  let yellow = 0;
  let bg = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    bg++;
    if ((r > 190 && g > 170 && b < 140 && r - b > 90) || (r < 140 && g > 190 && b > 190)) yellow++;
    if (Math.min(r, g, b) < 170 && !(b < 140 && r > 190 && g > 170) && !(r < 140 && g > 190 && b > 190)) { ink++; if (g > r + 30 && g > b + 10) green++; }
  }
  if (bg && yellow / bg > 0.3) return 'yellow';
  if (ink && green / ink > 0.4) return 'green';
  return null;
}

async function prepare(img) {
  const W = 1000;
  const H = Math.round((img.naturalHeight * W) / img.naturalWidth);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, W, H);
  const id = ctx.getImageData(0, 0, W, H);
  const px = id.data;
  const g = new Uint8ClampedArray(W * H);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = Math.max(px[i], px[i + 1], px[i + 2]);
  const clean = cleanGrid(g, W, H);
  const gc = document.createElement('canvas');
  gc.width = W; gc.height = H;
  const gctx = gc.getContext('2d');
  const out = gctx.createImageData(W, H);
  for (let j = 0, i = 0; j < clean.length; j++, i += 4) { out.data[i] = out.data[i + 1] = out.data[i + 2] = clean[j]; out.data[i + 3] = 255; }
  gctx.putImageData(out, 0, 0);
  const big = document.createElement('canvas');
  big.width = W * 2; big.height = H * 2;
  const bctx = big.getContext('2d');
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(gc, 0, 0, W * 2, H * 2);
  const colorOf = (seg) => {
    const x0 = Math.max(0, Math.floor(seg.x0 / 2) - 2);
    const y0 = Math.max(0, Math.floor(seg.y0 / 2) - 2);
    const w = Math.max(1, Math.ceil((seg.x1 - seg.x0) / 2) + 4);
    const h = Math.max(1, Math.ceil((seg.y1 - seg.y0) / 2) + 4);
    return classify(ctx.getImageData(x0, y0, Math.min(w, W - x0), Math.min(h, H - y0)).data);
  };
  return { canvas: big, W: W * 2, H: H * 2, colorOf, clean, w1: W, h1: H };
}

/* ---------- işlem akışı ---------- */
$('file').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (f) run(f);
});

async function run(file) {
  const url = URL.createObjectURL(file);
  $('view').innerHTML = `
    <div class="stage" id="stage">
      <div class="scroller" id="scroller">
        <div class="sheet-img" id="sheetImg"><img id="img" alt="${t('uploaded')}" /><div class="dim" id="dim"></div></div>
      </div>
      <div class="scan" id="scan"></div>
      <div class="status" id="status"><span id="stTxt">${t('st_list')}</span><div class="bar"><i id="barI"></i></div></div>
    </div>
    <div id="out"></div>`;
  $('img').src = url;
  if (!reduced) animate('#stage', { opacity: [0, 1], scale: [0.96, 1] }, { type: 'spring', stiffness: 240, damping: 24 });

  let scanAnim = null;
  if (!reduced) {
    const h = $('stage').offsetHeight;
    scanAnim = animate('#scan', { y: [-90, h] }, { duration: 1.4, repeat: Infinity, ease: 'easeInOut', repeatType: 'reverse' });
  } else $('scan').style.display = 'none';

  const barI = $('barI');
  let tick = Date.now();
  onProgress = (p) => { tick = Date.now(); barI.style.width = `${Math.round(Math.min(1, p) * 100)}%`; };
  onStage = (t) => { tick = Date.now(); const el = $('stTxt'); if (el) el.textContent = t; };
  let watch;
  const stall = new Promise((_, rej) => {
    watch = setInterval(() => { if (Date.now() - tick > 45000) rej(new Error(t('stall', { stage: lastStage }))); }, 1000);
  });

  try {
    onStage(t('st_img'));
    const img = await loadImg(url);
    const prep = await prepare(img);
    onStage(t('st_core'));
    const workers = await Promise.race([getWorkers(), stall]);
    onStage(t('st_read'));
    Object.keys(prog).forEach((k) => delete prog[k]);
    const pieces = plan(prep.clean, prep.w1, prep.h1, workers.length).map((r) => {
      const c = document.createElement('canvas');
      c.width = r.w * 2; c.height = r.h * 2;
      c.getContext('2d').drawImage(prep.canvas, r.x * 2, r.y * 2, r.w * 2, r.h * 2, 0, 0, r.w * 2, r.h * 2);
      return { r, c };
    });
    const results = await Promise.race([
      Promise.all(pieces.map((pc, k) => workers[k % workers.length].recognize(pc.c, {}, { blocks: true }))),
      stall,
    ]);
    clearInterval(watch);
    const words = [];
    results.forEach(({ data }, k) => {
      const ox = pieces[k].r.x * 2;
      const oy = pieces[k].r.y * 2;
      for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) {
        words.push({ t: w.text, x0: w.bbox.x0 + ox, x1: w.bbox.x1 + ox, y0: w.bbox.y0 + oy, y1: w.bbox.y1 + oy });
      }
    });
    current = { url, words, W: prep.W, H: prep.H, colorOf: prep.colorOf };
    if (scanAnim) scanAnim.stop();
    await Promise.all([
      reduced ? null : animate('#scan', { opacity: 0 }, { duration: 0.25 }),
      reduced ? null : animate('#status', { opacity: 0, y: 12 }, { duration: 0.25 }),
    ]);
    $('scan').remove();
    $('status').remove();
    show();
  } catch (err) {
    clearInterval(watch);
    if (scanAnim) scanAnim.stop();
    workerP = null;
    $('view').innerHTML = `<div class="miss"><h2>${t('failTitle')}</h2><p>${t('failText')}</p><p style="font-size:13px">${t('detail')}: ${esc(err && err.message ? err.message : String(err))} · ${esc(lastStage)}</p></div>
      <button class="again" id="again">${t('pickOther')}</button>`;
    $('again').addEventListener('click', () => $('file').click());
    console.error(err);
  }
}

const pct = (b, W, H) => `left:${(b.x / W) * 100}%;top:${(b.y / H) * 100}%;width:${(b.w / W) * 100}%;height:${(b.h / H) * 100}%`;
function boxPad(b, p = 16) {
  return { x: b.x0 - p, y: b.y0 - p * 0.7, w: b.x1 - b.x0 + p * 2, h: b.y1 - b.y0 + p * 1.4 };
}
function union(a, b) {
  if (!b) return a;
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

function show() {
  const { words, W, H, colorOf } = current;
  const r = analyze(words, W, name, colorOf);
  const out = $('out');
  const sheet = $('sheetImg');
  sheet.querySelectorAll('svg, .hl').forEach((s) => s.remove());

  const sitesHTML = r.sites.length ? `
    <section class="sites">
      <h3>${t('sitesTitle')}</h3>
      ${r.sites.map((s) => `<a class="site" href="${esc(mapHref(s.query))}" target="_blank" rel="noopener"><div><b>${esc(s.street)}</b><span>${esc(s.company)}</span></div>${I.arrow}</a>`).join('')}
    </section>` : '';

  if (!r.found || !r.result) {
    animate('#dim', { opacity: 0 }, { duration: 0.2 });
    out.innerHTML = `
      <div class="miss">
        <h2>${esc(t(r.found ? 'noAddrTitle' : 'notFoundTitle', { name }))}</h2>
        <p>${t(r.found ? 'noAddrText' : 'notFoundText')}</p>
      </div>
      ${sitesHTML}
      <button class="again" id="again">${t('loadOther')}</button>`;
    $('again').addEventListener('click', () => $('file').click());
    if (!reduced) animate('.miss, .sites, .again', { opacity: [0, 1], y: [20, 0] }, { duration: 0.35 });
    return;
  }

  const list = (r.result.list && r.result.list.length ? r.result.list : [r.result]);
  const n = boxPad(r.nameSeg);
  const boxes = list.map((s) => boxPad(union(s.streetBox, s.companyBox)));
  const sx = n.x + n.w;
  const sy = n.y + n.h / 2;
  const routes = boxes.map((a) => {
    const ex = a.x;
    const ey = a.y + a.h / 2;
    const mx = (sx + ex) / 2;
    return `M${sx} ${sy} C${mx} ${sy}, ${mx} ${ey}, ${ex} ${ey}`;
  });
  sheet.insertAdjacentHTML('beforeend', `
    <svg class="overlay" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      ${routes.map((d) => `<path class="route" d="${d}"/>`).join('')}
    </svg>
    <div class="hl" id="hlName" style="${pct(n, W, H)}"></div>
    ${boxes.map((a) => `<div class="hl hl-addr" style="${pct(a, W, H)}"></div>`).join('')}`);

  const stops = list.map((s) => ({ ...s, q: s.query }));
  const hasMap = (s) => !(s.plain && !/\d/.test(s.street));
  const LABEL = { MON: t('kind_MON'), DEM: t('kind_DEM') };
  const multi = stops.length > 1;
  const routeUrl = () => {
    const qs = stops.filter(hasMap).map((s) => s.q);
    if (qs.length < 2) return null;
    return routeHref(qs);
  };
  const save = () => {
    remember({ date: r.date, stops: stops.map((s) => ({ company: s.company, street: s.street, city: s.city, query: s.q, label: s.label })), name, ts: Date.now() });
  };
  save();

  out.innerHTML = `
    <article class="card" id="card">
      <div class="card-head">
        <div class="pin-wrap"><span class="ring" id="ring"></span><span class="pin" id="pin" style="color:var(--orange)">${I.pin(34)}</span></div>
        <div>
          ${r.date ? `<span class="date">${esc(r.date)}</span>` : ''}
          ${multi ? `<div class="count">${t('addrCount', { n: stops.length })}</div>` : ''}
        </div>
      </div>
      ${stops.map((s, i) => `
        <section class="stop" data-i="${i}">
          ${multi ? `<div class="stop-n">${i + 1}</div>` : ''}
          <div class="stop-body">
            ${s.label ? `<div class="kind">${esc(LABEL[s.label] || s.label)}</div>` : ''}
            ${s.company ? `<div class="company">${esc(s.company)}</div>` : ''}
            <div class="street">${esc(s.street)}</div>
            ${s.city ? `<div class="city">${esc(s.city)}</div>` : ''}
            ${s.notes && s.notes.length ? `<div class="notes">${s.notes.map((x) => `<span class="note">${esc(x)}</span>`).join('')}</div>` : ''}
            ${hasMap(s) ? `<a class="go ${multi ? 'small' : ''}" data-go="${i}" href="${esc(mapHref(s.q))}" target="_blank" rel="noopener">${I.pin(20)}${t('openMap')}</a>` : ''}
            <div class="edit"><input data-q="${i}" value="${esc(s.q)}" aria-label="${t('mapSearch')}" /><small>${t('fixHint')}</small></div>
          </div>
        </section>`).join('')}
      ${multi && routeUrl() ? `<a class="go route-btn" id="routeBtn" href="${esc(routeUrl())}" target="_blank" rel="noopener">${I.arrow}${t('route', { n: stops.filter(hasMap).length })}</a>` : ''}
      <div class="row2">
        <button class="sec" id="copy">${t('copy')}</button>
        <button class="sec" id="share">${t('share')}</button>
        <button class="sec" id="fix" aria-pressed="false">${t('fix')}</button>
      </div>
      ${r.mates.length ? `<div class="meta"><div><div class="lbl">${t('crew')}</div><div class="val">${r.mates.map(esc).join(', ')}</div></div></div>` : ''}
    </article>
    ${sitesHTML}
    <div class="row2 end"><button class="again" id="again">${t('newList')}</button><button class="again" id="toHist">${t('history')}</button></div>`;

  const allText = () => stops.map((s, i) => `${multi ? `${i + 1}. ` : ''}${s.company ? `${s.company}\n` : ''}${s.q}${hasMap(s) ? `\n${mapsUrl(s.q)}` : ''}`).join('\n\n')
    + (multi && routeUrl() ? `\n\n${t('routeWord')}: ${routeUrl()}` : '');
  out.querySelectorAll('[data-q]').forEach((inp) => inp.addEventListener('input', () => {
    const i = +inp.dataset.q;
    stops[i].q = inp.value.trim() || list[i].query;
    const go = out.querySelector(`[data-go="${i}"]`);
    if (go) go.href = mapHref(stops[i].q);
    const rb = $('routeBtn');
    if (rb && routeUrl()) rb.href = routeUrl();
    save();
  }));
  $('fix').addEventListener('click', () => {
    const on = !out.querySelector('.edit.on');
    out.querySelectorAll('.edit').forEach((e) => e.classList.toggle('on', on));
    $('fix').setAttribute('aria-pressed', on);
    if (on) out.querySelector('[data-q]').focus();
  });
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(allText()); toast(multi ? t('copiedAll') : t('copiedLink')); } catch { toast(t('copyFail')); }
  });
  $('share').addEventListener('click', async () => {
    const text = allText();
    try {
      if (Capacitor.isNativePlatform()) await Share.share({ title: t('shareTitle'), text });
      else if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast(t('copied')); }
    } catch { /* iptal */ }
  });
  $('again').addEventListener('click', () => $('file').click());
  $('toHist').addEventListener('click', () => { current = null; home(); window.scrollTo(0, 0); });

  choreograph(n, boxes);
}

async function choreograph(n, boxes) {
  const scroller = $('scroller');
  const sheet = $('sheetImg');
  const scale = sheet.offsetWidth / current.W;
  const ys = [n.y, ...boxes.map((b) => b.y)];
  const target = Math.max(0, ((Math.min(...ys) + Math.max(...ys)) / 2) * scale - scroller.offsetHeight / 2 + 20);
  const hlN = $('hlName');
  const hlA = [...sheet.querySelectorAll('.hl-addr')];
  const routes = [...sheet.querySelectorAll('.route')];
  if (reduced) {
    scroller.scrollTop = target;
    [hlN, ...hlA].forEach((x) => { x.style.opacity = 1; });
    routes.forEach((x) => { x.style.display = 'none'; });
    $('dim').style.opacity = 1;
    return;
  }
  const lens = routes.map((rt) => {
    const len = rt.getTotalLength();
    rt.style.strokeWidth = `${3 / scale}`;
    rt.style.strokeDasharray = `${len}`;
    rt.style.strokeDashoffset = `${len}`;
    return len;
  });
  $('card').style.opacity = 0;

  await animate(scroller.scrollTop, target, { duration: 0.9, ease: [0.65, 0, 0.35, 1], onUpdate: (v) => { scroller.scrollTop = v; } });
  animate('#dim', { opacity: 1 }, { duration: 0.4 });
  buzz(12);
  await animate(hlN, { opacity: [0, 1], scale: [1.6, 1] }, { type: 'spring', stiffness: 380, damping: 22 });
  for (let i = 0; i < routes.length; i++) {
    const rt = routes[i];
    await animate(lens[i], 0, { duration: 0.5, ease: 'easeInOut', onUpdate: (v) => { rt.style.strokeDashoffset = `${v}`; } });
    buzz(12);
    animate(hlA[i], { opacity: [0, 1], scale: [1.4, 1] }, { type: 'spring', stiffness: 380, damping: 22 });
  }
  await new Promise((res) => setTimeout(res, 220));

  const card = $('card');
  card.style.opacity = '';
  animate(card, { y: [80, 0], opacity: [0, 1] }, { type: 'spring', stiffness: 210, damping: 24 });
  animate('.stop', { opacity: [0, 1], x: [-18, 0] }, { delay: (i) => 0.2 + i * 0.12, duration: 0.4 });
  animate('.street', { clipPath: ['inset(0 100% 0 0)', 'inset(0 0% 0 0)'] }, { duration: 0.5, delay: 0.25, ease: 'easeOut' });
  await animate('#pin', { y: [-90, 0], scaleY: [1.2, 1] }, { type: 'spring', stiffness: 520, damping: 13, delay: 0.15 });
  buzz([20, 30, 10]);
  animate('#ring', { opacity: [0.9, 0], scale: [0.4, 2.4] }, { duration: 0.7, ease: 'easeOut' });
  animate('.go', { scale: [1, 1.04, 1] }, { duration: 0.5, delay: 0.25 });
  animate('.sites, .row2.end', { opacity: [0, 1], y: [16, 0] }, { duration: 0.4, delay: 0.3 });
}

/* ---------- isim ---------- */
$('who').addEventListener('click', () => openNameSheet(false));

function openNameSheet(start) {
  if (document.querySelector('.sheet')) return;
  history.pushState({ s: 1 }, '');
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const sh = document.createElement('div');
  sh.className = 'sheet';
  sh.setAttribute('role', 'dialog');
  let pick = getLang();
  const paintSheet = () => {
    const prev = sh.querySelector('#nm') ? sh.querySelector('#nm').value : name;
    setLang(pick);
    sh.innerHTML = `<div class="grip"></div><h2>${start ? t('askTitle') : t('editTitle')}</h2>
      <div class="lab">${t('langLabel')}</div>
      <div class="langs" role="group" aria-label="${t('langLabel')}">${LANGS.map((l) => `<button class="lang ${l.code === pick ? 'on' : ''}" data-lang="${l.code}" aria-pressed="${l.code === pick}">${l.label}</button>`).join('')}</div>
      <div class="lab">${t('nameLabel')}</div>
      <input id="nm" value="${esc(prev)}" autocomplete="off" autocapitalize="words" enterkeyhint="done" />
      <p>${t('nameHint')}</p>
      <button class="go" id="nmSave">${start ? t('cont') : t('save')}</button>`;
    sh.querySelector('#nmSave').addEventListener('click', submit);
    sh.querySelector('#nm').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    sh.querySelectorAll('[data-lang]').forEach((bt) => bt.addEventListener('click', () => {
      pick = bt.dataset.lang;
      paintSheet();
      if (!reduced) animate(sh.querySelector('h2'), { opacity: [0, 1], y: [6, 0] }, { duration: 0.25 });
    }));
  };
  document.body.append(scrim, sh);
  animate(scrim, { opacity: 1 }, { duration: 0.2 });
  if (!reduced) animate(sh, { y: ['100%', '0%'] }, { type: 'spring', stiffness: 240, damping: 26 });
  let closed = false;
  const close = (fromPop) => {
    if (closed) return;
    closed = true;
    setLang(ls.get('werf.lang', 'en'));
    window.removeEventListener('popstate', onPop);
    if (!fromPop) history.back();
    animate(scrim, { opacity: 0 }, { duration: 0.2 });
    animate(sh, { y: '100%' }, { duration: 0.22, ease: 'easeIn' }).then(() => { scrim.remove(); sh.remove(); });
  };
  const onPop = () => close(true);
  window.addEventListener('popstate', onPop);
  scrim.addEventListener('click', () => close(false));
  function submit() {
    const v = sh.querySelector('#nm').value.trim();
    const langChanged = pick !== ls.get('werf.lang', 'en');
    const changed = v && v !== name;
    if (v) { name = v; ls.set('werf.name', name); }
    ls.set('werf.lang', pick);
    setLang(pick);
    renderWho();
    sh.querySelector('#nm').blur();
    close(false);
    if (!changed && !langChanged) return;
    if (current && $('sheetImg')) show();
    else home();
  }
  paintSheet();
}

if (Capacitor.isNativePlatform()) {
  StatusBar.setBackgroundColor({ color: '#1C1F22' }).catch(() => {});
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
}
home();
// okuma motorunu önceden hazırla, liste seçilince beklemesin
setTimeout(() => { getWorkers().catch(() => {}); }, 2600);
