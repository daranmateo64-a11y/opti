import { optimize } from './optimizer.js';

const STORAGE_KEY = 'opti-vidrio-v1';

const defaults = {
  settings: { kerf: 0, trim: 10, minRemnantWidth: 300, minRemnantHeight: 300, reuseRemnants: true },
  stock: [
    { id: uid(), type: 'Float incoloro', thickness: 4, width: 3600, height: 2500, quantity: '', isRemnant: false },
    { id: uid(), type: 'Float incoloro', thickness: 6, width: 3600, height: 2500, quantity: '', isRemnant: false },
    { id: uid(), type: 'Laminado 3+3', thickness: 6, width: 3210, height: 2250, quantity: '', isRemnant: false },
  ],
  pieces: [
    { id: uid(), label: 'Ventana', type: 'Float incoloro', thickness: 4, width: 1200, height: 800, quantity: 4, rotate: true },
  ],
};

let state = load();
let lastResult = null;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...structuredClone(defaults), ...JSON.parse(raw) };
  } catch {
    // Sin almacenamiento disponible: se usan los valores por defecto.
  }
  return structuredClone(defaults);
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignorar: la app funciona igual sin guardar.
  }
}

const $ = (sel) => document.querySelector(sel);

function bindSettings() {
  const map = { kerf: 'kerf', trim: 'trim', minW: 'minRemnantWidth', minH: 'minRemnantHeight' };
  for (const [id, key] of Object.entries(map)) {
    const el = $(`#${id}`);
    el.value = state.settings[key];
    el.addEventListener('input', () => {
      state.settings[key] = Number(el.value) || 0;
      save();
    });
  }
  const reuse = $('#reuse');
  reuse.checked = state.settings.reuseRemnants;
  reuse.addEventListener('change', () => {
    state.settings.reuseRemnants = reuse.checked;
    save();
  });
}

function input(row, key, type, attrs = {}) {
  const el = document.createElement('input');
  el.type = type;
  if (type === 'checkbox') el.checked = !!row[key];
  else el.value = row[key] ?? '';
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.addEventListener(type === 'checkbox' ? 'change' : 'input', () => {
    row[key] = type === 'checkbox' ? el.checked : type === 'number' && el.value !== '' ? Number(el.value) : el.value;
    save();
    if (key === 'type') refreshTypes();
  });
  const td = document.createElement('td');
  td.append(el);
  return td;
}

function deleteCell(list, row) {
  const td = document.createElement('td');
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'del';
  b.textContent = '✕';
  b.title = 'Quitar';
  b.addEventListener('click', () => {
    list.splice(list.indexOf(row), 1);
    save();
    renderTables();
  });
  td.append(b);
  return td;
}

function renderTables() {
  const sb = $('#stock-body');
  sb.replaceChildren();
  for (const row of state.stock) {
    const tr = document.createElement('tr');
    tr.append(
      input(row, 'type', 'text', { list: 'types', placeholder: 'Float, Laminado…' }),
      input(row, 'thickness', 'number', { min: 0, step: 0.5 }),
      input(row, 'width', 'number', { min: 0 }),
      input(row, 'height', 'number', { min: 0 }),
      input(row, 'quantity', 'number', { min: 0, placeholder: '∞' }),
      input(row, 'isRemnant', 'checkbox'),
      deleteCell(state.stock, row),
    );
    sb.append(tr);
  }

  const pb = $('#pieces-body');
  pb.replaceChildren();
  for (const row of state.pieces) {
    const tr = document.createElement('tr');
    tr.append(
      input(row, 'label', 'text', { placeholder: 'Opcional' }),
      input(row, 'type', 'text', { list: 'types' }),
      input(row, 'thickness', 'number', { min: 0, step: 0.5 }),
      input(row, 'width', 'number', { min: 0 }),
      input(row, 'height', 'number', { min: 0 }),
      input(row, 'quantity', 'number', { min: 1 }),
      input(row, 'rotate', 'checkbox'),
      deleteCell(state.pieces, row),
    );
    pb.append(tr);
  }
  refreshTypes();
}

function refreshTypes() {
  const types = new Set([...state.stock, ...state.pieces].map((r) => String(r.type || '').trim()).filter(Boolean));
  $('#types').replaceChildren(...[...types].map((t) => Object.assign(document.createElement('option'), { value: t })));
}

