import {
  CURRENCIES,
  emptyLedger,
  today,
  validDate,
  type Currency,
  type Data,
} from "../../engine";
import {
  newImportRow,
  suggestCategory,
  type ImportRow,
} from "./transactionImport";

export type TextBox = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type DocumentText = { text: string; boxes?: TextBox[] };
export type RecognitionOptions = {
  year?: number;
  currency?: string;
  now?: string;
};
const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .toLowerCase();
const months = [
  ["sty", "stycznia", "jan", "january", "січ", "січня"],
  ["lut", "lutego", "feb", "february", "лют", "лютого"],
  ["mar", "marca", "march", "бер", "березня"],
  ["kwi", "kwietnia", "apr", "april", "кві", "квітня"],
  ["maj", "maja", "may", "тра", "травня"],
  ["cze", "czerwca", "jun", "june", "чер", "червня"],
  ["lip", "lipca", "jul", "july", "лип", "липня"],
  ["sie", "sierpnia", "aug", "august", "сер", "серпня"],
  ["wrz", "wrzesnia", "sep", "sept", "september", "вер", "вересня"],
  ["paz", "pazdziernika", "oct", "october", "жов", "жовтня"],
  ["lis", "listopada", "nov", "november", "лис", "листопада"],
  ["gru", "grudnia", "dec", "december", "гру", "грудня"],
];
const namedDate = new RegExp(
  `\\b(\\d{1,2})\\s+(${months.flat().join("|")})\\.?(?:\\s+(20\\d{2}|19\\d{2}))?(?![a-zа-яіїє])`,
  "iu",
);
export function recognizedDate(text: string, options: RecognitionOptions = {}) {
  const normalized = plain(text);
  const now = options.now || today();
  const relative =
    /\b(today|dzisiaj|dzis|yesterday|wczoraj)\b|сьогодні|вчора/i.exec(
      normalized,
    );
  if (relative) {
    const d = new Date(now + "T12:00:00");
    if (/yesterday|wczoraj|вчора/.test(relative[0])) d.setDate(d.getDate() - 1);
    return {
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      start: relative.index,
      length: relative[0].length,
      inferred: false,
    };
  }
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(normalized);
  const numeric = /\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/.exec(normalized);
  const named = namedDate.exec(normalized);
  const m = iso || numeric || named;
  if (!m) return null;
  const year = iso
    ? m[1]
    : m[3] || String(options.year || Number(now.slice(0, 4)));
  const month = iso
    ? m[2]
    : numeric
      ? m[2]
      : String(months.findIndex((names) => names.includes(m[2])) + 1);
  const day = iso ? m[3] : m[1];
  const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return {
    date: validDate(date) ? date : "",
    start: m.index,
    length: m[0].length,
    inferred: !iso && !numeric && !m[3],
  };
}

export function visualLines(boxes: TextBox[]) {
  const lines: { y: number; height: number; boxes: TextBox[]; text: string }[] =
    [];
  for (const b of [...boxes]
    .filter((b) => b.text.trim())
    .sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = lines.find(
      (l) =>
        Math.abs(l.y - b.y) <= Math.max(1, Math.min(l.height, b.height) * 0.45),
    );
    if (line) line.boxes.push(b);
    else lines.push({ y: b.y, height: b.height, boxes: [b], text: "" });
  }
  for (const line of lines) {
    line.boxes.sort((a, b) => a.x - b.x);
    line.text = line.boxes.map((b) => b.text).join(" ");
  }
  return lines;
}
const currencyCode = (s: string) =>
  ({ zł: "PLN", zl: "PLN", "€": "EUR", $: "USD", "£": "GBP", "₴": "UAH" })[
    s.toLowerCase()
  ] || s.toUpperCase();
const codePattern =
  "PLN|EUR|USD|UAH|GBP|HUF|AED|CHF|CZK|RON|SEK|NOK|DKK|zł|zl|€|\\$|£|₴";
export function recognizedAmounts(text: string) {
  const number = "\\d+(?:[ \\u00a0.,]\\d{3})*(?:[.,]\\d{2})?";
  // Integers are accepted only next to an explicit currency; dates/times are not money.
  const re = new RegExp(
    `([+−–-]?\\s*(?:${codePattern})\\s*[+−–-]?\\s*${number}|[+−–-]?\\s*${number}(?=\\s*(?:${codePattern}))|[+−–-]?\\s*\\d+(?:[ \\u00a0.,]\\d{3})*[.,]\\d{2})\\s*(${codePattern})?`,
    "gi",
  );
  return [...text.matchAll(re)].map((m) => {
    const code = m[2] || m[1].match(new RegExp(codePattern, "i"))?.[0] || "";
    return {
      amount: m[1]
        .replace(new RegExp(codePattern, "gi"), "")
        .replace(/[−–]/g, "-")
        .trim(),
      currency: code ? currencyCode(code) : "",
      start: m.index!,
      end: m.index! + m[0].length,
    };
  });
}
function makeRow(data: Data, fields: Partial<ImportRow>): ImportRow {
  const row = { ...newImportRow(data.currency), ...fields };
  row.categoryId = suggestCategory(
    row.description,
    data.ledgers[row.currency as Currency] || emptyLedger(),
  );
  return row;
}

