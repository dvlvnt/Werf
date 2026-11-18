// Kullanım rehberi: kaydırılabilir, animasyonlu 5 adım
import { animate } from 'motion';
import { t } from './i18n.js';

const O = '#FF6A13';
const G = '#1C1F22';
const B = '#EDEAE3';
const S = '#3A4046';

const rows = (x, y, n, w) => Array.from({ length: n }, (_, i) => `<rect x="${x}" y="${y + i * 13}" width="${w}" height="7" rx="2" fill="${S}"/>`).join('');

const ART = [
  // 1: telefon + tablo + deklanşör
  `<g class="g-phone"><rect x="105" y="20" width="90" height="180" rx="16" fill="${G}" stroke="${S}" stroke-width="3"/>
    <rect x="113" y="38" width="74" height="138" rx="4" fill="${B}"/>
    <rect x="113" y="38" width="74" height="12" fill="#B6D7A8"/>
    ${rows(118, 56, 8, 30)}${rows(152, 56, 8, 30).replace(/fill="#3A4046"/g, 'fill="#9AA1A7"')}
    <rect x="152" y="82" width="30" height="7" rx="2" fill="#F5D547"/>
    <rect x="113" y="166" width="74" height="10" fill="#DDD9D0"/><rect x="140" y="168" width="28" height="6" rx="2" fill="#2E8B57"/></g>
  <rect class="g-flash" x="113" y="38" width="74" height="138" rx="4" fill="#fff" opacity="0"/>
  <g class="g-corners" stroke="${O}" stroke-width="4" fill="none" stroke-linecap="round">
    <path d="M98 40v-14h14"/><path d="M202 40v-14h-14"/><path d="M98 182v14h14"/><path d="M202 182v14h-14"/></g>`,
  // 2: turuncu kart + uçan küçük resim + tarama çizgisi
  `<rect x="60" y="70" width="180" height="120" rx="22" fill="#262A2E" stroke="${S}" stroke-width="3" stroke-dasharray="8 6"/>
    <rect class="g-ico" x="128" y="92" width="44" height="44" rx="14" fill="${O}"/>
    <path class="g-ico" d="M140 104h20v20h-20z M144 120l5-6 4 4 3-3 4 5" fill="none" stroke="${G}" stroke-width="3" stroke-linejoin="round"/>
    <rect x="95" y="150" width="110" height="9" rx="4" fill="${S}"/>
    <g class="g-thumb"><rect x="190" y="8" width="44" height="70" rx="6" fill="${B}"/>${rows(196, 18, 4, 32)}</g>
    <rect class="g-scan" x="62" y="72" width="176" height="4" fill="${O}" opacity="0"/>`,
  // 3: harita + iki iğne + rota
  `<g stroke="#2E3338" stroke-width="2" fill="none">
     <path d="M20 60c60-30 120 20 260-10"/><path d="M20 110c80-40 150 30 260-20"/><path d="M20 160c70-30 140 25 260-5"/><path d="M20 200c90-20 160 10 260-15"/></g>
   <path class="g-route" d="M90 160C120 90 180 170 215 85" fill="none" stroke="${O}" stroke-width="4" stroke-linecap="round" stroke-dasharray="6 9"/>
   <g class="g-pin1"><path d="M90 160c-12-16-20-26-20-36a20 20 0 1140 0c0 10-8 20-20 36z" fill="${O}"/><circle cx="90" cy="124" r="7" fill="${G}"/></g>
   <g class="g-pin2"><path d="M215 85c-12-16-20-26-20-36a20 20 0 1140 0c0 10-8 20-20 36z" fill="${O}"/><circle cx="215" cy="49" r="7" fill="${G}"/></g>
   <ellipse class="g-ring" cx="215" cy="87" rx="18" ry="5" fill="none" stroke="${O}" stroke-width="2" opacity="0"/>`,
  // 4: kart + notlar + kalem
  `<rect x="50" y="30" width="200" height="165" rx="20" fill="${B}"/>
   <rect x="70" y="50" width="70" height="10" rx="4" fill="#9AA1A7"/>
   <rect x="70" y="68" width="130" height="16" rx="5" fill="${G}"/>
   <rect class="g-n1" x="70" y="98" width="110" height="18" rx="5" fill="#F5D547"/>
   <rect class="g-n2" x="70" y="122" width="140" height="18" rx="5" fill="#7FE3EC"/>
   <rect x="70" y="155" width="160" height="24" rx="10" fill="${O}"/>
   <g class="g-pen"><path d="M228 40l14 14-38 38-18 4 4-18z" fill="${G}"/><path d="M228 40l14 14" stroke="${O}" stroke-width="5"/></g>`,
  // 5: geçmiş listesi + ayar düğmesi
  `<rect x="190" y="18" width="80" height="26" rx="13" fill="#262A2E"/><rect x="198" y="25" width="20" height="12" rx="4" fill="${S}"/><rect x="224" y="27" width="38" height="8" rx="3" fill="${B}"/>
   ${[0, 1, 2].map((i) => `<g class="g-day"><rect x="40" y="${60 + i * 50}" width="220" height="40" rx="12" fill="${i === 0 ? '#2B3035' : '#262A2E'}"/>
     <rect x="54" y="${70 + i * 50}" width="70" height="9" rx="3" fill="${B}"/><rect x="54" y="${84 + i * 50}" width="50" height="6" rx="3" fill="#9AA1A7"/>
     <circle cx="226" cy="${80 + i * 50}" r="9" fill="${O}"/></g>`).join('')}
   <circle class="g-tap" cx="230" cy="31" r="16" fill="none" stroke="${O}" stroke-width="3" opacity="0"/>`,
];

