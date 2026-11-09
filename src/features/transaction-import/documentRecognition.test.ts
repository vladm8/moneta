import { describe, expect, it } from "vitest";
import { initialData } from "../../engine";
import {
  recognizedDate,
  recognizedAmounts,
  recognizeDocument,
  screenshotRows,
  type TextBox,
} from "./documentRecognition";
import { importAmount } from "./transactionImport";
const d = initialData();
const box = (text: string, x: number, y: number, height = 10): TextBox => ({
  text,
  x,
  y,
  width: text.length * 5,
  height,
});
function statement() {
  const boxes = [
    box("Wyciąg EUR", 400, 10),
    box("Revolut Bank UAB", 400, 25),
    box("Razem 100,00€ 250,00€ 300,00€ 150,00€", 10, 50),
    box("Transakcje na koncie", 10, 70),
    box("Data", 10, 90),
    box("Opis", 120, 90),
    box("Wydatki", 330, 90),
    box("Wpływy", 420, 90),
    box("Saldo", 540, 90),
    box("19 paź 2026", 10, 110),
    box("Wymiana na EUR", 120, 110),
    box("50,00€", 420, 110),
    box("50,00€", 520, 110),
    box("219,89 PLN", 420, 121, 7),
    box("20 paź 2026", 10, 140),
    box("Sklep A", 120, 140),
    box("8,00€", 330, 140),
    box("42,00€", 520, 140),
    box("Do: Sklep A", 120, 153, 7),
    box("Karta: 1234", 120, 165, 7),
    box("21 paź 2026", 10, 190),
    box("Przelew od: ANNA", 120, 190),
    box("2,50€", 420, 190),
    box("44,50€", 520, 190),
    box("TESTOWA", 120, 203),
    box("Dane referencyjne: opis", 120, 215, 7),
    box("Zgłoś kradzież lub utratę karty", 10, 270),
  ];
  return { text: boxes.map((b) => b.text).join("\n"), boxes };
}
describe("document recognition", () => {
  it("reads Revolut debit and credit columns, excludes balances and FX lines, joins wrapped names", () => {
    const rows = recognizeDocument(statement(), d);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => [r.date, r.amount, r.currency, r.type])).toEqual([
      ["2026-10-19", "50,00", "EUR", "internal"],
      ["2026-10-20", "8,00", "EUR", "expense"],
      ["2026-10-21", "2,50", "EUR", "income"],
    ]);
    expect(rows[2].description).toBe("Przelew od: ANNA TESTOWA");
    expect(rows.every((r) => !r.reviewed)).toBe(true);
  });
  it("does not turn a zero-activity statement into transactions", () => {
    expect(
      recognizeDocument(
        {
          text: "Revolut Bank UAB\nWyciąg HUF\nRazem 0,00 HUF 0,00 HUF 0,00 HUF",
        },
        d,
      ),
    ).toEqual([]);
  });
  it("keeps pending rows excluded and handles tables without a balance column", () => {
    const doc = statement();
    doc.boxes = doc.boxes
      .filter((b) => b.x < 500)
      .map((b) =>
        b.text === "Transakcje na koncie"
          ? { ...b, text: "Przetwarzane od 1 paź 2026" }
          : b,
      );
    doc.text = doc.boxes.map((b) => b.text).join("\n");
    const rows = recognizeDocument(doc, d);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => !r.include)).toBe(true);
    expect(rows[1].type).toBe("expense");
  });
  it("leaves direction unresolved when Revolut column geometry is lost", () => {
    const rows = recognizeDocument(
      {
        text: "Revolut Bank UAB\nWyciąg PLN\nData Opis Wydatki Wpływy Saldo\n5 lis 2026 Sklep 12,00 PLN 128,00 PLN",
      },
      d,
    );
    expect(rows[0].amount).toBe("12,00");
    expect(rows[0].type).toBe("");
  });
  it.each([
    ["19 paź 2026", "2026-10-19"],
    ["5 listopada 2026", "2026-11-05"],
    ["30 Oct, 19:20", "2025-10-30"],
    ["4 лис 2026", "2026-11-04"],
    ["2026-11-04", "2026-11-04"],
    ["04.11.2026", "2026-11-04"],
    ["Dzisiaj", "2026-01-01"],
    ["Wczoraj", "2025-12-31"],
  ])("reads date %s", (text, expected) => {
    expect(recognizedDate(text, { year: 2025, now: "2026-01-01" })?.date).toBe(
      expected,
    );
  });
  it("does not invent valid dates for invalid days", () => {
    expect(recognizedDate("31 lut 2026")?.date).toBe("");
  });
  it("reads prefix currencies, Unicode minus and grouped decimals", () => {
    expect(recognizedAmounts("Shop −PLN 1,234.56")[0]).toMatchObject({
      amount: "- 1,234.56",
      currency: "PLN",
    });
    expect(
      importAmount(recognizedAmounts("Sklep -1 234,56 zł")[0].amount).amount,
    ).toBe(123456);
    expect(recognizedAmounts("Transfer -PLN 50")[0]).toMatchObject({
      amount: "- 50",
      currency: "PLN",
    });
    expect(recognizedAmounts("Salary +88 PLN")[0]).toMatchObject({
      amount: "+88",
      currency: "PLN",
    });
    expect(recognizedAmounts("30 Oct, 19:20")).toEqual([]);
  });
  it("reads screenshot date headings, split descriptions, converted amounts and declined rows", () => {
    const rows = screenshotRows(
      {
        text: "Personal · PLN\n4 lis 2026\nLidl\n−42,90 zł\nSpotify -PLN 26.99\n-$6.00\n5 lis 2026\nSalary +PLN 1200.00\nShop -12.90 PLN\nPending\nBalance PLN 500.00",
      },
      d,
    );
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.type)).toEqual([
      "expense",
      "expense",
      "income",
      "expense",
    ]);
    expect(rows[0].date).toBe("2026-11-04");
    expect(rows[3].include).toBe(false);
    expect(rows[2].currency).toBe("PLN");
  });
  it("marks inferred year and currency, and leaves missing dates empty", () => {
    const rows = screenshotRows({ text: "5 lis\nSklep -42,90\n" }, d, {
      year: 2024,
      currency: "EUR",
    });
    expect(rows[0]).toMatchObject({ date: "2024-11-05", currency: "EUR" });
    expect(rows[0].notes).toHaveLength(2);
    expect(screenshotRows({ text: "Sklep -42,90 PLN" }, d)[0].date).toBe("");
  });
});
