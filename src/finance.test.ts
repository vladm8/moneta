import { describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import {
  calendarMonths,
  convertMoney,
  exactAllocation,
  fetchNBPRates,
  goalPlan,
  parseNBPRates,
  portfolio,
  sliderAmount,
} from "./finance";
import {
  categorySpent,
  emptyLedger,
  initialData,
  parseMoney,
  starterCategories,
  summary,
  validateImport,
  type ExchangeRates,
  type Goal,
  type Holding,
} from "./engine";
import {
  commitImport,
  duplicateKind,
  guessColumns,
  importAmount,
  importDate,
  jsonRows,
  mappedRows,
  newImportRow,
  ocrRows,
  parseCSV,
  rowEntry,
} from "./features/transaction-import/transactionImport";
import { deleteData, loadData, persistData } from "./persistence";
const rateFixture: ExchangeRates = {
  date: "2026-11-04",
  fetchedAt: "2026-11-04T12:00:00Z",
  table: "test fixture",
  rates: { PLN: 100000000, EUR: 430000000, USD: 400000000 },
};
const goal: Goal = {
  id: "g",
  name: "Reserve",
  target: 2000000,
  initialSaved: 500000,
  date: "2027-09-04",
  color: "#779cff",
  archived: false,
};
const holding = (
  id: string,
  currency: Holding["currency"],
  amount: number,
  type: Holding["type"] = "cash",
): Holding => ({
  id,
  name: id,
  currency,
  amount,
  type,
  updatedAt: "2026-11-04T12:00:00Z",
});

describe("comfortable allocation", () => {
  it("snaps dragging to five currency units without exceeding the limit", () => {
    expect(sliderAmount(50321, 100000)).toBe(50500);
    expect(sliderAmount(99999, 99899)).toBe(99500);
    expect(sliderAmount(400, 499)).toBe(0);
    expect(sliderAmount(-600, 100000)).toBe(0);
  });
  it("keeps exact manual decimals and rejects excess allocation", () => {
    expect(exactAllocation(parseMoney("503,21"), 50321)).toBe(50321);
    expect(() => exactAllocation(50322, 50321)).toThrow();
    expect(() => exactAllocation(1.5, 100)).toThrow();
  });
});
describe("goal planner", () => {
  it("calculates the requested 20k goal with 5k saved and ten calendar months", () => {
    const p = goalPlan(goal, emptyLedger(), "2026-11-04");
    expect(p.months).toBe(10);
    expect(p.monthly).toBe(150000);
    expect(p.progress).toBe(25);
    expect(p.remaining).toBe(1500000);
  });
  it("handles partial months, leap years and clamped month ends", () => {
    expect(calendarMonths("2026-11-04", "2026-11-19")).toBe(0.5);
    expect(calendarMonths("2028-01-31", "2028-02-29")).toBe(1);
    expect(
      goalPlan({ ...goal, date: "2026-11-19" }, emptyLedger(), "2026-11-04")
        .monthly,
    ).toBe(3000000);
  });
  it("does not invent a schedule for overdue or undated goals", () => {
    expect(
      goalPlan({ ...goal, date: "2026-11-03" }, emptyLedger(), "2026-11-04"),
    ).toMatchObject({ status: "Overdue", monthly: null, days: 0 });
    expect(
      goalPlan({ ...goal, date: "" }, emptyLedger(), "2026-11-04"),
    ).toMatchObject({ monthly: null, days: null, projected: null });
  });
  it("never produces negative saving requirements for completed goals", () => {
    expect(
      goalPlan({ ...goal, initialSaved: 2100000 }, emptyLedger(), "2026-11-04"),
    ).toMatchObject({
      status: "Completed",
      remaining: 0,
      monthly: 0,
      weekly: 0,
      progress: 100,
    });
  });
  it("uses actual contribution pace and ignores future contributions", () => {
    const l = emptyLedger();
    l.entries = [
      {
        id: "a",
        type: "transfer",
        goalId: "g",
        amount: 100000,
        date: "2026-10-06",
        description: "Saving",
        categoryId: "",
      },
      {
        id: "b",
        type: "transfer",
        goalId: "g",
        amount: 900000,
        date: "2026-12-01",
        description: "Future",
        categoryId: "",
      },
    ];
    const p = goalPlan(goal, l, "2026-11-04");
    expect(p.saved).toBe(600000);
    expect(p.dailyPace).toBeCloseTo(100000 / 30);
    expect(p.status).toBe("Behind schedule");
    expect(p.projected).toBeTruthy();
    l.entries[0].amount = 1000000;
    expect(goalPlan(goal, l, "2026-11-04").status).toBe("On track");
  });
});
describe("NBP and net worth", () => {
  it("uses half-up integer cross-currency conversion", () => {
    expect(convertMoney(120000, "EUR", "PLN", rateFixture)).toBe(516000);
    expect(convertMoney(10000, "EUR", "USD", rateFixture)).toBe(10750);
    expect(convertMoney(2, "EUR", "PLN", rateFixture)).toBe(9);
    expect(convertMoney(500, "UAH", "UAH")).toBe(500);
  });
  it("never substitutes a missing rate and does not mutate the cache", () => {
    expect(convertMoney(100, "GBP", "PLN", rateFixture)).toBeNull();
    expect(convertMoney(100, "EUR", "GBP", rateFixture)).toBeNull();
    expect(rateFixture.rates.GBP).toBeUndefined();
  });
  it("aggregates assets and liabilities only, without budgets or savings transfers", () => {
    const holdings = [
      holding("PLN", "PLN", 500000),
      holding("EUR", "EUR", 120000),
      holding("USD", "USD", 80000),
      holding("debt", "PLN", 100000, "liability"),
    ];
    expect(portfolio(holdings, "PLN", rateFixture)).toMatchObject({
      assets: 1336000,
      liabilities: 100000,
      net: 1236000,
      missing: 0,
    });
    const d = initialData();
    d.holdings = holdings;
    d.ledgers.PLN!.goals = [goal];
    d.ledgers.PLN!.entries.push({
      id: "t",
      type: "transfer",
      goalId: "g",
      amount: 10000,
      description: "Saving",
      date: "2026-11-04",
      categoryId: "",
    });
    expect(portfolio(d.holdings, "PLN", rateFixture).net).toBe(1236000);
  });
  it("marks partial valuations instead of hiding missing assets", () => {
    expect(
      portfolio([holding("x", "GBP", 100000)], "PLN", rateFixture),
    ).toMatchObject({ missing: 1, assets: 0 });
  });
  it("validates NBP metadata and rejects invalid rates", () => {
    const r = parseNBPRates([
      {
        table: "A",
        no: "test",
        effectiveDate: "2026-11-04",
        rates: [{ code: "EUR", mid: 4.3123 }],
      },
    ]);
    expect(r.rates.EUR).toBe(431230000);
    expect(r.date).toBe("2026-11-04");
    expect(() =>
      parseNBPRates([
        {
          table: "A",
          effectiveDate: "2026-11-04",
          rates: [{ code: "EUR", mid: -4 }],
        },
      ]),
    ).toThrow();
  });
  it("reports network failures without overwriting cached rates", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    try {
      await expect(fetchNBPRates()).rejects.toThrow(
        "Exchange rates unavailable",
      );
      expect(rateFixture.rates.EUR).toBe(430000000);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
describe("reviewable transaction import", () => {
  const data = () => {
    const d = initialData();
    d.ledgers.PLN!.categories = starterCategories("pl");
    return d;
  };
  it("handles BOM, semicolons, Polish decimals and quoted multiline fields", () => {
    const csv = parseCSV(
      '\uFEFFData;Opis;Kwota;Waluta\r\n04.11.2026;"Lidl\nzakupy";-1 234,56;PLN',
    );
    const rows = mappedRows(csv, guessColumns(csv[0]), data(), "DMY");
    expect(rows[0]).toMatchObject({
      date: "2026-11-04",
      description: "Lidl\nzakupy",
      type: "expense",
    });
    expect(rowEntry(rows[0]).amount).toBe(123456);
    expect(rows[0].categoryId).not.toBe("");
  });
  it.each([
    ["1,234.56", 123456],
    ["1.234,56", 123456],
    ["-12,30", 1230],
    ["(12.30)", 1230],
  ])("parses international amount %s", (raw, expected) => {
    expect(importAmount(raw as string).amount).toBe(expected);
  });
  it("rejects ambiguous or malformed money and impossible dates", () => {
    expect(() => importAmount("1,234")).toThrow();
    expect(() => importAmount("1.2.3,45")).toThrow();
    expect(importDate("11/04/2026", "MDY")).toBe("2026-11-04");
    const r = {
      ...newImportRow("PLN"),
      date: "2026-02-30",
      description: "Lidl",
      amount: "50",
      type: "expense",
    };
    expect(() => rowEntry(r)).toThrow("date");
  });
  it("rejects malformed CSV and undocumented JSON", () => {
    expect(() => parseCSV('a,b\n"never closed')).toThrow();
    expect(() => parseCSV("a,b\n1,2,3")).toThrow();
    expect(() => jsonRows('{"transactions":[]}', data())).toThrow();
  });
  it("preserves all ledgers with atomic validation without per-row confirmation", () => {
    const d = data();
    const r = {
      ...newImportRow("EUR"),
      date: "2026-11-04",
      amount: "100.25",
      description: "Salary",
      type: "income",
    };
    expect(commitImport(d, [r]).ledgers.EUR!.entries).toHaveLength(1);
    const next = commitImport(d, [{ ...r, reviewed: true }]);
    expect(next.ledgers.EUR!.entries[0].amount).toBe(10025);
    expect(d.ledgers.EUR).toBeUndefined();
    expect(next.ledgers.PLN).toBe(d.ledgers.PLN);
    expect(() =>
      commitImport(d, [
        { ...r, reviewed: true },
        { ...r, id: "bad", reviewed: true, date: "wrong" },
      ]),
    ).toThrow();
    expect(d.ledgers.EUR).toBeUndefined();
  });
  it("distinguishes income, expense, refunds and neutral internal transfers", () => {
    const d = data();
    const rows = jsonRows(
      JSON.stringify({
        schema: "moneta-transactions-v1",
        transactions: [
          {
            date: "2026-11-04",
            description: "Salary",
            amount: "1000",
            currency: "PLN",
            type: "income",
          },
          {
            date: "2026-11-04",
            description: "Lidl",
            amount: "-100",
            currency: "PLN",
            type: "expense",
            category: "Jedzenie",
          },
          {
            date: "2026-11-04",
            description: "Lidl refund",
            amount: "25",
            currency: "PLN",
            type: "refund",
            category: "Jedzenie",
          },
          {
            date: "2026-11-04",
            description: "Own account",
            amount: "500",
            currency: "PLN",
            type: "internal",
          },
        ],
      }),
      d,
    );
    const next = commitImport(d, rows);
    const l = next.ledgers.PLN!;
    expect(summary(l, "2026-11")).toMatchObject({
      income: 100000,
      spent: 7500,
      saved: 0,
      available: 92500,
    });
    expect(categorySpent(l, "2026-11", l.categories[1].id)).toBe(7500);
    expect(() => validateImport(next)).not.toThrow();
  });
  it("detects reimports and duplicates within a file; requires explicit override", () => {
    const d = data();
    const r = {
      ...newImportRow("PLN"),
      date: "2026-11-04",
      amount: "10",
      description: "Lidl",
      type: "expense",
      reviewed: true,
    };
    const next = commitImport(d, [r]);
    expect(duplicateKind(rowEntry(r), next.ledgers.PLN!)).toBe("possible");
    expect(() => commitImport(next, [{ ...r, id: "new" }])).toThrow(
      "duplicate",
    );
    expect(() => commitImport(d, [r, { ...r, id: "new" }])).toThrow(
      "duplicate",
    );
    expect(
      commitImport(next, [{ ...r, id: "new", allowDuplicate: true }]).ledgers
        .PLN!.entries,
    ).toHaveLength(2);
    const withSource = commitImport(d, [{ ...r, sourceId: "bank:1" }]);
    expect(() =>
      commitImport(withSource, [
        { ...r, id: "new", sourceId: "bank:1", allowDuplicate: true },
      ]),
    ).toThrow();
  });
  it("extracts real OCR text conservatively without guessing missing fields", () => {
    const rows = ocrRows(
      "04.11.2026\nLidl -42,90 PLN\nUber\n-10.00 EUR\nUnknown 5.00",
      data(),
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      description: "Lidl",
      date: "2026-11-04",
      amount: "-42,90",
      currency: "PLN",
      reviewed: false,
    });
    expect(rows[1].description).toBe("Uber");
    expect(rows[2].currency).toBe("");
    expect(rows[2].type).toBe("");
  });
});
describe("backwards-compatible persistence", () => {
  it("imports a large batch without changing saved entries or accepting reused IDs", () => {
    const d = initialData();
    d.ledgers.PLN!.entries = Array.from({ length: 10000 }, (_, i) => ({
      id: `old-${i}`,
      type: "expense" as const,
      description: `Existing ${i}`,
      amount: 100,
      date: "2026-11-04",
      categoryId: "",
    }));
    const rows = Array.from({ length: 5000 }, (_, i) => ({
      ...newImportRow("PLN"),
      id: `new-${i}`,
      description: `Import ${i}`,
      amount: "1.00",
      date: "2026-11-04",
      type: "expense",
      reviewed: true,
    }));
    const next = commitImport(d, rows);
    expect(next.ledgers.PLN!.entries).toHaveLength(15000);
    expect(next.ledgers.PLN!.entries[0]).toBe(d.ledgers.PLN!.entries[0]);
    expect(d.ledgers.PLN!.entries).toHaveLength(10000);
    expect(() =>
      commitImport(d, [{ ...rows[0], id: "old-0", allowDuplicate: true }]),
    ).toThrow();
  });
  it("keeps refunds larger than expenses as negative net spending", () => {
    const d = initialData();
    const row = {
      ...newImportRow("PLN"),
      description: "Refund from last month",
      amount: "200.00",
      date: "2026-11-04",
      type: "refund",
      reviewed: true,
    };
    const next = commitImport(d, [row]);
    expect(summary(next.ledgers.PLN!, "2026-11")).toMatchObject({
      income: 0,
      spent: -20000,
      available: 20000,
    });
  });
  it("round-trips extensions and still loads old version-1 backups", async () => {
    await deleteData();
    const old = initialData();
    expect(validateImport(old)).toEqual(old);
    const d = initialData();
    d.holdings = [holding("asset", "EUR", 120000)];
    d.exchangeRates = rateFixture;
    d.ledgers.PLN!.goals = [goal];
    d.ledgers.PLN!.entries = [
      {
        id: "refund",
        sourceId: "bank:refund",
        type: "refund",
        description: "Refund",
        date: "2026-11-04",
        categoryId: "",
        amount: 1200,
      },
    ];
    await persistData(d);
    expect(await loadData()).toEqual(d);
  });
  it("rejects corrupt portfolio and goal data without dropping legacy records", () => {
    const d = initialData();
    d.holdings = [holding("a", "PLN", -1)];
    expect(() => validateImport(d)).toThrow();
    delete d.holdings;
    d.ledgers.PLN!.goals = [{ ...goal, initialSaved: -2 }];
    expect(() => validateImport(d)).toThrow();
    d.ledgers.PLN!.goals = [];
    d.exchangeRates = { ...rateFixture, rates: { PLN: 1 } };
    expect(() => validateImport(d)).toThrow();
  });
});