function play(i, svg, reduced) {
  if (reduced) return;
  const q = (s) => svg.querySelectorAll(s);
  if (i === 0) {
    animate(q('.g-phone'), { y: [20, 0], opacity: [0, 1] }, { type: 'spring', stiffness: 220, damping: 20 });
    animate(q('.g-corners path'), { scale: [1.4, 1], opacity: [0, 1] }, { delay: 0.35, duration: 0.35 });
    animate(q('.g-flash'), { opacity: [0, 0.95, 0] }, { delay: 0.8, duration: 0.45 });
  } else if (i === 1) {
    animate(q('.g-thumb'), { x: [0, -78], y: [0, 50], scale: [1, 0.6], opacity: [1, 1, 0] }, { delay: 0.2, duration: 0.8, ease: [0.6, 0, 0.3, 1] });
    animate(q('.g-ico'), { scale: [1, 1.2, 1] }, { delay: 0.9, duration: 0.35 });
    animate(q('.g-scan'), { y: [0, 112, 0], opacity: [0.9, 0.9, 0] }, { delay: 1.1, duration: 1.4, ease: 'easeInOut' });
  } else if (i === 2) {
    animate(q('.g-pin1'), { y: [-80, 0], opacity: [0, 1] }, { type: 'spring', stiffness: 400, damping: 14 });
    const r = svg.querySelector('.g-route');
    const len = r.getTotalLength();
    r.style.strokeDasharray = `${len}`;
    animate(len, 0, { delay: 0.35, duration: 0.8, onUpdate: (v) => { r.style.strokeDashoffset = `${v}`; } })
      .then(() => { r.style.strokeDasharray = '6 9'; r.style.strokeDashoffset = '0'; });
    animate(q('.g-pin2'), { y: [-80, 0], opacity: [0, 1] }, { type: 'spring', stiffness: 400, damping: 14, delay: 1.1 });
    animate(q('.g-ring'), { opacity: [0.9, 0], scale: [0.4, 2.2] }, { delay: 1.35, duration: 0.7 });
  } else if (i === 3) {
    animate(q('.g-n1'), { scaleX: [0, 1], opacity: [0, 1] }, { delay: 0.2, duration: 0.4 });
    animate(q('.g-n2'), { scaleX: [0, 1], opacity: [0, 1] }, { delay: 0.4, duration: 0.4 });
    animate(q('.g-pen'), { rotate: [0, -12, 8, -6, 0], x: [30, 0], opacity: [0, 1] }, { delay: 0.6, duration: 0.8 });
  } else if (i === 4) {
    animate(q('.g-day'), { x: [-30, 0], opacity: [0, 1] }, { delay: (k) => 0.1 + k * 0.12, duration: 0.4 });
    animate(q('.g-tap'), { scale: [0.5, 1.6], opacity: [0.9, 0] }, { delay: 0.8, duration: 0.7, repeat: 1, repeatDelay: 0.4 });
  }
}

