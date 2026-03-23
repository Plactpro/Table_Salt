export type CurrencyCode =
  | "USD" | "EUR" | "GBP" | "AED" | "SAR" | "INR" | "JPY" | "CNY"
  | "AUD" | "CAD" | "CHF" | "SGD" | "MYR" | "THB" | "PHP" | "IDR"
  | "KRW" | "BRL" | "MXN" | "ZAR" | "NGN" | "EGP" | "KES" | "TRY";

export interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  name: string;
  decimalPlaces: number;
  locale: string;
}

export const currencyMap: Record<CurrencyCode, CurrencyInfo> = {
  USD: { code: "USD", symbol: "$", name: "US Dollar", decimalPlaces: 2, locale: "en-US" },
  EUR: { code: "EUR", symbol: "\u20AC", name: "Euro", decimalPlaces: 2, locale: "de-DE" },
  GBP: { code: "GBP", symbol: "\u00A3", name: "British Pound", decimalPlaces: 2, locale: "en-GB" },
  AED: { code: "AED", symbol: "AED", name: "UAE Dirham", decimalPlaces: 2, locale: "en-AE" },
  SAR: { code: "SAR", symbol: "\uFDFC", name: "Saudi Riyal", decimalPlaces: 2, locale: "ar-SA" },
  INR: { code: "INR", symbol: "\u20B9", name: "Indian Rupee", decimalPlaces: 2, locale: "en-IN" },
  JPY: { code: "JPY", symbol: "\u00A5", name: "Japanese Yen", decimalPlaces: 0, locale: "ja-JP" },
  CNY: { code: "CNY", symbol: "\u00A5", name: "Chinese Yuan", decimalPlaces: 2, locale: "zh-CN" },
  AUD: { code: "AUD", symbol: "A$", name: "Australian Dollar", decimalPlaces: 2, locale: "en-AU" },
  CAD: { code: "CAD", symbol: "C$", name: "Canadian Dollar", decimalPlaces: 2, locale: "en-CA" },
  CHF: { code: "CHF", symbol: "CHF", name: "Swiss Franc", decimalPlaces: 2, locale: "de-CH" },
  SGD: { code: "SGD", symbol: "S$", name: "Singapore Dollar", decimalPlaces: 2, locale: "en-SG" },
  MYR: { code: "MYR", symbol: "RM", name: "Malaysian Ringgit", decimalPlaces: 2, locale: "ms-MY" },
  THB: { code: "THB", symbol: "\u0E3F", name: "Thai Baht", decimalPlaces: 2, locale: "th-TH" },
  PHP: { code: "PHP", symbol: "\u20B1", name: "Philippine Peso", decimalPlaces: 2, locale: "en-PH" },
  IDR: { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah", decimalPlaces: 0, locale: "id-ID" },
  KRW: { code: "KRW", symbol: "\u20A9", name: "South Korean Won", decimalPlaces: 0, locale: "ko-KR" },
  BRL: { code: "BRL", symbol: "R$", name: "Brazilian Real", decimalPlaces: 2, locale: "pt-BR" },
  MXN: { code: "MXN", symbol: "MX$", name: "Mexican Peso", decimalPlaces: 2, locale: "es-MX" },
  ZAR: { code: "ZAR", symbol: "R", name: "South African Rand", decimalPlaces: 2, locale: "en-ZA" },
  NGN: { code: "NGN", symbol: "\u20A6", name: "Nigerian Naira", decimalPlaces: 2, locale: "en-NG" },
  EGP: { code: "EGP", symbol: "E\u00A3", name: "Egyptian Pound", decimalPlaces: 2, locale: "ar-EG" },
  KES: { code: "KES", symbol: "KSh", name: "Kenyan Shilling", decimalPlaces: 2, locale: "en-KE" },
  TRY: { code: "TRY", symbol: "\u20BA", name: "Turkish Lira", decimalPlaces: 2, locale: "tr-TR" },
};

export const staticExchangeRates: Record<CurrencyCode, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  AED: 3.67,
  SAR: 3.75,
  INR: 83.12,
  JPY: 149.50,
  CNY: 7.24,
  AUD: 1.53,
  CAD: 1.36,
  CHF: 0.88,
  SGD: 1.34,
  MYR: 4.72,
  THB: 35.80,
  PHP: 56.20,
  IDR: 15650,
  KRW: 1330,
  BRL: 4.97,
  MXN: 17.15,
  ZAR: 18.90,
  NGN: 1550,
  EGP: 30.90,
  KES: 153.50,
  TRY: 30.25,
};

export interface FormatCurrencyOptions {
  position?: "before" | "after";
  decimals?: number;
}

