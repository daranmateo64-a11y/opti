// Optimizador de corte de vidrio (cortes guillotina).
//
// Idea central: no basta con elegir la plancha que deja menos sobrante.
// Un sobrante grande puede volver al stock como retazo útil, mientras que
// un sobrante chico es desperdicio. Por eso cada plancha candidata se evalúa
// por el DESPERDICIO REAL (lo que no se coloca ni sirve como retazo) y no por
// el área sobrante total.

const EPS = 1e-6;

export function groupKey(type, thickness) {
  return `${String(type ?? '').trim().toLowerCase()}|${Number(thickness)}`;
}

export function isUsefulRemnant(w, h, settings) {
  const a = settings.minRemnantWidth ?? 0;
  const b = settings.minRemnantHeight ?? 0;
  return (w + EPS >= a && h + EPS >= b) || (w + EPS >= b && h + EPS >= a);
}

const ORDERS = {
  area: (p, q) => q.w * q.h - p.w * p.h,
  longSide: (p, q) => Math.max(q.w, q.h) - Math.max(p.w, p.h),
  height: (p, q) => q.h - p.h || q.w - p.w,
  width: (p, q) => q.w - p.w || q.h - p.h,
};

const FITS = {
  // Menor área libre restante en el hueco elegido.
  bestArea: (f, w, h) => f.w * f.h - w * h,
  // Menor lado sobrante en el hueco elegido.
  bestShortSide: (f, w, h) => Math.min(f.w - w, f.h - h),
};

// Elige cómo partir el hueco libre después de colocar una pieza.
// 'maxRect' deja el rectángulo restante más grande posible (favorece retazos útiles).
// 'minRect' deja el rectángulo restante más chico (concentra el sobrante).
const SPLITS = ['maxRect', 'minRect'];

// Tamaño que ocupa una pieza dentro de un hueco, contando el ancho de corte.
// Si la pieza toca exactamente el borde del hueco no hace falta corte.
function footprint(size, space, kerf) {
  if (size > space + EPS) return null;
  return Math.min(size + kerf, space);
}

/**
 * Acomoda piezas en una plancha con cortes guillotina.
 * items: [{ pieceId, label, w, h, rotate }]
 * Devuelve { placements, free, unplaced }.
 */
export function packSheet(sheetW, sheetH, items, settings, strategy) {
  const kerf = settings.kerf ?? 0;
  const trim = settings.trim ?? 0;
  const W = sheetW - 2 * trim;
  const H = sheetH - 2 * trim;
  const free = W > EPS && H > EPS ? [{ x: trim, y: trim, w: W, h: H }] : [];
  const placements = [];
  const unplaced = [];
  const fit = FITS[strategy.fit];
  const sorted = [...items].sort(ORDERS[strategy.order]);

  for (const item of sorted) {
    let best = null;
    for (let i = 0; i < free.length; i++) {
      const f = free[i];
      const orientations = item.rotate && Math.abs(item.w - item.h) > EPS
        ? [[item.w, item.h, false], [item.h, item.w, true]]
        : [[item.w, item.h, false]];
      for (const [w, h, rotated] of orientations) {
        const ew = footprint(w, f.w, kerf);
        const eh = footprint(h, f.h, kerf);
        if (ew === null || eh === null) continue;
        const score = fit(f, ew, eh);
        if (!best || score < best.score - EPS) best = { i, w, h, ew, eh, rotated, score };
      }
    }
    if (!best) {
      unplaced.push(item);
      continue;
    }
    const f = free[best.i];
    placements.push({
      pieceId: item.pieceId,
      label: item.label,
      x: f.x,
      y: f.y,
      w: best.w,
      h: best.h,
      rotated: best.rotated,
    });
    free.splice(best.i, 1, ...splitFree(f, best.ew, best.eh, strategy.split));
  }
  return { placements, free, unplaced };
}

