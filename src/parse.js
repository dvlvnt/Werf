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

/**
 * words: [{t, x0, y0, x1, y1}], width: görüntü genişliği.
 * colorOf(seg) -> 'green' | null (isteğe bağlı, aktif sekmeyi bulmak için)
 */
export function analyze(words, width, name, colorOf) {
  const segs = segments(words);
  const inAddrCol = (s, nx) => s.x0 > nx + width * 0.15 && s.x0 < nx + width * 0.45 && !SKIP.test(s.text);

  // tüm şantiyeler (her sokak satırı + üstündeki firma satırı)
  const streets = segs.filter((s) => isStreet(s.text) && s.x0 > width * 0.2);
  const companyFor = (st) => {
    const cand = segs.filter((s) => s !== st
      && Math.abs(s.x0 - st.x0) < width * 0.03
      && s.yc < st.yc - st.h * 0.4 && s.yc > st.yc - st.h * 2.6
      && /[A-Za-zÀ-ÿ]{2,}/.test(s.text) && s.text.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 4
      && !isStreet(s.text) && !SKIP.test(s.text));
    cand.sort((a, b) => b.yc - a.yc);
    return cand[0] || null;
  };
  const sites = [];
  for (const st of streets) {
    const c = companyFor(st);
    const company = c ? cleanCompany(c.text) : '';
    const key = `${company}|${st.text}`.toLowerCase();
    const site = { company, street: st.text, city: cityOf(company), box: { x0: Math.min(st.x0, c ? c.x0 : st.x0), y0: c ? c.y0 : st.y0, x1: Math.max(st.x1, c ? c.x1 : st.x1), y1: st.y1 } };
    site.query = mapsQuery(site);
    site.url = mapsUrl(site.query);
    if (!sites.find((x) => x.key === key)) sites.push({ ...site, key });
  }

  // tarih sekmeleri
  const dates = [];
  for (const s of segs) {
    const m = s.text.match(/\b(MA|DI|WO|DO|VR|ZA|ZO)\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/i);
    if (m) dates.push({ label: `${m[1].toUpperCase()} ${m[2]}/${m[3]}/${m[4]}`, seg: s, active: colorOf ? colorOf(s) === 'green' : false });
  }
  const date = (dates.find((d) => d.active) || dates[dates.length - 1] || null);

  // isim
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const nameSegs = segs.filter((s) => s.x0 < width * 0.75 && !isStreet(s.text));
  let hit = null;
  for (const s of nameSegs) {
    const ok = parts.every((p) => s.words.some((w) => tokenMatch(w.t, p)));
    if (ok) { hit = s; break; }
  }
  if (!hit) return { found: false, sites, date: date && date.label, segs };

  const col = segs.filter((s) => inAddrCol(s, hit.x0));
  const colStreets = col.filter((s) => isStreet(s.text) && s.yc <= hit.yc + hit.h * 0.6);
  colStreets.sort((a, b) => b.yc - a.yc);
  const st = colStreets[0];
  const isCompanyLine = (s) => streets.some((x) => companyFor(x) === s);
  const sameRow = col.find((s) => Math.abs(s.yc - hit.yc) < hit.h * 0.6 && !isStreet(s.text) && !isCompanyLine(s)
    && s.text.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 3);
  let result;
  if (sameRow) {
    result = { company: '', street: sameRow.text, city: '', streetBox: sameRow, companyBox: null, plain: true };
  } else if (st) {
    const c = companyFor(st);
    const company = c ? cleanCompany(c.text) : '';
    result = { company, street: st.text, city: cityOf(company), streetBox: st, companyBox: c };
  } else {
    const near = col.filter((s) => s.yc <= hit.yc + hit.h * 0.6).sort((a, b) => b.yc - a.yc)[0];
    result = near ? { company: '', street: near.text, city: '', streetBox: near, companyBox: null } : null;
  }
  // aynı gruptaki arkadaşlar (aynı sütun, ilk adresten sonra, bir sonraki adrese kadar)
  let mates = [];
  if (result) {
    const top = (result.companyBox || result.streetBox).y0 - 4;
    const nextSt = col.filter((s) => isStreet(s.text) && s.yc > hit.yc + hit.h * 0.6).sort((a, b) => a.yc - b.yc)[0];
    const section = segs.filter((s) => /^(TRANSPORT|AFWEZIGEN)/i.test(s.text) && s.yc > hit.yc).sort((a, b) => a.yc - b.yc)[0];
    const bottom = Math.min(nextSt ? (companyFor(nextSt) || nextSt).y0 : Infinity, section ? section.y0 : Infinity, hit.y1 + hit.h * 12);
    mates = segs.filter((s) => s !== hit && Math.abs(s.x0 - hit.x0) < width * 0.05 && s.y0 > top && s.y1 < bottom
      && /^[A-ZÀ-Ý][a-zà-ÿ]+ [A-ZÀ-Ý]/.test(s.text)).map((s) => s.text);
    const notes = result.plain ? [] : col.filter((s) => s.y0 > (result.streetBox.y1) && s.text.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 3 && s.y1 < bottom && s.yc < hit.yc + hit.h * 3 && !isStreet(s.text)
      && !(nextSt && companyFor(nextSt) === s)).map((s) => s.text);
    result.notes = notes;
    result.query = mapsQuery(result);
    result.url = mapsUrl(result.query);
  }
  if (result && result.plain) result.query = `${result.street}`;
  if (result && result.plain) result.url = mapsUrl(result.query);
  return { found: true, nameSeg: hit, nameText: hit.text, result, mates, sites, date: date && date.label, segs };
}
