import {
  CURRENCIES,
  emptyLedger,
  recordEntry,
  uid,
  validateImport,
  type Currency,
  type Data,
  type Entry,
  type Holding,
} from "./engine";

export type BankTransaction = {
  id: string;
  accountId: string;
  amount: number | null;
  currency: string;
  date: string;
  description: string;
  status: string;
  type: Entry["type"];
  stable: boolean;
  valid: boolean;
  review: boolean;
  note: string;
  merchantCode: string;
};
export type BankAccount = {
  id: string;
  connectionId: string;
  bank: string;
  name: string;
  currency: string;
  mask: string;
  balance?: {
    amount: number;
    currency: string;
    type: string;
    referenceDate: string | null;
  };
  balanceFetchedAt?: string;
  lastSync?: string;
  error?: string;
};
export type BankConnection = {
  id: string;
  bank: string;
  country: string;
  expires: string;
  status: string;
  lastSync?: string;
  error?: string;
};
export type BankSnapshot = {
  ownerId: string;
  environment: "SANDBOX" | "PRODUCTION";
  connections: BankConnection[];
  accounts: BankAccount[];
  transactions: BankTransaction[];
};
export type BankingLocal = {
  ownerId: string;
  environment: string;
  seen: string[];
  links: Record<string, { holdingId: string }>;
  funding?: Record<
    string,
    { goalId: string; currency: Currency; amount: number }
  >;
};

export function binding(
  data: Data,
  snapshot: Pick<BankSnapshot, "ownerId" | "environment">,
): BankingLocal {
  if (
    data.banking &&
    (data.banking.ownerId !== snapshot.ownerId ||
      data.banking.environment !== snapshot.environment)
  )
    throw new Error("BANK_PROFILE_MISMATCH");
  return (
    data.banking || {
      ownerId: snapshot.ownerId,
      environment: snapshot.environment,
      seen: [],
      links: {},
    }
  );
}
export function bankDuplicates(data: Data, row: BankTransaction) {
  if (!CURRENCIES.includes(row.currency as Currency)) return [];
  return (data.ledgers[row.currency as Currency]?.entries || []).filter(
    (e) =>
      e.date === row.date &&
      e.amount === row.amount &&
      e.type === row.type &&
      (!e.sourceId?.startsWith("bank:") ||
        (!row.stable && e.sourceId !== `bank:${row.id}`)),
  );
}
export function suggestCategory(data: Data, row: BankTransaction) {
  const categories = data.ledgers[row.currency as Currency]?.categories || [];
  const rules: [RegExp, RegExp][] = [
    [
      /biedronka|lidl|żabka|zabka|aldi|kaufland|carrefour|tesco/i,
      /jedzeni|food|продукт/i,
    ],
    [/uber|bolt|orlen|shell|bp |pkp|mpk/i, /transport|транспорт/i],
    [/netflix|spotify|hbo|disney/i, /subskryp|subscription|підпис/i],
    [/czynsz|rent|energia|electricity|gaz /i, /mieszkan|housing|житл/i],
  ];
  const rule = rules.find(([merchant]) => merchant.test(row.description));
  return rule
    ? categories.find((c) => !c.archived && rule[1].test(c.name))?.id || ""
    : "";
}
export function importBankRows(
  data: Data,
  snapshot: BankSnapshot,
  rows: BankTransaction[],
  allowDuplicates = false,
): Data {
  const local = binding(data, snapshot),
    seen = new Set(local.seen);
  const next: Data = structuredClone(data);
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    if (
      !row.valid ||
      row.status !== "BOOK" ||
      row.amount === null ||
      !CURRENCIES.includes(row.currency as Currency)
    )
      throw new Error("INVALID_BANK_TRANSACTION");
    const currency = row.currency as Currency,
      ledger = next.ledgers[currency] || emptyLedger();
    const sourceId = `bank:${row.id}`;
    if (!ledger.entries.some((e) => e.sourceId === sourceId)) {
      if (!allowDuplicates && bankDuplicates(next, row).length)
        throw new Error("BANK_DUPLICATE");
      next.ledgers[currency] = recordEntry(ledger, {
        id: uid(),
        sourceId,
        type: row.type,
        amount: row.amount,
        date: row.date,
        description: row.description,
        ...(row.note ? { note: row.note } : {}),
        categoryId: suggestCategory(next, row),
      });
    }
    seen.add(row.id);
  }
  next.banking = { ...local, seen: [...seen] };
  return validateImport(next);
}

