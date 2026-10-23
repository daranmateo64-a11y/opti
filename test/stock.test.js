import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimize } from '../src/optimizer.js';
import { applyCut, summarize } from '../src/stock.js';

const settings = { kerf: 0, trim: 0, minRemnantWidth: 300, minRemnantHeight: 300 };
let seq = 0;
const newId = () => `n${++seq}`;

test('confirmar un corte descuenta la plancha y guarda el retazo útil', () => {
  const stock = [
    { id: 'P', type: 'Float', thickness: 4, width: 1000, height: 1500, quantity: 3, isRemnant: false },
    { id: 'L', type: 'Laminado', thickness: 6, width: 2000, height: 1000, quantity: 1, isRemnant: false },
  ];
  const res = optimize({ stock, pieces: [{ id: 'a', type: 'Float', thickness: 4, width: 1000, height: 1000, quantity: 1 }], settings });
  const next = applyCut(stock, res, newId);
  assert.equal(next.find((r) => r.id === 'P').quantity, 2);
  assert.equal(next.find((r) => r.id === 'L').quantity, 1);
  const added = next.filter((r) => r.isRemnant);
  assert.equal(added.length, 1);
  assert.deepEqual([added[0].width, added[0].height].sort((x, y) => x - y), [500, 1000]);
  assert.equal(added[0].type, 'Float');
  assert.equal(stock[0].quantity, 3, 'no modifica el stock original');
});

test('un retazo usado por completo desaparece del stock', () => {
  const stock = [{ id: 'R', type: 'Float', thickness: 4, width: 600, height: 600, quantity: 1, isRemnant: true }];
  const res = optimize({ stock, pieces: [{ id: 'a', type: 'Float', thickness: 4, width: 600, height: 600, quantity: 1 }], settings });
  assert.deepEqual(applyCut(stock, res, newId), []);
});

test('las planchas sin límite no se descuentan', () => {
  const stock = [{ id: 'P', type: 'Float', thickness: 4, width: 1000, height: 1000, quantity: null, isRemnant: false }];
  const res = optimize({ stock, pieces: [{ id: 'a', type: 'Float', thickness: 4, width: 1000, height: 1000, quantity: 2 }], settings });
  const next = applyCut(stock, res, newId);
  assert.equal(next.length, 1);
  assert.equal(next[0].quantity, null);
});

test('resumen por tipo y espesor', () => {
  const sum = summarize([
    { type: 'Float', thickness: 4, width: 1000, height: 1000, quantity: 2, isRemnant: false },
    { type: 'float ', thickness: 4, width: 500, height: 500, quantity: 1, isRemnant: true },
    { type: 'Float', thickness: 6, width: 1000, height: 1000, quantity: 1, isRemnant: false },
    { type: '', thickness: 4, width: 1, height: 1, quantity: 1 },
  ]);
  assert.equal(sum.length, 2);
  assert.equal(sum[0].sheets, 2);
  assert.equal(sum[0].remnants, 1);
  assert.equal(sum[0].area, 2e6 + 250000);
});
