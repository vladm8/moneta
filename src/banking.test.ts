import { describe, it, expect } from "vitest";
import "fake-indexeddb/auto";
import {
  initialData,
  emptyLedger,
  summary,
  validateImport,
  type Data,
} from "./engine";
import { goalPlan, portfolio } from "./finance";
import {
  bankDuplicates,
  binding,
  fundBankGoal,
  importBankRows,
  linkBankHolding,
  refreshBankHoldings,
  type BankSnapshot,
  type BankTransaction,
} from "./banking";
import { persistData, loadData } from "./persistence";

const id = "a".repeat(64),
  accountId = "b".repeat(64);
const snapshot: BankSnapshot = {
  ownerId: "alice",
  environment: "SANDBOX",
  connections: [],
  accounts: [
    {
      id: accountId,
      connectionId: "connection",
      bank: "Test Bank",
      name: "Account",
      currency: "PLN",
      mask: "•••• 1234",
      balance: {
        amount: 50000,
        currency: "PLN",
        type: "CLBD",
        referenceDate: "2026-11-05",
      },
      balanceFetchedAt: "2026-11-05T12:00:00Z",
    },
  ],
  transactions: [],
};
const row: BankTransaction = {
  id,
  accountId,
  amount: 1234,
  currency: "PLN",
  date: "2026-11-05",
  description: "Lidl",
  status: "BOOK",
  type: "expense",
  stable: true,
  valid: true,
  review: false,
  note: "",
  merchantCode: "",
};
const data = (): Data => ({
  ...initialData(),
  ledgers: {
    PLN: {
      ...emptyLedger(),
      categories: [
        {
          id: "food",
          name: "Jedzenie",
          icon: "basket",
          color: "#123456",
          archived: false,
          kind: "needs",
        },
      ],
    },
  },
});
describe("banking integration", () => {
  it("posts booked entries into existing budgets and categorizes merchants", () => {
    const next = importBankRows(data(), snapshot, [row]);
    expect(next.ledgers.PLN!.entries[0].categoryId).toBe("food");
    expect(summary(next.ledgers.PLN!, "2026-11").spent).toBe(1234);
    expect(Object.keys(next.banking!).sort()).toEqual([
      "environment",
      "links",
      "ownerId",
      "seen",
    ]);
    expect(
      importBankRows(next, snapshot, [row]).ledgers.PLN!.entries,
    ).toHaveLength(1);
  });
  it("preserves manual descriptions/categories and does not re-add deleted bank rows", () => {
    const next = importBankRows(data(), snapshot, [row]);
    next.ledgers.PLN!.entries[0].description = "Manual edit";
    next.ledgers.PLN!.entries[0].categoryId = "";
    next.ledgers.PLN!.entries[0].note = "Manual note";
    expect(
      importBankRows(next, snapshot, [row]).ledgers.PLN!.entries[0].note,
    ).toBe("Manual note");
    expect(
      importBankRows(next, snapshot, [row]).ledgers.PLN!.entries[0].description,
    ).toBe("Manual edit");
    next.ledgers.PLN!.entries = [];
    expect(
      importBankRows(next, snapshot, [row]).ledgers.PLN!.entries,
    ).toHaveLength(0);
  });
  it("rejects pending, malformed and unsupported currency rows atomically", () => {
    const original = data();
    for (const invalid of [
      { ...row, status: "PDNG" },
      { ...row, currency: "JPY" },
      { ...row, amount: null },
      { ...row, date: "2026-02-31" },
    ])
      expect(() =>
        importBankRows(original, snapshot, [
          row,
          { ...invalid, id: "c".repeat(64) },
        ]),
      ).toThrow();
    expect(original.ledgers.PLN!.entries).toHaveLength(0);
  });
  it("protects user/environment binding", () => {
    const next = importBankRows(data(), snapshot, [row]);
    expect(() =>
      binding(next, { ownerId: "bob", environment: "SANDBOX" }),
    ).toThrow("BANK_PROFILE_MISMATCH");
    expect(() =>
      binding(next, { ownerId: "alice", environment: "PRODUCTION" }),
    ).toThrow("BANK_PROFILE_MISMATCH");
  });
  it("detects old manual/PDF imports and requires explicit duplicate override", () => {
    const original = data();
    original.ledgers.PLN!.entries.push({
      id: "manual",
      amount: 1234,
      date: row.date,
      type: "expense",
      description: "Imported PDF",
      categoryId: "",
    });
    expect(bankDuplicates(original, row)).toHaveLength(1);
    expect(() => importBankRows(original, snapshot, [row])).toThrow(
      "BANK_DUPLICATE",
    );
    expect(
      importBankRows(original, snapshot, [row], true).ledgers.PLN!.entries,
    ).toHaveLength(2);
  });
  it("keeps currencies separate and internal transfers neutral", () => {
    const next = importBankRows(data(), snapshot, [
      { ...row, type: "income", amount: 10000 },
      { ...row, id: "d".repeat(64), type: "internal", amount: 3000 },
      { ...row, id: "e".repeat(64), currency: "EUR", amount: 500 },
    ]);
    expect(summary(next.ledgers.PLN!, "2026-11").income).toBe(10000);
    expect(summary(next.ledgers.PLN!, "2026-11").spent).toBe(0);
    expect(summary(next.ledgers.EUR!, "2026-11").spent).toBe(500);
  });
  it("replaces a manual holding instead of double counting and handles negative balances", () => {
    const original = data();
    original.holdings = [
      {
        id: "manual",
        name: "My bank",
        currency: "PLN",
        type: "cash",
        amount: 10000,
        updatedAt: "2026-11-01T00:00:00Z",
      },
    ];
    const next = linkBankHolding(
      original,
      snapshot,
      snapshot.accounts[0],
      "manual",
    );
    expect(next.holdings).toHaveLength(1);
    expect(next.holdings![0].amount).toBe(50000);
    expect(portfolio(next.holdings!, "PLN").net).toBe(50000);
    const debt = structuredClone(snapshot);
    debt.accounts[0].balance!.amount = -1000;
    expect(refreshBankHoldings(next, debt).holdings![0].type).toBe("liability");
    expect(
      portfolio(refreshBankHoldings(next, debt).holdings!, "PLN").net,
    ).toBe(-1000);
  });
  it("cannot link two accounts to the same manual asset", () => {
    const original = data();
    original.holdings = [
      {
        id: "manual",
        name: "Bank",
        currency: "PLN",
        type: "cash",
        amount: 10,
        updatedAt: "2026-11-01T00:00:00Z",
      },
    ];
    const next = linkBankHolding(
      original,
      snapshot,
      snapshot.accounts[0],
      "manual",
    );
    expect(() =>
      linkBankHolding(
        next,
        snapshot,
        { ...snapshot.accounts[0], id: "c".repeat(64) },
        "manual",
      ),
    ).toThrow("BANK_HOLDING_LINKED");
  });
  it("backs a goal without adding income, a new contribution or a second asset", () => {
    const original = data();
    original.ledgers.PLN!.goals = [
      {
        id: "goal",
        name: "Trip",
        date: "2027-01-01",
        target: 100000,
        color: "#123456",
        archived: false,
        initialSaved: 20000,
      },
    ];
    const next = fundBankGoal(
      original,
      snapshot,
      snapshot.accounts[0],
      "goal",
      30000,
    );
    expect(
      goalPlan(next.ledgers.PLN!.goals[0], next.ledgers.PLN!, "2026-11-05")
        .saved,
    ).toBe(30000);
    expect(summary(next.ledgers.PLN!, "2026-11").totalSaved).toBe(30000);
    expect(summary(next.ledgers.PLN!, "2026-11").income).toBe(0);
    expect(next.ledgers.PLN!.entries).toHaveLength(0);
    expect(next.holdings).toHaveLength(0);
    expect(() =>
      fundBankGoal(next, snapshot, snapshot.accounts[0], "goal", 60000),
    ).toThrow();
    const lower = structuredClone(snapshot);
    lower.accounts[0].balance!.amount = 10000;
    expect(
      goalPlan(
        refreshBankHoldings(next, lower).ledgers.PLN!.goals[0],
        next.ledgers.PLN!,
        "2026-11-05",
      ).saved,
    ).toBe(20000);
  });
  it("roundtrips bank links and seen transaction tombstones in existing persistence", async () => {
    const next = linkBankHolding(
      importBankRows(data(), snapshot, [row]),
      snapshot,
      snapshot.accounts[0],
      "new",
    );
    await persistData(next);
    expect(await loadData()).toEqual(next);
    expect(validateImport(data()).banking).toBeUndefined();
    expect(() =>
      validateImport({
        ...next,
        banking: { ...next.banking, links: { bad: { holdingId: "x" } } },
      }),
    ).toThrow();
  });
});
