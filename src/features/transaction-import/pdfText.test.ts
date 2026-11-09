import { describe, expect, it } from "vitest";
import { pdfTextLines } from "./pdfText";
import { ocrRows, commitImport } from "./transactionImport";
import { initialData } from "../../engine";
const item = (str: string, x: number, y: number) => ({
  str,
  transform: [1, 0, 0, 1, x, y],
  height: 12,
});
describe("PDF transaction extraction", () => {
  it("reorders positioned columns and tolerates small baseline differences", () => {
    const text = pdfTextLines([
      item("-42,90 PLN", 400, 700),
      item("Lidl", 140, 700.5),
      item("05.11.2026", 10, 700),
      item("+500,00 EUR", 400, 680),
      item("Salary", 140, 680),
      item("06.11.2026", 10, 680),
    ]);
    const rows = ocrRows(text, initialData());
    expect(
      rows.map((r) => [
        r.date,
        r.description,
        r.amount.trim(),
        r.currency,
        r.type,
      ]),
    ).toEqual([
      ["2026-11-05", "Lidl", "-42,90", "PLN", "expense"],
      ["2026-11-06", "Salary", "+500,00", "EUR", "income"],
    ]);
    expect(commitImport(initialData(), rows).ledgers.EUR!.entries).toHaveLength(
      1,
    );
  });
  it("keeps adjacent rows separate and ignores empty text items", () => {
    expect(
      pdfTextLines([item("A", 0, 20), item(" ", 5, 20), item("B", 0, 10)]),
    ).toBe("A\nB");
  });
});