export function openGuide({ reduced = false, onClose } = {}) {
  if (document.querySelector('.guide')) return;
  const n = ART.length;
  let i = 0;
  const el = document.createElement('div');
  el.className = 'guide';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', t('help'));
  el.innerHTML = `
    <button class="g-skip" id="gSkip">${t('skip')}</button>
    <div class="g-track" id="gTrack">
      ${ART.map((a, k) => `<section class="g-slide" aria-hidden="${k !== 0}">
        <svg class="g-art" viewBox="0 0 300 220" aria-hidden="true">${a}</svg>
        <div class="g-step">${k + 1} / ${n}</div>
        <h2>${t(`g${k + 1}t`)}</h2>
        <p>${t(`g${k + 1}d`)}</p>
      </section>`).join('')}
    </div>
    <div class="g-dots">${ART.map((_, k) => `<i class="${k === 0 ? 'on' : ''}"></i>`).join('')}</div>
    <div class="g-nav"><button class="g-back" id="gBack">${t('back')}</button><button class="g-next" id="gNext">${t('next')}</button></div>`;
  document.body.appendChild(el);
  const track = el.querySelector('#gTrack');
  const slides = [...el.querySelectorAll('.g-slide')];
  const dots = [...el.querySelectorAll('.g-dots i')];

  const go = (k, instant) => {
    i = Math.max(0, Math.min(n - 1, k));
    const to = `${-i * 100}%`;
    if (reduced || instant) track.style.transform = `translateX(${to})`;
    else animate(track, { x: to }, { type: 'spring', stiffness: 260, damping: 30 });
    slides.forEach((s, k2) => s.setAttribute('aria-hidden', k2 !== i));
    dots.forEach((d, k2) => d.classList.toggle('on', k2 === i));
    el.querySelector('#gBack').style.visibility = i === 0 ? 'hidden' : 'visible';
    el.querySelector('#gNext').textContent = i === n - 1 ? t('done') : t('next');
    play(i, slides[i].querySelector('svg'), reduced);
    if (!reduced) animate(slides[i].querySelectorAll('h2, p, .g-step'), { opacity: [0, 1], y: [12, 0] }, { delay: (k2) => 0.1 + k2 * 0.06, duration: 0.35 });
  };
  const close = () => {
    const done = () => { el.remove(); if (onClose) onClose(); };
    if (reduced) done();
    else animate(el, { opacity: 0, y: 30 }, { duration: 0.25 }).then(done);
  };
  el.querySelector('#gSkip').addEventListener('click', close);
  el.querySelector('#gBack').addEventListener('click', () => go(i - 1));
  el.querySelector('#gNext').addEventListener('click', () => (i === n - 1 ? close() : go(i + 1)));

  // kaydırma
  let sx = null;
  let sy = 0;
  track.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
  track.addEventListener('pointerup', (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - sy)) go(i + (dx < 0 ? 1 : -1));
    sx = null;
  });

  if (!reduced) animate(el, { opacity: [0, 1], y: [30, 0] }, { duration: 0.3 });
  go(0, true);
}
