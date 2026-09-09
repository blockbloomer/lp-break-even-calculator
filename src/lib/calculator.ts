export const MAX_APR_PERCENT = 100_000;

export type RangeInput =
  | { mode: 'bounds'; lowerPrice: number; upperPrice: number }
  | { mode: 'ratio'; lowerPrice: number; tokenPercent: number };

export interface CalculatorInput {
  capital: number;
  /** User-observed fee APR for this exact position/range; never scaled by range width. */
  aprPercent: number;
  /** Net value to buy this time, as a percentage of capital; independent of LP inventory. */
  entryBuyPercent: number;
  currentPrice: number;
  range: RangeInput;
  gasIn: number;
  gasOut: number;
  feeInPercent: number;
  wearInPercent: number;
  feeOutPercent: number;
  wearOutPercent: number;
  /** Null links this estimate to the combined outgoing conversion loss. */
  feeHaircutPercent: number | null;
}

export interface Position {
  capital: number;
  currentPrice: number;
  lowerPrice: number;
  upperPrice: number;
  normalizedLiquidity: number;
  tokenWeight: number;
}

export interface PositionAmounts {
  tokenAmount: number;
  stableAmount: number;
  grossValue: number;
}

export interface ExitScenario extends PositionAmounts {
  price: number;
  capitalLoss: number;
  holdingValue: number;
  marketLoss: number;
  impermanentLoss: number;
  exitSwapFee: number;
  exitExecutionWear: number;
  exitSwapLoss: number;
  exitNetValue: number;
  totalGap: number;
  requiredFees: number;
  breakEvenHours: number | null;
}

export interface CalculationSuccess {
  ok: true;
  position: Position;
  lowerPrice: number;
  upperPrice: number;
  tokenWeight: number;
  initialTokenAmount: number;
  initialStableAmount: number;
  entrySwapFee: number;
  entryExecutionWear: number;
  entrySwapLoss: number;
  entryBuyValue: number;
  entrySpend: number;
  totalGas: number;
  totalFundsRequired: number;
  grossHourlyFee: number;
  netHourlyFee: number;
  feeHaircutPercent: number;
  requiredFees: number;
  breakEvenHours: number | null;
  scenarios: Record<'lower' | 'current' | 'upper', ExitScenario>;
}

export interface CalculationError {
  ok: false;
  errors: Record<string, string>;
}

/** Prices are stablecoin units per token; tokenWeight is a value fraction. */
export function solveUpperPrice(currentPrice: number, lowerPrice: number, tokenWeight: number): number {
  if (!(Number.isFinite(currentPrice) && Number.isFinite(lowerPrice) && lowerPrice > 0 && lowerPrice < currentPrice)) {
    throw new Error('下限须大于 0，且低于当前价格。');
  }
  if (!(Number.isFinite(tokenWeight) && tokenWeight > 0 && tokenWeight < 1)) {
    throw new Error('波动币占比须大于 0%，且小于 100%。');
  }
  const lowerRatio = lowerPrice / currentPrice;
  const lowerDistance = (1 - lowerRatio) / (1 + Math.sqrt(lowerRatio));
  const denominator = 1 - (tokenWeight / (1 - tokenWeight)) * lowerDistance;
  const upperPrice = currentPrice / denominator ** 2;
  if (!(denominator > 0 && Number.isFinite(upperPrice) && upperPrice > currentPrice)) {
    const maximumPercent = 100 / (2 - Math.sqrt(lowerRatio));
    throw new Error(`这个下限无法配出该比例。波动币占比须低于 ${maximumPercent.toFixed(4)}%，请减小占比或提高下限。`);
  }
  return upperPrice;
}

/** Stable difference identities avoid subtracting nearly equal square roots. */
function createPosition(capital: number, currentPrice: number, lowerPrice: number, upperPrice: number): Position {
  const upperRatio = upperPrice / currentPrice;
  const lowerRatio = lowerPrice / currentPrice;
  const upperRoot = Math.sqrt(upperRatio);
  const tokenUnits = (upperRatio - 1) / (upperRoot * (upperRoot + 1));
  const stableUnits = (1 - lowerRatio) / (1 + Math.sqrt(lowerRatio));
  const denominator = tokenUnits + stableUnits;
  return { capital, currentPrice, lowerPrice, upperPrice, normalizedLiquidity: capital / denominator, tokenWeight: tokenUnits / denominator };
}

