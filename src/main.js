import '@fontsource-variable/archivo/wdth.css';
import './style.css';
import { animate } from 'motion';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { StatusBar, Style } from '@capacitor/status-bar';
import { cleanGrid } from './prep.js';
import { analyze, mapsUrl } from './parse.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* yok */ } };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* dolu */ } },
};

let name = ls.get('werf.name', 'Levent');
let last = ls.get('werf.last', null);
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
    <div class="mark">${I.logo}Werf</div>
    <button class="who" id="who" aria-label="Aranacak isim">${I.edit}<span id="whoName"></span></button>
  </header>
  <main id="view"></main>
  <input type="file" id="file" accept="image/*" hidden />
  <div class="toast" id="toast" role="status"></div>
`;
const $ = (id) => document.getElementById(id);
const renderWho = () => { $('whoName').textContent = name; };
renderWho();

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  animate(t, { opacity: [0, 1], y: [12, 0] }, { duration: 0.2 });
  clearTimeout(toast.t);
  toast.t = setTimeout(() => animate(t, { opacity: 0 }, { duration: 0.3 }), 1600);
}

/* ---------- ana ekran ---------- */
function home() {
  $('view').innerHTML = `
    <button class="drop" id="pick">
      <div class="ico">${I.image}</div>
      <h1>Günlük listeyi yükle</h1>
      <p>Ekran görüntüsünü seç, ${esc(name)} için adres ve harita linki çıksın.</p>
    </button>
    ${last ? `<section class="last">
      <div class="last-h">Son ${(last.stops || [last]).length > 1 ? 'adresler' : 'adres'}${last.date ? `, ${esc(last.date)}` : ''}</div>
      ${(last.stops || [last]).map((s) => `<a class="site" href="${esc(mapsUrl(s.query))}" target="_blank" rel="noopener">
        <div><b>${esc(s.street)}</b><span>${esc([s.company, s.city].filter(Boolean).join(', '))}</span></div>${I.arrow}
      </a>`).join('')}
    </section>` : ''}`;
  $('pick').addEventListener('click', () => $('file').click());
  if (!reduced) {
    animate('.drop .ico', { y: [-30, 0], rotate: [-12, 0], opacity: [0, 1] }, { type: 'spring', stiffness: 260, damping: 14 });
    animate('.drop h1, .drop p, .last', { opacity: [0, 1], y: [14, 0] }, { delay: 0.12, duration: 0.4 });
  }
}

/* ---------- OCR ---------- */
let workerP = null;
let onProgress = () => {};
let onStage = () => {};
let lastStage = 'başlıyor';
const STAGES = {
  'loading tesseract core': 'Okuma motoru yükleniyor',
  'initializing tesseract': 'Okuma motoru başlatılıyor',
  'initialized tesseract': 'Okuma motoru hazır',
  'loading language traineddata': 'Dil dosyası yükleniyor',
  'loaded language traineddata': 'Dil dosyası yüklendi',
  'initializing api': 'Hazırlanıyor',
  'initialized api': 'Hazır',
  'recognizing text': 'Yazılar çözülüyor',
};
function getWorker() {
  if (!workerP) {
    workerP = import('tesseract.js').then(({ createWorker }) => {
      const base = new URL('ocr/', location.href).href;
      return createWorker('eng', 1, {
        workerPath: `${base}worker.min.js`,
        corePath: base,
        langPath: base.replace(/\/$/, ''),
        gzip: false,
        workerBlobURL: false,
        cacheMethod: 'none',
        logger: (m) => {
          lastStage = m.status;
          onStage(STAGES[m.status] || m.status);
          if (m.status === 'recognizing text') onProgress(0.25 + m.progress * 0.75); else if (m.progress) onProgress(m.progress * 0.25);
        },
        errorHandler: (e) => { lastStage = `hata: ${e}`; },
      }).then(async (w) => {
        await w.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' });
        return w;
      });
    });
    workerP.catch(() => { workerP = null; });
  }
  return workerP;
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
  return { canvas: big, W: W * 2, H: H * 2, colorOf };
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
        <div class="sheet-img" id="sheetImg"><img id="img" alt="Yüklenen liste" /><div class="dim" id="dim"></div></div>
      </div>
      <div class="scan" id="scan"></div>
      <div class="status" id="status"><span id="stTxt">Liste okunuyor</span><div class="bar"><i id="barI"></i></div></div>
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
    watch = setInterval(() => { if (Date.now() - tick > 45000) rej(new Error(`45 saniyedir ilerleme yok (${lastStage})`)); }, 1000);
  });

  try {
    onStage('Resim hazırlanıyor');
    const img = await loadImg(url);
    const prep = await prepare(img);
    onStage('Okuma motoru yükleniyor');
    const worker = await Promise.race([getWorker(), stall]);
    onStage('Yazılar çözülüyor');
    const { data } = await Promise.race([worker.recognize(prep.canvas, {}, { blocks: true }), stall]);
    clearInterval(watch);
    const words = [];
    for (const b of data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) words.push({ t: w.text, ...w.bbox });
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
    $('view').innerHTML = `<div class="miss"><h2>Liste okunamadı</h2><p>Okuma tamamlanamadı. Tekrar dene. Yine olmazsa bu ekranın görüntüsünü gönder.</p><p style="font-size:13px">Ayrıntı: ${esc(err && err.message ? err.message : String(err))} · ${esc(lastStage)}</p></div>
      <button class="again" id="again">Başka resim seç</button>`;
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
      <h3>Listedeki şantiyeler</h3>
      ${r.sites.map((s) => `<a class="site" href="${esc(s.url)}" target="_blank" rel="noopener"><div><b>${esc(s.street)}</b><span>${esc(s.company)}</span></div>${I.arrow}</a>`).join('')}
    </section>` : '';

  if (!r.found || !r.result) {
    animate('#dim', { opacity: 0 }, { duration: 0.2 });
    out.innerHTML = `
      <div class="miss">
        <h2>${r.found ? `${esc(name)} için adres yok` : `${esc(name)} listede yok`}</h2>
        <p>${r.found ? 'İsmin yanındaki sütunda adres bulunamadı.' : 'İsim okunamadı ya da bu listede değil. Üstten ismi kontrol et ya da aşağıdan şantiyeyi seç.'}</p>
      </div>
      ${sitesHTML}
      <button class="again" id="again">Başka liste yükle</button>`;
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
  const LABEL = { MON: 'Kurulum (MON)', DEM: 'Söküm (DEM)' };
  const multi = stops.length > 1;
  const routeUrl = () => {
    const qs = stops.filter(hasMap).map((s) => s.q);
    if (qs.length < 2) return null;
    const dest = qs[qs.length - 1];
    const way = qs.slice(0, -1).join('|');
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&waypoints=${encodeURIComponent(way)}&travelmode=driving`;
  };
  const save = () => {
    last = { date: r.date, stops: stops.map((s) => ({ company: s.company, street: s.street, city: s.city, query: s.q, label: s.label })), name, ts: Date.now() };
    ls.set('werf.last', last);
  };
  save();

  out.innerHTML = `
    <article class="card" id="card">
      <div class="card-head">
        <div class="pin-wrap"><span class="ring" id="ring"></span><span class="pin" id="pin" style="color:var(--orange)">${I.pin(34)}</span></div>
        <div>
          ${r.date ? `<span class="date">${esc(r.date)}</span>` : ''}
          ${multi ? `<div class="count">${stops.length} adres</div>` : ''}
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
            ${hasMap(s) ? `<a class="go ${multi ? 'small' : ''}" data-go="${i}" href="${esc(mapsUrl(s.q))}" target="_blank" rel="noopener">${I.pin(20)}Haritada aç</a>` : ''}
            <div class="edit"><input data-q="${i}" value="${esc(s.q)}" aria-label="Harita araması" /><small>Okuma hatalıysa buradan düzelt, link hemen güncellenir.</small></div>
          </div>
        </section>`).join('')}
      ${multi && routeUrl() ? `<a class="go route-btn" id="routeBtn" href="${esc(routeUrl())}" target="_blank" rel="noopener">${I.arrow}Rotayı aç (${stops.filter(hasMap).length} durak)</a>` : ''}
      <div class="row2">
        <button class="sec" id="copy">Kopyala</button>
        <button class="sec" id="share">Paylaş</button>
        <button class="sec" id="fix" aria-pressed="false">Düzelt</button>
      </div>
      ${r.mates.length ? `<div class="meta"><div><div class="lbl">Ekipte</div><div class="val">${r.mates.map(esc).join(', ')}</div></div></div>` : ''}
    </article>
    ${sitesHTML}
    <button class="again" id="again">Yeni liste yükle</button>`;

  const allText = () => stops.map((s, i) => `${multi ? `${i + 1}. ` : ''}${s.company ? `${s.company}\n` : ''}${s.q}${hasMap(s) ? `\n${mapsUrl(s.q)}` : ''}`).join('\n\n')
    + (multi && routeUrl() ? `\n\nRota: ${routeUrl()}` : '');
  out.querySelectorAll('[data-q]').forEach((inp) => inp.addEventListener('input', () => {
    const i = +inp.dataset.q;
    stops[i].q = inp.value.trim() || list[i].query;
    const go = out.querySelector(`[data-go="${i}"]`);
    if (go) go.href = mapsUrl(stops[i].q);
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
    try { await navigator.clipboard.writeText(allText()); toast(multi ? 'Adresler kopyalandı' : 'Link kopyalandı'); } catch { toast('Kopyalanamadı'); }
  });
  $('share').addEventListener('click', async () => {
    const text = allText();
    try {
      if (Capacitor.isNativePlatform()) await Share.share({ title: 'Adres', text });
      else if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast('Kopyalandı'); }
    } catch { /* iptal */ }
  });
  $('again').addEventListener('click', () => $('file').click());

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
  animate('.sites, .again', { opacity: [0, 1], y: [16, 0] }, { duration: 0.4, delay: 0.3 });
}

/* ---------- isim ---------- */
$('who').addEventListener('click', () => {
  history.pushState({ s: 1 }, '');
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const sh = document.createElement('div');
  sh.className = 'sheet';
  sh.setAttribute('role', 'dialog');
  sh.innerHTML = `<div class="grip"></div><h2>Kimi arayalım?</h2><p>Listede bu isim aranır. Ad yeterli, istersen soyadını da yaz.</p>
    <input id="nm" value="${esc(name)}" autocomplete="off" /><button class="go" id="nmSave">Kaydet</button>`;
  document.body.append(scrim, sh);
  animate(scrim, { opacity: 1 }, { duration: 0.2 });
  if (!reduced) animate(sh, { y: ['100%', '0%'] }, { type: 'spring', stiffness: 240, damping: 26 });
  let closed = false;
  const close = (fromPop) => {
    if (closed) return;
    closed = true;
    window.removeEventListener('popstate', onPop);
    if (!fromPop) history.back();
    animate(scrim, { opacity: 0 }, { duration: 0.2 });
    animate(sh, { y: '100%' }, { duration: 0.22, ease: 'easeIn' }).then(() => { scrim.remove(); sh.remove(); });
  };
  const onPop = () => close(true);
  window.addEventListener('popstate', onPop);
  scrim.addEventListener('click', () => close(false));
  sh.querySelector('#nmSave').addEventListener('click', () => {
    const v = sh.querySelector('#nm').value.trim();
    if (v) { name = v; ls.set('werf.name', name); renderWho(); }
    close(false);
    if (current && $('sheetImg')) show(); else home();
  });
});

if (Capacitor.isNativePlatform()) {
  StatusBar.setBackgroundColor({ color: '#1C1F22' }).catch(() => {});
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
}
home();
