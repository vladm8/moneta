import { describe, expect, it } from "vitest";
import { CURRENCIES, locale, money, type Language } from "./engine";
import { formatTransactionDate } from "./formatting";

describe("localized formatting", () => {
  it("preserves native currency output across currencies, languages and precision", () => {
    for (const language of ["pl", "en", "uk"] as Language[])
      for (const currency of CURRENCIES)
        for (const decimals of [true, false])
          for (const amount of [0, 1, -1, 123456, -987654, 10000000000]) {
            const digits = decimals ? 2 : 0;
            const expected = (amount / 100).toLocaleString(locale(language), {
              style: "currency",
              currency,
              minimumFractionDigits: digits,
              maximumFractionDigits: digits,
            });
            expect(money(amount, currency, language, decimals)).toBe(expected);
          }
  });

  it("preserves transaction dates when the selected language changes", () => {
    for (const language of ["pl", "en", "uk", "pl"])
      for (const date of [
        "2024-02-29",
        "2026-01-01",
        "2026-10-25",
        "2026-12-31",
      ])
        expect(formatTransactionDate(date, language)).toBe(
          new Date(date + "T12:00:00").toLocaleDateString(language, {
            day: "numeric",
            month: "short",
          }),
        );
  });
});
