/* =====================================================================
   drawings.js — собственный движок инструментов рисования
   для Lightweight Charts v5 (без сторонних библиотек).

   • 28 инструментов (линии, фибо, паттерны, позиции, фигуры, текст)
   • мышь + touch: нарисовать (клик-клик / протяжка / тап-тап),
     выделить, перетащить, тянуть узлы
   • панель свойств (цвет, толщина, пунктир, текст, копия, удалить)
   • undo / redo, магнит (слабый/сильный), скрыть все, сохранение
   • точки хранятся как {t: время, p: цена} — рисунки переживают
     смену таймфрейма и выходят в будущее за последнюю свечу
   ===================================================================== */

const CSS = `
.dr-canvas{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2}
.dr-bar{position:absolute;bottom:42px;left:50%;transform:translateX(-50%);z-index:7;display:none;
  align-items:center;gap:4px;padding:5px 6px;background:var(--panel,#151d27);color:var(--text,#dce3ec);
  border:1px solid var(--line,#34404d);border-radius:10px;box-shadow:0 8px 28px #0009;
  max-width:calc(100% - 12px);touch-action:manipulation;user-select:none;-webkit-user-select:none}
.dr-bar.on{display:flex}
.dr-bar button,.dr-bar select,.dr-bar input[type=color]{height:34px;min-width:34px;padding:0 8px;font-size:14px;
  background:transparent;color:inherit;border:1px solid transparent;border-radius:6px;cursor:pointer}
.dr-bar input[type=color]{padding:2px;width:36px;background:transparent}
.dr-bar button:hover,.dr-bar select:hover{background:#1c2734;border-color:#2d3a49}
.dr-bar button.on{background:#1a2a40;border-color:#344e75;color:#a9c6ff}
.dr-bar .b-del:hover{background:#351e24;color:var(--down,#e06464)}
.dr-bar select{padding:0 4px;background:var(--panel,#151d27)}
.dr-bar .sep{width:1px;height:20px;background:var(--line,#34404d);margin:0 2px}
#wrap.dr-pointer,#wrap.dr-pointer *{cursor:pointer!important}
#wrap.dr-draw,#wrap.dr-draw *{cursor:crosshair!important}
@media (pointer:coarse){.dr-bar{bottom:50px}.dr-bar button,.dr-bar select,.dr-bar input[type=color]{height:40px;min-width:40px}}
`;

