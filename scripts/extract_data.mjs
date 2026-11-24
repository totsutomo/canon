/**
 * デスクトップの 古文助動詞・助詞まとめ.html / 漢文句法まとめ.html から
 * クイズ全問データ (POOL) とリファレンスHTML・カード解説を抽出し、
 * static/data/canon_data.js を生成する。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const KOBUN_HTML = 'C:\\Users\\totsu\\OneDrive\\デスクトップ\\古文助動詞・助詞まとめ.html';
const KANBUN_HTML = 'C:\\Users\\totsu\\OneDrive\\デスクトップ\\漢文句法まとめ.html';
const OUT_FILE = path.resolve('C:\\Users\\totsu\\projects\\canon\\static\\data\\canon_data.js');

function runHtmlScript(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const bigs = [...html.matchAll(/<span class="big">(.*?)<\/span>/g)].map(m => m[1]);

  // Capture rendered HTML for tables/cards if script populates elements
  const elements = {};
  function makeEl(id, extra) {
    const el = Object.assign({
      id, innerHTML: '', textContent: '', value: '', style: {},
      classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
      dataset: {},
      children: [],
      addEventListener(){},
      querySelector(){ return makeEl(''); },
      querySelectorAll(){ return []; },
      appendChild(c){ this.children.push(c); return c; },
      setAttribute(){},
      getAttribute(){ return null; },
      focus(){},
      scrollIntoView(){},
      cloneNode(){ return makeEl(''); }
    }, extra || {});
    return el;
  }
  const sandbox = {
    console, Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, parseInt, parseFloat, isNaN,
    setTimeout: () => {}, clearTimeout: () => {},
    window: { addEventListener(){}, scrollY: 0, scrollTo(){}, matchMedia: () => ({ matches: false, addEventListener(){} }) },
    localStorage: { _d: {}, getItem(k){ return this._d[k] || null; }, setItem(k,v){ this._d[k]=String(v); }, removeItem(k){ delete this._d[k]; } },
    document: {
      documentElement: makeEl('html'),
      body: makeEl('body'),
      getElementById(id){ if (!elements[id]) elements[id] = makeEl(id); return elements[id]; },
      querySelector(){ return makeEl(''); },
      querySelectorAll(sel){
        if (sel.includes('.card')) {
          return bigs.map(k => makeEl('card', { querySelector: () => makeEl('big', { textContent: k }) }));
        }
        return [];
      },
      createElement(tag){ return makeEl(tag); },
      addEventListener(){}
    }
  };
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(scripts.join('\n;\n'), sandbox);
  return { html, sandbox, elements };
}

function extractSections(html, excludeIds) {
  // Grab all <section id="...">...</section> excluding quiz section
  const sections = [];
  const re = /<section\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (excludeIds.includes(id)) continue;
    // Extract title from <h2>
    const h2 = m[2].match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    const title = h2 ? h2[1].replace(/<[^>]+>/g, '').trim() : id;
    sections.push({ id, title, html: m[2] });
  }
  return sections;
}

function extractCardMap(html) {
  const map = {};
  const re = /<div class="card">([\s\S]*?)<\/div>\s*(?=<div class="card">|<\/div>)/g;
  // Simpler robust scan: find each <span class="big">key</span> inside a .card
  const parts = html.split('<div class="card">');
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const bm = chunk.match(/<span class="big">(.*?)<\/span>/);
    if (!bm) continue;
    const key = bm[1].trim();
    // Balance <div> tags to find end of this card
    let depth = 1, pos = 0;
    const tagRe = /<\/?div\b[^>]*>/g;
    let tm;
    while ((tm = tagRe.exec(chunk)) !== null) {
      if (tm[0].startsWith('</')) depth--;
      else depth++;
      if (depth === 0) { pos = tm.index; break; }
    }
    const inner = pos > 0 ? chunk.slice(0, pos) : chunk.slice(0, 600);
    if (!map[key]) map[key] = inner;
  }
  return map;
}

// 1. Kobun
const kb = runHtmlScript(KOBUN_HTML);
const kobunPool = {};
let kobunCount = 0;
for (const [fmt, arr] of Object.entries(kb.sandbox.POOL)) {
  kobunPool[fmt] = arr.map((e, idx) => ({
    id: `kobun:${fmt}:${idx}`,
    subject: 'kobun',
    fmt,
    sub: e.sub || '',
    q: e.q,
    x: e.x || '',
    short: e.short || '',
    a: e.a,
    d: e.d || [],
    e: e.e || '',
    t: e.t || '',
    w: e.w || [],
    gi: e.gi || [],
    g: e.g || '',
    lv: e.lv || 1,
    tr: e.tr || '',
    pts: e.pts || null,
    is_kindai: Array.isArray(e.gi) && e.gi.includes(11)
  }));
  kobunCount += kobunPool[fmt].length;
}
const kobunSections = extractSections(kb.html, ['quiz']);
const kobunTables = {
  tb: kb.elements.tb ? kb.elements.tb.innerHTML : '',
  jtb: kb.elements.jtb ? kb.elements.jtb.innerHTML : ''
};
if (!kobunTables.tb && Array.isArray(kb.sandbox.G)) {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  kobunTables.tb = kb.sandbox.G.map(grp => {
    const hdr = `<tr class="group"><td colspan="9">${esc(grp.label || grp.title || '')}</td></tr>`;
    const rows = (grp.items || []).map(it => {
      const means = Array.isArray(it[8])
        ? it[8].map(m => Array.isArray(m) ? `<span class="tag k-${esc(m[1]||'other')}">${esc(m[0])}</span>` : `<span class="tag k-other">${esc(m)}</span>`).join('')
        : `<span class="tag k-other">${esc(it[8] || '')}</span>`;
      return `<tr><td class="name">${esc(it[0])}</td><td>${esc(it[1])}</td><td class="form">${esc(it[2])}</td><td class="form">${esc(it[3])}</td><td class="form">${esc(it[4])}</td><td class="form">${esc(it[5])}</td><td class="form">${esc(it[6])}</td><td class="form">${esc(it[7])}</td><td>${means}</td></tr>`;
    }).join('');
    return hdr + rows;
  }).join('');
}
if (kobunTables.tb) {
  kobunSections.unshift({
    id: 'table',
    title: '助動詞の活用表',
    html: '<h2>助動詞の活用表（接続形ごと・31語）</h2><p class="sec-lead">接続形ごとに並べた助動詞の活用6形と意味。</p><div class="tablebox"><table><thead><tr><th>助動詞</th><th>活用の型</th><th>未然</th><th>連用</th><th>終止</th><th>連体</th><th>已然</th><th>命令</th><th>意味</th></tr></thead><tbody id="tb"></tbody></table></div>'
  });
}
const kobunCards = extractCardMap(kb.html);

// 2. Kanbun
const kn = runHtmlScript(KANBUN_HTML);
const kanbunPool = {};
let kanbunCount = 0;
for (const [fmt, arr] of Object.entries(kn.sandbox.POOL)) {
  kanbunPool[fmt] = arr.map((e, idx) => ({
    id: `kanbun:${fmt}:${idx}`,
    subject: 'kanbun',
    fmt,
    sub: e.sub || '',
    q: e.q,
    x: e.x || '',
    short: e.short || '',
    a: e.a,
    d: e.d || [],
    e: e.e || '',
    t: e.t || '',
    w: e.w || [],
    gi: e.gi || [],
    g: e.g || '',
    lv: e.lv || 1,
    tr: e.tr || '',
    pts: e.pts || null,
    is_kindai: false
  }));
  kanbunCount += kanbunPool[fmt].length;
}
const kanbunSections = extractSections(kn.html, ['quiz']);
const kanbunTables = {};
for (const id of ['tb-sai', 'tb-kuho', 'tb-joji', 'cards-sai', 'cards-kuho', 'cards-joji', 'cards-tips']) {
  if (kn.elements[id] && kn.elements[id].innerHTML) {
    kanbunTables[id] = kn.elements[id].innerHTML;
  }
}
const kanbunCards = extractCardMap(kn.html);

const payload = {
  meta: {
    kobun_total: kobunCount,
    kanbun_total: kanbunCount,
    grand_total: kobunCount + kanbunCount,
    kobun_fmt_label: kb.sandbox.FMT_LABEL,
    kobun_range_label: kb.sandbox.RANGE_LABEL,
    kanbun_fmt_label: kn.sandbox.FMT_LABEL,
    kanbun_range_label: kn.sandbox.RANGE_LABEL
  },
  kobun: {
    pool: kobunPool,
    sections: kobunSections,
    tables: kobunTables,
    cards: kobunCards
  },
  kanbun: {
    pool: kanbunPool,
    sections: kanbunSections,
    tables: kanbunTables,
    cards: kanbunCards
  }
};

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, 'window.CANON_DATA = ' + JSON.stringify(payload) + ';\n', 'utf8');
console.log('Extracted Canon data:', payload.meta);
console.log('Kobun sections:', kobunSections.map(s => s.id));
console.log('Kanbun sections:', kanbunSections.map(s => s.id));
console.log('Output size:', (fs.statSync(OUT_FILE).size / 1024).toFixed(1), 'KB');
