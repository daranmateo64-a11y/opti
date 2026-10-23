import { groupKey } from './optimizer.js';

export function isUnlimited(quantity) {
  return quantity === null || quantity === undefined || quantity === '';
}

/**
 * Descuenta del stock lo usado en un resultado de optimize() y agrega los
 * retazos útiles que sobran. Devuelve un stock nuevo; no modifica el original.
 * Los retazos que se agotan se quitan; las planchas enteras quedan en 0.
 */
export function applyCut(stock, result, newId) {
  const used = new Map();
  for (const sh of result.sheets) {
    if (!sh.fromJob) used.set(sh.stockId, (used.get(sh.stockId) || 0) + 1);
  }

  const next = [];
  for (const row of stock) {
    const n = used.get(row.id) || 0;
    if (!n || isUnlimited(row.quantity)) {
      next.push({ ...row });
      continue;
    }
    const quantity = Math.max(0, Number(row.quantity) - n);
    if (quantity === 0 && row.isRemnant) continue;
    next.push({ ...row, quantity });
  }

  for (const sh of result.sheets) {
    for (const r of sh.remnants) {
      if (r.consumed) continue;
      next.push({
        id: newId(),
        type: sh.type,
        thickness: sh.thickness,
        // Redondeo hacia abajo: mejor anotar el retazo un poco más chico que más grande.
        width: Math.floor(r.w),
        height: Math.floor(r.h),
        quantity: 1,
        isRemnant: true,
      });
    }
  }
  return next;
}

/** Resumen del stock por tipo y espesor. */
export function summarize(stock) {
  const groups = new Map();
  for (const row of stock) {
    if (!String(row.type || '').trim()) continue;
    const key = groupKey(row.type, row.thickness);
    if (!groups.has(key)) {
      groups.set(key, { key, type: String(row.type).trim(), thickness: Number(row.thickness), sheets: 0, remnants: 0, area: 0, unlimited: false });
    }
    const g = groups.get(key);
    const unlimited = isUnlimited(row.quantity);
    const qty = unlimited ? 0 : Math.max(0, Number(row.quantity) || 0);
    if (unlimited) g.unlimited = true;
    if (row.isRemnant) g.remnants += qty;
    else g.sheets += qty;
    g.area += qty * Number(row.width || 0) * Number(row.height || 0);
  }
  return [...groups.values()].sort((a, b) => a.type.localeCompare(b.type) || a.thickness - b.thickness);
}
