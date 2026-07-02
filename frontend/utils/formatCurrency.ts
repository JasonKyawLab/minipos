
import { Currency } from "@/types";

const CURRENCY_CONFIG: Record<Currency, { locale: string; symbol: string }> = {
  THB: { locale: "th-TH", symbol: "฿" },
  USD: { locale: "en-US", symbol: "$" },
  SGD: { locale: "en-SG", symbol: "S$" },
  MMK: { locale: "my-MM", symbol: "K" },
  EUR: { locale: "de-DE", symbol: "€" },
};

/**
 * Formats a number as a currency string.
 * @example formatCurrency(1500, "THB") → "฿1,500.00"
 */
export function formatCurrency(amount: number, currency: Currency = "THB"): string {
  const config = CURRENCY_CONFIG[currency] ?? CURRENCY_CONFIG.THB;

  try {
    return new Intl.NumberFormat(config.locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback if Intl isn't available
    return `${config.symbol}${amount.toFixed(2)}`;
  }
}

/**
 * Returns just the symbol for a currency.
 */
export function getCurrencySymbol(currency: Currency): string {
  return CURRENCY_CONFIG[currency]?.symbol ?? currency;
}