/** Inventory clamps at the bounds; valuation always uses the actual price. */
export function positionAtPrice(position: Position, price: number): PositionAmounts {
  if (!Number.isFinite(price) || price <= 0) throw new Error('估值价格须为大于 0 的有限数值。');
  const { capital, currentPrice, lowerPrice, upperPrice, normalizedLiquidity, tokenWeight } = position;
  if (price === currentPrice) {
    const tokenValue = capital * tokenWeight;
    return { tokenAmount: tokenValue / currentPrice, stableAmount: capital - tokenValue, grossValue: capital };
  }
  const lower = lowerPrice / currentPrice;
  const upper = upperPrice / currentPrice;
  const clamped = Math.max(lower, Math.min(upper, price / currentPrice));
  const root = Math.sqrt(clamped);
  const upperRoot = Math.sqrt(upper);
  const lowerRoot = Math.sqrt(lower);
  const tokenAmount = normalizedLiquidity * (upper - clamped) / (root * upperRoot * (upperRoot + root)) / currentPrice;
  const stableAmount = normalizedLiquidity * (clamped - lower) / (root + lowerRoot);
  return { tokenAmount, stableAmount, grossValue: price * tokenAmount + stableAmount };
}

function hoursToCover(gap: number, hourlyFee: number): number | null {
  if (gap <= 0) return 0;
  if (hourlyFee <= 0) return null;
  return gap / hourlyFee;
}

