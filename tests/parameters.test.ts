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
  assert.ok(Math.abs(r.breakEvenHours! - 3.82130898694) < 1e-8);
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
  for (const patch of [{ downsidePercent: '' }, { downsidePercent: '0' }, { downsidePercent: '100' }, { upsidePercent: '-2' }, { upsidePercent: '' }, { entryBuyPercent: '' }, { tradeWearInPercent: '' }, { tradeWearOutPercent: '' }]) {
    assert.equal(calculateLPBreakEven(toCalculatorInput({ ...EXAMPLE, ...patch }, true)).ok, false);
  }
});

test('single trade wear rates map directly and cashout can follow or override the exit rate', () => {
  const parameters = { ...EXAMPLE, tradeWearInPercent: '0.2', tradeWearOutPercent: '0.7', feeHaircutPercent: '0' };
  const input = toCalculatorInput(parameters, true);
  assert.equal(input.tradeWearInPercent, 0.2);
  assert.equal(input.tradeWearOutPercent, 0.7);
  const automatic = calculateLPBreakEven(input);
  const custom = calculateLPBreakEven(toCalculatorInput(parameters, false));
  assert.ok(automatic.ok && custom.ok);
  assert.equal(automatic.feeHaircutPercent, 0.7);
  assert.equal(custom.feeHaircutPercent, 0);
  assert.equal(automatic.requiredFees, custom.requiredFees);
  assert.equal(automatic.netHourlyFee, custom.netHourlyFee * 0.993);
});
