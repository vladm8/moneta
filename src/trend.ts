import type { Entry } from "./engine";

export function trendWindow(days: number, span: number, anchor = days) {
  const length = span ? Math.min(span, days) : days;
  const start = Math.max(1, Math.min(anchor - length + 1, days - length + 1));
  return { start, end: start + length - 1 };
}
export function trendSeries(
  entries: Entry[],
  month: string,
  start: number,
  end: number,
) {
  const daily = Array<number>(end - start + 1).fill(0);
  for (const entry of entries) {
    const day = Number(entry.date.slice(8));
    if (entry.date.slice(0, 7) !== month || day < start || day > end) continue;
    if (entry.type === "expense" || entry.type === "refund")
      daily[day - start] += entry.amount * (entry.type === "refund" ? -1 : 1);
  }
  let total = 0;
  return { daily, cumulative: daily.map((amount) => (total += amount)) };
}
export function nearestTrendIndex(
  x: number,
  left: number,
  right: number,
  count: number,
) {
  return Math.max(
    0,
    Math.min(
      count - 1,
      Math.round(((x - left) / (right - left)) * (count - 1)),
    ),
  );
}