export function formatCurrency(
  amount: number | string,
  currencyCode?: string,
  options?: FormatCurrencyOptions | string
): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "0.00";

  const code = (currencyCode?.toUpperCase() || "USD") as CurrencyCode;
  const info = currencyMap[code];

  const locale = typeof options === "string" ? options : undefined;
  const opts: FormatCurrencyOptions = typeof options === "object" ? options : {};

  if (!info) {
    const dec = opts.decimals ?? 2;
    const formatted = num.toFixed(dec);
    return opts.position === "after" ? `${formatted} ${code}` : `${code} ${formatted}`;
  }

  const resolvedLocale = locale || info.locale;
  const decimalPlaces = opts.decimals ?? info.decimalPlaces;

  if (opts.position) {
    const formatted = num.toFixed(decimalPlaces);
    return opts.position === "after"
      ? `${formatted} ${info.symbol}`
      : `${info.symbol}${formatted}`;
  }

  try {
    return new Intl.NumberFormat(resolvedLocale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    }).format(num);
  } catch {
    return `${info.symbol}${num.toFixed(decimalPlaces)}`;
  }
}

export function convertCurrency(
  amount: number,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode
): number {
  if (fromCurrency === toCurrency) return amount;
  const fromRate = staticExchangeRates[fromCurrency] || 1;
  const toRate = staticExchangeRates[toCurrency] || 1;
  return (amount / fromRate) * toRate;
}

export function getCurrencySymbol(currencyCode: string): string {
  const code = currencyCode.toUpperCase() as CurrencyCode;
  return currencyMap[code]?.symbol || currencyCode;
}

export function getSupportedCurrencies(): CurrencyInfo[] {
  return Object.values(currencyMap);
}

// ── Task #118: Cash Machine — Denomination configs & helpers ────────────────

export interface DenominationConfig {
  notes: number[];
  coins: number[];
  rounding: 'NONE' | 'ROUND_0.05' | 'ROUND_0.25' | 'ROUND_1';
  subunit: string;
  subunitValue: number;
}

export const currencyDenominations: Partial<Record<CurrencyCode, DenominationConfig>> = {
  INR: { notes: [2000,500,200,100,50,20,10], coins: [10,5,2,1], rounding: 'ROUND_1', subunit: 'Paise', subunitValue: 100 },
  AED: { notes: [1000,500,200,100,50,20,10,5], coins: [1,0.50,0.25], rounding: 'ROUND_0.25', subunit: 'Fils', subunitValue: 100 },
  USD: { notes: [100,50,20,10,5,1], coins: [0.25,0.10,0.05,0.01], rounding: 'NONE', subunit: 'Cents', subunitValue: 100 },
  GBP: { notes: [50,20,10,5], coins: [2,1,0.50,0.20,0.10,0.05,0.02,0.01], rounding: 'NONE', subunit: 'Pence', subunitValue: 100 },
  EUR: { notes: [500,200,100,50,20,10,5], coins: [2,1,0.50,0.20,0.10,0.05,0.02,0.01], rounding: 'NONE', subunit: 'Cents', subunitValue: 100 },
  SGD: { notes: [1000,100,50,10,5,2], coins: [1,0.50,0.20,0.10,0.05], rounding: 'ROUND_0.05', subunit: 'Cents', subunitValue: 100 },
};

export function applyRounding(amount: number, rounding: DenominationConfig['rounding']): number {
  switch (rounding) {
    case 'ROUND_0.05': return Math.round(amount / 0.05) * 0.05;
    case 'ROUND_0.25': return Math.round(amount / 0.25) * 0.25;
    case 'ROUND_1':    return Math.round(amount);
    default:           return amount;
  }
}

export interface DenominationBreakdown {
  denomination: number;
  count: number;
  value: number;
  label: string;
}

export function denominationBreakdown(amount: number, config: DenominationConfig, symbol: string): DenominationBreakdown[] {
  const result: DenominationBreakdown[] = [];
  let remaining = Math.round(amount * 100) / 100;
  const all = [...config.notes, ...config.coins].sort((a, b) => b - a);
  for (const denom of all) {
    if (remaining >= denom - 0.001) {
      const count = Math.floor(Math.round(remaining / denom * 1000) / 1000);
      if (count > 0) {
        result.push({
          denomination: denom,
          count,
          value: count * denom,
          label: denom >= 1 ? `${symbol}${denom}` : `${Math.round(denom * config.subunitValue)} ${config.subunit}`,
        });
        remaining = Math.round((remaining - count * denom) * 100) / 100;
      }
    }
  }
  return result;
}