export function refreshBankHoldings(data: Data, snapshot: BankSnapshot): Data {
  const local = binding(data, snapshot);
  const holdings = [...(data.holdings || [])];
  for (const account of snapshot.accounts) {
    const id = local.links[account.id]?.holdingId;
    if (
      !id ||
      !account.balance ||
      !account.balanceFetchedAt ||
      !CURRENCIES.includes(account.currency as Currency)
    )
      continue;
    const index = holdings.findIndex((h) => h.id === id);
    if (index < 0) continue;
    const old = holdings[index];
    holdings[index] = {
      ...old,
      currency: account.currency as Currency,
      amount: Math.abs(account.balance.amount),
      type: account.balance.amount < 0 ? "liability" : "cash",
      updatedAt: account.balanceFetchedAt,
    };
  }
  const next = structuredClone({ ...data, banking: local, holdings });
  // Bank funding is a backing value, not a new contribution or additional asset.
  for (const [currency, ledger] of Object.entries(next.ledgers)) {
    if (!ledger) continue;
    for (const goal of ledger.goals) {
      const allocations = Object.entries(local.funding || {}).filter(
        ([, f]) => f.goalId === goal.id && f.currency === currency,
      );
      goal.bankSaved = allocations.reduce((total, [id, f]) => {
        const account = snapshot.accounts.find((a) => a.id === id);
        return (
          total +
          (account?.balance
            ? Math.min(f.amount, Math.max(0, account.balance.amount))
            : 0)
        );
      }, 0);
    }
  }
  return validateImport(next);
}
export function fundBankGoal(
  data: Data,
  snapshot: BankSnapshot,
  account: BankAccount,
  goalId: string,
  amount: number,
): Data {
  if (
    !account.balance ||
    amount < 0 ||
    amount > Math.max(0, account.balance.amount) ||
    !Number.isSafeInteger(amount)
  )
    throw new Error("INVALID_BANK_TRANSACTION");
  const local = structuredClone(binding(data, snapshot));
  local.funding ||= {};
  if (!goalId) delete local.funding[account.id];
  else {
    const currency = account.currency as Currency;
    if (
      !data.ledgers[currency]?.goals.some((g) => g.id === goalId && !g.archived)
    )
      throw new Error("INVALID_BANK_TRANSACTION");
    local.funding[account.id] = { goalId, currency, amount };
  }
  return refreshBankHoldings({ ...data, banking: local }, snapshot);
}
export function linkBankHolding(
  data: Data,
  snapshot: BankSnapshot,
  account: BankAccount,
  choice: string,
): Data {
  const local = structuredClone(binding(data, snapshot));
  const holdings = [...(data.holdings || [])];
  const previous = local.links[account.id]?.holdingId;
  let filtered = holdings.filter(
    (h) => !(previous?.startsWith("bank:") && h.id === previous),
  );
  delete local.links[account.id];
  if (choice) {
    const id = choice === "new" ? `bank:${account.id}` : choice;
    if (Object.values(local.links).some((link) => link.holdingId === id))
      throw new Error("BANK_HOLDING_LINKED");
    if (choice === "new") {
      if (
        !account.balance ||
        !CURRENCIES.includes(account.currency as Currency)
      )
        throw new Error("BALANCE_UNAVAILABLE");
      const holding: Holding = {
        id,
        name: `${account.bank} · ${account.name}`.slice(0, 160),
        currency: account.currency as Currency,
        type: "cash",
        amount: 0,
        updatedAt: new Date().toISOString(),
      };
      filtered.push(holding);
    } else if (
      !filtered.some((h) => h.id === id && h.currency === account.currency)
    )
      throw new Error("BANK_HOLDING_LINKED");
    local.links[account.id] = { holdingId: id };
  }
  return refreshBankHoldings(
    { ...data, holdings: filtered, banking: local },
    snapshot,
  );
}