// Geometry distinguishes debit/credit and balance; never infer an amount from the last column.
export function revolutRows(doc: DocumentText, data: Data): ImportRow[] | null {
  if (!/revolut/i.test(doc.text) || !/wyci[aą]g|statement/i.test(doc.text))
    return null;
  const currency =
    /(?:wyci[aą]g|statement)\s+([A-Z]{3})/i
      .exec(doc.text)?.[1]
      ?.toUpperCase() ||
    /([A-Z]{3})\s+statement/i.exec(doc.text)?.[1]?.toUpperCase() ||
    "";
  const lines = doc.boxes?.length
    ? visualLines(doc.boxes)
    : doc.text
        .split(/\r?\n/)
        .map((text) => ({ text, boxes: [] as TextBox[], y: 0, height: 10 }));
  const rows: ImportRow[] = [];
  let columns: {
    desc: number;
    out: number;
    incoming: number;
    balance: number;
  } | null = null;
  let inTable = false,
    pending = false,
    previous: ImportRow | undefined;
  let descriptionHeight = 0;
  for (const line of lines) {
    const t = plain(line.text);
    if (/przetwarzane od|pending from|pending transactions/.test(t)) {
      pending = true;
      inTable = false;
      previous = undefined;
    }
    if (/transakcje na koncie|account transactions/.test(t)) {
      pending = false;
      inTable = false;
      previous = undefined;
    }
    if (/zglos kradziez|report.*lost|revolut bank.*licenc|©/.test(t)) {
      inTable = false;
      previous = undefined;
    }
    if (
      /^(data|date)\b/.test(t) &&
      /opis|description/.test(t) &&
      /wydatki|money out/.test(t)
    ) {
      if (/data rozpoczecia|date started|started date/.test(t)) pending = true;
      inTable = true;
      previous = undefined;
      const words = line.boxes.flatMap((b) => {
        const pieces = [...b.text.matchAll(/\S+/g)];
        return pieces.map((m) => ({
          text: plain(m[0]),
          x: b.x + (m.index! / b.text.length) * b.width,
        }));
      });
      const desc = words.find((b) => /^(opis|description)$/.test(b.text))?.x;
      const columnX = (polish: string, english: string) => {
        const i = words.findIndex(
          (b) => b.text === polish || b.text === english,
        );
        return i < 0
          ? undefined
          : words[i - 1]?.text === "money"
            ? words[i - 1].x
            : words[i].x;
      };
      const out = columnX("wydatki", "out");
      const incoming = columnX("wplywy", "in");
      const balance = words.find((b) => /^(saldo|balance)$/.test(b.text))?.x;
      columns =
        desc !== undefined && out !== undefined && incoming !== undefined
          ? { desc, out, incoming, balance: balance ?? Infinity }
          : null;
      continue;
    }
    if (!inTable) continue;
    const date = recognizedDate(line.text);
    if (date && date.start < 3) {
      previous = undefined;
      const all = recognizedAmounts(line.text);
      if (!all.length) continue;
      let money = all[0],
        direction = "",
        description = line.text.slice(date.length, money.start).trim();
      if (columns) {
        const { desc, out, incoming, balance } = columns;
        const margin = line.height * 0.7;
        const debit = recognizedAmounts(
          line.boxes
            .filter((b) => b.x >= out - margin && b.x < incoming - margin)
            .map((b) => b.text)
            .join(" "),
        );
        const credit = recognizedAmounts(
          line.boxes
            .filter(
              (b) => b.x >= incoming - margin && b.x < (incoming + balance) / 2,
            )
            .map((b) => b.text)
            .join(" "),
        );
        // Both populated is ambiguous; leave type empty for explicit correction.
        if (debit.length === 1 && !credit.length) {
          money = debit[0];
          direction = "expense";
        }
        if (credit.length === 1 && !debit.length) {
          money = credit[0];
          direction = "income";
        }
        description = line.boxes
          .filter((b) => b.x >= desc - margin && b.x < out - margin)
          .map((b) => b.text)
          .join(" ")
          .trim();
      }
      const exchange = /wymiana na|exchanged to/i.test(description);
      const topup = /zasilenie|top.?up/i.test(description);
      const transfer = /przelew|transfer/i.test(description);
      const row = makeRow(data, {
        date: date.date,
        description,
        amount: money.amount,
        currency: currency || money.currency,
        type: exchange || topup ? "internal" : direction,
        sourceDirection:
          direction === "expense"
            ? "out"
            : direction === "income"
              ? "in"
              : undefined,
        include:
          !pending &&
          CURRENCIES.includes((currency || money.currency) as Currency),
        notes: [
          pending ? "Pending transaction — excluded" : "",
          exchange || topup || transfer
            ? "Check whether this is a transfer between your own accounts"
            : "",
          !columns ? "Column layout unavailable — check direction" : "",
        ].filter(Boolean),
        sourceText: line.text,
      });
      rows.push(row);
      previous = row;
      descriptionHeight = line.height;
    } else if (
      previous &&
      columns &&
      !/^(do:|od:|to:|from:|karta:|card:|dane referencyjne:|reference:|kurs |exchange rate)/.test(
        t,
      )
    ) {
      const continuation = line.boxes
        .filter(
          (b) =>
            b.x >= columns!.desc - line.height * 0.7 &&
            b.x < columns!.out - line.height * 0.7 &&
            b.height >= descriptionHeight * 0.85,
        )
        .map((b) => b.text)
        .join(" ");
      if (
        continuation &&
        !recognizedAmounts(continuation).length &&
        previous.description.length + continuation.length < 160
      )
        previous.description += " " + continuation;
    }
  }
  return rows;
}