const m2 = (mm2) => (mm2 / 1e6).toLocaleString('es', { maximumFractionDigits: 2 }) + ' m²';
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toLocaleString('es', { maximumFractionDigits: 1 }) + ' %' : '–');

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function drawSheet(sheet) {
  const svg = svgEl('svg', { viewBox: `0 0 ${sheet.width} ${sheet.height}`, role: 'img' });
  const stroke = Math.max(sheet.width, sheet.height) / 400;
  const font = Math.max(sheet.width, sheet.height) / 40;
  svg.append(svgEl('rect', { x: 0, y: 0, width: sheet.width, height: sheet.height, fill: 'var(--waste)', stroke: 'var(--waste-stroke)', 'stroke-width': stroke }));

  const label = (r, text) => {
    // Achica el texto para que entre en el rectángulo; si queda ilegible, no se dibuja.
    const size = Math.min(font, r.h / 2.5, (r.w * 0.9) / (text.length * 0.6));
    if (size < font * 0.35) return;
    const t = svgEl('text', { x: r.x + r.w / 2, y: r.y + r.h / 2, 'font-size': size, 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
    t.textContent = text;
    svg.append(t);
  };

  for (const r of sheet.remnants) {
    svg.append(svgEl('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: 'var(--remnant)', stroke: 'var(--remnant-stroke)', 'stroke-width': stroke, 'stroke-dasharray': `${stroke * 4} ${stroke * 3}` }));
    label(r, `retazo ${Math.round(r.w)}×${Math.round(r.h)}`);
  }
  for (const p of sheet.placements) {
    svg.append(svgEl('rect', { x: p.x, y: p.y, width: p.w, height: p.h, fill: 'var(--piece)', stroke: 'var(--piece-stroke)', 'stroke-width': stroke }));
    const size = `${p.w}×${p.h}`;
    const name = p.label && p.label !== size ? `${p.label} ` : '';
    label({ x: p.x, y: p.y, w: p.w, h: p.h }, `${name}${size}${p.rotated ? ' ↻' : ''}`);
  }
  return svg;
}

function stat(k, v) {
  const d = document.createElement('div');
  d.className = 'stat';
  d.innerHTML = `<div class="v"></div><div class="k"></div>`;
  d.querySelector('.v').textContent = v;
  d.querySelector('.k').textContent = k;
  return d;
}

function renderResults(res) {
  const out = $('#results');
  out.replaceChildren();
  const card = document.createElement('section');
  card.className = 'card';
  card.innerHTML = '<h2>Resultado</h2>';
  out.append(card);

  const t = res.totals;
  const summary = document.createElement('div');
  summary.className = 'summary';
  summary.append(
    stat('Planchas/retazos del stock', t.sheetsUsed),
    stat('Área de piezas', m2(t.placedArea)),
    stat('Retazos útiles que quedan', `${t.remnantCount} · ${m2(t.remnantArea)}`),
    stat('Desperdicio real', `${m2(t.wasteArea)} · ${pct(t.wasteArea, t.usedArea)}`),
  );
  card.append(summary);

  if (res.unplaced.length) {
    const warn = document.createElement('p');
    warn.className = 'warn';
    const byReason = {};
    for (const u of res.unplaced) {
      const k = `${u.label} ${u.w}×${u.h} (${u.type} ${u.thickness} mm): ${u.reason}`;
      byReason[k] = (byReason[k] || 0) + 1;
    }
    warn.textContent = 'Sin colocar: ' + Object.entries(byReason).map(([k, n]) => `${n} × ${k}`).join(' · ');
    card.append(warn);
  }

  const finalRemnants = res.sheets.flatMap((s) => s.remnants.filter((r) => !r.consumed).map((r) => ({ ...r, type: s.type, thickness: s.thickness })));
  if (finalRemnants.length) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `Guardar ${finalRemnants.length} retazo(s) en el stock`;
    b.addEventListener('click', () => {
      for (const r of finalRemnants) {
        state.stock.push({ id: uid(), type: r.type, thickness: r.thickness, width: Math.round(r.w), height: Math.round(r.h), quantity: 1, isRemnant: true });
      }
      save();
      renderTables();
      b.disabled = true;
      b.textContent = 'Retazos guardados';
    });
    card.append(b);
  }

  const legend = document.createElement('div');
  legend.className = 'legend';
  legend.innerHTML = '<span class="l-piece">Pieza</span><span class="l-remnant">Retazo útil</span><span class="l-waste">Desperdicio</span>';
  card.append(legend);

  for (const s of res.sheets) {
    const div = document.createElement('div');
    div.className = 'sheet';
    const origin = s.fromJob ? 'retazo de este trabajo' : s.isRemnant ? 'retazo del stock' : 'plancha';
    const h = document.createElement('h3');
    h.textContent = `#${s.index} · ${s.type} ${s.thickness} mm · ${s.width}×${s.height} (${origin})`;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${s.placements.length} pieza(s) · aprovechado ${pct(s.placedArea, s.sheetArea)} · retazo útil ${m2(s.remnantArea)} · desperdicio ${m2(s.wasteArea)}`;
    div.append(h, meta, drawSheet(s));
    card.append(div);
  }
}

function run() {
  lastResult = optimize({
    stock: state.stock.map((s) => ({ ...s, quantity: s.quantity === '' ? null : s.quantity })),
    pieces: state.pieces,
    settings: state.settings,
  });
  renderResults(lastResult);
}

$('#add-stock').addEventListener('click', () => {
  const prev = state.stock.at(-1) || {};
  state.stock.push({ id: uid(), type: prev.type || '', thickness: prev.thickness || 4, width: 3600, height: 2500, quantity: '', isRemnant: false });
  save();
  renderTables();
});

$('#add-piece').addEventListener('click', () => {
  const prev = state.pieces.at(-1) || {};
  state.pieces.push({ id: uid(), label: '', type: prev.type || '', thickness: prev.thickness || 4, width: 500, height: 500, quantity: 1, rotate: true });
  save();
  renderTables();
});

$('#run').addEventListener('click', run);

bindSettings();
renderTables();
