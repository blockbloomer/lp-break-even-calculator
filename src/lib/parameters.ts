import type { CalculatorInput } from './calculator.ts';

export const EXAMPLE = {
  capital: '5000', aprPercent: '5000', downsidePercent: '2', upsidePercent: '2', entryBuyPercent: '50',
  gasIn: '2', gasOut: '2', tradeWearInPercent: '0.4', tradeWearOutPercent: '0.4', feeHaircutPercent: '0.4',
};
export type ParameterKey = keyof typeof EXAMPLE;
export type Parameters = Record<ParameterKey, string>;

export const parseParameter = (raw: string): number => raw.trim() === '' ? NaN : Number(raw);

/** Absolute prices cancel in the USD loss model, so normalize entry price to 1. */
export function toCalculatorInput(parameters: Parameters, automaticHaircut: boolean): CalculatorInput {
  return {
    capital: parseParameter(parameters.capital), aprPercent: parseParameter(parameters.aprPercent),
    entryBuyPercent: parseParameter(parameters.entryBuyPercent), currentPrice: 1,
    range: { mode: 'bounds', lowerPrice: 1 - parseParameter(parameters.downsidePercent) / 100, upperPrice: 1 + parseParameter(parameters.upsidePercent) / 100 },
    gasIn: parseParameter(parameters.gasIn), gasOut: parseParameter(parameters.gasOut),
    tradeWearInPercent: parseParameter(parameters.tradeWearInPercent), tradeWearOutPercent: parseParameter(parameters.tradeWearOutPercent),
    feeHaircutPercent: automaticHaircut ? null : parseParameter(parameters.feeHaircutPercent),
  };
}
