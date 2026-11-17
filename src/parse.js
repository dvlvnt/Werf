// Ekran görüntüsünden çıkan kelimeleri (bbox ile) tabloya göre yorumlar.

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

function lev(a, b) {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[m][n];
}

const tokenMatch = (word, target) => {
  const a = norm(word);
  const b = norm(target);
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.length >= 4 && a.length >= b.length - 1) return lev(a, b) <= (b.length >= 7 ? 2 : 1);
  return false;
};

/** Kelimeleri satır parçalarına (segment) birleştirir. */
export function segments(words) {
  const ws = words
    .filter((w) => w.t && w.t.trim())
    .map((w) => ({ ...w, h: w.y1 - w.y0, yc: (w.y0 + w.y1) / 2 }))
    .sort((a, b) => a.yc - b.yc || a.x0 - b.x0);
  const rows = [];
  for (const w of ws) {
    const r = rows.find((row) => Math.abs(row.yc - w.yc) < Math.max(row.h, w.h) * 0.55);
    if (r) { r.ws.push(w); r.yc = (r.yc * (r.ws.length - 1) + w.yc) / r.ws.length; r.h = Math.max(r.h, w.h); }
    else rows.push({ yc: w.yc, h: w.h, ws: [w] });
  }
  const segs = [];
  for (const r of rows) {
    r.ws.sort((a, b) => a.x0 - b.x0);
    let cur = null;
    for (const w of r.ws) {
      if (cur && w.x0 - cur.x1 < r.h * 1.6) {
        cur.words.push(w);
        cur.x1 = w.x1; cur.y0 = Math.min(cur.y0, w.y0); cur.y1 = Math.max(cur.y1, w.y1);
      } else {
        cur = { words: [w], x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1 };
        segs.push(cur);
      }
    }
  }
  for (const s of segs) {
    s.text = s.words.map((w) => w.t).join(' ').replace(/\s+/g, ' ').trim();
    s.yc = (s.y0 + s.y1) / 2;
    s.h = s.y1 - s.y0;
  }
  return segs;
}

const STREET = /[A-Za-zÀ-ÿ]{3,}[^\d]*\s\d{1,4}[a-zA-Z]?(\s*[-/]\s*\d+)?\s*$/;
const SKIP = /^(mon|dem|ploeg|werf|transport|afwezigen)$/i;
const CORP = new Set(['nv', 'bv', 'bvba', 'sa', 'srl', 'cv', 'vof']);

export const isStreet = (t) => STREET.test(t) && !/^\d+\s/.test(t);