export function screenshotRows(
  doc: DocumentText,
  data: Data,
  options: RecognitionOptions = {},
): ImportRow[] {
  const lines = doc.boxes?.length
    ? visualLines(doc.boxes).map((l) => l.text)
    : doc.text.split(/\r?\n/);
  const rows: ImportRow[] = [];
  let date = "",
    inferred = false,
    previous = "";
  const headerCurrency =
    /(?:personal|osobiste|konto|account|waluta|currency)\s*[·:|-]?\s*(PLN|EUR|USD|UAH|GBP)\b/i
      .exec(doc.text)?.[1]
      ?.toUpperCase();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (
      /^(pending|declined|failed|reverted|przetwarzana|oczekuj[aą]ca|odrzucona|cofni[eę]ta|insufficient balance)$/i.test(
        line,
      ) &&
      rows.length
    ) {
      rows[rows.length - 1].include = false;
      rows[rows.length - 1].notes = [
        ...(rows[rows.length - 1].notes || []),
        "Uncompleted transaction — excluded",
      ];
      continue;
    }
    const found = recognizedDate(line, options);
    if (found) {
      date = found.date;
      inferred = found.inferred;
    }
    const cleaned = found
      ? line.slice(0, found.start) + line.slice(found.start + found.length)
      : line;
    const amounts = recognizedAmounts(cleaned);
    if (!amounts.length) {
      if (
        !found &&
        !/^(completed|zrealizowan|card|karta|do:|od:|kurs|exchange rate)/i.test(
          line,
        )
      )
        previous = line;
      continue;
    }
    // Ignore totals, FX details, balances and a second converted amount under a card payment.
    if (
      /saldo|balance|razem|total|kurs |exchange rate|wydano w|spent this|available|dostepne/i.test(
        plain(line),
      )
    )
      continue;
    const money = amounts[0];
    const before = cleaned
      .slice(0, money.start)
      .replace(/\b\d{1,2}:\d{2}\b/g, "")
      .replace(/^[\s,·|]+|[\s,·|]+$/g, "");
    let description = before || previous;
    if (!description || (!before && !previous && !found)) continue;
    const excluded =
      /declined|failed|reverted|pending|odrzucon|cofniet|przetwarzan|oczekuj|insufficient balance/i.test(
        plain(line + " " + previous),
      );
    description = description
      .replace(
        /\b(completed|zrealizowan[ayoe]?|pending|oczekuj[aą]c[ay])\b/gi,
        "",
      )
      .trim();
    const type = /^\s*-/.test(money.amount)
      ? "expense"
      : /^\s*\+/.test(money.amount)
        ? "income"
        : "";
    const fallbackCurrency = headerCurrency || options.currency || "";
    rows.push(
      makeRow(data, {
        date,
        description,
        amount: money.amount,
        currency: money.currency || fallbackCurrency,
        type:
          /zwrot|refund/i.test(description) && type === "income"
            ? "refund"
            : type,
        include: !excluded,
        sourceText: line,
        notes: [
          inferred ? "Year taken from import settings" : "",
          !money.currency && fallbackCurrency
            ? "Currency taken from import settings"
            : "",
          excluded ? "Uncompleted transaction — excluded" : "",
          amounts.length > 1
            ? "Several amounts found — check the transaction amount"
            : "",
        ].filter(Boolean),
      }),
    );
    previous = "";
  }
  return rows;
}

export function recognizeDocument(
  doc: DocumentText,
  data: Data,
  options: RecognitionOptions = {},
) {
  return revolutRows(doc, data) ?? screenshotRows(doc, data, options);
}
