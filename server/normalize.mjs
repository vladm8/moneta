import { hash } from "./store.mjs";

export const supportedCurrencies = ["PLN", "EUR", "USD", "UAH", "GBP"];
export function minor(value) {
  if (!/^-?\d+(\.\d{1,2})?$/.test(String(value))) return null;
  const [whole, fraction = ""] = String(value).replace("-", "").split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) && result <= 10000000000
    ? result * (String(value).startsWith("-") ? -1 : 1)
    : null;
}
const iban = (value) => value?.iban?.replace(/\s/g, "").toUpperCase();
export function normalizeTransactions(rows, account, accounts) {
  const occurrences = new Map();
  const own = new Set(
    accounts.map((a) => iban(a.details.account_id)).filter(Boolean),
  );
  return rows.map((raw) => {
    const amount = minor(raw.transaction_amount?.amount),
      currency = raw.transaction_amount?.currency;
    const direction = raw.credit_debit_indicator;
    const date =
      raw.booking_date || raw.value_date || raw.transaction_date || "";
    const counterparty =
      direction === "DBIT" ? raw.creditor?.name : raw.debtor?.name;
    const description = (
      [counterparty, ...(raw.remittance_information || [])]
        .filter(Boolean)
        .join(" · ") || "Transakcja bankowa"
    ).slice(0, 160);
    const other = iban(
      direction === "DBIT" ? raw.creditor_account : raw.debtor_account,
    );
    const internal = !!other && own.has(other);
    // Never use transaction_id: the provider explicitly documents it as unstable.
    const fingerprint = hash(
      JSON.stringify([
        date,
        amount,
        currency,
        direction,
        description,
        raw.reference_number || "",
      ]),
    );
    const occurrence = (occurrences.get(fingerprint) || 0) + 1;
    occurrences.set(fingerprint, occurrence);
    const id = hash(
      `${account.id}:${raw.entry_reference ? `ref:${raw.entry_reference}` : `fallback:${fingerprint}:${occurrence}`}`,
    );
    const valid =
      amount !== null &&
      amount > 0 &&
      supportedCurrencies.includes(currency) &&
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      !isNaN(Date.parse(date)) &&
      new Date(date + "T12:00:00Z").toISOString().slice(0, 10) === date &&
      ["CRDT", "DBIT"].includes(direction);
    const refund =
      direction === "CRDT" && /\b(refund|zwrot|reversal)\b/i.test(description);
    return {
      id,
      accountId: account.id,
      amount,
      currency,
      date,
      description,
      status: raw.status,
      type: internal
        ? "internal"
        : refund
          ? "refund"
          : direction === "DBIT"
            ? "expense"
            : "income",
      stable: !!raw.entry_reference,
      valid,
      note: String(raw.note || "").slice(0, 500),
      review:
        !valid ||
        !raw.entry_reference ||
        (!internal && (!!other || direction === "CRDT")),
      merchantCode: raw.merchant_category_code || "",
    };
  });
}

export function mergeTransactions(existing, incoming, accountId, from, to) {
  // Pending rows are a snapshot, never posted to the ledger. Booked rows are retained.
  const result = new Map(
    existing
      .filter(
        (t) =>
          t.accountId !== accountId ||
          t.status === "BOOK" ||
          t.date < from ||
          t.date > to,
      )
      .map((t) => [t.id, t]),
  );
  const same = (a, b) =>
    a.accountId === b.accountId &&
    a.date === b.date &&
    a.amount === b.amount &&
    a.currency === b.currency &&
    a.description === b.description &&
    a.type === b.type;
  for (let t of incoming) {
    const alias = existing.find(
      (e) => e.providerId === t.id && e.accountId === accountId,
    );
    if (alias) t = { ...t, id: alias.id, providerId: t.id };
    else if (!result.has(t.id) && t.stable && t.status === "BOOK") {
      const candidates = [...result.values()].filter(
        (e) => !e.stable && e.status === "BOOK" && same(e, t),
      );
      if (
        candidates.length === 1 &&
        incoming.filter((e) => e.status === "BOOK" && same(e, t)).length === 1
      )
        t = { ...t, id: candidates[0].id, providerId: t.id };
    }
    const old = result.get(t.id);
    if (old?.status === "BOOK" && t.status !== "BOOK") continue;
    result.set(t.id, t);
  }
  return [...result.values()];
}

export function selectBalance(balances, currency) {
  // Booked balance is used for net worth; never sum available/booked balance variants.
  const ordered = ["CLBD", "ITBD", "CLAV", "ITAV", "OPBD"];
  const balance = balances
    .filter(
      (b) =>
        b.balance_amount?.currency === currency &&
        ordered.includes(b.balance_type),
    )
    .sort(
      (a, b) =>
        ordered.indexOf(a.balance_type) - ordered.indexOf(b.balance_type),
    )[0];
  if (!balance) return null;
  const amount = minor(balance.balance_amount.amount);
  return amount === null
    ? null
    : {
        amount,
        currency,
        type: balance.balance_type,
        referenceDate: balance.reference_date || null,
      };
}
