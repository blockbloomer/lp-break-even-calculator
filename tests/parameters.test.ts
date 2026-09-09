import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLE, toCalculatorInput } from '../src/lib/parameters.ts';
import { calculateLPBreakEven } from '../src/lib/calculator.ts';

test('relative bounds preserve the actual position APR and dollar break-even result', () => {
  const input = toCalculatorInput(EXAMPLE, true);
  assert.equal(input.currentPrice, 1);
  assert.deepEqual(input.range, { mode: 'bounds', lowerPrice: 0.98, upperPrice: 1.02 });
  assert.equal(input.aprPercent, 5000);
  const r = calculateLPBreakEven(input);
  assert.ok(r.ok);
  assert.ok(Math.abs(r.breakEvenHours! - 3.8205116932) < 1e-8);
});

test('buy percentage changes costs without changing bounds or APR', () => {
  const input = toCalculatorInput({ ...EXAMPLE, entryBuyPercent: '10' }, true);
  assert.equal(input.entryBuyPercent, 10);
  assert.equal(input.aprPercent, 5000);
  assert.deepEqual(input.range, { mode: 'bounds', lowerPrice: 0.98, upperPrice: 1.02 });
  const r = calculateLPBreakEven(input);
  assert.ok(r.ok);
  assert.equal(r.entryBuyValue, 500);
});

test('empty or physically invalid relative bounds do not produce a result', () => {
  for (const patch of [{ downsidePercent: '' }, { downsidePercent: '0' }, { downsidePercent: '100' }, { upsidePercent: '-2' }, { upsidePercent: '' }, { entryBuyPercent: '' }]) {
    assert.equal(calculateLPBreakEven(toCalculatorInput({ ...EXAMPLE, ...patch }, true)).ok, false);
  }
});