export function calculateLPBreakEven(input: CalculatorInput): CalculationSuccess | CalculationError {
  const errors: Record<string, string> = {};
  const positive = (key: string, value: number, label: string) => {
    if (!Number.isFinite(value) || value <= 0) errors[key] = `请填写大于 0 的${label}。`;
  };
  const nonnegative = (key: string, value: number, label: string) => {
    if (!Number.isFinite(value) || value < 0) errors[key] = `请填写不小于 0 的${label}。`;
  };
  const percent = (key: string, value: number, label: string, allowHundred = true) => {
    if (!Number.isFinite(value) || value < 0 || (allowHundred ? value > 100 : value >= 100)) {
      errors[key] = `${label}须为 0% 至 ${allowHundred ? '100%' : '小于 100%'}。`;
    }
  };
  positive('capital', input.capital, '净入池本金');
  positive('currentPrice', input.currentPrice, '当前币价');
  positive('lowerPrice', input.range.lowerPrice, '价格下限');
  nonnegative('aprPercent', input.aprPercent, '手续费 APR');
  if (input.aprPercent > MAX_APR_PERCENT) errors.aprPercent = '手续费 APR 最高为 100,000%。';
  percent('entryBuyPercent', input.entryBuyPercent, '开仓买币比例');
  nonnegative('gasIn', input.gasIn, '进场 gas');
  nonnegative('gasOut', input.gasOut, '退出 gas');
  percent('feeInPercent', input.feeInPercent, '进场兑换费', false);
  percent('wearInPercent', input.wearInPercent, '进场成交磨损', false);
  percent('feeOutPercent', input.feeOutPercent, '退出兑换费');
  percent('wearOutPercent', input.wearOutPercent, '退出成交磨损');
  if (input.feeHaircutPercent !== null) percent('feeHaircutPercent', input.feeHaircutPercent, '手续费兑现损耗');
  if (input.range.lowerPrice >= input.currentPrice) errors.lowerPrice = '价格下限须低于当前币价。';

  let upperPrice: number;
  if (input.range.mode === 'bounds') {
    upperPrice = input.range.upperPrice;
    positive('upperPrice', upperPrice, '价格上限');
    if (upperPrice <= input.currentPrice) errors.upperPrice = '价格上限须高于当前币价。';
  } else {
    upperPrice = NaN;
    try {
      upperPrice = solveUpperPrice(input.currentPrice, input.range.lowerPrice, input.range.tokenPercent / 100);
    } catch (error) {
      if (!errors.lowerPrice && !errors.currentPrice) errors.tokenPercent = error instanceof Error ? error.message : '该配比无法计算。';
    }
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  const position = createPosition(input.capital, input.currentPrice, input.range.lowerPrice, upperPrice);
  const initial = positionAtPrice(position, input.currentPrice);
  const entryTokenValue = input.capital * input.entryBuyPercent / 100;
  const inputKeep = (1 - input.feeInPercent / 100) * (1 - input.wearInPercent / 100);
  const outputKeep = (1 - input.feeOutPercent / 100) * (1 - input.wearOutPercent / 100);
  const entrySpend = entryTokenValue / inputKeep;
  const entrySwapFee = entrySpend * input.feeInPercent / 100;
  const entryExecutionWear = (entrySpend - entrySwapFee) * input.wearInPercent / 100;
  const entrySwapLoss = entrySwapFee + entryExecutionWear;
  const totalGas = input.gasIn + input.gasOut;
  const feeHaircutPercent = input.feeHaircutPercent ?? (1 - outputKeep) * 100;
  const grossHourlyFee = (input.capital / 8760) * (input.aprPercent / 100);
  const netHourlyFee = grossHourlyFee * (1 - feeHaircutPercent / 100);

  const scenario = (price: number): ExitScenario => {
    const amounts = positionAtPrice(position, price);
    const tokenValue = amounts.tokenAmount * price;
    const exitSwapFee = tokenValue * input.feeOutPercent / 100;
    const exitExecutionWear = (tokenValue - exitSwapFee) * input.wearOutPercent / 100;
    const exitSwapLoss = exitSwapFee + exitExecutionWear;
    const capitalLoss = input.capital - amounts.grossValue;
    const holdingValue = price === input.currentPrice ? input.capital : initial.tokenAmount * price + initial.stableAmount;
    const marketLoss = input.capital - holdingValue;
    const impermanentLoss = holdingValue - amounts.grossValue;
    const totalGap = capitalLoss + entrySwapLoss + totalGas + exitSwapLoss;
    return {
      ...amounts, price, capitalLoss, holdingValue, marketLoss, impermanentLoss, exitSwapFee, exitExecutionWear, exitSwapLoss,
      exitNetValue: tokenValue * outputKeep + amounts.stableAmount,
      totalGap, requiredFees: Math.max(0, totalGap), breakEvenHours: hoursToCover(totalGap, netHourlyFee),
    };
  };
  const scenarios = { lower: scenario(input.range.lowerPrice), current: scenario(input.currentPrice), upper: scenario(upperPrice) };
  const result: CalculationSuccess = {
    ok: true, position, lowerPrice: input.range.lowerPrice, upperPrice,
    tokenWeight: position.tokenWeight, initialTokenAmount: initial.tokenAmount, initialStableAmount: initial.stableAmount,
    entrySwapFee, entryExecutionWear, entrySwapLoss, entryBuyValue: entryTokenValue, entrySpend, totalGas,
    totalFundsRequired: input.capital + entrySwapLoss + totalGas,
    grossHourlyFee, netHourlyFee, feeHaircutPercent, requiredFees: scenarios.lower.requiredFees,
    breakEvenHours: scenarios.lower.breakEvenHours, scenarios,
  };
  const numericValues = [
    position.normalizedLiquidity, position.tokenWeight, result.initialTokenAmount, result.initialStableAmount,
    entrySwapFee, entryExecutionWear, result.totalFundsRequired, grossHourlyFee, netHourlyFee,
    ...Object.values(scenarios).flatMap(s => Object.values(s).filter((v): v is number => typeof v === 'number')),
  ];
  if (!numericValues.every(Number.isFinite)) {
    return { ok: false, errors: { calculation: '参数组合超出可计算精度，请扩大价格区间，或检查金额、币价及 APR 的数量级。' } };
  }
  return result;
}
