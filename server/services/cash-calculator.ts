import {
  currencyDenominations,
  applyRounding,
  denominationBreakdown,
  type DenominationConfig,
  type DenominationBreakdown,
} from "@shared/currency";

export { applyRounding };

export function calculateChange(
  amountDue: number,
  tendered: number,
  rule: string
): { valid: boolean; rounded: number; change: number; error?: string } {
  const rounded = applyRounding(amountDue, rule as DenominationConfig['rounding']);
  if (tendered < rounded - 0.001) {
    return { valid: false, rounded, change: 0, error: `Tendered amount ${tendered} is less than rounded due ${rounded}` };
  }
  const change = Math.round((tendered - rounded) * 100) / 100;
  return { valid: true, rounded, change };
}

export function generateQuickTender(amountDue: number, config: DenominationConfig): number[] {
  const rounded = applyRounding(amountDue, config.rounding);
  const all = [...config.notes, ...config.coins].sort((a, b) => b - a);

  let exact = rounded;
  const result: number[] = [exact];

  const nextDenom = all.find(d => d > 0 && (rounded % d !== 0 || d >= rounded));
  if (nextDenom) {
    const nextUp = Math.ceil(rounded / nextDenom) * nextDenom;
    if (nextUp > exact) {
      exact = nextUp;
      result.push(exact);
    }
  }

  const bigDenoms = config.notes.sort((a, b) => b - a);
  for (const d of bigDenoms) {
    if (d > rounded) {
      if (!result.includes(d)) result.push(d);
      if (result.length >= 4) break;
    }
  }

  for (const d of bigDenoms) {
    if (d * 2 > rounded) {
      const v = d * 2;
      if (!result.includes(v)) result.push(v);
      if (result.length >= 4) break;
    }
  }

  return result.sort((a, b) => a - b).slice(0, 4);
}

export function buildChangeBreakdown(
  change: number,
  config: DenominationConfig,
  symbol: string
): DenominationBreakdown[] {
  return denominationBreakdown(change, config, symbol);
}

export { currencyDenominations, denominationBreakdown };
export type { DenominationConfig, DenominationBreakdown };