function splitFree(f, ew, eh, rule) {
  const rw = f.w - ew;
  const bh = f.h - eh;
  // Corte horizontal primero: derecha baja, abajo ocupa todo el ancho.
  const horizontal = [
    { x: f.x + ew, y: f.y, w: rw, h: eh },
    { x: f.x, y: f.y + eh, w: f.w, h: bh },
  ];
  // Corte vertical primero: derecha ocupa todo el alto, abajo sólo el ancho de la pieza.
  const vertical = [
    { x: f.x + ew, y: f.y, w: rw, h: f.h },
    { x: f.x, y: f.y + eh, w: ew, h: bh },
  ];
  const maxArea = (rects) => Math.max(...rects.map((r) => r.w * r.h));
  const hMax = maxArea(horizontal);
  const vMax = maxArea(vertical);
  const useHorizontal = rule === 'maxRect' ? hMax >= vMax : hMax < vMax;
  return (useHorizontal ? horizontal : vertical).filter((r) => r.w > EPS && r.h > EPS);
}

function evaluate(sheet, packed, settings) {
  const sheetArea = sheet.width * sheet.height;
  const placedArea = packed.placements.reduce((s, p) => s + p.w * p.h, 0);
  const remnants = packed.free.filter((r) => isUsefulRemnant(r.w, r.h, settings));
  const remnantArea = remnants.reduce((s, r) => s + r.w * r.h, 0);
  const wasteArea = Math.max(0, sheetArea - placedArea - remnantArea);
  return { sheetArea, placedArea, remnants, remnantArea, wasteArea };
}

// Menor es mejor. Proporción de desperdicio real respecto de lo colocado.
function wasteRatio(m) {
  return m.placedArea > EPS ? m.wasteArea / m.placedArea : Infinity;
}

function compareCandidates(a, b) {
  const ra = wasteRatio(a.metrics);
  const rb = wasteRatio(b.metrics);
  if (Math.abs(ra - rb) > 0.01) return ra - rb;
  // Empate: preferir consumir retazos antes que planchas enteras.
  if (a.stock.isRemnant !== b.stock.isRemnant) return a.stock.isRemnant ? -1 : 1;
  // Luego colocar más área y, por último, usar la plancha más chica.
  if (Math.abs(a.metrics.placedArea - b.metrics.placedArea) > EPS) {
    return b.metrics.placedArea - a.metrics.placedArea;
  }
  return a.metrics.sheetArea - b.metrics.sheetArea;
}

function bestPack(stock, items, settings) {
  let best = null;
  for (const order of Object.keys(ORDERS)) {
    for (const fit of Object.keys(FITS)) {
      for (const split of SPLITS) {
        const packed = packSheet(stock.width, stock.height, items, settings, { order, fit, split });
        if (!packed.placements.length) continue;
        const cand = { stock, packed, metrics: evaluate(stock, packed, settings) };
        if (!best || compareCandidates(cand, best) < 0) best = cand;
      }
    }
  }
  return best;
}

function expandPieces(pieces) {
  const items = [];
  for (const p of pieces) {
    const qty = Math.max(0, Math.floor(Number(p.quantity) || 0));
    for (let i = 0; i < qty; i++) {
      items.push({
        pieceId: p.id,
        label: p.label || `${p.width}×${p.height}`,
        w: Number(p.width),
        h: Number(p.height),
        rotate: p.rotate !== false,
      });
    }
  }
  return items;
}

/**
 * stock:  [{ id, type, thickness, width, height, quantity (null = ilimitado), isRemnant }]
 * pieces: [{ id, label, type, thickness, width, height, quantity, rotate }]
 * settings: { kerf, trim, minRemnantWidth, minRemnantHeight, reuseRemnants }
 */
