import { optimize, groupKey } from './optimizer.js';
import { applyCut, summarize, isUnlimited } from './stock.js';

const STORAGE_KEY = 'opti-vidrio-v1';

const defaults = {
  tab: 'stock',
  settings: { kerf: 0, trim: 10, minRemnantWidth: 300, minRemnantHeight: 300, reuseRemnants: true },
  stock: [],
  pieces: [],
};

let state = load();

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return { ...structuredClone(defaults), ...saved, settings: { ...defaults.settings, ...saved.settings } };
    }
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
  scheduleSync();
}

// ---------- Guardado en el servidor ----------
// Publicada en claude.ai, el stock y los ajustes se guardan en el servidor y no dependen
// de los datos del navegador. Abierta como archivo suelto queda sólo el guardado local.
// Las piezas a cortar son un borrador y se guardan sólo en el dispositivo.

const REMOTE_DOC = 'opti/stock';
let remote = null;
let lastSynced = null;
let syncTimer = null;
let syncQueue = Promise.resolve();

function sharedJson() {
  return JSON.stringify({ stock: state.stock, settings: state.settings });
}

function setSyncStatus(text, isError = false) {
  const el = $('#sync');
  el.textContent = text;
  el.classList.toggle('warn', isError);
}

function scheduleSync() {
  if (!remote) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 600);
}

function syncNow() {
  syncTimer = null;
  const json = sharedJson();
  if (json === lastSynced) return;
  lastSynced = json;
  setSyncStatus('Guardando…');
  // Una escritura a la vez sobre el mismo documento.
  syncQueue = syncQueue
    .then(() => remote.doc(REMOTE_DOC).set(JSON.parse(json)))
    .then(() => setSyncStatus('Stock guardado en la nube'))
    .catch(() => {
      lastSynced = null;
      setSyncStatus('No se pudo guardar en la nube. Revisá la conexión; los cambios siguen en este teléfono.', true);
    });
}

async function connectRemote() {
  const db = await window.claude?.use?.('db').catch(() => null);
  if (!db) {
    setSyncStatus('Guardado en este dispositivo');
    // Pide al navegador que no borre los datos por falta de espacio.
    navigator.storage?.persist?.().catch(() => {});
    return;
  }
  remote = db;
  setSyncStatus('Conectando…');
  db.doc(REMOTE_DOC).onSnapshot(
    (snap) => {
      // Mientras haya cambios propios sin subir, lo local manda.
      if (snap.metadata.hasPendingWrites || syncTimer) return;
      if (!snap.exists) {
        if (state.stock.length) syncNow();
        else setSyncStatus('Stock guardado en la nube');
        return;
      }
      const data = snap.data();
      const json = JSON.stringify({ stock: data.stock ?? [], settings: { ...defaults.settings, ...data.settings } });
      lastSynced = json;
      setSyncStatus('Stock guardado en la nube');
      if (json === sharedJson()) return;
      const incoming = JSON.parse(json);
      state.stock = incoming.stock;
      state.settings = incoming.settings;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Ignorar.
      }
      fillSettings();
      renderStock();
      renderPieces();
    },
    () => setSyncStatus('Se perdió la conexión con la nube. Recargá la página.', true),
  );
}

const $ = (sel) => document.querySelector(sel);

const m2 = (mm2) => (mm2 / 1e6).toLocaleString('es', { maximumFractionDigits: 2 }) + ' m²';
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toLocaleString('es', { maximumFractionDigits: 1 }) + ' %' : '–');

// ---------- Pestañas ----------

function showTab(name) {
  state.tab = name;
  save();
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  for (const t of document.querySelectorAll('.tab')) t.hidden = t.id !== `tab-${name}`;
  if (name !== 'cut') return;
  if (!state.pieces.length && materials().length) addPiece();
  else renderPieces();
}

for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => showTab(b.dataset.tab));

// ---------- Ajustes ----------

const SETTING_INPUTS = { kerf: 'kerf', trim: 'trim', minW: 'minRemnantWidth', minH: 'minRemnantHeight' };

