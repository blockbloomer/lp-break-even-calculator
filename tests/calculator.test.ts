import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateLPBreakEven, positionAtPrice, solveUpperPrice } from '../src/lib/calculator.ts';
import type { CalculatorInput, CalculationSuccess } from '../src/lib/calculator.ts';

const base: CalculatorInput = {
  capital: 5000, aprPercent: 5000, currentPrice: 100,
  range: { mode: 'bounds', lowerPrice: 98, upperPrice: 102 },
  gasIn: 0, gasOut: 0, feeInPercent: 0, wearInPercent: 0,
  feeOutPercent: 0, wearOutPercent: 0, feeHaircutPercent: null,
};
const near = (actual: number, expected: number, tolerance = 1e-8) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≉ ${expected}`);
};
function calculate(patch: Partial<CalculatorInput> = {}): CalculationSuccess {
  const result = calculateLPBreakEven({ ...base, ...patch });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result as CalculationSuccess;
}

test('reproduces the screenshot using actual concentrated liquidity inventory', () => {
  const r = calculate();
  near(r.tokenWeight, 0.4950246274410478);
  near(r.netHourlyFee, 28.538812785388128);
  near(r.scenarios.lower.grossValue, 4925.121246341572);
  near(r.scenarios.lower.capitalLoss, 74.878753658428);
  near(r.breakEvenHours!, 2.623751528191308);
});

test('reproduces the one percent range example without changing APR implicitly', () => {
  const r = calculate({ aprPercent: 10000, range: { mode: 'bounds', lowerPrice: 99, upperPrice: 101 } });
  near(r.scenarios.lower.capitalLoss, 37.4692189619467);
  near(r.netHourlyFee, 57.07762557077626);
  near(r.breakEvenHours!, 0.6564607162133063);
});

test('grosses up entry conversion and charges outgoing conversion only once', () => {
  const r = calculate({ gasIn: 2, gasOut: 2, feeInPercent: 0.3, feeOutPercent: 0.3, wearInPercent: 0.1, wearOutPercent: 0.1 });
  near(r.entrySwapLoss, 9.932768454923917);
  near(r.scenarios.lower.exitSwapLoss, 19.685709621627403);
  near(r.requiredFees, 108.49723173497932);
  near(r.netHourlyFee, 28.424743150684932);
  near(r.breakEvenHours!, 3.816999547183769);
  near(r.entrySwapFee + r.entryExecutionWear, r.entrySwapLoss);
  near(r.scenarios.lower.exitSwapFee + r.scenarios.lower.exitExecutionWear, r.scenarios.lower.exitSwapLoss);
  near(r.totalFundsRequired, 5013.932768454924);
});

test('conserves capital at the initial price', () => {
  const r = calculate();
  near(r.initialTokenAmount * 100 + r.initialStableAmount, 5000);
  assert.equal(r.scenarios.current.capitalLoss, 0);
  assert.equal(r.scenarios.current.breakEvenHours, 0);
});

test('solves a true 50:50 allocation rather than an arithmetic symmetric range', () => {
  near(solveUpperPrice(100, 98, 0.5), 102.0408163265306);
  const r = calculate({ range: { mode: 'ratio', lowerPrice: 98, tokenPercent: 50 } });
  near(r.tokenWeight, 0.5);
  near(r.upperPrice, 102.0408163265306);
});

test('ratio solver round trips multiple allocations and rejects an impossible upper bound', () => {
  for (const tokenPercent of [1, 30, 50, 70, 95]) {
    const r = calculate({ range: { mode: 'ratio', lowerPrice: 90, tokenPercent } });
    near(r.tokenWeight * 100, tokenPercent, 1e-9);
  }
  const bad = calculateLPBreakEven({ ...base, range: { mode: 'ratio', lowerPrice: 25, tokenPercent: 80 } });
  assert.equal(bad.ok, false);
  assert.throws(() => solveUpperPrice(100, 25, 0.8));
});

test('lower bound is the worst stablecoin exit value, with or without fees', () => {
  for (const feeOutPercent of [0, 0.3, 90, 100]) {
    const r = calculate({ feeOutPercent });
    let previous = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const p = 98 + i / 5;
      const amount = positionAtPrice(r.position, p);
      const value = amount.tokenAmount * p * (1 - feeOutPercent / 100) + amount.stableAmount;
      assert.ok(value >= previous - 1e-8);
      previous = value;
    }
  }
});

test('inventory is continuous at boundaries and becomes a single token outside', () => {
  const r = calculate();
  const lower = positionAtPrice(r.position, 98);
  const upper = positionAtPrice(r.position, 102);
  assert.equal(lower.stableAmount, 0);
  assert.equal(upper.tokenAmount, 0);
  near(positionAtPrice(r.position, 98 + 1e-8).tokenAmount, lower.tokenAmount, 1e-5);
  near(positionAtPrice(r.position, 102 - 1e-8).stableAmount, upper.stableAmount, 2e-5);
  const below = positionAtPrice(r.position, 90);
  near(below.tokenAmount, lower.tokenAmount);
  near(below.grossValue, lower.tokenAmount * 90);
  assert.ok(below.grossValue < lower.grossValue);
});

test('zero fee revenue cannot cover a positive gap', () => {
  const r = calculate({ aprPercent: 0 });
  assert.equal(r.breakEvenHours, null);
  assert.equal(r.scenarios.current.breakEvenHours, 0);
});

test('100 percent fee cashout loss is a valid zero revenue scenario', () => {
  assert.equal(calculate({ feeHaircutPercent: 100 }).breakEvenHours, null);
});

test('automatic cashout loss tracks outgoing settings and custom loss overrides it', () => {
  const patch = { feeOutPercent: 1, wearOutPercent: 2 };
  near(calculate(patch).feeHaircutPercent, 2.98);
  near(calculate({ ...patch, feeHaircutPercent: 0 }).netHourlyFee, calculate().netHourlyFee);
});

test('capital scaling cancels without gas; fixed gas penalizes smaller positions', () => {
  near(calculate({ capital: 10000 }).breakEvenHours!, calculate().breakEvenHours!);
  assert.ok(calculate({ capital: 1000, gasIn: 10 }).breakEvenHours! > calculate({ capital: 10000, gasIn: 10 }).breakEvenHours!);
});

test('APR stays constant when the range changes', () => {
  near(calculate({ range: { mode: 'bounds', lowerPrice: 99, upperPrice: 101 } }).netHourlyFee, calculate().netHourlyFee);
});

test('handles narrow ranges and different token price scales', () => {
  for (const p of [1e-10, 1, 1e10]) {
    const r = calculate({ currentPrice: p, range: { mode: 'bounds', lowerPrice: p * 0.99999999, upperPrice: p * 1.00000001 } });
    near(r.initialTokenAmount * p + r.initialStableAmount, 5000, 1e-8);
    assert.ok(Number.isFinite(r.breakEvenHours));
    assert.ok(r.breakEvenHours! > 0);
    near(r.scenarios.lower.capitalLoss, 0.0000375, 1e-8);
    near(r.tokenWeight, 0.5, 1e-7);
  }
});

test('rejects missing, negative, nonfinite and invalid rate inputs', () => {
  for (const patch of [
    { capital: NaN }, { capital: 0 }, { currentPrice: Infinity }, { gasIn: -1 },
    { aprPercent: -1 }, { feeInPercent: 100 }, { wearInPercent: 100 },
    { feeOutPercent: 101 }, { feeHaircutPercent: -1 },
    { range: { mode: 'bounds' as const, lowerPrice: 100, upperPrice: 102 } },
    { range: { mode: 'bounds' as const, lowerPrice: 98, upperPrice: 99 } },
    { range: { mode: 'ratio' as const, lowerPrice: 98, tokenPercent: 100 } },
  ]) assert.equal(calculateLPBreakEven({ ...base, ...patch }).ok, false, JSON.stringify(patch));
});
