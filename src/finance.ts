import {
  CURRENCIES,
  MAX_AMOUNT,
  today,
  validDate,
  type Currency,
  type ExchangeRates,
  type Goal,
  type Holding,
  type Ledger,
} from "./engine";

export const ALLOCATION_STEP = 500;
export function sliderAmount(value: number, limit: number) {
  return (
    Math.max(
      0,
      Math.min(
        Math.round(value / ALLOCATION_STEP),
        Math.floor(Math.max(0, limit) / ALLOCATION_STEP),
      ),
    ) * ALLOCATION_STEP
  );
}
export function exactAllocation(value: number, limit: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > limit)
    throw new Error("Your allocations exceed your income.");
  return value;
}
const dayNumber = (date: string) => Date.parse(date + "T00:00:00Z") / 86400000;
function addMonths(date: string, count: number) {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + count, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + count, Math.min(last, d)))
    .toISOString()
    .slice(0, 10);
}
function monthRatio(start: string, end: string) {
  if (end <= start) return { numerator: 0, denominator: 1 };
  let whole =
    (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
    Number(end.slice(5, 7)) -
    Number(start.slice(5, 7));
  if (addMonths(start, whole) > end) whole--;
  const anchor = dayNumber(addMonths(start, whole));
  const denominator = dayNumber(addMonths(start, whole + 1)) - anchor;
  return {
    numerator: whole * denominator + dayNumber(end) - anchor,
    denominator,
  };
}
export function calendarMonths(start: string, end: string) {
  const { numerator, denominator } = monthRatio(start, end);
  return numerator / denominator;
}
const ceilRatio = (amount: number, numerator: number, denominator: number) =>
  Number(
    (BigInt(amount) * BigInt(numerator) + BigInt(denominator) - 1n) /
      BigInt(denominator),
  );
export function goalPlan(goal: Goal, ledger: Ledger, asOf = today()) {
  const contributions = ledger.entries.filter(
    (e) => e.type === "transfer" && e.goalId === goal.id && e.date <= asOf,
  );
  const saved =
    (goal.initialSaved || 0) + contributions.reduce((s, e) => s + e.amount, 0);
  const remaining = Math.max(0, goal.target - saved);
  const days = goal.date
    ? Math.max(0, dayNumber(goal.date) - dayNumber(asOf))
    : null;
  const ratio = goal.date ? monthRatio(asOf, goal.date) : null;
  const months = ratio ? ratio.numerator / ratio.denominator : null;
  const first = contributions.map((e) => e.date).sort()[0];
  const windowStart = Math.max(
    dayNumber(asOf) - 89,
    first ? dayNumber(first) : dayNumber(asOf),
  );
  const windowDays = dayNumber(asOf) - windowStart + 1;
  const recent = contributions
    .filter((e) => dayNumber(e.date) >= windowStart)
    .reduce((s, e) => s + e.amount, 0);
  // Require at least one week of observations; opening savings are not a contribution pace.
  const dailyPace = windowDays >= 7 && recent > 0 ? recent / windowDays : null;
  const projectionDays = dailyPace
    ? ceilRatio(remaining, windowDays, recent)
    : null;
  const projected = !remaining
    ? asOf
    : projectionDays !== null && projectionDays <= 36500
      ? new Date((dayNumber(asOf) + projectionDays) * 86400000)
          .toISOString()
          .slice(0, 10)
      : null;
  const status = !remaining
    ? "Completed"
    : goal.date && goal.date < asOf
      ? "Overdue"
      : goal.date === asOf
        ? "Due today"
        : !goal.date
          ? "No deadline"
          : !projected
            ? "Not enough history"
            : projected <= goal.date
              ? "On track"
              : "Behind schedule";
  return {
    saved,
    remaining,
    days,
    months,
    progress: Math.min(100, (saved / goal.target) * 100),
    monthly: !remaining
      ? 0
      : ratio && ratio.numerator > 0
        ? ceilRatio(remaining, ratio.denominator, ratio.numerator)
        : null,
    weekly: !remaining
      ? 0
      : days && days > 0
        ? ceilRatio(remaining, 7, days)
        : null,
    projected,
    status,
    dailyPace,
  };
}

export const RATE_SCALE = 100000000;
export function parseNBPRates(input: unknown): ExchangeRates {
  if (
    !Array.isArray(input) ||
    !input[0] ||
    input[0].table !== "A" ||
    typeof input[0].no !== "string" ||
    !input[0].no ||
    input[0].no.length > 80 ||
    !validDate(input[0].effectiveDate) ||
    !Array.isArray(input[0].rates)
  )
    throw new Error("Invalid exchange rate response.");
  const rates: ExchangeRates["rates"] = { PLN: RATE_SCALE };
  for (const c of CURRENCIES.filter((c) => c !== "PLN")) {
    const item = input[0].rates.find(
      (r: { code?: string } | null) => r?.code === c,
    );
    if (item) {
      if (
        typeof item.mid !== "number" ||
        !Number.isFinite(item.mid) ||
        item.mid <= 0 ||
        item.mid > 10000
      )
        throw new Error("Invalid exchange rate response.");
      rates[c] = Math.round(item.mid * RATE_SCALE);
    }
  }
  return {
    date: input[0].effectiveDate,
    fetchedAt: new Date().toISOString(),
    table: String(input[0].no),
    rates,
  };
}
export async function fetchNBPRates() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(
      "https://api.nbp.pl/api/exchangerates/tables/A/?format=json",
      { signal: controller.signal },
    );
    if (!response.ok)
      throw new Error(
        "Exchange rates unavailable. Saved rates are still available.",
      );
    return parseNBPRates(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}
export function convertMoney(
  amount: number,
  from: Currency,
  to: Currency,
  rates?: ExchangeRates,
): number | null {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_AMOUNT)
    throw new Error("Amount is too large.");
  if (from === to) return amount;
  const source = from === "PLN" ? RATE_SCALE : rates?.rates[from];
  const target = to === "PLN" ? RATE_SCALE : rates?.rates[to];
  if (!source || !target) return null;
  const converted = Number(
    (BigInt(amount) * BigInt(source) + BigInt(target) / 2n) / BigInt(target),
  );
  if (!Number.isSafeInteger(converted)) throw new Error("Amount is too large.");
  return converted;
}
// Holdings alone define the portfolio. Plans and goal transfers never create assets.
export function portfolio(
  holdings: Holding[],
  base: Currency,
  rates?: ExchangeRates,
) {
  let assets = 0,
    liabilities = 0;
  const byCurrency: Partial<Record<Currency, number>> = {};
  const byType: Record<string, number> = {};
  const rows = holdings.map((h) => ({
    ...h,
    converted: convertMoney(h.amount, h.currency, base, rates),
  }));
  for (const h of rows) {
    if (h.converted === null) continue;
    if (h.type === "liability") liabilities += h.converted;
    else {
      assets += h.converted;
      byCurrency[h.currency] = (byCurrency[h.currency] || 0) + h.converted;
      byType[h.type] = (byType[h.type] || 0) + h.converted;
    }
  }
  if (![assets, liabilities].every(Number.isSafeInteger))
    throw new Error("Amount is too large.");
  const missing = rows.filter((h) => h.converted === null).length;
  return {
    rows,
    assets,
    liabilities,
    net: assets - liabilities,
    missing,
    byCurrency,
    byType,
  };
}