const TOUCH_TOL = 18, MOUSE_TOL = 6;
const DEFAULT_STYLE = { color: '#4c8dff', width: 2, dash: false };
const STYLE_BY_KIND = {
  'long-position': { color: '#787b86' }, 'short-position': { color: '#787b86' },
  text: { width: 1 }, note: { width: 1, color: '#f7a600' }, 'price-label': { width: 1 }, callout: { width: 1 },
  brush: { width: 2 }
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Math.random().toString(36).slice(2, 9);
const p2 = n => String(n).padStart(2, '0');

function rgba(hex, a) {
  let h = String(hex || '#4c8dff').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (isNaN(n)) return `rgba(76,141,255,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function fmtT(s) {
  const d = new Date(s * 1000);
  return p2(d.getUTCDate()) + '.' + p2(d.getUTCMonth() + 1) + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes());
}
function fmtDur(s) {
  s = Math.abs(Math.round(s));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return d + 'д' + (h ? ' ' + h + 'ч' : '');
  if (h) return h + 'ч' + (m ? ' ' + m + 'м' : '');
  if (m) return m + 'м';
  return s + 'с';
}

/* ---------- геометрия для hit-test ---------- */
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function inPoly(px, py, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
function hitDist(h, x, y) {
  switch (h.k) {
    case 's': return segDist(x, y, h.x1, h.y1, h.x2, h.y2);
    case 'r': {
      if (h.f && x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return 0;
      return Math.min(
        segDist(x, y, h.x, h.y, h.x + h.w, h.y), segDist(x, y, h.x + h.w, h.y, h.x + h.w, h.y + h.h),
        segDist(x, y, h.x + h.w, h.y + h.h, h.x, h.y + h.h), segDist(x, y, h.x, h.y + h.h, h.x, h.y));
    }
    case 'c': {
      const dd = Math.hypot(x - h.cx, y - h.cy);
      if (h.f && dd <= h.r) return 0;
      return Math.abs(dd - h.r);
    }
    case 'p': return h.f && inPoly(x, y, h.pts) ? 0 : Infinity;
  }
  return Infinity;
}
const normRect = (x, y, w, h, f) => ({ k: 'r', x: Math.min(x, x + w), y: Math.min(y, y + h), w: Math.abs(w), h: Math.abs(h), f: !!f });

const FIB = [[0, '#787b86'], [0.236, '#f23645'], [0.382, '#ff9800'], [0.5, '#4caf50'], [0.618, '#089981'], [0.786, '#00bcd4'], [1, '#787b86']];
const FIBX = [[0, '#787b86'], [0.236, '#f23645'], [0.382, '#ff9800'], [0.5, '#4caf50'], [0.618, '#089981'], [0.786, '#00bcd4'], [1, '#787b86'], [1.618, '#2962ff'], [2.618, '#9c27b0']];
const FAN = [[0.25, '#ff9800'], [0.382, '#4caf50'], [0.5, '#089981'], [0.618, '#00bcd4'], [0.75, '#2962ff'], [1, '#787b86']];
const FIBNUM = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
const GREEN = '#089981', RED = '#f23645';

export function createDrawings(o) {
  const { chart, wrap, getSeries, getBars, storage, fmtPrice, toast = () => {}, onState = () => {} } = o;
  const ts = chart.timeScale();
  const chartEl = chart.chartElement();
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;

  /* ---------- состояние ---------- */
  let drawings = [];
  let key = null;
  let tool = 'cross';
  let keep = false;
  let magnet = 'off';
  let selId = null;
  let draft = null;
  let drag = null;
  let hidden = false;
  let undoS = [], redoS = [];
  let dirty = true;
  let saveTimer = null, saveNeeded = false;
  let lastStyle = Object.assign({}, DEFAULT_STYLE, (storage && storage.get('dr2:style', {})) || {});
  let activeTouch = false;

  /* ---------- стили и canvas ---------- */
  if (typeof document !== 'undefined' && !document.getElementById('dr-style')) {
    const st = document.createElement('style'); st.id = 'dr-style'; st.textContent = CSS; document.head.appendChild(st);
  }
  const cv = document.createElement('canvas');
  cv.className = 'dr-canvas';
  wrap.appendChild(cv);
  const ctx = cv.getContext('2d');

  const fmt = p => {
    if (p == null || !isFinite(p)) return '—';
    if (fmtPrice) return fmtPrice(p);
    const a = Math.abs(p);
    if (a >= 1000) return p.toFixed(2);
    if (a >= 100) return p.toFixed(2);
    if (a >= 1) return p.toFixed(3);
    if (a >= 0.01) return p.toFixed(4);
    return String(+p.toPrecision(4));
  };

  /* ---------- время <-> логический индекс ---------- */
  let stepKey = '', stepVal = 60;
  function getStep() {
    const b = getBars(), n = b.length, k = n + ':' + (n ? b[n - 1].time : 0);
    if (k === stepKey) return stepVal;
    stepKey = k;
    const ds = [];
    for (let i = Math.max(1, n - 30); i < n; i++) { const d = b[i].time - b[i - 1].time; if (d > 0) ds.push(d); }
    ds.sort((a, b) => a - b);
    stepVal = ds.length ? ds[ds.length >> 1] : 60;
    return stepVal;
  }
  function t2i(t) {
    const b = getBars(), n = b.length;
    if (!n) return null;
    const step = getStep();
    if (t <= b[0].time) return (t - b[0].time) / step;
    if (t >= b[n - 1].time) return n - 1 + (t - b[n - 1].time) / step;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (b[m].time <= t) lo = m; else hi = m; }
    return lo + (t - b[lo].time) / (b[hi].time - b[lo].time);
  }
  function i2t(i) {
    const b = getBars(), n = b.length;
    const step = getStep();
    if (i <= 0) return Math.round(b[0].time + i * step);
    if (i >= n - 1) return Math.round(b[n - 1].time + (i - (n - 1)) * step);
    const lo = Math.floor(i);
    return Math.round(b[lo].time + (i - lo) * (b[lo + 1].time - b[lo].time));
  }

  /* ---------- размеры области графика ---------- */
  function plotSize() {
    let w = 0, h = 0;
    try { w = ts.width(); } catch (e) {}
    if (!w) w = chartEl.clientWidth - 60;
    try { h = chart.paneSize(0).height; } catch (e) {}
    if (!h) { try { h = chart.panes()[0].getHeight(); } catch (e) {} }
    if (!h) { let th = 26; try { th = ts.height(); } catch (e) {} h = chartEl.clientHeight - th; }
    return { w, h };
  }
  const rel = (cx, cy) => { const r = chartEl.getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top }; };
  const inPlot = (x, y) => { const s = plotSize(); return x >= 0 && y >= 0 && x <= s.w && y <= s.h; };

  /* ---------- координата курсора -> точка (время, цена) ---------- */
  function ptFromXY(x, y) {
    const s = getSeries(), bars = getBars();
    if (!s || !bars.length) return null;
    const fi = ts.coordinateToLogical(x);
    if (fi == null) return null;
    const i = Math.round(fi);
    let p = s.coordinateToPrice(y);
    if (p == null) return null;
    if (magnet !== 'off' && i >= 0 && i < bars.length) {
      const b = bars[i];
      let best = null, bd = Infinity;
      for (const c of [b.open, b.high, b.low, b.close]) {
        const yy = s.priceToCoordinate(c);
        if (yy == null) continue;
        const dd = Math.abs(yy - y);
        if (dd < bd) { bd = dd; best = c; }
      }
      if (best != null && (magnet === 'strong' || bd <= (activeTouch ? 40 : 26))) p = best;
    }
    return { t: i2t(i), p };
  }

  /* ---------- история / сохранение ---------- */
  const snap = () => JSON.stringify(drawings, (k, v) => (k[0] === '_' ? undefined : v));
  function commit(before) {
    const now = snap();
    if (before === now) return;
    undoS.push(before); if (undoS.length > 100) undoS.shift();
    redoS = [];
    changed();
  }
  function changed() { dirty = true; saveNeeded = true; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 350); onState(); }
  function flush() {
    clearTimeout(saveTimer);
    if (!key || !saveNeeded) return;
    saveNeeded = false;
    if (storage) storage.set(key, snap());
  }
  function parseList(raw) {
    try {
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(arr)) return [];
      return arr.filter(d => d && TOOLS[d.kind] && Array.isArray(d.points) && d.points.length >= 1 && d.points.every(p => isFinite(p.t) && isFinite(p.p)));
    } catch (e) { return []; }
  }
  function load(k) {
    flush();
    key = k;
    drawings = parseList(storage ? storage.get(k, null) : null);
    undoS = []; redoS = []; selId = null; draft = null; drag = null;
    syncBar(); dirty = true; onState();
  }
  function restore(str) {
    drawings = parseList(str);
    if (selId && !byId(selId)) selId = null;
    syncBar(); changed();
  }
  const byId = id => drawings.find(d => d.id === id);
  const getSel = () => (selId ? byId(selId) : null);
  const styleFor = kind => Object.assign({}, lastStyle, STYLE_BY_KIND[kind] || {});
  const textSize = d => 11 + 3 * (d.style.width || 1);

  /* ---------- публичные операции ---------- */
  function setTool(k) {
    if (!TOOLS[k]) k = 'cross';
    draft = null;
    if (k !== 'cross') { if (selId) { selId = null; syncBar(); } if (hidden) hidden = false; }
    tool = k;
    wrap.classList.toggle('dr-draw', k !== 'cross');
    dirty = true; onState();
  }
  function escape() {
    if (draft) { draft = null; dirty = true; return true; }
    if (selId) { select(null); return true; }
    if (tool !== 'cross') { setTool('cross'); return true; }
    return false;
  }
  function select(id) { if (selId === id) return; selId = id; syncBar(); dirty = true; onState(); }
  function deleteSelected() {
    const d = getSel(); if (!d) return false;
    const before = snap();
    drawings = drawings.filter(x => x.id !== d.id);
    selId = null; syncBar(); commit(before); return true;
  }
  function clearAll() { const before = snap(); drawings = []; selId = null; syncBar(); commit(before); }
  function undo() { if (!undoS.length) return false; redoS.push(snap()); restore(undoS.pop()); return true; }
  function redo() { if (!redoS.length) return false; undoS.push(snap()); restore(redoS.pop()); return true; }
  function duplicate() {
    const d = getSel(); if (!d) return;
    const before = snap();
    const c = JSON.parse(JSON.stringify(d, (k, v) => (k[0] === '_' ? undefined : v)));
    c.id = uid();
    c.points.forEach(pt => { const i = t2i(pt.t); if (i != null) pt.t = i2t(Math.round(i) + 3); });
    drawings.push(c); selId = c.id; syncBar(); commit(before);
  }
  function setMagnet(m) { magnet = m; onState(); }
  function cycleMagnet() { magnet = magnet === 'off' ? 'weak' : magnet === 'weak' ? 'strong' : 'off'; onState(); return magnet; }
  function setKeep(v) { keep = !!v; onState(); }
  function toggleHidden() { hidden = !hidden; if (hidden) select(null); dirty = true; onState(); return hidden; }
  function add(kind, points, style, text) {
    if (!TOOLS[kind]) return null;
    const before = snap();
    let pts = points.map(p => ({ t: p.t, p: p.p }));
    if (TOOLS[kind].fix) pts = TOOLS[kind].fix(pts);
    const d = { id: uid(), kind, points: pts, style: Object.assign(styleFor(kind), style || {}) };
    if (text) d.text = text;
    drawings.push(d); commit(before); return d;
  }
  const isTextKind = d => d && (d.kind === 'text' || d.kind === 'note' || d.kind === 'callout');
  function editText(d) {
    if (!isTextKind(d)) return;
    const t = window.prompt('Текст', d.text || '');
    if (t === null) return;
    const before = snap(); d.text = t; commit(before);
  }

  /* ====================================================================
     РЕНДЕР
     ==================================================================== */
  let plotW = 0, plotH = 0, cur = null, after = [];

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  const R = {
    get W() { return plotW; }, get H() { return plotH; },
    fmt, fmtT, fmtDur,
    col: a => rgba(cur.st.color, a),
    noShadow() { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; },
    stroke(op = {}) {
      const c = op.color || cur.st.color;
      ctx.strokeStyle = c; ctx.lineWidth = op.width || cur.st.width || 1;
      ctx.setLineDash((op.dash === undefined ? cur.st.dash : op.dash) ? [6, 4] : []);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.shadowColor = cur.sel ? c : 'transparent'; ctx.shadowBlur = cur.sel ? 7 : 0;
    },
    line(x1, y1, x2, y2, op) {
      R.stroke(op); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      cur.hits.push({ k: 's', x1, y1, x2, y2 });
    },
    ext(ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, k = ((plotW + plotH) * 4) / len;
      return [ax + dx * k, ay + dy * k];
    },
    ray(ax, ay, bx, by, op) { const e = R.ext(ax, ay, bx, by); R.line(ax, ay, e[0], e[1], op); },
    xline(ax, ay, bx, by, op) {
      const e = R.ext(ax, ay, bx, by), f = R.ext(bx, by, ax, ay); R.line(f[0], f[1], e[0], e[1], op);
    },
    poly(pts, op = {}) {
      if (!pts.length) return;
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (op.close) ctx.closePath();
      if (op.fill) { R.noShadow(); ctx.fillStyle = op.fill; ctx.fill(); }
      if (op.stroke !== false) { R.stroke(op); ctx.stroke(); }
      for (let i = 1; i < pts.length; i++) cur.hits.push({ k: 's', x1: pts[i - 1].x, y1: pts[i - 1].y, x2: pts[i].x, y2: pts[i].y });
      if (op.close && pts.length > 2) {
        const a = pts[pts.length - 1], b = pts[0];
        cur.hits.push({ k: 's', x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        if (op.fill) cur.hits.push({ k: 'p', pts, f: true });
      }
    },
    rect(x, y, w, h, op = {}) {
      if (op.fill) { R.noShadow(); ctx.fillStyle = op.fill; ctx.fillRect(x, y, w, h); }
      if (op.stroke !== false) { R.stroke(op); ctx.strokeRect(x, y, w, h); }
      cur.hits.push(normRect(x, y, w, h, !!op.fill));
    },
    fillRect(x, y, w, h, c) { R.noShadow(); ctx.fillStyle = c; ctx.fillRect(x, y, w, h); },
    hitRect(x, y, w, h, f) { cur.hits.push(normRect(x, y, w, h, f)); },
    circle(cx, cy, r, op = {}) {
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(r, 0.5), 0, Math.PI * 2);
      if (op.fill) { R.noShadow(); ctx.fillStyle = op.fill; ctx.fill(); }
      R.stroke(op); ctx.stroke();
      cur.hits.push({ k: 'c', cx, cy, r, f: !!op.fill });
    },
    head(x1, y1, x2, y2, size, color) {
      const a = Math.atan2(y2 - y1, x2 - x1);
      R.noShadow(); ctx.setLineDash([]); ctx.fillStyle = color || cur.st.color;
      ctx.beginPath(); ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - size * Math.cos(a - 0.4), y2 - size * Math.sin(a - 0.4));
      ctx.lineTo(x2 - size * Math.cos(a + 0.4), y2 - size * Math.sin(a + 0.4));
      ctx.closePath(); ctx.fill();
    },
    text(s, x, y, op = {}) {
      const size = op.size || 12;
      R.noShadow(); ctx.setLineDash([]);
      ctx.font = `${op.weight || 600} ${size}px Inter,system-ui,-apple-system,sans-serif`;
      ctx.textAlign = op.align || 'left'; ctx.textBaseline = op.base || 'middle';
      const w = ctx.measureText(s).width;
      if (op.bg) {
        const pad = op.pad == null ? 4 : op.pad;
        const bx = ctx.textAlign === 'center' ? x - w / 2 : ctx.textAlign === 'right' ? x - w : x;
        ctx.fillStyle = op.bg; rr(bx - pad, y - size / 2 - pad + 1, w + pad * 2, size + pad * 2 - 2, 4); ctx.fill();
      }
      ctx.fillStyle = op.color || cur.st.color; ctx.fillText(s, x, y);
      return w;
    },
    box(str, cx, cy, op = {}) {
      const lines = String(str).split('\n'), size = op.size || 13, pad = 8, lh = size + 3;
      R.noShadow(); ctx.setLineDash([]);
      ctx.font = `600 ${size}px Inter,system-ui,-apple-system,sans-serif`;
      const lw = Math.max(20, ...lines.map(l => ctx.measureText(l).width));
      const w = lw + pad * 2, h = lines.length * lh + pad * 2 - 3;
      const bx = cx - w / 2, by = op.anchor === 'bottom' ? cy - h : cy - h / 2;
      ctx.fillStyle = op.fill || 'rgba(0,0,0,.5)'; rr(bx, by, w, h, 6); ctx.fill();
      if (op.border) { R.stroke({ color: op.border, width: 1.5, dash: false }); rr(bx, by, w, h, 6); ctx.stroke(); }
      R.noShadow(); ctx.fillStyle = op.color || '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      lines.forEach((l, i) => ctx.fillText(l, bx + pad, by + pad + lh * i + lh / 2 - 1.5));
      cur.hits.push(normRect(bx, by, w, h, true));
      return { x: bx, y: by, w, h };
    },
    bubble(s, x, y, above) {
      const yy = y + (above ? -16 : 16);
      R.noShadow(); ctx.setLineDash([]);
      ctx.fillStyle = cur.st.color; ctx.beginPath(); ctx.arc(x, yy, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '700 11px Inter,system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s, x, yy + 0.5);
    },
    axisLabel(y, txt, color) {
      if (y < 0 || y > plotH) return;
      after.push(() => {
        let aw = 64; try { aw = chart.priceScale('right').width() || 64; } catch (e) {}
        ctx.shadowBlur = 0; ctx.setLineDash([]); ctx.fillStyle = color; ctx.fillRect(plotW, y - 9, aw, 18);
        ctx.fillStyle = '#fff'; ctx.font = '600 11px Inter,system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, plotW + aw / 2, y + 0.5);
      });
    },
    timeLabel(x, txt, color) {
      if (x < 0 || x > plotW) return;
      after.push(() => {
        let th = 26; try { th = ts.height() || 26; } catch (e) {}
        ctx.shadowBlur = 0; ctx.setLineDash([]); ctx.fillStyle = color; ctx.fillRect(x - 38, plotH, 76, Math.min(th, 20));
        ctx.fillStyle = '#fff'; ctx.font = '600 11px Inter,system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, x, plotH + 10);
      });
    },
    above(P, k) {
      const prev = P[k - 1], next = P[k + 1];
      const ref = ((prev ? prev.y : next ? next.y : P[k].y) + (next ? next.y : prev ? prev.y : P[k].y)) / 2;
      return P[k].y <= ref;
    }
  };

  /* ====================================================================
     ИНСТРУМЕНТЫ
     draw(R, d, P) — P: [{x,y,i,p}] в пикселях; need — число точек
     ==================================================================== */
  const defHandles = (d, P) => P.map((q, k) => ({ x: q.x, y: q.y, set: pt => { d.points[k].t = pt.t; d.points[k].p = pt.p; } }));
  const levelFill = (R2, x1, x2, ys, cols) => {
    for (let k = 0; k < ys.length - 1; k++) {
      R2.fillRect(x1, Math.min(ys[k], ys[k + 1]), x2 - x1, Math.abs(ys[k + 1] - ys[k]), rgba(cols[k + 1], 0.08));
    }
  };

  const TOOLS = {
    'trend-line': { need: 2, draw(R, d, P) { R.line(P[0].x, P[0].y, P[1].x, P[1].y); } },
    ray: { need: 2, draw(R, d, P) { R.ray(P[0].x, P[0].y, P[1].x, P[1].y); } },
    'horizontal-line': {
      need: 1,
      draw(R, d, P) {
        const y = P[0].y; R.line(0, y, R.W, y);
        R.axisLabel(y, fmt(P[0].p), d.style.color);
      },
      handles: (d, P) => [{ x: plotW * 0.5, y: P[0].y, set: pt => { d.points[0].p = pt.p; } }]
    },
    'vertical-line': {
      need: 1,
      draw(R, d, P) {
        const x = P[0].x; R.line(x, 0, x, R.H);
        R.timeLabel(x, fmtT(d.points[0].t), d.style.color);
      },
      handles: (d, P) => [{ x: P[0].x, y: plotH * 0.5, set: pt => { d.points[0].t = pt.t; } }]
    },
    'cross-line': {
      need: 1,
      draw(R, d, P) {
        R.line(0, P[0].y, R.W, P[0].y); R.line(P[0].x, 0, P[0].x, R.H);
        R.axisLabel(P[0].y, fmt(P[0].p), d.style.color);
      }
    },
    'parallel-channel': {
      need: 3,
      draw(R, d, P) {
        const [a, b, c] = P, dx = b.x - a.x, dy = b.y - a.y;
        let ox = 0, oy = 0;
        if (Math.abs(dx) < 1e-6) ox = c.x - a.x; else oy = c.y - (a.y + (dy * (c.x - a.x)) / dx);
        const a2 = { x: a.x + ox, y: a.y + oy }, b2 = { x: b.x + ox, y: b.y + oy };
        R.poly([a, b, b2, a2], { close: true, fill: R.col(0.1), stroke: false });
        R.line(a.x, a.y, b.x, b.y); R.line(a2.x, a2.y, b2.x, b2.y);
        R.line((a.x + a2.x) / 2, (a.y + a2.y) / 2, (b.x + b2.x) / 2, (b.y + b2.y) / 2, { width: 1, dash: true });
      }
    },
    pitchfork: {
      need: 3,
      draw(R, d, P) {
        const [a, b, c] = P, mx = (b.x + c.x) / 2, my = (b.y + c.y) / 2, dx = mx - a.x, dy = my - a.y;
        const K = ((plotW + plotH) * 4) / (Math.hypot(dx, dy) || 1);
        const far = q => ({ x: q.x + dx * K, y: q.y + dy * K });
        R.poly([b, far(b), far(c), c], { close: true, fill: R.col(0.08), stroke: false });
        R.line(a.x, a.y, a.x + dx * K, a.y + dy * K);
        R.line(b.x, b.y, far(b).x, far(b).y); R.line(c.x, c.y, far(c).x, far(c).y);
        R.line(b.x, b.y, c.x, c.y, { width: 1, dash: true });
      }
    },
    'fib-retracement': {
      need: 2,
      draw(R, d, P) {
        const [a, b] = P, x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
        const ys = FIB.map(([l]) => b.y + (a.y - b.y) * l);
        levelFill(R, x1, x2, ys, FIB.map(f => f[1]));
        const w = Math.max(1, d.style.width - 1);
        FIB.forEach(([l, c], k) => {
          R.line(x1, ys[k], x2, ys[k], { color: c, width: w, dash: false });
          R.text(l + ' (' + fmt(b.p + (a.p - b.p) * l) + ')', x1 + 4, ys[k] - 7, { color: c, size: 11 });
        });
        R.line(a.x, a.y, b.x, b.y, { color: '#787b86', width: 1, dash: true });
      }
    },
    'trend-based-fib-extension': {
      need: 3,
      draw(R, d, P) {
        const [a, b, c] = P;
        const x1 = Math.min(b.x, c.x), x2 = Math.max(b.x, c.x) + Math.max(90, Math.abs(b.x - a.x));
        const ys = FIBX.map(([l]) => c.y + (b.y - a.y) * l);
        levelFill(R, x1, x2, ys, FIBX.map(f => f[1]));
        const w = Math.max(1, d.style.width - 1);
        FIBX.forEach(([l, col], k) => {
          R.line(x1, ys[k], x2, ys[k], { color: col, width: w, dash: false });
          R.text(l + ' (' + fmt(c.p + (b.p - a.p) * l) + ')', x1 + 4, ys[k] - 7, { color: col, size: 11 });
        });
        R.line(a.x, a.y, b.x, b.y, { color: '#787b86', width: 1, dash: true });
        R.line(b.x, b.y, c.x, c.y, { color: '#787b86', width: 1, dash: true });
      }
    },
    'fib-speed-resistance-fan': {
      need: 2,
      draw(R, d, P) {
        const [a, b] = P, w = Math.max(1, d.style.width - 1);
        FAN.forEach(([l, c]) => {
          R.ray(a.x, a.y, b.x, a.y + (b.y - a.y) * l, { color: c, width: w, dash: false });
          R.ray(a.x, a.y, a.x + (b.x - a.x) * l, b.y, { color: c, width: w, dash: false });
        });
        R.line(a.x, a.y, b.x, b.y, { color: '#787b86', width: 1, dash: true });
      }
    },
    'fib-time-zone': {
      need: 2,
      draw(R, d, P) {
        const [a, b] = P; const unit = Math.abs(b.i - a.i) < 0.5 ? 1 : b.i - a.i;
        FIBNUM.forEach((n, k) => {
          const x = ts.logicalToCoordinate(a.i + n * unit);
          if (x == null || x < -5 || x > plotW + 5) return;
          R.line(x, 0, x, R.H, { width: 1, dash: k > 0 });
          R.text(String(n), x + 3, 10, { size: 10 });
        });
        R.line(a.x, a.y, b.x, b.y, { width: 1, dash: true });
      }
    },
    'xabcd-pattern': {
      need: 5,
      draw(R, d, P) {
        const [X, A, B, C, D] = P, pr = d.points.map(q => q.p);
        R.poly([X, A, B], { close: true, fill: R.col(0.12), stroke: false });
        R.poly([B, C, D], { close: true, fill: R.col(0.12), stroke: false });
        R.poly(P, {});
        const dd = { width: 1, dash: true };
        R.line(X.x, X.y, B.x, B.y, dd); R.line(B.x, B.y, D.x, D.y, dd); R.line(X.x, X.y, D.x, D.y, dd); R.line(A.x, A.y, C.x, C.y, dd);
        const ratio = (n, m) => (m ? Math.abs(n / m).toFixed(3) : '—');
        const tag = (q1, q2, v) => R.text(v, (q1.x + q2.x) / 2, (q1.y + q2.y) / 2, { size: 10, align: 'center', color: '#fff', bg: R.col(0.85), pad: 2 });
        tag(X, B, ratio(pr[2] - pr[1], pr[1] - pr[0])); tag(A, C, ratio(pr[3] - pr[2], pr[2] - pr[1]));
        tag(B, D, ratio(pr[4] - pr[3], pr[3] - pr[2])); tag(X, D, ratio(pr[4] - pr[1], pr[1] - pr[0]));
        ['X', 'A', 'B', 'C', 'D'].forEach((s, k) => R.bubble(s, P[k].x, P[k].y, R.above(P, k)));
      }
    },
    'head-and-shoulders': {
      need: 7,
      draw(R, d, P) {
        R.poly([P[2], P[3], P[4]], { close: true, fill: R.col(0.1), stroke: false });
        R.poly(P, {});
        const a = P[2], b = P[4], k = b.x !== a.x ? (b.y - a.y) / (b.x - a.x) : 0;
        const x1 = Math.min(P[0].x, a.x), x2 = Math.max(P[6].x, b.x);
        R.line(x1, a.y + k * (x1 - a.x), x2, a.y + k * (x2 - a.x), { width: 1, dash: true });
        [[1, 'Лев. плечо'], [3, 'Голова'], [5, 'Прав. плечо']].forEach(([i, s]) =>
          R.text(s, P[i].x, P[i].y + (R.above(P, i) ? -14 : 14), { size: 11, align: 'center' }));
      }
    },
    'elliott-impulse': {
      need: 6,
      draw(R, d, P) { R.poly(P, {}); P.forEach((q, k) => R.bubble(String(k), q.x, q.y, R.above(P, k))); }
    },
    'triangle-pattern': {
      need: 4,
      draw(R, d, P) {
        const [A, B, C, D] = P;
        R.poly([A, C, D, B], { close: true, fill: R.col(0.1), stroke: false });
        R.poly(P, {});
        R.line(A.x, A.y, C.x, C.y, { width: 1, dash: true }); R.line(B.x, B.y, D.x, D.y, { width: 1, dash: true });
        ['A', 'B', 'C', 'D'].forEach((s, k) => R.bubble(s, P[k].x, P[k].y, R.above(P, k)));
      }
    },
    'long-position': position('Лонг'),
    'short-position': position('Шорт'),
    'date-range': {
      need: 2,
      draw(R, d, P) {
        const [a, b] = P, x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), my = (a.y + b.y) / 2;
        R.fillRect(x1, 0, x2 - x1, R.H, R.col(0.1)); R.hitRect(x1, 0, x2 - x1, R.H, true);
        R.line(a.x, 0, a.x, R.H, { width: 1 }); R.line(b.x, 0, b.x, R.H, { width: 1 });
        R.line(x1, my, x2, my, { width: 1, dash: false });
        R.head(x2, my, x1, my, 7); R.head(x1, my, x2, my, 7);
        const bars = Math.round(Math.abs(b.i - a.i)), dur = fmtDur(d.points[1].t - d.points[0].t);
        R.text(bars + ' баров, ' + dur, (x1 + x2) / 2, my - 14, { align: 'center', color: '#fff', bg: R.col(0.9), size: 11 });
      }
    },
    'price-range': {
      need: 2,
      draw(R, d, P) {
        const [a, b] = P, x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x, Math.min(a.x, b.x) + 30), mx = (x1 + x2) / 2;
        R.fillRect(x1, Math.min(a.y, b.y), x2 - x1, Math.abs(b.y - a.y), R.col(0.1));
        R.hitRect(x1, Math.min(a.y, b.y), x2 - x1, Math.abs(b.y - a.y), true);
        R.line(x1, a.y, x2, a.y, { width: 1 }); R.line(x1, b.y, x2, b.y, { width: 1 });
        R.line(mx, a.y, mx, b.y, { width: 1, dash: false });
        R.head(mx, a.y, mx, b.y, 7); R.head(mx, b.y, mx, a.y, 7);
        const dp = b.p - a.p, pct = a.p ? ((dp / a.p) * 100).toFixed(2) : '0';
        R.text((dp >= 0 ? '+' : '') + fmt(dp) + ' (' + (dp >= 0 ? '+' : '') + pct + '%)', mx, (a.y + b.y) / 2, { align: 'center', color: '#fff', bg: R.col(0.9), size: 11 });
      }
    },
    brush: {
      free: true, need: 2,
      draw(R, d, P) { R.poly(P, {}); },
      handles: () => []
    },
    rectangle: {
      need: 2,
      draw(R, d, P) { R.rect(Math.min(P[0].x, P[1].x), Math.min(P[0].y, P[1].y), Math.abs(P[1].x - P[0].x), Math.abs(P[1].y - P[0].y), { fill: R.col(0.14) }); },
      handles(d, P) {
        const [a, b] = P, pts = d.points;
        return [
          { x: a.x, y: a.y, set: pt => { pts[0].t = pt.t; pts[0].p = pt.p; } },
          { x: b.x, y: a.y, set: pt => { pts[1].t = pt.t; pts[0].p = pt.p; } },
          { x: b.x, y: b.y, set: pt => { pts[1].t = pt.t; pts[1].p = pt.p; } },
          { x: a.x, y: b.y, set: pt => { pts[0].t = pt.t; pts[1].p = pt.p; } }
        ];
      }
    },
    circle: {
      need: 2,
      draw(R, d, P) { R.circle(P[0].x, P[0].y, Math.hypot(P[1].x - P[0].x, P[1].y - P[0].y), { fill: R.col(0.14) }); }
    },
    triangle: { need: 3, draw(R, d, P) { R.poly(P, { close: true, fill: R.col(0.14) }); } },
    arrow: {
      need: 2,
      draw(R, d, P) {
        R.line(P[0].x, P[0].y, P[1].x, P[1].y);
        R.head(P[0].x, P[0].y, P[1].x, P[1].y, 9 + d.style.width * 2);
      }
    },
    text: {
      need: 1, text: true,
      draw(R, d, P) {
        if (!d.text) return;
        const size = textSize(d);
        const w = R.text(d.text, P[0].x, P[0].y, { size, color: d.style.color, weight: 600 });
        R.hitRect(P[0].x - 4, P[0].y - size / 2 - 4, w + 8, size + 8, true);
        if (cur.sel) { R.stroke({ width: 1, dash: true, color: d.style.color }); ctx.strokeRect(P[0].x - 4, P[0].y - size / 2 - 4, w + 8, size + 8); }
      }
    },
    note: {
      need: 1, text: true,
      draw(R, d, P) {
        if (!d.text) return;
        const q = P[0];
        R.line(q.x, q.y, q.x, q.y - 10, { width: 1.5, dash: false });
        R.box(d.text, q.x, q.y - 10, { anchor: 'bottom', fill: rgba(d.style.color, 0.95), color: '#111', size: textSize(d) });
        R.noShadow(); ctx.fillStyle = d.style.color; ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, Math.PI * 2); ctx.fill();
      }
    },
    'price-label': {
      need: 1,
      draw(R, d, P) {
        const q = P[0], s = fmt(d.points[0].p), size = textSize(d);
        R.noShadow(); ctx.font = `700 ${size}px Inter,system-ui,sans-serif`;
        const w = ctx.measureText(s).width + 14, h = size + 10;
        ctx.setLineDash([]); ctx.fillStyle = d.style.color;
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x + 8, q.y - h / 2); ctx.lineTo(q.x + 8 + w, q.y - h / 2);
        ctx.lineTo(q.x + 8 + w, q.y + h / 2); ctx.lineTo(q.x + 8, q.y + h / 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, q.x + 15, q.y + 0.5);
        cur.hits.push(normRect(q.x, q.y - h / 2, w + 8, h, true));
      }
    },
    callout: {
      need: 2, text: true,
      draw(R, d, P) {
        if (!d.text) return;
        const [a, b] = P;
        const bx = R.box(d.text, b.x, b.y, { fill: rgba(d.style.color, 0.22), border: d.style.color, color: '#fff', size: textSize(d) });
        const cx = b.x, cy = b.y, dx = a.x - cx, dy = a.y - cy;
        const t = Math.min(dx ? bx.w / 2 / Math.abs(dx) : Infinity, dy ? bx.h / 2 / Math.abs(dy) : Infinity);
        if (t < 1) {
          R.line(cx + dx * t, cy + dy * t, a.x, a.y, { width: 1.5, dash: false });
          R.head(cx + dx * t, cy + dy * t, a.x, a.y, 8);
        }
      }
    }
  };

  function position(title) {
    return {
      need: 2,
      fix: pts => { const [e, t] = pts; return [e, t, { t: t.t, p: e.p - (t.p - e.p) }]; },
      draw(R, d, P) {
        const [e, t, s] = P, p = d.points;
        const x1 = Math.min(e.x, t.x), x2 = x1 + Math.max(14, Math.abs(t.x - e.x)), w = x2 - x1;
        const dT = p[1].p - p[0].p, dS = p[2].p - p[0].p, pct = v => (p[0].p ? ((v / p[0].p) * 100).toFixed(2) : '0');
        R.fillRect(x1, Math.min(e.y, t.y), w, Math.abs(t.y - e.y), rgba(GREEN, 0.2));
        R.fillRect(x1, Math.min(e.y, s.y), w, Math.abs(s.y - e.y), rgba(RED, 0.2));
        R.hitRect(x1, Math.min(e.y, t.y), w, Math.abs(t.y - e.y), true);
        R.hitRect(x1, Math.min(e.y, s.y), w, Math.abs(s.y - e.y), true);
        R.line(x1, t.y, x2, t.y, { color: GREEN, width: 1, dash: false });
        R.line(x1, s.y, x2, s.y, { color: RED, width: 1, dash: false });
        R.line(x1, e.y, x2, e.y, { color: d.style.color, width: Math.max(1, d.style.width - 1), dash: false });
        const mx = (x1 + x2) / 2;
        R.text('Цель ' + (dT >= 0 ? '+' : '') + fmt(dT) + ' (' + pct(dT) + '%)', mx, (e.y + t.y) / 2, { align: 'center', color: '#fff', bg: rgba(GREEN, 0.92), size: 11 });
        R.text('Стоп ' + (dS >= 0 ? '+' : '') + fmt(dS) + ' (' + pct(dS) + '%)', mx, (e.y + s.y) / 2, { align: 'center', color: '#fff', bg: rgba(RED, 0.92), size: 11 });
        const rr2 = dS ? Math.abs(dT / dS).toFixed(2) : '—';
        R.text(title + ' · R/R ' + rr2, x1 + 4, e.y - 9, { size: 11, color: d.style.color });
      },
      handles(d, P) {
        const [e, t, s] = P, p = d.points;
        return [
          { x: e.x, y: e.y, set: pt => { p[0].t = pt.t; p[0].p = pt.p; } },
          { x: t.x, y: t.y, set: pt => { p[1].t = pt.t; p[1].p = pt.p; p[2].t = pt.t; } },
          { x: t.x, y: s.y, set: pt => { p[2].p = pt.p; p[2].t = p[1].t; } }
        ];
      }
    };
  }
  // 'position' — function declaration, поднимается; TOOLS уже заполнен выше.

  /* ---------- отрисовка одного рисунка ---------- */
  function drawOne(d, preview) {
    const def = TOOLS[d.kind]; if (!def) return;
    const s = getSeries(); if (!s) return;
    const P = [];
    for (const pt of d.points) {
      const i = t2i(pt.t); if (i == null) return;
      const x = ts.logicalToCoordinate(i), y = s.priceToCoordinate(pt.p);
      if (x == null || y == null || !isFinite(x) || !isFinite(y)) return;
      P.push({ x, y, i, p: pt.p });
    }
    if (P.length < Math.min(def.need, 1)) return;
    const sel = !preview && d.id === selId;
    cur = { d, st: d.style, sel, hits: [], after };
    ctx.save();
    try { def.draw(R, d, P); } catch (e) { console.warn('[drawings] ' + d.kind, e); }
    ctx.restore();
    if (!preview) d._h = cur.hits;
    if (sel) {
      const hd = def.handles ? def.handles(d, P) : defHandles(d, P);
      d._hd = hd;
      const r = coarse ? 8 : 5;
      ctx.save(); ctx.setLineDash([]); ctx.shadowBlur = 0;
      hd.forEach(h => {
        ctx.beginPath(); ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = d.style.color; ctx.stroke();
      });
      ctx.restore();
    } else if (!preview) d._hd = [];
  }

  function drawDraft() {
    if (!draft) return;
    const def = draft.def;
    let pts;
    if (draft.free) pts = draft.free.slice();
    else {
      pts = draft.placed.slice();
      while (pts.length < def.need) pts.push(draft.cursor);
    }
    pts = pts.map(q => ({ t: q.t, p: q.p }));
    const s = getSeries();
    if (!(def.text)) {
      let use = pts;
      if (def.fix && use.length >= 2) use = def.fix(use.slice(0, 2));
      drawOne({ id: '_draft', kind: draft.kind, points: use, style: styleFor(draft.kind) }, true);
    }
    // маркеры поставленных точек
    ctx.save(); ctx.setLineDash([]);
    const mk = def.free ? [pts[0]] : draft.placed;
    mk.forEach(q => {
      const i = t2i(q.t); if (i == null) return;
      const x = ts.logicalToCoordinate(i), y = s.priceToCoordinate(q.p);
      if (x == null || y == null) return;
      ctx.beginPath(); ctx.arc(x, y, coarse ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = styleFor(draft.kind).color; ctx.stroke();
    });
    ctx.restore();
  }

  function fit() {
    const w = wrap.clientWidth, h = wrap.clientHeight, dpr = window.devicePixelRatio || 1;
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    return { w, h, dpr };
  }

  function render() {
    const { w, h, dpr } = fit();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const s = getSeries(), bars = getBars();
    if (!s || !bars.length || !w || !h) return;
    const wr = wrap.getBoundingClientRect(), cr = chartEl.getBoundingClientRect();
    const ps = plotSize(); plotW = ps.w; plotH = ps.h;
    after = [];
    ctx.save();
    ctx.translate(cr.left - wr.left, cr.top - wr.top);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, plotW, plotH); ctx.clip();
    if (!hidden) drawings.forEach(d => drawOne(d, false));
    drawDraft();
    ctx.restore();
    after.forEach(f => f());
    ctx.restore();
  }

  let sig = '';
  function signature() {
    const s = getSeries(), b = getBars(), n = b.length;
    let a = '', c = '', e = '', f = '';
    try { a = ts.logicalToCoordinate(0); c = ts.logicalToCoordinate(50); } catch (_) {}
    try { if (s) { e = s.priceToCoordinate(1); f = s.priceToCoordinate(100000); } } catch (_) {}
    return [wrap.clientWidth, wrap.clientHeight, n, n ? b[n - 1].time : 0, a, c, e, f, plotH].join('|');
  }
  function loop() {
    requestAnimationFrame(loop);
    try {
      const sg = signature();
      if (dirty || sg !== sig) { sig = sg; dirty = false; render(); }
    } catch (e) { console.warn('[drawings] render', e); }
  }

  /* ====================================================================
     ВЗАИМОДЕЙСТВИЕ
     ==================================================================== */
  const tol = () => (activeTouch ? TOUCH_TOL : MOUSE_TOL);
  function hitHandle(d, x, y) {
    const r = activeTouch ? 22 : 9; let best = -1, bd = r;
    (d._hd || []).forEach((h, i) => { const dd = Math.hypot(h.x - x, h.y - y); if (dd <= bd) { bd = dd; best = i; } });
    return best;
  }
  function hitDrawing(x, y) {
    const tl = tol();
    for (let k = drawings.length - 1; k >= 0; k--) {
      const d = drawings[k];
      if (!d._h) continue;
      for (const h of d._h) if (hitDist(h, x, y) <= tl + (d.style.width || 1) / 2) return d;
    }
    return null;
  }

  function startHandle(d, hi) { drag = { kind: 'handle', id: d.id, hi, before: snap(), moved: false }; }
  function startMove(d, x, y) {
    const s = getSeries();
    drag = {
      kind: 'move', id: d.id, before: snap(), moved: false, sx: x, sy: y,
      i0: ts.coordinateToLogical(x), p0: s.coordinateToPrice(y),
      orig: d.points.map(pt => ({ i: t2i(pt.t), p: pt.p }))
    };
  }
  function updateDrag(x, y) {
    const d = byId(drag.id); if (!d) { drag = null; return; }
    if (!drag.moved && Math.hypot(x - (drag.sx ?? x), y - (drag.sy ?? y)) > 2) drag.moved = true;
    if (drag.kind === 'handle') {
      const pt = ptFromXY(x, y); if (!pt) return;
      const h = (d._hd || [])[drag.hi]; if (h) { h.set(pt); drag.moved = true; }
    } else {
      const s = getSeries(), fi = ts.coordinateToLogical(x), pp = s.coordinateToPrice(y);
      if (fi == null || pp == null) return;
      const di = Math.round(fi - drag.i0), dp = pp - drag.p0;
      d.points.forEach((pt, k) => { pt.t = i2t(drag.orig[k].i + di); pt.p = drag.orig[k].p + dp; });
    }
    dirty = true;
  }
  let lastTapT = 0, lastTapId = null;
  function registerTap(d) {
    const now = Date.now(); const dbl = d && lastTapId === d.id && now - lastTapT < 400;
    lastTapT = now; lastTapId = d ? d.id : null;
    if (dbl && isTextKind(d)) editText(d);
  }
  function endDrag() {
    const dr = drag; drag = null; if (!dr) return;
    const d = byId(dr.id);
    if (!dr.moved && activeTouch) registerTap(d);
    commit(dr.before);
  }

  function askText(label) { const t = window.prompt(label || 'Текст', ''); return t === null ? null : t.trim(); }
  function finishDraft() {
    const dr = draft; draft = null; const def = dr.def;
    let pts = dr.free ? dr.free.map(q => ({ t: q.t, p: q.p })) : dr.placed.slice(0, def.need).map(q => ({ t: q.t, p: q.p }));
    if (def.fix) pts = def.fix(pts);
    const before = snap();
    const d = { id: uid(), kind: dr.kind, points: pts, style: styleFor(dr.kind) };
    if (def.text) {
      const t = askText(dr.kind === 'callout' ? 'Текст выноски' : dr.kind === 'note' ? 'Текст заметки' : 'Текст');
      if (!t) { dirty = true; return; }
      d.text = t;
    }
    drawings.push(d);
    commit(before);
    if (keep) { dirty = true; return; }
    tool = 'cross'; wrap.classList.remove('dr-draw');
    select(d.id); onState();
  }

  function pointerDown(x, y, touch) {
    activeTouch = touch;
    if (tool !== 'cross') {
      if (hidden) { hidden = false; onState(); }
      if (selId) select(null);
      const pt = ptFromXY(x, y); if (!pt) return true;
      if (!draft) {
        const def = TOOLS[tool];
        draft = { kind: tool, def, placed: [pt], cursor: pt, free: def.free ? [pt] : null, pressDrag: true, moved: false, down: true, dx: x, dy: y, lastXY: [x, y] };
      } else { draft.cursor = pt; draft.down = true; draft.pressDrag = false; }
      dirty = true; return true;
    }
    if (hidden) return false;
    const sel = getSel();
    if (sel) { const hi = hitHandle(sel, x, y); if (hi >= 0) { startHandle(sel, hi); drag.sx = x; drag.sy = y; return true; } }
    const d = hitDrawing(x, y);
    if (d) {
      if (!touch || d.id === selId) { select(d.id); startMove(d, x, y); return true; }
      tapInfo = { x, y, id: d.id, t: Date.now() }; return false;
    }
    if (!touch) select(null); else tapInfo = { x, y, id: null, t: Date.now() };
    return false;
  }
  function pointerMove(x, y, touch) {
    activeTouch = touch;
    if (drag) { updateDrag(x, y); return true; }
    if (draft) {
      const pt = ptFromXY(x, y); if (!pt) return false;
      if (draft.free) {
        if (draft.down) {
          const l = draft.lastXY;
          if (!l || Math.hypot(x - l[0], y - l[1]) >= 3) { draft.free.push(pt); draft.lastXY = [x, y]; }
        }
        draft.cursor = pt;
      } else if (!touch || draft.down) draft.cursor = pt;
      if (draft.pressDrag && Math.hypot(x - draft.dx, y - draft.dy) > 8) draft.moved = true;
      dirty = true; return true;
    }
    if (!touch && tool === 'cross') wrap.classList.toggle('dr-pointer', !hidden && !!hitDrawing(x, y));
    return false;
  }
  function pointerUp() {
    if (drag) { endDrag(); return; }
    if (!draft) return;
    draft.down = false;
    if (draft.free) { if (draft.free.length >= 2) finishDraft(); else { draft = null; dirty = true; } return; }
    if (draft.pressDrag) { draft.pressDrag = false; if (draft.moved) draft.placed.push(draft.cursor); }
    else draft.placed.push(draft.cursor);
    draft.moved = false;
    if (draft.placed.length >= draft.def.need) finishDraft();
    dirty = true;
  }

  /* ----- мышь ----- */
  let lastTouchT = 0, mouseOwned = false, touchOwned = false, tapInfo = null;
  const onUI = e => !!(e.target && e.target.closest && e.target.closest('.dr-ui'));
  wrap.addEventListener('mousedown', e => {
    if (e.button !== 0 || Date.now() - lastTouchT < 700 || onUI(e)) return;
    const { x, y } = rel(e.clientX, e.clientY);
    if (!inPlot(x, y)) return;
    if (pointerDown(x, y, false)) { mouseOwned = true; e.preventDefault(); e.stopPropagation(); }
  }, true);
  window.addEventListener('mousemove', e => {
    if (Date.now() - lastTouchT < 700) return;
    const wr = wrap.getBoundingClientRect();
    const over = e.clientX >= wr.left && e.clientX <= wr.right && e.clientY >= wr.top && e.clientY <= wr.bottom;
    if (!over && !drag && !mouseOwned) return;
    const { x, y } = rel(e.clientX, e.clientY);
    pointerMove(x, y, false);
  }, { passive: true });
  window.addEventListener('mouseup', () => {
    if (Date.now() - lastTouchT < 700) return;
    if (mouseOwned) { mouseOwned = false; pointerUp(); }
  });
  wrap.addEventListener('dblclick', e => {
    if (onUI(e) || tool !== 'cross') return;
    const { x, y } = rel(e.clientX, e.clientY);
    activeTouch = false;
    const d = hitDrawing(x, y); if (d && isTextKind(d)) editText(d);
  }, true);
  wrap.addEventListener('contextmenu', e => {
    if (tool !== 'cross' || draft || drag) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  /* ----- touch ----- */
  const tpos = t => rel(t.clientX, t.clientY);
  wrap.addEventListener('touchstart', e => {
    lastTouchT = Date.now();
    if (onUI(e)) return;
    if (e.touches.length > 1) {
      if (drag) { const d = byId(drag.id); const b = drag.before; drag = null; if (d && b) { drawings = parseList(b); dirty = true; } }
      touchOwned = false; tapInfo = null; return;
    }
    const { x, y } = tpos(e.touches[0]);
    if (!inPlot(x, y)) return;
    if (pointerDown(x, y, true)) { touchOwned = true; e.preventDefault(); e.stopPropagation(); }
    else touchOwned = false;
  }, { capture: true, passive: false });
  wrap.addEventListener('touchmove', e => {
    lastTouchT = Date.now();
    if (e.touches.length > 1) { touchOwned = false; tapInfo = null; return; }
    const { x, y } = tpos(e.touches[0]);
    if (touchOwned) { e.preventDefault(); e.stopPropagation(); pointerMove(x, y, true); }
    else if (tapInfo && Math.hypot(x - tapInfo.x, y - tapInfo.y) > 10) tapInfo = null;
  }, { capture: true, passive: false });
  const touchEnd = e => {
    lastTouchT = Date.now();
    if (touchOwned) {
      e.preventDefault(); e.stopPropagation(); touchOwned = false;
      const t = e.changedTouches && e.changedTouches[0];
      if (t && draft && !draft.free) { const { x, y } = tpos(t); pointerMove(x, y, true); }
      if (e.type === 'touchcancel') { draft = draft && draft.free ? null : draft; drag = null; }
      pointerUp();
      return;
    }
    if (tapInfo && Date.now() - tapInfo.t < 500 && e.touches.length === 0) {
      const d = tapInfo.id ? byId(tapInfo.id) : null;
      registerTap(d); select(d ? d.id : null);
    }
    tapInfo = null;
  };
  wrap.addEventListener('touchend', touchEnd, { capture: true, passive: false });
  wrap.addEventListener('touchcancel', touchEnd, { capture: true, passive: false });

  /* ====================================================================
     ПАНЕЛЬ СВОЙСТВ
     ==================================================================== */
  const bar = document.createElement('div');
  bar.className = 'dr-bar dr-ui';
  bar.innerHTML =
    '<input type="color" class="b-col" title="Цвет">' +
    '<select class="b-w" title="Толщина / размер"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select>' +
    '<button class="b-dash" title="Пунктир">┄</button>' +
    '<button class="b-txt" title="Изменить текст">T</button>' +
    '<span class="sep"></span>' +
    '<button class="b-dup" title="Дублировать">⧉</button>' +
    '<button class="b-del" title="Удалить">🗑</button>';
  wrap.appendChild(bar);
  const bCol = bar.querySelector('.b-col'), bW = bar.querySelector('.b-w'), bDash = bar.querySelector('.b-dash'),
    bTxt = bar.querySelector('.b-txt'), bDup = bar.querySelector('.b-dup'), bDel = bar.querySelector('.b-del');
  ['mousedown', 'touchstart', 'click', 'dblclick'].forEach(ev => bar.addEventListener(ev, e => e.stopPropagation()));

  function syncBar() {
    const d = getSel();
    bar.classList.toggle('on', !!d);
    if (!d) return;
    bCol.value = /^#[0-9a-f]{6}$/i.test(d.style.color) ? d.style.color : '#4c8dff';
    bW.value = String(clamp(Math.round(d.style.width || 1), 1, 4));
    bDash.classList.toggle('on', !!d.style.dash);
    const txt = isTextKind(d);
    bTxt.style.display = txt ? '' : 'none';
    bDash.style.display = (txt || d.kind === 'price-label') ? 'none' : '';
  }
  function applyStyle(patch) {
    const d = getSel(); if (!d) return;
    Object.assign(d.style, patch);
    lastStyle = Object.assign({}, lastStyle, { color: d.style.color, width: d.style.width, dash: d.style.dash });
    if (storage) storage.set('dr2:style', lastStyle);
    dirty = true;
  }
  let styleBefore = null;
  bCol.addEventListener('input', () => { if (!styleBefore) styleBefore = snap(); applyStyle({ color: bCol.value }); });
  bCol.addEventListener('change', () => { if (styleBefore) { commit(styleBefore); styleBefore = null; } });
  bW.addEventListener('change', () => { const b = snap(); applyStyle({ width: +bW.value }); commit(b); });
  bDash.addEventListener('click', () => { const d = getSel(); if (!d) return; const b = snap(); applyStyle({ dash: !d.style.dash }); bDash.classList.toggle('on', !!d.style.dash); commit(b); });
  bTxt.addEventListener('click', () => editText(getSel()));
  bDup.addEventListener('click', duplicate);
  bDel.addEventListener('click', () => { if (deleteSelected()) toast('Фигура удалена'); });

  /* ---------- старт ---------- */
  requestAnimationFrame(loop);

  return {
    setTool, getTool: () => tool, escape, cancel: () => { draft = null; dirty = true; },
    setMagnet, cycleMagnet, getMagnet: () => magnet,
    setKeep, getKeep: () => keep,
    toggleHidden, isHidden: () => hidden,
    load, flush, markDirty: () => { dirty = true; },
    deleteSelected, clearAll, undo, redo, duplicate,
    canUndo: () => undoS.length > 0, canRedo: () => redoS.length > 0,
    hasSelection: () => !!selId, count: () => drawings.length,
    select, add, render,
    // для тестов
    __test: { pointerDown, pointerMove, pointerUp, get drawings() { return drawings; }, get draft() { return draft; }, hitDrawing, ptFromXY, t2i, i2t, kinds: () => Object.keys(TOOLS) }
  };
}