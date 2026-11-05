import {
  CURRENCIES,
  emptyLedger,
  parseMoney,
  recordEntry,
  uid,
  validDate,
  type Currency,
  type Data,
  type Entry,
  type Ledger,
} from "./engine";
export type ImportRow = {
  id: string;
  date: string;
  description: string;
  amount: string;
  currency: string;
  type: string;
  categoryId: string;
  sourceId: string;
  include: boolean;
  allowDuplicate: boolean;
  reviewed: boolean;
};
export const importFields = [
  "date",
  "description",
  "amount",
  "currency",
  "type",
  "category",
  "sourceId",
] as const;
export type ImportField = (typeof importFields)[number];
export type ColumnMap = Record<ImportField, number>;
export const newImportRow = (currency: Currency): ImportRow => ({
  id: uid(),
  date: "",
  description: "",
  amount: "",
  currency,
  type: "",
  categoryId: "",
  sourceId: "",
  include: true,
  allowDuplicate: false,
  reviewed: false,
});
export function parseCSV(text: string): string[][] {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/)[0];
  const delimiters = [",", ";", "\t"];
  const count = (d: string) => {
    let quoted = false,
      n = 0;
    for (const c of firstLine) {
      if (c === '"') quoted = !quoted;
      else if (c === d && !quoted) n++;
    }
    return n;
  };
  const delimiter = delimiters.sort((a, b) => count(b) - count(a))[0];
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false,
    closed = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else value += c;
    } else if (c === '"') {
      if (value || closed) throw new Error("Malformed CSV quoting.");
      quoted = true;
    } else if (c === delimiter) {
      row.push(value);
      value = "";
      closed = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(value);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      value = "";
      closed = false;
    } else {
      if (closed && c.trim()) throw new Error("Malformed CSV quoting.");
      if (!closed) value += c;
    }
  }
  if (quoted) throw new Error("Malformed CSV quoting.");
  row.push(value);
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows.length < 2 || rows.length > 5001)
    throw new Error("Import between 1 and 5000 transactions.");
  if (rows.some((r) => r.length !== rows[0].length))
    throw new Error("CSV rows have inconsistent columns.");
  return rows;
}
const normalized = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9\u0400-\u04ff]/g, "");
export function guessColumns(headers: string[]): ColumnMap {
  const names: Record<ImportField, string[]> = {
    date: ["date", "data", "datatransakcji", "bookingdate", "дата"],
    description: [
      "description",
      "opis",
      "merchant",
      "title",
      "tytul",
      "nazwa",
      "опис",
    ],
    amount: ["amount", "kwota", "wartosc", "сума"],
    currency: ["currency", "waluta", "валюта"],
    type: ["type", "typ", "direction", "rodzaj", "тип"],
    category: ["category", "kategoria", "категорія"],
    sourceId: ["id", "sourceid", "transactionid"],
  };
  return Object.fromEntries(
    importFields.map((f) => [
      f,
      headers.findIndex((h) => names[f].includes(normalized(h))),
    ]),
  ) as ColumnMap;
}
export function importDate(value: string, order: "DMY" | "MDY" = "DMY") {
  const v = value.trim();
  if (validDate(v)) return v;
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(v);
  if (!m) return v;
  const result = `${m[3]}-${(order === "DMY" ? m[2] : m[1]).padStart(2, "0")}-${(order === "DMY" ? m[1] : m[2]).padStart(2, "0")}`;
  return validDate(result) ? result : v;
}
export function importAmount(raw: string) {
  let v = raw
    .trim()
    .replace(/\u2212/g, "-")
    .replace(/\s/g, "");
  const negative = v.startsWith("-") || /^\(.*\)$/.test(v);
  v = v.replace(/^[-+]/, "").replace(/^\((.*)\)$/, "$1");
  if (v.includes(",") && v.includes(".")) {
    const decimal = v.lastIndexOf(",") > v.lastIndexOf(".") ? "," : ".";
    const group = decimal === "," ? "." : ",";
    const [whole, fraction] = v.split(decimal);
    if (
      !/^\d{1,3}([.,]\d{3})+$/.test(whole) ||
      !/^\d{1,2}$/.test(fraction || "")
    )
      throw new Error("Invalid imported amount.");
    v = whole.split(group).join("") + "." + fraction;
  } else {
    // Single 3-digit separator is ambiguous (1,234); require manual correction.
    if (/[.,]\d{3}$/.test(v))
      throw new Error(
        "Ambiguous decimal separator. Enter an amount with two decimals.",
      );
    v = v.replace(",", ".");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(v)) throw new Error("Invalid imported amount.");
  return { amount: parseMoney(v), negative };
}
function detectType(value: string, amount: string) {
  const v = normalized(value);
  if (["income", "przychod", "dochod", "credit", "дохід"].includes(v))
    return "income";
  if (["expense", "wydatek", "debit", "витрата"].includes(v)) return "expense";
  if (["refund", "zwrot", "повернення"].includes(v)) return "refund";
  if (["internal", "transfer", "przelew", "переказ"].includes(v))
    return "internal";
  if (v) return "";
  return /^\s*[-−(]/.test(amount)
    ? "expense"
    : /^\s*\+/.test(amount)
      ? "income"
      : "";
}
export function suggestCategory(
  description: string,
  ledger: Ledger,
  provided = "",
) {
  const categories = ledger.categories.filter((c) => !c.archived);
  if (provided)
    return (
      categories.find((c) => normalized(c.name) === normalized(provided))?.id ||
      ""
    );
  const rules: [RegExp, string[]][] = [
    [
      /\b(zabka|lidl|biedronka|aldi)\b/,
      ["jedzenie", "food", "groceries", "харчування"],
    ],
    [/\b(uber|bolt|orlen)\b/, ["transport", "транспорт"]],
    [/\b(netflix|spotify)\b/, ["subskrypcje", "subscriptions", "підписки"]],
    [/\bsteam\b/, ["rozrywka", "entertainment", "дозвілля"]],
  ];
  const text = description
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const match = rules.find(([pattern]) => pattern.test(text));
  return match
    ? categories.find((c) =>
        match[1].map(normalized).includes(normalized(c.name)),
      )?.id || ""
    : "";
}
export function mappedRows(
  csv: string[][],
  mapping: ColumnMap,
  data: Data,
  order: "DMY" | "MDY",
) {
  return csv.slice(1).map((values) => {
    const get = (f: ImportField) => values[mapping[f]]?.trim() || "";
    const currency = (get("currency") || data.currency).toUpperCase();
    const row = {
      ...newImportRow(data.currency),
      date: importDate(get("date"), order),
      description: get("description"),
      amount: get("amount"),
      currency,
      type: detectType(get("type"), get("amount")),
      sourceId: get("sourceId"),
      reviewed: true,
    };
    row.categoryId = suggestCategory(
      row.description,
      data.ledgers[currency as Currency] || emptyLedger(),
      get("category"),
    );
    return row;
  });
}
export function jsonRows(text: string, data: Data) {
  const input = JSON.parse(text);
  if (
    !input ||
    input.schema !== "moneta-transactions-v1" ||
    !Array.isArray(input.transactions) ||
    !input.transactions.length ||
    input.transactions.length > 5000
  )
    throw new Error("Use the moneta-transactions-v1 JSON schema.");
  return input.transactions.map((v: Record<string, unknown>) => {
    if (
      !v ||
      typeof v !== "object" ||
      typeof v.date !== "string" ||
      typeof v.description !== "string" ||
      typeof v.amount !== "string" ||
      typeof v.currency !== "string" ||
      typeof v.type !== "string" ||
      (v.sourceId !== undefined && typeof v.sourceId !== "string") ||
      (v.category !== undefined && typeof v.category !== "string")
    )
      throw new Error("Invalid JSON transaction fields.");
    const row: ImportRow = {
      ...newImportRow(data.currency),
      date: v.date,
      description: v.description,
      amount: v.amount,
      currency: v.currency,
      type: detectType(v.type, v.amount),
      sourceId: String(v.sourceId || ""),
      reviewed: true,
    };
    row.categoryId = suggestCategory(
      row.description,
      data.ledgers[row.currency as Currency] || emptyLedger(),
      String(v.category || ""),
    );
    return row;
  });
}
export function rowEntry(row: ImportRow): Entry {
  if (!validDate(row.date)) throw new Error("Choose a valid date.");
  if (!CURRENCIES.includes(row.currency as Currency))
    throw new Error("Choose a supported currency.");
  if (!["income", "expense", "refund", "internal"].includes(row.type))
    throw new Error("Choose a transaction type.");
  if (!row.description.trim() || row.description.length > 160)
    throw new Error("Enter a description.");
  const { amount } = importAmount(row.amount);
  if (!amount) throw new Error("Enter an amount greater than zero.");
  if (row.sourceId.length > 160)
    throw new Error("Source identifier is too long.");
  return {
    id: row.id,
    date: row.date,
    description: row.description.trim(),
    amount,
    type: row.type as Entry["type"],
    categoryId:
      row.type === "income" || row.type === "internal" ? "" : row.categoryId,
    ...(row.sourceId ? { sourceId: row.sourceId } : {}),
  };
}
export function duplicateKind(
  entry: Entry,
  ledger: Ledger,
): "source" | "possible" | null {
  return duplicateIndex(ledger).kind(entry);
}
export function duplicateIndex(ledger: Ledger) {
  const fingerprint = (e: Entry) =>
    `${e.date}|${e.amount}|${e.type}|${normalized(e.description)}`;
  const sources = new Set(
    ledger.entries.map((e) => e.sourceId).filter(Boolean),
  );
  const fingerprints = new Set(ledger.entries.map(fingerprint));
  const ids = new Set(ledger.entries.map((e) => e.id));
  return {
    kind(entry: Entry): "source" | "possible" | null {
      return entry.sourceId && sources.has(entry.sourceId)
        ? "source"
        : fingerprints.has(fingerprint(entry))
          ? "possible"
          : null;
    },
    hasId(id: string) {
      return ids.has(id);
    },
    add(entry: Entry) {
      if (entry.sourceId) sources.add(entry.sourceId);
      fingerprints.add(fingerprint(entry));
      ids.add(entry.id);
    },
  };
}
export function commitImport(data: Data, rows: ImportRow[]) {
  if (!rows.some((r) => r.include))
    throw new Error("Select transactions to import.");
  const next = { ...data, ledgers: { ...data.ledgers } };
  const pending = new Map<
    Currency,
    {
      ledger: Ledger;
      index: ReturnType<typeof duplicateIndex>;
      entries: Entry[];
    }
  >();
  for (const row of rows.filter((r) => r.include)) {
    if (!row.reviewed)
      throw new Error("Review each extracted row before importing.");
    const e = rowEntry(row);
    const currency = row.currency as Currency;
    let batch = pending.get(currency);
    if (!batch) {
      const ledger = data.ledgers[currency] || emptyLedger();
      batch = { ledger, index: duplicateIndex(ledger), entries: [] };
      pending.set(currency, batch);
    }
    const duplicate = batch.index.kind(e);
    if (
      batch.index.hasId(e.id) ||
      duplicate === "source" ||
      (duplicate === "possible" && !row.allowDuplicate)
    )
      throw new Error("Resolve duplicate transactions before importing.");
    if (batch.ledger.entries.length + batch.entries.length >= 100000)
      throw new Error("Too many transactions.");
    // Validate using the existing command, without copying an entire ledger per row.
    recordEntry({ ...batch.ledger, entries: [] }, e);
    batch.entries.push(e);
    batch.index.add(e);
  }
  for (const [currency, batch] of pending) {
    next.ledgers[currency] = {
      ...batch.ledger,
      entries: [...batch.ledger.entries, ...batch.entries],
    };
  }
  return next;
}
// OCR is a suggestion, never a confirmed transaction. Every row requires review.
export function ocrRows(text: string, data: Data): ImportRow[] {
  let date = "",
    previous = "";
  const rows: ImportRow[] = [];
  for (const line of text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    const dateMatch = line.match(
      /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{4})\b/,
    );
    if (dateMatch) date = importDate(dateMatch[0]);
    const cleaned = line.replace(dateMatch?.[0] || "\0", "");
    const amountMatch = cleaned.match(
      /([+−-]?\s*\d+(?:[ \u00a0]\d{3})*[.,]\d{2})\s*(PLN|EUR|USD|UAH|GBP|zł|€|\$|£|₴)?\s*$/i,
    );
    if (amountMatch) {
      const currency =
        (
          { zł: "PLN", "€": "EUR", $: "USD", "£": "GBP", "₴": "UAH" } as Record<
            string,
            string
          >
        )[amountMatch[2]] ||
        amountMatch[2]?.toUpperCase() ||
        "";
      const description =
        cleaned.slice(0, amountMatch.index).trim() || previous;
      rows.push({
        ...newImportRow(data.currency),
        date,
        description,
        amount: amountMatch[1],
        currency,
        type: detectType("", amountMatch[1]),
        categoryId: suggestCategory(
          description,
          data.ledgers[currency as Currency] || emptyLedger(),
        ),
      });
      previous = "";
    } else if (!dateMatch) previous = line;
  }
  return rows;
}