export function optimize({ stock, pieces, settings }) {
  const s = {
    kerf: 0,
    trim: 0,
    minRemnantWidth: 300,
    minRemnantHeight: 300,
    reuseRemnants: true,
    ...settings,
  };

  const groups = new Map();
  for (const p of pieces) {
    const key = groupKey(p.type, p.thickness);
    if (!groups.has(key)) groups.set(key, { type: p.type, thickness: Number(p.thickness), pieces: [] });
    groups.get(key).pieces.push(p);
  }

  const result = { groups: [], sheets: [], unplaced: [], totals: null };
  let remnantSeq = 0;

  for (const [key, group] of groups) {
    const pool = stock
      .filter((st) => groupKey(st.type, st.thickness) === key)
      .map((st) => ({
        ...st,
        width: Number(st.width),
        height: Number(st.height),
        remaining: st.quantity === null || st.quantity === undefined || st.quantity === ''
          ? Infinity
          : Math.max(0, Math.floor(Number(st.quantity))),
      }));

    let items = expandPieces(group.pieces);
    const groupSheets = [];

    while (items.length) {
      let best = null;
      for (const st of pool) {
        if (st.remaining <= 0) continue;
        const cand = bestPack(st, items, s);
        if (cand && (!best || compareCandidates(cand, best) < 0)) best = cand;
      }
      if (!best) break;

      best.stock.remaining -= 1;
      items = best.packed.unplaced;

      const remnants = best.metrics.remnants.map((r) => ({ ...r }));
      if (s.reuseRemnants) {
        // Los retazos útiles que deja este corte quedan disponibles para lo que sigue.
        for (const r of remnants) {
          pool.push({
            id: `retazo-${++remnantSeq}`,
            type: group.type,
            thickness: group.thickness,
            width: r.w,
            height: r.h,
            remaining: 1,
            isRemnant: true,
            fromJob: true,
          });
          r.reusedAs = `retazo-${remnantSeq}`;
        }
      }

      const sheet = {
        index: result.sheets.length + 1,
        groupKey: key,
        type: group.type,
        thickness: group.thickness,
        stockId: best.stock.id,
        isRemnant: !!best.stock.isRemnant,
        fromJob: !!best.stock.fromJob,
        width: best.stock.width,
        height: best.stock.height,
        placements: best.packed.placements,
        remnants,
        scraps: best.packed.free.filter((r) => !isUsefulRemnant(r.w, r.h, s)),
        ...pick(best.metrics, ['sheetArea', 'placedArea', 'remnantArea', 'wasteArea']),
      };
      result.sheets.push(sheet);
      groupSheets.push(sheet);
    }

    // Retazos generados que fueron consumidos por cortes posteriores ya no son sobrante final.
    const consumed = new Set(result.sheets.filter((sh) => sh.fromJob).map((sh) => sh.stockId));
    for (const sh of groupSheets) {
      for (const r of sh.remnants) r.consumed = !!(r.reusedAs && consumed.has(r.reusedAs));
    }

    const reason = pool.length ? 'No entra en ninguna plancha disponible' : 'No hay planchas de este tipo y espesor';
    for (const it of items) result.unplaced.push({ ...it, type: group.type, thickness: group.thickness, reason });

    result.groups.push({ key, type: group.type, thickness: group.thickness, sheets: groupSheets.map((x) => x.index) });
  }

  // Totales sobre material realmente sacado del stock (no se cuentan dos veces los retazos reutilizados).
  const fromStock = result.sheets.filter((sh) => !sh.fromJob);
  const usedArea = fromStock.reduce((a, sh) => a + sh.sheetArea, 0);
  const placedArea = result.sheets.reduce((a, sh) => a + sh.placedArea, 0);
  const finalRemnants = result.sheets.flatMap((sh) => sh.remnants.filter((r) => !r.consumed));
  const remnantArea = finalRemnants.reduce((a, r) => a + r.w * r.h, 0);
  result.totals = {
    sheetsUsed: fromStock.length,
    usedArea,
    placedArea,
    remnantArea,
    wasteArea: Math.max(0, usedArea - placedArea - remnantArea),
    remnantCount: finalRemnants.length,
  };
  return result;
}

function pick(obj, keys) {
  return Object.fromEntries(keys.map((k) => [k, obj[k]]));
}