function cityOf(company) {
  if (!company) return '';
  const parts = company.split(' ').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  if (parts.length < 2 || CORP.has(last.toLowerCase()) || !/^[A-ZÀ-Ý][a-zà-ÿ'-]{2,}$/.test(last)) return '';
  return last;
}

export function cleanCompany(t) {
  return t.replace(/^[^A-Za-zÀ-ÿ]+/, '').replace(/^Pp\s+IT\b/, 'PIT').replace(/^P\s+IT\b/, 'PIT').trim();
}

export function mapsQuery(site) {
  return [site.street, site.city, 'Belgium'].filter(Boolean).join(', ');
}
export const mapsUrl = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

const SUFFIX = /(straat|str|weg|steenweg|plein|laan|lei|dreef|kaai|baan|dijk|markt|plaats|singel|hof|park|veld|berg|rue|avenue|chaussée|boulevard|ulica|ul\.)\b/i;
export const streetLike = (t) => /[a-zà-ÿ]{3,}/.test(t) && !/^\d+\s*[A-Z]{2,3}\s*\d+$/.test(t.trim()) && (SUFFIX.test(t) || /[A-Za-zÀ-ÿ]{3,}.*\s\d{1,4}[a-zA-Z]?$/.test(t.trim()));
const letters = (t) => t.replace(/[^A-Za-zÀ-ÿ]/g, '').length;

/**
 * words: [{t, x0, y0, x1, y1}], width: görüntü genişliği.
 * colorOf(seg) -> 'green' | 'yellow' | null
 */
export function analyze(words, width, name, colorOf = () => null) {
  const segs = segments(words);
  for (const s of segs) s.color = colorOf(s);
  const real = (s) => letters(s.text) >= 3 && !SKIP.test(s.text);

  // adres sütunu: isimlerin sağındaki sütun (sol blok ve sağ blok ayrı)
  const colOf = (nx) => segs.filter((s) => s.x0 > nx + width * 0.15 && s.x0 < nx + width * 0.45 && real(s));
  const near = (a, b) => Math.abs(a.x0 - b.x0) < width * 0.03;
  const below = (list, s) => list.filter((x) => near(x, s) && x.yc > s.yc + s.h * 0.4 && x.yc < s.yc + s.h * 2.6).sort((p, q) => p.yc - q.yc)[0];
  const above = (list, s) => list.filter((x) => near(x, s) && x.yc < s.yc - s.h * 0.4 && x.yc > s.yc - s.h * 2.6).sort((p, q) => q.yc - p.yc)[0];

  function siteAt(col, S) {
    const plainCol = col.filter((x) => x.color !== 'yellow');
    if (streetLike(S.text)) {
      const c = above(plainCol, S);
      const company = c && !streetLike(c.text) ? c : null;
      return { company: company ? cleanCompany(company.text) : '', street: S.text, companyBox: company, streetBox: S };
    }
    const b = below(plainCol, S);
    if (b && streetLike(b.text)) return { company: cleanCompany(S.text), street: b.text, companyBox: S, streetBox: b };
    return { company: '', street: S.text, companyBox: null, streetBox: S, plain: true };
  }
  const finish = (r) => {
    r.city = r.plain ? '' : cityOf(r.company);
    r.query = r.plain ? r.street : mapsQuery(r);
    r.url = mapsUrl(r.query);
    return r;
  };

  // tüm şantiyeler
  const sites = [];
  const plainAll = segs.filter((s) => s.x0 > width * 0.2 && real(s) && s.color !== 'yellow');
  for (const s of plainAll) {
    if (!streetLike(s.text)) continue;
    const c = above(plainAll, s);
    const company = c && !streetLike(c.text) ? cleanCompany(c.text) : '';
    const r = finish({ company, street: s.text });
    r.key = `${company}|${s.text}`.toLowerCase().replace(/\s/g, '');
    if (!sites.find((x) => x.key === r.key)) sites.push(r);
  }

  // tarih sekmeleri
  const dates = [];
  for (const s of segs) {
    const m = s.text.match(/\b(MA|DI|WO|DO|VR|ZA|ZO)\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/i);
    if (m) dates.push({ label: `${m[1].toUpperCase()} ${m[2]}/${m[3]}/${m[4]}`, active: s.color === 'green' });
  }
  const date = dates.find((d) => d.active) || dates[dates.length - 1] || null;

  // isim
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const hit = segs.find((s) => s.x0 < width * 0.75 && !streetLike(s.text) && parts.every((p) => s.words.some((w) => tokenMatch(w.t, p))));
  if (!hit) return { found: false, sites, date: date && date.label, segs };

  const col = colOf(hit.x0);
  const cands = col.filter((s) => s.color !== 'yellow' && s.yc <= hit.yc + hit.h * 0.6).sort((a, b) => b.yc - a.yc);
  // isim satırının hemen altında (2 satır içinde) adres varsa ve üstteki adres uzaksa alttakini kullan
  const belowNear = col.filter((s) => s.color !== 'yellow' && s.yc > hit.yc + hit.h * 0.6 && s.yc < hit.yc + hit.h * 3.2).sort((a, b) => a.yc - b.yc)[0];
  if (belowNear && (!cands.length || cands[0].yc < hit.yc - hit.h * 5)) cands.unshift(belowNear);
  let result = null;
  let mates = [];
  if (cands.length) {
    const chosen = siteAt(col, cands[0]);
    // sütundaki tüm adres blokları (firma + sokak + sarı notlar)
    const plain = col.filter((x) => x.color !== 'yellow').sort((p, q) => p.yc - q.yc);
    const used = new Set();
    const blocks = [];
    for (const sg of plain) {
      if (used.has(sg)) continue;
      const st = siteAt(col, sg);
      if (st.companyBox && used.has(st.companyBox)) continue;
      if (st.companyBox) used.add(st.companyBox);
      used.add(st.streetBox);
      blocks.push(st);
    }
    blocks.sort((p, q) => (p.companyBox || p.streetBox).yc - (q.companyBox || q.streetBox).yc);
    const h = hit.h;
    blocks.forEach((bk, i) => {
      const nextTop = blocks[i + 1] ? (blocks[i + 1].companyBox || blocks[i + 1].streetBox).y0 : Infinity;
      const notes = col.filter((x) => x.color === 'yellow' && x.yc > bk.streetBox.yc && x.y1 <= nextTop + 2 && x.yc < bk.streetBox.yc + h * 6)
        .sort((p, q) => p.yc - q.yc);
      bk.notes = notes.map((x) => x.text);
      bk.bottom = notes.length ? notes[notes.length - 1].y1 : bk.streetBox.y1;
      bk.top = (bk.companyBox || bk.streetBox).y0;
      const top = bk.companyBox || bk.streetBox;
      const lab = segs.find((x) => /^(MON|DEM)$/i.test(x.text) && x.x0 > hit.x1 && x.x1 < top.x0 + 4
        && x.yc > top.y0 - h * 0.8 && x.yc < bk.streetBox.y1 + h * 0.8);
      bk.label = lab ? lab.text.toUpperCase() : '';
      finish(bk);
    });
    // bitişik blokları aynı gruba al (aralarında boş satır yoksa)
    let idx = blocks.findIndex((bk) => bk.streetBox === chosen.streetBox);
    if (idx < 0) { blocks.push(finish({ ...chosen, notes: [], top: (chosen.companyBox || chosen.streetBox).y0, bottom: chosen.streetBox.y1, label: '' })); idx = blocks.length - 1; }
    let i0 = idx;
    let i1 = idx;
    while (i0 > 0 && blocks[i0].top - blocks[i0 - 1].bottom < h * 1.5) i0--;
    while (i1 < blocks.length - 1 && blocks[i1 + 1].top - blocks[i1].bottom < h * 1.5) i1++;
    const list = blocks.slice(i0, i1 + 1);
    result = { ...list[list.indexOf(blocks[idx])], list };
    const top = list[0].top - 4;
    const nextBlock = blocks[i1 + 1];
    const section = segs.filter((x) => /^(TRANSPORT|AFWEZIGEN)/i.test(x.text) && x.yc > hit.yc).sort((p, q) => p.yc - q.yc)[0];
    const bottom = Math.min(nextBlock ? nextBlock.top : Infinity, section ? section.y0 : Infinity, hit.y1 + h * 12);
    mates = segs.filter((x) => x !== hit && Math.abs(x.x0 - hit.x0) < width * 0.05 && x.y0 > top && x.y1 < bottom
      && /^[A-ZÀ-Ý][a-zà-ÿ]+ [A-ZÀ-Ý]/.test(x.text)).map((x) => x.text);
  }
  return { found: true, nameSeg: hit, nameText: hit.text, result, mates, sites, date: date && date.label, segs };
}
