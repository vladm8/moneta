export const CURRENCIES = ["PLN", "EUR", "USD", "UAH", "GBP"] as const;
export type Currency = (typeof CURRENCIES)[number];
export type Language = "pl" | "en" | "uk";
export type Page =
  | "overview"
  | "budget"
  | "transactions"
  | "analytics"
  | "goals"
  | "portfolio"
  | "settings";
export type Category = {
  id: string;
  name: string;
  color: string;
  icon: string;
  archived: boolean;
  kind: "needs" | "wants" | "savings";
};
export type Entry = {
  id: string;
  type: "income" | "expense" | "transfer" | "refund" | "internal";
  amount: number;
  date: string;
  description: string;
  categoryId: string;
  goalId?: string;
  recurringId?: string;
  sourceId?: string;
};
export type Goal = {
  id: string;
  name: string;
  target: number;
  date: string;
  archived: boolean;
  color: string;
  initialSaved?: number;
  description?: string;
  icon?: string;
  createdAt?: string;
};
export type Holding = {
  id: string;
  name: string;
  type: "cash" | "savings" | "investment" | "other" | "liability";
  currency: Currency;
  amount: number;
  updatedAt: string;
};
export type ExchangeRates = {
  date: string;
  fetchedAt: string;
  table: string;
  // PLN per currency unit, scaled by 100,000,000.
  rates: Partial<Record<Currency, number>>;
};
export type Recurring = {
  id: string;
  type: "income" | "expense";
  amount: number;
  description: string;
  categoryId: string;
  day: number;
};
export type Preset = {
  id: string;
  name: string;
  allocations: Record<string, number>;
};
export type Ledger = {
  categories: Category[];
  entries: Entry[];
  plans: Record<string, Record<string, number>>;
  goals: Goal[];
  recurring: Recurring[];
  presets: Preset[];
};
export type Data = {
  version: 1;
  name: string;
  language: Language;
  theme: "light" | "dark" | "system";
  currency: Currency;
  defaultPage: Page;
  onboarded: boolean;
  ledgers: Partial<Record<Currency, Ledger>>;
  holdings?: Holding[];
  exchangeRates?: ExchangeRates;
};
export const MAX_AMOUNT = 100_000_000_00;
export const colors = [
  "#2d6a50",
  "#a9be8c",
  "#d6a96a",
  "#b598bd",
  "#84acb6",
  "#db8e73",
  "#8e98ac",
  "#c5bc8b",
];
export const icons = [
  "home",
  "basket",
  "car",
  "sparkles",
  "bag",
  "leaf",
  "heart",
  "coffee",
  "plane",
  "book",
  "wallet",
  "gift",
];
export const uid = () => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  // LAN previews use HTTP, where browsers may only expose getRandomValues.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
};
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const thisMonth = () => today().slice(0, 7);
export function shiftMonth(month: string, step: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + step, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export const locale = (lang: Language) =>
  ({ pl: "pl-PL", en: "en-GB", uk: "uk-UA" })[lang];
export function money(
  amount: number,
  currency: Currency,
  lang: Language,
  decimals = true,
) {
  return new Intl.NumberFormat(locale(lang), {
    style: "currency",
    currency,
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(amount / 100);
}
// All persisted money uses safe integer minor units. Input rounds half up at the third decimal.
export function parseMoney(value: string): number {
  const v = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(v))
    throw new Error("Enter a valid positive amount.");
  const [whole, decimal = ""] = v.split(".");
  const amount =
    Number(whole) * 100 +
    Number(decimal.padEnd(2, "0").slice(0, 2)) +
    (Number(decimal[2] || 0) >= 5 ? 1 : 0);
  if (!Number.isSafeInteger(amount) || amount > MAX_AMOUNT)
    throw new Error("Amount is too large.");
  return amount;
}
export function percentAmount(income: number, percentage: string) {
  const basisPoints = parseMoney(percentage);
  if (basisPoints > 10000)
    throw new Error("Use a percentage between 0 and 100.");
  return Number((BigInt(income) * BigInt(basisPoints) + 5000n) / 10000n);
}
export function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum || !total) return weights.map(() => 0);
  const parts = weights.map((w) =>
    Number((BigInt(total) * BigInt(w)) / BigInt(sum)),
  );
  let remainder = total - parts.reduce((a, b) => a + b, 0);
  const order = weights
    .map((w, i) => ({ i, r: (BigInt(total) * BigInt(w)) % BigInt(sum) }))
    .sort((a, b) => (a.r > b.r ? -1 : a.r < b.r ? 1 : a.i - b.i));
  for (let j = 0; remainder > 0; j++, remainder--)
    parts[order[j % order.length].i]++;
  return parts;
}
export const emptyLedger = (): Ledger => ({
  categories: [],
  entries: [],
  plans: {},
  goals: [],
  recurring: [],
  presets: [],
});
export const initialData = (): Data => ({
  version: 1,
  name: "",
  language: "pl",
  theme: "dark",
  currency: "PLN",
  defaultPage: "overview",
  onboarded: false,
  ledgers: { PLN: emptyLedger() },
});
export const getLedger = (data: Data) =>
  data.ledgers[data.currency] || emptyLedger();
