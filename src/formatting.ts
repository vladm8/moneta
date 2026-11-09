const currencies = new Map<string, Intl.NumberFormat>();
const dates = new Map<string, Intl.DateTimeFormat>();

export function formatCurrency(
  amount: number,
  currency: string,
  locale: string,
  decimals: boolean,
) {
  const key = `${locale}:${currency}:${decimals}`;
  let formatter = currencies.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0,
    });
    currencies.set(key, formatter);
  }
  return formatter.format(amount / 100);
}

export function formatTransactionDate(date: string, language: string) {
  let formatter = dates.get(language);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(language, {
      day: "numeric",
      month: "short",
    });
    dates.set(language, formatter);
  }
  return formatter.format(new Date(date + "T12:00:00"));
}