function fillSettings() {
  for (const [id, key] of Object.entries(SETTING_INPUTS)) $(`#${id}`).value = state.settings[key];
  $('#reuse').checked = state.settings.reuseRemnants;
}

function bindSettings() {
  fillSettings();
  for (const [id, key] of Object.entries(SETTING_INPUTS)) {
    const el = $(`#${id}`);
    el.addEventListener('input', () => {
      state.settings[key] = Number(el.value) || 0;
      save();
    });
  }
  const reuse = $('#reuse');
  reuse.addEventListener('change', () => {
    state.settings.reuseRemnants = reuse.checked;
    save();
  });
}

// ---------- Celdas editables ----------

function input(row, key, type, attrs = {}, onChange) {
  const el = document.createElement('input');
  el.type = type;
  if (type === 'checkbox') el.checked = !!row[key];
  else el.value = row[key] ?? '';
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.addEventListener(type === 'checkbox' ? 'change' : 'input', () => {
    row[key] = type === 'checkbox' ? el.checked : type === 'number' && el.value !== '' ? Number(el.value) : el.value;
    save();
    onChange?.();
  });
  const td = document.createElement('td');
  td.append(el);
  return td;
}

function deleteCell(list, row, rerender) {
  const td = document.createElement('td');
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'del';
  b.textContent = '✕';
  b.title = 'Quitar';
  b.addEventListener('click', () => {
    list.splice(list.indexOf(row), 1);
    save();
    rerender();
  });
  td.append(b);
  return td;
}

// ---------- Stock ----------

function stat(k, v) {
  const d = document.createElement('div');
  d.className = 'stat';
  const vEl = document.createElement('div');
  vEl.className = 'v';
  vEl.textContent = v;
  const kEl = document.createElement('div');
  kEl.className = 'k';
  kEl.textContent = k;
  d.append(vEl, kEl);
  return d;
}

function renderStockSummary() {
  const box = $('#stock-summary');
  const groups = summarize(state.stock);
  box.replaceChildren(
    ...groups.map((g) => {
      const sheets = g.unlimited ? 'sin límite' : `${g.sheets} plancha(s)`;
      return stat(`${g.type} ${g.thickness} mm`, `${sheets} · ${g.remnants} retazo(s)`);
    }),
  );
  if (!groups.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Todavía no hay vidrios cargados.';
    box.append(p);
  }
  refreshTypes();
}

// En pantallas angostas cada fila se muestra como tarjeta; cada celda lleva el título de su columna.
function labelCells(tbody) {
  const heads = [...tbody.closest('table').querySelectorAll('thead th')].map((th) => th.textContent);
  for (const tr of tbody.rows) [...tr.cells].forEach((td, i) => (td.dataset.label = heads[i] || ''));
}

function renderStock() {
  const sb = $('#stock-body');
  sb.replaceChildren();
  for (const row of state.stock) {
    const tr = document.createElement('tr');
    tr.append(
      input(row, 'type', 'text', { list: 'types', placeholder: 'Float, Laminado…' }, renderStockSummary),
      input(row, 'thickness', 'number', { min: 0, step: 0.5 }, renderStockSummary),
      input(row, 'width', 'number', { min: 0 }, renderStockSummary),
      input(row, 'height', 'number', { min: 0 }, renderStockSummary),
      input(row, 'quantity', 'number', { min: 0, placeholder: '∞' }, renderStockSummary),
      input(row, 'isRemnant', 'checkbox', {}, renderStockSummary),
      deleteCell(state.stock, row, renderStock),
    );
    sb.append(tr);
  }
  labelCells(sb);
  renderStockSummary();
}

function addStockRow(isRemnant) {
  const prev = state.stock.at(-1) || {};
  state.stock.push({
    id: uid(),
    type: prev.type || '',
    thickness: prev.thickness || 4,
    width: isRemnant ? '' : prev.width || 3600,
    height: isRemnant ? '' : prev.height || 2500,
    quantity: 1,
    isRemnant,
  });
  save();
  renderStock();
  $('#stock-body tr:last-child input').focus();
}