export const bankingErrors: Record<string, string> = {
  OFFLINE: "Serwer bankowy jest niedostępny. Uruchom npm run banking:server.",
  MISSING_CREDENTIALS:
    "Dodaj Application ID i ścieżkę klucza RSA w pliku .env na serwerze.",
  INVALID_KEY: "Serwer nie może odczytać poprawnego prywatnego klucza RSA.",
  INVALID_REDIRECT:
    "Adres callback nie znajduje się w konfiguracji aplikacji Enable Banking. Dodaj dokładny adres z BANKING.md.",
  APPLICATION_INACTIVE:
    "Aplikacja Enable Banking nie jest aktywna lub nie ma dostępu AIS. Sprawdź panel dostawcy.",
  PRODUCTION_DISABLED: "Dostęp produkcyjny nie został włączony na serwerze.",
  LOGIN_REQUIRED: "Zaloguj się ponownie do połączeń bankowych.",
  LOGIN_FAILED: "Nieprawidłowy login lub hasło Moneta.",
  RATE_LIMIT: "Limit zapytań. Odczekaj chwilę przed ponowną próbą.",
  CSRF: "Sesja wygasła. Odśwież stronę i zaloguj się ponownie.",
  ORIGIN_MISMATCH: "Adres strony nie zgadza się z MONETA_ORIGIN w konfiguracji serwera. Otwórz aplikację pod skonfigurowanym adresem (domyślnie http://localhost:5173).",
  INVALID_STATE:
    "Link autoryzacji wygasł lub został już użyty. Rozpocznij połączenie ponownie.",
  AUTH_CANCELLED:
    "Autoryzacja została anulowana. Żadne nowe konto nie zostało podłączone.",
  PROVIDER_AUTH:
    "Enable Banking odrzucił klucz lub identyfikator aplikacji. Sprawdź konfigurację serwera.",
  ENVIRONMENT_MISMATCH:
    "Dane dostępowe pochodzą z innego środowiska Enable Banking.",
  CONSENT_EXPIRED:
    "Zgoda bankowa wygasła lub została cofnięta. Połącz bank ponownie.",
  PARTIAL_SYNC:
    "Część danych nie została odświeżona. Zachowano poprzednie dane; sprawdź komunikaty przy kontach.",
  BALANCE_UNAVAILABLE:
    "Saldo niedostępne. Poprzednia wartość może być nieaktualna.",
  UNSUPPORTED_ACCOUNT: "Bank nie udostępnia danych tego rachunku.",
  REVOCATION_REQUIRED:
    "Nie udało się potwierdzić cofnięcia zgody. Spróbuj ponownie lub odwołaj ją w banku.",
  BANK_PROFILE_MISMATCH:
    "Ten lokalny profil jest powiązany z innym użytkownikiem lub środowiskiem. Użyj osobnego profilu przeglądarki.",
  BANK_DUPLICATE:
    "Wykryto podobną transakcję. Porównaj ją z historią przed importem.",
  BANK_HOLDING_LINKED:
    "Ten składnik majątku jest już powiązany z innym rachunkiem lub ma inną walutę.",
  UNSUPPORTED_BANK:
    "Ta instytucja nie jest obecnie dostępna dla kont osobistych.",
  LIVE_CONSENT_REQUIRED: "Potwierdź zgodę na połączenie z prawdziwym bankiem.",
  BUSY: "Trwa już operacja bankowa. Poczekaj na jej zakończenie.",
  ACCESS_DENIED: "Bank odmówił dostępu. Sprawdź zgodę i uprawnienia aplikacji.",
};
export const bankingError = (error: unknown) =>
  bankingErrors[error instanceof Error ? error.message : String(error)] ||
  "Nie udało się pobrać danych bankowych. Spróbuj ponownie; zapisane dane pozostają bez zmian.";
