// Dues amounts are stored in minor units (kobo, cents, pesewas). All supported currencies use 2 decimals.
export const CURRENCIES = ["NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR", "CAD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const formatMoney = (minor: number | bigint | string, currency: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(minor) / 100);

/** "25,000.50" → 2500050. Returns null for invalid, zero or negative input. */
export function toMinor(input: string): number | null {
  const clean = input.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, frac = ""] = clean.split(".");
  const v = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return v > 0 && Number.isSafeInteger(v) ? v : null;
}

export const PERIOD_LABEL: Record<string, string> = { one_time: "One-time", monthly: "Monthly", quarterly: "Quarterly", annual: "Annual" };
export const METHOD_LABEL: Record<string, string> = {
  bank_transfer: "Bank transfer", card: "Card", cash: "Cash", mobile_money: "Mobile money", other: "Other",
};