function refreshTypes() {
  const types = new Set(state.stock.map((r) => String(r.type || '').trim()).filter(Boolean));
  $('#types').replaceChildren(...[...types].map((t) => Object.assign(document.createElement('option'), { value: t })));
}

$('#add-stock').addEventListener('click', () => addStockRow(false));
$('#add-remnant').addEventListener('click', () => addStockRow(true));

$('#export').addEventListener('click', async () => {
  const data = JSON.stringify({ stock: state.stock, settings: state.settings }, null, 2);
  const filename = `stock-vidrio-${new Date().toISOString().slice(0, 10)}.json`;
  const downloads = await window.claude?.use?.('downloads').catch(() => null);
  if (downloads) {
    // El visor pide confirmación; si la persona cancela no hay nada que hacer.
    await downloads.save({ filename, data }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const box = $('#import-msg');
  box.replaceChildren();
  let data;
  try {
    data = JSON.parse(await file.text());
    if (!Array.isArray(data.stock)) throw new Error('formato');
  } catch {
    box.append(Object.assign(document.createElement('p'), { className: 'warn', textContent: 'No se pudo leer el archivo. Tiene que ser un stock descargado desde esta página.' }));
    return;
  }
  const msg = Object.assign(document.createElement('p'), { textContent: `Esto reemplaza el stock actual por las ${data.stock.length} fila(s) del archivo.` });
  const yes = Object.assign(document.createElement('button'), { type: 'button', className: 'primary', textContent: 'Reemplazar stock' });
  const no = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Cancelar' });
  yes.addEventListener('click', () => {
    state.stock = data.stock.map((r) => ({ ...r, id: r.id || uid() }));
    if (data.settings) state.settings = { ...state.settings, ...data.settings };
    save();
    fillSettings();
    renderStock();
    box.replaceChildren(Object.assign(document.createElement('p'), { className: 'ok', textContent: 'Stock reemplazado.' }));
  });
  no.addEventListener('click', () => box.replaceChildren());
  const row = Object.assign(document.createElement('div'), { className: 'row' });
  row.append(yes, no);
  box.append(msg, row);
});

// ---------- Piezas a cortar ----------

function materials() {
  return summarize(state.stock);
}

function materialSelect(row) {
  const td = document.createElement('td');
  const sel = document.createElement('select');
  const mats = materials();
  const current = groupKey(row.type, row.thickness);
  for (const m of mats) {
    const o = document.createElement('option');
    o.value = m.key;
    o.textContent = `${m.type} ${m.thickness} mm`;
    sel.append(o);
  }
  if (!mats.some((m) => m.key === current)) {
    // El vidrio de la pieza ya no está en el stock: mostrarlo igual para no cambiarlo sin aviso.
    const o = document.createElement('option');
    o.value = current;
    o.textContent = `${row.type} ${row.thickness} mm (sin stock)`;
    sel.prepend(o);
  }
  sel.value = current;
  sel.addEventListener('change', () => {
    const m = mats.find((x) => x.key === sel.value);
    if (m) {
      row.type = m.type;
      row.thickness = m.thickness;
      save();
    }
  });
  td.append(sel);
  return td;
}

function renderPieces() {
  const pb = $('#pieces-body');
  pb.replaceChildren();
  const hasStock = materials().length > 0;
  $('#add-piece').disabled = !hasStock;
  $('#run').disabled = !hasStock;
  if (!hasStock) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.className = 'hint';
    td.textContent = 'Primero cargá el stock en la pestaña "1. Stock".';
    tr.append(td);
    pb.append(tr);
    return;
  }
  for (const row of state.pieces) {
    const tr = document.createElement('tr');
    tr.append(
      materialSelect(row),
      input(row, 'width', 'number', { min: 0, placeholder: 'mm' }),
      input(row, 'height', 'number', { min: 0, placeholder: 'mm' }),
      input(row, 'quantity', 'number', { min: 1 }),
      input(row, 'rotate', 'checkbox'),
      input(row, 'label', 'text', { placeholder: 'Opcional' }),
      deleteCell(state.pieces, row, renderPieces),
    );
    pb.append(tr);
  }
  labelCells(pb);
}

function addPiece() {
  const prev = state.pieces.at(-1) || materials()[0];
  state.pieces.push({ id: uid(), label: '', type: prev.type, thickness: prev.thickness, width: '', height: '', quantity: 1, rotate: true });
  save();
  renderPieces();
  $('#pieces-body tr:last-child input[type="number"]')?.focus();
}

$('#add-piece').addEventListener('click', addPiece);
$('#run').addEventListener('click', run);

// ---------- Resultado ----------

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

function renderResults(res) {
  const out = $('#results');
  out.replaceChildren();
  const card = document.createElement('section');
  card.className = 'card';
  card.innerHTML = '<h2>Mejor forma de cortar</h2>';
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

  if (res.sheets.length) {
    const actions = document.createElement('div');
    actions.className = 'row';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'primary';
    b.textContent = 'Confirmar corte y actualizar stock';
    b.title = 'Descuenta las planchas usadas y guarda los retazos útiles en el stock';
    b.addEventListener('click', () => confirmCut(res, actions));
    actions.append(b);
    card.append(actions);
  }

  const legend = document.createElement('div');
  legend.className = 'legend';
  legend.innerHTML = '<span class="l-piece">Pieza</span><span class="l-remnant">Retazo útil</span><span class="l-waste">Desperdicio</span>';
  card.append(legend);

  for (const s of res.sheets) {
    const div = document.createElement('div');
    div.className = 'sheet';
    const origin = s.fromJob ? 'retazo de este mismo corte' : s.isRemnant ? 'retazo del stock' : 'plancha';
    const h = document.createElement('h3');
    h.textContent = `#${s.index} · ${s.type} ${s.thickness} mm · ${s.width}×${s.height} (${origin})`;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${s.placements.length} pieza(s) · aprovechado ${pct(s.placedArea, s.sheetArea)} · retazo útil ${m2(s.remnantArea)} · desperdicio ${m2(s.wasteArea)}`;
    div.append(h, meta, drawSheet(s));
    card.append(div);
  }
}

function confirmCut(res, actions) {
  state.stock = applyCut(state.stock, res, uid);
  // Quitar del pedido las piezas que ya se cortaron; quedan las que no entraron.
  const pending = new Map();
  for (const u of res.unplaced) pending.set(u.pieceId, (pending.get(u.pieceId) || 0) + 1);
  state.pieces = state.pieces.filter((p) => pending.has(p.id)).map((p) => ({ ...p, quantity: pending.get(p.id) }));
  save();
  renderStock();
  renderPieces();
  const msg = document.createElement('p');
  msg.className = 'ok';
  const added = res.totals.remnantCount;
  msg.textContent = `Stock actualizado: se descontaron ${res.totals.sheetsUsed} plancha(s)/retazo(s) y se agregaron ${added} retazo(s).`;
  actions.replaceChildren(msg);
}

function validPieces() {
  return state.pieces.filter((p) => Number(p.width) > 0 && Number(p.height) > 0 && Number(p.quantity) > 0);
}

function run() {
  const pieces = validPieces();
  if (!pieces.length) {
    $('#results').replaceChildren(Object.assign(document.createElement('p'), { className: 'warn', textContent: 'Ingresá al menos una pieza con ancho y alto.' }));
    return;
  }
  const result = optimize({
    stock: state.stock
      .filter((s) => Number(s.width) > 0 && Number(s.height) > 0)
      .map((s) => ({ ...s, quantity: isUnlimited(s.quantity) ? null : s.quantity })),
    pieces,
    settings: state.settings,
  });
  renderResults(result);
}

bindSettings();
renderStock();
connectRemote();
// Instalable y usable sin conexión cuando se sirve como página web (no dentro de claude.ai).
if ('serviceWorker' in navigator && !window.claude && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
showTab(state.stock.length ? state.tab : 'stock');