export const entriesFor = (ledger: Ledger, month: string) =>
  ledger.entries.filter((e) => e.date.startsWith(month));
export function summary(
  ledger: Ledger,
  month: string,
  plan = ledger.plans[month] || {},
) {
  const es = entriesFor(ledger, month);
  const sum = (type: Entry["type"]) =>
    es.filter((e) => e.type === type).reduce((s, e) => s + e.amount, 0);
  const income = sum("income"),
    spent = sum("expense") - sum("refund"),
    saved = sum("transfer"),
    allocated = Object.values(plan).reduce((a, b) => a + b, 0);
  return {
    income,
    spent,
    saved,
    allocated,
    unallocated: income - allocated,
    available: income - spent - saved,
    totalSaved:
      ledger.entries
        .filter((e) => e.type === "transfer")
        .reduce((s, e) => s + e.amount, 0) +
      ledger.goals.reduce((s, g) => s + (g.initialSaved || 0), 0),
  };
}
export function categorySpent(l: Ledger, month: string, id: string) {
  return entriesFor(l, month)
    .filter(
      (e) =>
        e.categoryId === id &&
        ["expense", "refund", "transfer"].includes(e.type),
    )
    .reduce((s, e) => s + (e.type === "refund" ? -e.amount : e.amount), 0);
}
export function savePlan(
  l: Ledger,
  month: string,
  plan: Record<string, number>,
) {
  if (
    Object.entries(plan).some(
      ([id, n]) =>
        !l.categories.some((c) => c.id === id) ||
        !Number.isSafeInteger(n) ||
        n < 0 ||
        n > MAX_AMOUNT,
    )
  )
    throw new Error("Invalid budget.");
  if (summary(l, month, plan).unallocated < 0)
    throw new Error("Your allocations exceed your income.");
  return { ...l, plans: { ...l.plans, [month]: { ...plan } } };
}
export function addCategory(l: Ledger, category: Category) {
  if (l.categories.length >= 100) throw new Error("Maximum 100 categories.");
  if (
    l.categories.some(
      (c) => c.name.trim().toLowerCase() === category.name.trim().toLowerCase(),
    )
  )
    throw new Error("This category already exists.");
  if (!category.name.trim()) throw new Error("Enter a name.");
  return { ...l, categories: [...l.categories, category] };
}
export function removeCategory(l: Ledger, id: string) {
  return {
    ...l,
    categories: l.categories.filter((c) => c.id !== id),
    entries: l.entries.map((e) =>
      e.categoryId === id ? { ...e, categoryId: "" } : e,
    ),
    recurring: l.recurring.map((e) =>
      e.categoryId === id ? { ...e, categoryId: "" } : e,
    ),
    plans: Object.fromEntries(
      Object.entries(l.plans).map(([m, p]) => [
        m,
        Object.fromEntries(Object.entries(p).filter(([k]) => k !== id)),
      ]),
    ),
    presets: l.presets.map((p) => ({
      ...p,
      allocations: Object.fromEntries(
        Object.entries(p.allocations).filter(([k]) => k !== id),
      ),
    })),
  };
}
export function recordEntry(l: Ledger, entry: Entry) {
  if (
    !["income", "expense", "transfer", "refund", "internal"].includes(
      entry.type,
    )
  )
    throw new Error("Invalid transaction type.");
  if (!entry.description.trim() || entry.description.length > 160)
    throw new Error("Enter a description.");
  if (
    !Number.isSafeInteger(entry.amount) ||
    entry.amount <= 0 ||
    entry.amount > MAX_AMOUNT
  )
    throw new Error("Enter an amount greater than zero.");
  if (!validDate(entry.date)) throw new Error("Choose a valid date.");
  if (entry.categoryId && !l.categories.some((c) => c.id === entry.categoryId))
    throw new Error("Choose a valid category.");
  const without = { ...l, entries: l.entries.filter((e) => e.id !== entry.id) };
  if (entry.type === "transfer") {
    if (!l.goals.some((g) => g.id === entry.goalId))
      throw new Error("Choose a savings goal.");
    if (summary(without, entry.date.slice(0, 7)).available < entry.amount)
      throw new Error("This contribution exceeds your available money.");
  }
  return { ...l, entries: [...without.entries, entry] };
}
export function applyRecurring(l: Ledger, month: string) {
  let next = { ...l, entries: [...l.entries] };
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  for (const r of l.recurring) {
    if (
      next.entries.some(
        (e) => e.recurringId === r.id && e.date.startsWith(month),
      )
    )
      continue;
    next = recordEntry(next, {
      ...r,
      id: uid(),
      recurringId: r.id,
      date: `${month}-${String(Math.min(last, r.day)).padStart(2, "0")}`,
    });
  }
  return next;
}
export function validDate(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !isNaN(Date.parse(v)) &&
    new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v
  );
}
const isObject = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
export function validateImport(input: unknown): Data {
  const fail = () => {
    throw new Error("The file is not a valid MONETA backup.");
  };
  if (!isObject(input)) return fail();
  const d = input as unknown as Data;
  if (
    d.version !== 1 ||
    !["pl", "en", "uk"].includes(d.language) ||
    !["light", "dark", "system"].includes(d.theme) ||
    !CURRENCIES.includes(d.currency) ||
    typeof d.name !== "string" ||
    d.name.length > 80 ||
    typeof d.onboarded !== "boolean" ||
    ![
      "overview",
      "budget",
      "transactions",
      "analytics",
      "goals",
      "portfolio",
      "settings",
    ].includes(d.defaultPage) ||
    !isObject(d.ledgers)
  )
    return fail();
  const amount = (n: unknown) =>
    typeof n === "number" &&
    Number.isSafeInteger(n) &&
    n >= 0 &&
    n <= MAX_AMOUNT;
  const str = (s: unknown, max = 160) =>
    typeof s === "string" && s.length <= max;
  const id = (s: unknown) =>
    str(s, 80) &&
    !!s &&
    s !== "__proto__" &&
    s !== "constructor" &&
    s !== "prototype";
  const unique = (a: { id: string }[]) =>
    new Set(a.map((x) => x.id)).size === a.length;
  for (const [currency, raw] of Object.entries(d.ledgers)) {
    if (!CURRENCIES.includes(currency as Currency) || !isObject(raw))
      return fail();
    const l = raw as unknown as Ledger;
    if (
      !Array.isArray(l.categories) ||
      !Array.isArray(l.entries) ||
      !Array.isArray(l.goals) ||
      !Array.isArray(l.recurring) ||
      !Array.isArray(l.presets) ||
      !isObject(l.plans) ||
      l.entries.length > 100000 ||
      l.categories.length > 100
    )
      return fail();
    if (
      l.categories.some(
        (c) =>
          !isObject(c) ||
          !id(c.id) ||
          !str(c.name) ||
          !c.name.trim() ||
          !/^#[a-fA-F0-9]{6}$/.test(c.color) ||
          !icons.includes(c.icon) ||
          typeof c.archived !== "boolean" ||
          !["needs", "wants", "savings"].includes(c.kind),
      ) ||
      !unique(l.categories)
    )
      return fail();
    if (
      new Set(l.categories.map((c) => c.name.trim().toLowerCase())).size !==
      l.categories.length
    )
      return fail();
    const cat = (c: unknown) =>
      c === "" || l.categories.some((x) => x.id === c);
    if (
      l.goals.some(
        (g) =>
          !isObject(g) ||
          !id(g.id) ||
          !str(g.name) ||
          !g.name.trim() ||
          !amount(g.target) ||
          g.target === 0 ||
          !(g.date === "" || validDate(g.date)) ||
          typeof g.archived !== "boolean" ||
          !/^#[a-fA-F0-9]{6}$/.test(g.color) ||
          (g.initialSaved !== undefined && !amount(g.initialSaved)) ||
          (g.description !== undefined && !str(g.description, 500)) ||
          (g.icon !== undefined && !icons.includes(g.icon)) ||
          (g.createdAt !== undefined && !validDate(g.createdAt)),
      ) ||
      !unique(l.goals)
    )
      return fail();
    if (
      l.entries.some(
        (e) =>
          !isObject(e) ||
          !id(e.id) ||
          !["income", "expense", "transfer", "refund", "internal"].includes(
            e.type,
          ) ||
          !amount(e.amount) ||
          !e.amount ||
          !validDate(e.date) ||
          !str(e.description) ||
          !cat(e.categoryId) ||
          (e.type === "transfer" && !l.goals.some((g) => g.id === e.goalId)) ||
          (e.recurringId !== undefined && !id(e.recurringId)) ||
          (e.sourceId !== undefined && !str(e.sourceId, 160)),
      ) ||
      !unique(l.entries)
    )
      return fail();
    const plan = (p: unknown) =>
      isObject(p) &&
      Object.entries(p).every(([k, v]) => cat(k) && k !== "" && amount(v));
    if (
      Object.entries(l.plans).some(
        ([m, p]) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(m) || !plan(p),
      )
    )
      return fail();
    if (
      l.recurring.some(
        (r) =>
          !isObject(r) ||
          !id(r.id) ||
          !["income", "expense"].includes(r.type) ||
          !amount(r.amount) ||
          !r.amount ||
          !str(r.description) ||
          !cat(r.categoryId) ||
          !Number.isInteger(r.day) ||
          r.day < 1 ||
          r.day > 31,
      ) ||
      !unique(l.recurring)
    )
      return fail();
    if (
      l.presets.some(
        (p) =>
          !isObject(p) || !id(p.id) || !str(p.name) || !plan(p.allocations),
      ) ||
      !unique(l.presets)
    )
      return fail();
  }
  if (
    d.holdings !== undefined &&
    (!Array.isArray(d.holdings) ||
      d.holdings.length > 1000 ||
      d.holdings.some(
        (h) =>
          !isObject(h) ||
          !id(h.id) ||
          !str(h.name) ||
          !h.name.trim() ||
          !["cash", "savings", "investment", "other", "liability"].includes(
            h.type,
          ) ||
          !CURRENCIES.includes(h.currency) ||
          !amount(h.amount) ||
          !str(h.updatedAt, 40) ||
          isNaN(Date.parse(h.updatedAt)),
      ) ||
      !unique(d.holdings))
  )
    return fail();
  if (d.exchangeRates !== undefined) {
    const r = d.exchangeRates;
    if (
      !isObject(r) ||
      !validDate(r.date) ||
      !str(r.table, 80) ||
      !str(r.fetchedAt, 40) ||
      isNaN(Date.parse(r.fetchedAt)) ||
      !isObject(r.rates) ||
      r.rates.PLN !== 100000000 ||
      Object.entries(r.rates).some(
        ([c, n]) =>
          !CURRENCIES.includes(c as Currency) ||
          !Number.isSafeInteger(n) ||
          n <= 0 ||
          n > 1000000000000,
      )
    )
      return fail();
  }
  return structuredClone(d);
}
export function csvExport(l: Ledger) {
  const escape = (s: string) =>
    `"${(/^[=+@\-\t\r]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"`;
  return (
    "\uFEFF" +
    [
      "date,type,description,category,amount",
      ...l.entries.map((e) =>
        [
          e.date,
          e.type,
          e.description,
          l.categories.find((c) => c.id === e.categoryId)?.name || "",
          (e.amount / 100).toFixed(2),
        ]
          .map(escape)
          .join(","),
      ),
    ].join("\r\n")
  );
}
export function starterCategories(lang: Language): Category[] {
  const names = {
    pl: [
      "Mieszkanie",
      "Jedzenie",
      "Transport",
      "Przyjemności",
      "Zakupy",
      "Oszczędności",
    ],
    en: ["Housing", "Food", "Transport", "Lifestyle", "Shopping", "Savings"],
    uk: [
      "Житло",
      "Харчування",
      "Транспорт",
      "Дозвілля",
      "Покупки",
      "Заощадження",
    ],
  }[lang];
  return names.map((name, i) => ({
    id: uid(),
    name,
    color: colors[i],
    icon: icons[i],
    archived: false,
    kind: i < 3 ? "needs" : i === 5 ? "savings" : "wants",
  }));
}
export function presetPlan(l: Ledger, income: number, kind: string) {
  const cats = l.categories.filter((c) => !c.archived);
  const proportions =
    kind === "savings"
      ? [45, 20, 35]
      : kind === "essentials"
        ? [65, 20, 15]
        : [50, 30, 20];
  const buckets = distribute(income, proportions);
  const plan: Record<string, number> = {};
  (["needs", "wants", "savings"] as const).forEach((k, i) => {
    const group = cats.filter((c) => c.kind === k);
    distribute(
      buckets[i],
      group.map(() => 1),
    ).forEach((n, j) => (plan[group[j].id] = n));
  });
  return plan;
}
export function demoData(lang: Language): Data {
  const d = initialData();
  d.language = lang;
  d.name = lang === "pl" ? "Ola" : lang === "uk" ? "Оля" : "Alex";
  d.onboarded = true;
  const l = emptyLedger();
  l.categories = starterCategories(lang);
  const month = thisMonth();
  for (let i = 5; i >= 0; i--) {
    const m = shiftMonth(month, -i);
    l.entries.push({
      id: uid(),
      type: "income",
      date: m + "-01",
      amount: 850000,
      description:
        lang === "pl" ? "Wynagrodzenie" : lang === "uk" ? "Зарплата" : "Salary",
      categoryId: "",
    });
    l.plans[m] = Object.fromEntries(
      l.categories.map((c, j) => [
        c.id,
        [260000, 120000, 50000, 80000, 60000, 150000][j],
      ]),
    );
    const expenses = [
      ["Rent", 260000, 0, 1],
      ["Lidl", 18645, 1, 2],
      ["Spotify", 2399, 3, 2],
      ["Coffee", 1800, 3, 3],
      ["Zara", 12990, 4, 3],
      ["Orlen", 16000, 2, 3],
    ] as const;
    for (const [desc, n, c, day] of expenses)
      l.entries.push({
        id: uid(),
        type: "expense",
        amount: Math.round(n * (i ? 1 + i * 0.03 : 1)),
        date: `${m}-${String(day).padStart(2, "0")}`,
        description:
          desc === "Rent"
            ? lang === "pl"
              ? "Czynsz"
              : lang === "uk"
                ? "Оренда"
                : "Rent"
            : desc,
        categoryId: l.categories[c].id,
      });
  }
  l.goals = [
    {
      id: uid(),
      name:
        lang === "pl"
          ? "Poduszka finansowa"
          : lang === "uk"
            ? "Резервний фонд"
            : "Emergency fund",
      target: 2000000,
      date: "",
      archived: false,
      color: colors[0],
    },
    {
      id: uid(),
      name:
        lang === "pl"
          ? "Włoskie wakacje"
          : lang === "uk"
            ? "Відпустка в Італії"
            : "Italian summer",
      target: 800000,
      date: "2027-06-01",
      archived: false,
      color: colors[2],
    },
  ];
  for (let i = 5; i >= 0; i--)
    l.entries.push({
      id: uid(),
      type: "transfer",
      amount: 100000,
      date: shiftMonth(month, -i) + "-02",
      description: l.goals[0].name,
      categoryId: l.categories[5].id,
      goalId: l.goals[0].id,
    });
  l.entries.push({
    id: uid(),
    type: "transfer",
    amount: 180000,
    date: shiftMonth(month, -1) + "-03",
    description: l.goals[1].name,
    categoryId: l.categories[5].id,
    goalId: l.goals[1].id,
  });
  d.ledgers.PLN = l;
  return d;
}
