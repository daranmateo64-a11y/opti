import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimize, packSheet, isUsefulRemnant } from '../src/optimizer.js';

const settings = { kerf: 0, trim: 0, minRemnantWidth: 300, minRemnantHeight: 300 };

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

test('las piezas no se superponen y quedan dentro de la plancha', () => {
  const items = [];
  for (let i = 0; i < 12; i++) items.push({ pieceId: 'p', label: 'p', w: 400 + i * 10, h: 300, rotate: true });
  const r = packSheet(2000, 1500, items, { ...settings, kerf: 3 }, { order: 'area', fit: 'bestArea', split: 'maxRect' });
  for (const p of r.placements) {
    assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= 2000 && p.y + p.h <= 1500);
  }
  for (let i = 0; i < r.placements.length; i++) {
    for (let j = i + 1; j < r.placements.length; j++) {
      assert.ok(!overlaps(r.placements[i], r.placements[j]));
    }
  }
});

test('separa por tipo y espesor', () => {
  const res = optimize({
    stock: [
      { id: 'f4', type: 'Float', thickness: 4, width: 2000, height: 1000, quantity: null },
      { id: 'f6', type: 'Float', thickness: 6, width: 2000, height: 1000, quantity: null },
    ],
    pieces: [
      { id: 'a', type: 'Float', thickness: 4, width: 500, height: 500, quantity: 2 },
      { id: 'b', type: 'float ', thickness: 6, width: 500, height: 500, quantity: 1 },
      { id: 'c', type: 'Laminado', thickness: 6, width: 500, height: 500, quantity: 1 },
    ],
    settings,
  });
  assert.equal(res.sheets.length, 2);
  assert.deepEqual(res.sheets.map((s) => s.stockId).sort(), ['f4', 'f6']);
  assert.equal(res.unplaced.length, 1);
  assert.equal(res.unplaced[0].pieceId, 'c');
});

test('prefiere la plancha que deja un retazo útil antes que la que deja menos sobrante inútil', () => {
  // Pieza 1000x1000.
  // Retazo A 1100x1100: sobrante 210.000 mm² pero en tiras de 100 mm → todo desperdicio.
  // Plancha B 1000x1500: sobrante 500.000 mm² pero es un retazo útil de 1000x500.
  const res = optimize({
    stock: [
      { id: 'A', type: 'Float', thickness: 4, width: 1100, height: 1100, quantity: 1, isRemnant: true },
      { id: 'B', type: 'Float', thickness: 4, width: 1000, height: 1500, quantity: 1 },
    ],
    pieces: [{ id: 'p', type: 'Float', thickness: 4, width: 1000, height: 1000, quantity: 1 }],
    settings,
  });
  assert.equal(res.sheets.length, 1);
  assert.equal(res.sheets[0].stockId, 'B');
  assert.equal(res.sheets[0].wasteArea, 0);
  assert.equal(res.sheets[0].remnants.length, 1);
});

test('a igual desperdicio usa primero los retazos', () => {
  const res = optimize({
    stock: [
      { id: 'entera', type: 'Float', thickness: 4, width: 3000, height: 2000, quantity: null },
      { id: 'ret', type: 'Float', thickness: 4, width: 600, height: 600, quantity: 1, isRemnant: true },
    ],
    pieces: [{ id: 'p', type: 'Float', thickness: 4, width: 600, height: 600, quantity: 1 }],
    settings,
  });
  assert.equal(res.sheets[0].stockId, 'ret');
});

test('reutiliza retazos generados en el mismo trabajo y no los cuenta como sobrante final', () => {
  const res = optimize({
    stock: [{ id: 'S', type: 'Float', thickness: 4, width: 1000, height: 1000, quantity: 1 }],
    pieces: [
      { id: 'a', type: 'Float', thickness: 4, width: 1000, height: 500, quantity: 1 },
      { id: 'b', type: 'Float', thickness: 4, width: 500, height: 500, quantity: 2 },
    ],
    settings,
  });
  assert.equal(res.unplaced.length, 0);
  assert.equal(res.totals.sheetsUsed, 1);
  assert.equal(res.totals.placedArea, 1000 * 1000);
  assert.equal(res.totals.wasteArea, 0);
  assert.equal(res.totals.remnantArea, 0);
});

test('respeta la cantidad de planchas en stock', () => {
  const res = optimize({
    stock: [{ id: 'S', type: 'Float', thickness: 4, width: 1000, height: 1000, quantity: 1 }],
    pieces: [{ id: 'a', type: 'Float', thickness: 4, width: 900, height: 900, quantity: 2 }],
    settings,
  });
  assert.equal(res.sheets.length, 1);
  assert.equal(res.unplaced.length, 1);
});

test('no rota piezas marcadas sin rotación', () => {
  const res = optimize({
    stock: [{ id: 'S', type: 'Float', thickness: 4, width: 1000, height: 500, quantity: null }],
    pieces: [{ id: 'a', type: 'Float', thickness: 4, width: 400, height: 800, quantity: 1, rotate: false }],
    settings,
  });
  assert.equal(res.sheets.length, 0);
  assert.equal(res.unplaced.length, 1);
});

test('el retazo útil se mide en cualquier orientación', () => {
  assert.ok(isUsefulRemnant(1000, 300, { minRemnantWidth: 300, minRemnantHeight: 500 }));
  assert.ok(!isUsefulRemnant(1000, 299, { minRemnantWidth: 300, minRemnantHeight: 500 }));
});
