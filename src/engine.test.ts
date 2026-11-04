import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  parseMoney,
  percentAmount,
  distribute,
  summary,
  savePlan,
  emptyLedger,
  addCategory,
  removeCategory,
  recordEntry,
  initialData,
  validateImport,
  starterCategories,
  categorySpent,
  shiftMonth,
  money,
  applyRecurring,
  csvExport,
  presetPlan,
  demoData,
  type Entry,
  type Ledger,
} from "./engine";
import { persistData, loadData, deleteData } from "./persistence";
const month = "2026-11";
function fixture() {
  let l = emptyLedger();
  l.categories = starterCategories("en");
  l = recordEntry(l, {
    id: "salary",
    type: "income",
    amount: 500000,
    date: "2026-11-01",
    description: "Salary",
    categoryId: "",
  });
  return l;
}
const expense = (l: Ledger, amount = 10000): Entry => ({
  id: "expense",
  type: "expense",
  date: "2026-11-03",
  amount,
  categoryId: l.categories[1].id,
  description: "Groceries",
});
describe("integer monetary engine", () => {
  it.each([
    ["5000", 500000],
    ["0.1", 10],
    ["1 234,56", 123456],
    ["1.005", 101],
    ["0.004", 0],
    ["999.999", 100000],
    ["0", 0],
  ])("parses %s to %i", (input, expected) =>
    expect(parseMoney(input)).toBe(expected),
  );
  it.each([
    "-1",
    "NaN",
    "Infinity",
    "1e3",
    "3.4.2",
    "",
    "10.1234",
    "100000001",
    "abc",
  ])("rejects unsafe input %s", (input) =>
    expect(() => parseMoney(input)).toThrow(),
  );
  it("rounds percentage allocation half up in integer units", () => {
    expect(percentAmount(10001, "12.5")).toBe(1250);
    expect(percentAmount(101, "50")).toBe(51);
    expect(() => percentAmount(500000, "101")).toThrow();
  });
  it("distributes every minor unit deterministically", () => {
    expect(distribute(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(distribute(500001, [50, 30, 20]).reduce((a, b) => a + b, 0)).toBe(
      500001,
    );
    expect(distribute(0, [1, 2])).toEqual([0, 0]);
    expect(distribute(100, [])).toEqual([]);
  });
  it("handles large products without floating-point rounding", () =>
    expect(distribute(10000000000, [3333, 3333, 3334])).toEqual([
      3333000000, 3333000000, 3334000000,
    ]));
  it("rejects overflow without changing the saved plan", () => {
    const l = fixture();
    expect(() =>
      savePlan(l, month, { [l.categories[0].id]: 500001 }),
    ).toThrow();
    expect(l.plans).toEqual({});
  });
  it("separates allocated, unallocated and available", () => {
    let l = fixture();
    l = savePlan(l, month, { [l.categories[1].id]: 90000 });
    l = recordEntry(l, expense(l));
    expect(summary(l, month)).toMatchObject({
      income: 500000,
      allocated: 90000,
      unallocated: 410000,
      spent: 10000,
      available: 490000,
    });
    expect(categorySpent(l, month, l.categories[1].id)).toBe(10000);
  });
  it("replaces edited transactions without double-counting", () => {
    let l = fixture();
    l = recordEntry(l, expense(l));
    l = recordEntry(l, { ...expense(l), amount: 15000 });
    expect(summary(l, month).spent).toBe(15000);
    expect(l.entries).toHaveLength(2);
  });
  it("isolates monthly plans and transactions", () => {
    let l = fixture();
    l = savePlan(l, month, { [l.categories[0].id]: 100000 });
    l = recordEntry(l, { ...expense(l), date: "2026-10-03" });
    expect(summary(l, month).spent).toBe(0);
    expect(summary(l, "2026-10").allocated).toBe(0);
    expect(summary(l, "2026-10").spent).toBe(10000);
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
  it("supports safe category deletion while retaining transactions", () => {
    let l = fixture();
    const id = l.categories[1].id;
    l = savePlan(l, month, { [id]: 30000 });
    l = recordEntry(l, expense(l));
    l = removeCategory(l, id);
    expect(l.entries.find((e) => e.id === "expense")?.categoryId).toBe("");
    expect(summary(l, month).spent).toBe(10000);
    expect(summary(l, month).allocated).toBe(0);
  });
  it("rejects duplicate category names", () => {
    const l = fixture();
    expect(() =>
      addCategory(l, { ...l.categories[0], id: "other", name: " HOUSING " }),
    ).toThrow();
  });
  it("rejects invalid dates and references", () => {
    const l = fixture();
    expect(() =>
      recordEntry(l, { ...expense(l), date: "2026-02-30" }),
    ).toThrow();
    expect(() =>
      recordEntry(l, { ...expense(l), categoryId: "missing" }),
    ).toThrow();
  });
  it("keeps zero-income calculations finite", () =>
    expect(summary(emptyLedger(), month)).toEqual({
      income: 0,
      spent: 0,
      saved: 0,
      allocated: 0,
      unallocated: 0,
      available: 0,
      totalSaved: 0,
    }));
  it("budgets groups using exact percentages", () => {
    const l = fixture();
    const p = presetPlan(l, 500000, "balanced");
    expect(
      l.categories
        .filter((c) => c.kind === "needs")
        .reduce((s, c) => s + p[c.id], 0),
    ).toBe(250000);
    expect(Object.values(p).reduce((a, b) => a + b, 0)).toBe(500000);
  });
});
describe("savings and recurrence", () => {
  it("counts a contribution once and excludes it from expenses", () => {
    let l = fixture();
    l.goals = [
      {
        id: "goal",
        name: "Reserve",
        target: 100000,
        date: "",
        color: "#2d6a50",
        archived: false,
      },
    ];
    l = recordEntry(l, {
      id: "transfer",
      type: "transfer",
      date: "2026-11-03",
      amount: 50000,
      description: "Reserve",
      categoryId: l.categories[5].id,
      goalId: "goal",
    });
    expect(summary(l, month)).toMatchObject({
      spent: 0,
      saved: 50000,
      totalSaved: 50000,
      available: 450000,
    });
    expect(categorySpent(l, month, l.categories[5].id)).toBe(50000);
  });
  it("prevents contributions greater than available cash", () => {
    const l = fixture();
    l.goals = [
      {
        id: "goal",
        name: "Reserve",
        target: 1000000,
        date: "",
        color: "#2d6a50",
        archived: false,
      },
    ];
    expect(() =>
      recordEntry(l, {
        id: "t",
        type: "transfer",
        date: "2026-11-03",
        amount: 500001,
        description: "Reserve",
        categoryId: "",
        goalId: "goal",
      }),
    ).toThrow();
  });
  it("does not materialize recurring items twice and clamps the day", () => {
    let l = fixture();
    l.recurring = [
      {
        id: "recurring",
        type: "income",
        amount: 10000,
        description: "Extra",
        categoryId: "",
        day: 31,
      },
    ];
    l = applyRecurring(l, "2026-02");
    l = applyRecurring(l, "2026-02");
    expect(l.entries.filter((e) => e.recurringId === "recurring")).toHaveLength(
      1,
    );
    expect(l.entries.at(-1)?.date).toBe("2026-02-28");
  });
});
describe("import and export validation", () => {
  it("roundtrips every demo language", () => {
    for (const lang of ["pl", "en", "uk"] as const) {
      const data = demoData(lang);
      expect(validateImport(JSON.parse(JSON.stringify(data)))).toEqual(data);
    }
  });
  it("rejects missing fields, unsupported versions and unsafe amounts", () => {
    expect(() => validateImport({})).toThrow();
    const d = initialData();
    expect(() => validateImport({ ...d, version: 2 })).toThrow();
    d.ledgers.PLN = fixture();
    d.ledgers.PLN.entries[0].amount = 1.5;
    expect(() => validateImport(d)).toThrow();
  });
  it("rejects dangling category references and duplicate entry IDs", () => {
    const d = initialData();
    d.ledgers.PLN = fixture();
    d.ledgers.PLN.entries.push({
      ...expense(d.ledgers.PLN),
      categoryId: "missing",
    });
    expect(() => validateImport(d)).toThrow();
    d.ledgers.PLN.entries[1] = d.ledgers.PLN.entries[0];
    expect(() => validateImport(d)).toThrow();
  });
  it("rejects bad color values, prototype IDs and malformed plans", () => {
    const d = initialData();
    d.ledgers.PLN = fixture();
    d.ledgers.PLN.categories[0].color = "url(javascript:alert(1))";
    expect(() => validateImport(d)).toThrow();
    d.ledgers.PLN.categories[0].color = "#2d6a50";
    d.ledgers.PLN.categories[0].id = "__proto__";
    expect(() => validateImport(d)).toThrow();
    d.ledgers.PLN = fixture();
    d.ledgers.PLN.plans["2026-13"] = {};
    expect(() => validateImport(d)).toThrow();
  });
  it("escapes CSV formulas and quotes", () => {
    const l = fixture();
    l.entries[0].description = '=HYPERLINK("example")';
    expect(csvExport(l)).toContain('"\'=HYPERLINK(""example"")"');
  });
  it("formats currencies with proper locale symbols", () => {
    expect(money(123456, "PLN", "pl")).toContain("1");
    expect(money(123456, "PLN", "pl")).toContain("234,56");
    expect(money(123456, "USD", "en")).toContain("1,234.56");
    expect(money(100, "EUR", "uk")).toContain("1,00");
  });
  it("switching currencies never modifies existing ledger values", () => {
    const d = initialData();
    d.ledgers.PLN = fixture();
    d.currency = "EUR";
    d.ledgers.EUR = emptyLedger();
    expect(summary(d.ledgers.PLN, month).income).toBe(500000);
    expect(summary(d.ledgers.EUR, month).income).toBe(0);
  });
});
describe("IndexedDB persistence", () => {
  beforeEach(async () => deleteData());
  it("roundtrips complete account data and respects deletion", async () => {
    const data = initialData();
    data.ledgers.PLN = fixture();
    await persistData(data);
    expect(await loadData()).toEqual(data);
    await deleteData();
    expect(await loadData()).toBeNull();
  });
  it("persists the full main user flow across reload and month switch", async () => {
    const d = initialData();
    let l = fixture();
    const id = l.categories[1].id;
    l = savePlan(l, month, { [id]: 50000 });
    l = savePlan(l, month, { [id]: 70000 });
    l = recordEntry(l, expense(l, 10000));
    d.ledgers.PLN = l;
    await persistData(d);
    const loaded = (await loadData())!.ledgers.PLN!;
    expect(summary(loaded, month)).toMatchObject({
      income: 500000,
      allocated: 70000,
      spent: 10000,
      available: 490000,
    });
    expect(70000 - categorySpent(loaded, month, id)).toBe(60000);
    expect(summary(loaded, "2026-12").income).toBe(0);
    expect(summary(loaded, "2026-12").spent).toBe(0);
  });
});
