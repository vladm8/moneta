import { useEffect, useRef, useState } from "react";
import {
  Landmark,
  RefreshCw,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { useFinance } from "./ui";
import { CURRENCIES, parseMoney, type Currency, type Data } from "./engine";
import {
  bankingError,
  bankDuplicates,
  binding,
  importBankRows,
  linkBankHolding,
  refreshBankHoldings,
  fundBankGoal,
  type BankAccount,
  type BankConnection,
  type BankSnapshot,
  type BankTransaction,
} from "./banking";
import "./banking.css";
import { BankSearch, type Institution } from "./BankSearch";

type Status = {
  authenticated: boolean;
  ready: boolean;
  csrf?: string;
  ownerId?: string;
  environment: "SANDBOX" | "PRODUCTION";
  error?: string;
};
const labels: Record<string, string> = {
  AUTHORIZED: "Zgoda aktywna",
  EXPIRED: "Zgoda wygasła",
  REVOKED: "Zgoda cofnięta",
  CLOSED: "Połączenie zamknięte",
  REPLACED: "Zastąpiona zgoda",
  BOOK: "Zaksięgowana",
  PDNG: "Oczekująca",
  HOLD: "Blokada",
  CNCL: "Anulowana",
  RJCT: "Odrzucona",
};

export function ConnectedBanks() {
  const { data, update, demo, toast, setPage } = useFinance();
  const latest = useRef(data);
  latest.current = data;
  const [status, setStatus] = useState<Status | null>(null),
    [snapshot, setSnapshot] = useState<BankSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  function setError(message: string) {
    if (message) toast(message, undefined, { variant: "error", duration: 9000 });
  }
  function setNotice(message: string) {
    toast(message, undefined, { variant: "info", duration: 8000 });
  }
  const [revokeFailed, setRevokeFailed] = useState<string | null>(null);
  const [liveConsent, setLiveConsent] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [allowDuplicates, setAllowDuplicates] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set()),
    [overrides, setOverrides] = useState<
      Record<string, BankTransaction["type"]>
    >({});
  const [page, setReviewPage] = useState(0),
    [showHistory, setShowHistory] = useState(false);
  const csrf = useRef(""),
    mounted = useRef(true);
  useEffect(() => {
    if (status?.error) setError(bankingError(new Error(status.error)));
  }, [status?.error]);
  async function api<T>(
    path: string,
    method = "GET",
    payload?: unknown,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`/api/banking/${path}`, {
        method,
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf.current,
        },
        ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
        signal: AbortSignal.timeout(180000),
      });
    } catch {
      throw new Error("OFFLINE");
    }
    const result = await response.json().catch(() => {
      throw new Error("OFFLINE");
    });
    if (!response.ok) {
      if (response.status === 401 && mounted.current) {
        setStatus((s) => (s ? { ...s, authenticated: false } : s));
        setSnapshot(null);
      }
      throw new Error(result.error);
    }
    return result;
  }
  function saveLocal(next: Data) {
    latest.current = next;
    update(() => next);
  }
  function accept(next: BankSnapshot) {
    if (!mounted.current) return;
    binding(latest.current, next);
    saveLocal(refreshBankHoldings(latest.current, next));
    setSnapshot(next);
    setSelected(new Set());
    setConfirmed(false);
    setReviewPage(0);
  }
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } catch (e) {
      if (mounted.current) setError(bankingError(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    if (!demo)
      void run(async () => {
        const result = await api<Status>("status");
        if (!mounted.current) return;
        setStatus(result);
        csrf.current = result.csrf || "";
        if (result.authenticated && result.ready)
          accept(await api<BankSnapshot>("connections"));
        const callback = new URLSearchParams(location.search).get("banking");
        if (callback) {
          const url = new URL(location.href);
          url.searchParams.delete("banking");
          history.replaceState(null, "", url);
          if (callback === "connected")
            setNotice(
              "Autoryzacja bankowa zakończona. Sprawdź stan synchronizacji oraz nowe transakcje poniżej.",
            );
          else setError(bankingError(new Error(callback)));
        }
      });
    return () => {
      mounted.current = false;
    };
  }, []);
  const seen = new Set(data.banking?.seen || []);
  const rows =
    snapshot?.transactions.filter(
      (row) => showHistory || (row.status === "BOOK" && !seen.has(row.id)),
    ) || [];
  const pending =
    snapshot?.transactions.filter((row) =>
      ["PDNG", "HOLD"].includes(row.status),
    ).length || 0;
  const eligible = rows.filter(
    (row) => row.valid && row.status === "BOOK" && !seen.has(row.id),
  );
  const visible = rows.slice(page * 15, page * 15 + 15);
  const date = (value?: string) =>
    value
      ? new Date(value).toLocaleString(data.language)
      : "Jeszcze nie synchronizowano";
  const amount = (value: number, currency: string) => {
    try {
      return new Intl.NumberFormat(data.language, {
        style: "currency",
        currency,
      }).format(value / 100);
    } catch {
      return `${(value / 100).toFixed(2)} ${currency || "?"}`;
    }
  };
  async function connect(
    bank: Institution | BankConnection,
    reconnect?: string,
  ) {
    const result = await api<{ url: string }>("authorize", "POST", {
      name: "bank" in bank ? bank.bank : bank.name,
      country: bank.country,
      reconnect,
      liveConsent,
    });
    location.assign(result.url);
  }
  function changeHolding(account: BankAccount, choice: string) {
    try {
      saveLocal(linkBankHolding(latest.current, snapshot!, account, choice));
    } catch (e) {
      setError(bankingError(e));
    }
  }
  if (demo)
    return (
      <section className="panel">
        <h2>Połączone banki</h2>
        <p>
          Połączenia bankowe są dostępne w Twoim własnym profilu. Tryb demo nie
          nawiązuje połączeń z bankami.
        </p>
      </section>
    );
  return (
    <div className="finance-stack banking-page" aria-busy={busy}>
      <section className="panel bank-intro">
        <div className="section-header">
          <div>
            <h2>
              <ShieldCheck size={22} /> Połączone banki
            </h2>
            <p>
              Tylko odczyt sald i historii. Logujesz się do banku na jego
              stronie.
            </p>
          </div>
          {status?.authenticated && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api("logout", "POST", {});
                  setStatus({ ...status, authenticated: false });
                  setSnapshot(null);
                  csrf.current = "";
                })
              }
            >
              <LogOut size={16} /> Wyloguj
            </button>
          )}
        </div>
        <p>
          Dane połączeń są szyfrowane na Twoim serwerze Moneta. Zatwierdzone
          transakcje i przypisane salda zapisują się również w tej przeglądarce.
        </p>
        {status && (
          <span className="bank-environment">
            {status.environment === "SANDBOX"
              ? "Sandbox · dane testowe"
              : "Restricted Production · prawdziwe rachunki"}
          </span>
        )}
        {busy && (
          <p role="status">
            <RefreshCw size={16} className="spin" /> Trwa operacja bankowa…
          </p>
        )}
        {!status && !busy && (
          <button
            className="button secondary"
            onClick={() =>
              void run(async () => {
                const next = await api<Status>("status");
                setStatus(next);
                csrf.current = next.csrf || "";
                if (next.authenticated && next.ready)
                  accept(await api<BankSnapshot>("connections"));
              })
            }
          >
            Spróbuj ponownie
          </button>
        )}
        {status && !status.authenticated && (
          <form
            className="bank-login"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void run(async () => {
                const result = await api<Status>("login", "POST", {
                  username: form.get("username"),
                  password: form.get("password"),
                });
                setStatus(result);
                csrf.current = result.csrf || "";
                if (result.ready)
                  accept(await api<BankSnapshot>("connections"));
              });
            }}
          >
            <p>
              Zaloguj się kontem Moneta utworzonym poleceniem{" "}
              <code>npm run banking:setup</code>. To nie są dane logowania do
              banku.
            </p>
            <label>
              Login Moneta
              <input
                name="username"
                autoComplete="username"
                required
                maxLength={80}
              />
            </label>
            <label>
              Hasło Moneta
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                maxLength={256}
              />
            </label>
            <button className="button" disabled={busy}>
              Zaloguj do połączeń bankowych
            </button>
          </form>
        )}
      </section>
      {status?.authenticated && status.ready && (
        <>
          <section className="panel">
            <div className="section-header">
              <h2>Dodaj bank</h2>
              <Landmark size={24} />
            </div>
            {status.environment === "PRODUCTION" && (
              <label className="bank-check">
                <input
                  type="checkbox"
                  checked={liveConsent}
                  onChange={(e) => setLiveConsent(e.target.checked)}
                />
                Chcę połączyć własny rachunek bankowy i udzielić dostępu tylko
                do odczytu.
              </label>
            )}
            <BankSearch
              sandbox={status.environment === "SANDBOX"}
              disabled={busy || (status.environment === "PRODUCTION" && !liveConsent)}
              load={async country => (await api<{ institutions: Institution[] }>(`institutions?country=${country}`)).institutions}
              connect={bank => void run(() => connect(bank))}
              onError={error => setError(bankingError(error))}
            />
          </section>
          {snapshot?.connections.map((connection) => (
            <section className="panel" key={connection.id}>
              <div className="section-header">
                <div>
                  <h2>{connection.bank}</h2>
                  <p>
                    {labels[connection.status] || connection.status} · do{" "}
                    {date(connection.expires)}
                  </p>
                  <small>
                    Ostatnia pełna synchronizacja: {date(connection.lastSync)}
                  </small>
                </div>
                <div className="bank-actions">
                  <button
                    className="button secondary"
                    disabled={busy || connection.status !== "AUTHORIZED"}
                    onClick={() =>
                      void run(async () => {
                        const next = await api<BankSnapshot>(
                          `connections/${connection.id}/sync`,
                          "POST",
                          {},
                        );
                        accept(next);
                        const syncError = next.connections.find((c) => c.id === connection.id)?.error
                          || next.accounts.find((a) => a.connectionId === connection.id && a.error)?.error;
                        if (syncError) setError(bankingError(new Error(syncError)));
                        else
                          toast("Dane bankowe zaktualizowane");
                      })
                    }
                  >
                    <RefreshCw size={16} />
                    Synchronizuj
                  </button>
                  <button
                    className="text-button"
                    disabled={
                      busy ||
                      (status.environment === "PRODUCTION" && !liveConsent)
                    }
                    onClick={() =>
                      void run(() => connect(connection, connection.id))
                    }
                  >
                    Połącz ponownie
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Odłączyć bank? Zgoda zostanie cofnięta, a dane połączenia usunięte z serwera. Zapisane wcześniej transakcje i ostatnie salda pozostaną lokalnie.",
                        )
                      )
                        void run(async () => {
                          let next: BankSnapshot;
                          try {
                            next = await api<BankSnapshot>(
                              `connections/${connection.id}`,
                              "DELETE",
                              {},
                            );
                          } catch (e) {
                            setRevokeFailed(connection.id);
                            throw e;
                          }
                          accept(next);
                          setRevokeFailed(null);
                          setNotice(
                            "Bank odłączony. Lokalne transakcje i ostatnie salda zachowano; możesz je usunąć w historii i portfelu.",
                          );
                        });
                    }}
                  >
                    Odłącz
                  </button>
                  {revokeFailed === connection.id && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Usunąć dane połączenia z serwera mimo braku potwierdzenia od banku? Zgodę musisz wtedy odwołać samodzielnie w bankowości internetowej.",
                          )
                        )
                          void run(async () => {
                            accept(
                              await api<BankSnapshot>(
                                `connections/${connection.id}`,
                                "DELETE",
                                { forget: true },
                              ),
                            );
                            setRevokeFailed(null);
                            setNotice(
                              "Dane połączenia usunięte. Odwołaj również zgodę w swoim banku.",
                            );
                          });
                      }}
                    >
                      Usuń dane połączenia z serwera
                    </button>
                  )}
                </div>
              </div>
              {connection.error && (
                <p className="notice">
                  {bankingError(new Error(connection.error))}
                </p>
              )}
              {snapshot.accounts
                .filter((a) => a.connectionId === connection.id)
                .map((account) => (
                  <article className="bank-account" key={account.id}>
                    <div>
                      <h3>{account.name}</h3>
                      <p>
                        {account.mask} · {account.currency}
                      </p>
                      <strong className="bank-balance">
                        {account.balance
                          ? amount(account.balance.amount, account.currency)
                          : "Saldo niedostępne"}
                      </strong>
                      <small>
                        Saldo z:{" "}
                        {account.balance?.referenceDate || "brak daty bankowej"}{" "}
                        · pobrano: {date(account.balanceFetchedAt)}
                      </small>
                      {(account.error ||
                        !account.balanceFetchedAt ||
                        Date.now() - Date.parse(account.balanceFetchedAt) >
                          86400000 ||
                        connection.status !== "AUTHORIZED") && (
                        <p className="notice">
                          {account.error
                            ? bankingError(new Error(account.error))
                            : "Saldo może być nieaktualne."}
                        </p>
                      )}
                    </div>
                    <label>
                      Uwzględnienie w majątku
                      <select
                        disabled={
                          busy ||
                          !account.balance ||
                          !CURRENCIES.includes(account.currency as Currency)
                        }
                        value={data.banking?.links[account.id]?.holdingId || ""}
                        onChange={(e) => changeHolding(account, e.target.value)}
                      >
                        <option value="">Nie uwzględniaj</option>
                        <option value="new">Dodaj jako nowy składnik</option>
                        {(data.holdings || [])
                          .filter((h) => h.currency === account.currency)
                          .map((h) => (
                            <option value={h.id} key={h.id}>
                              {h.name}
                            </option>
                          ))}
                      </select>
                      <small>
                        Wybierz istniejący składnik, jeśli ten rachunek jest już
                        wpisany ręcznie. Saldo zastąpi jego kwotę, zamiast ją
                        dublować.
                      </small>
                    </label>
                    <form
                      className="bank-goal-funding"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        try {
                          saveLocal(
                            fundBankGoal(
                              latest.current,
                              snapshot,
                              account,
                              String(form.get("goalId")),
                              parseMoney(String(form.get("amount") || "0")),
                            ),
                          );
                          toast("Powiązanie celu zapisane");
                        } catch (e) {
                          setError(bankingError(e));
                        }
                      }}
                    >
                      <label>
                        Środki na cel
                        <select
                          name="goalId"
                          defaultValue={
                            data.banking?.funding?.[account.id]?.goalId || ""
                          }
                        >
                          <option value="">Bez powiązania</option>
                          {(
                            data.ledgers[account.currency as Currency]?.goals ||
                            []
                          )
                            .filter((g) => !g.archived)
                            .map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Zarezerwowana kwota ({account.currency})
                        <input
                          name="amount"
                          inputMode="decimal"
                          defaultValue={(
                            (data.banking?.funding?.[account.id]?.amount || 0) /
                            100
                          ).toFixed(2)}
                        />
                      </label>
                      <p>
                        Powiązanie nie tworzy nowego dochodu ani wpłaty. Postęp
                        celu uwzględnia większą z wartości: zapisane wpłaty albo
                        zarezerwowane saldo. Nie sumujemy ich, by nie liczyć
                        tych samych pieniędzy dwa razy.
                      </p>
                      <button
                        className="button secondary"
                        disabled={busy || !account.balance}
                      >
                        Zapisz powiązanie
                      </button>
                    </form>
                    <button
                      className="text-button"
                      onClick={() => setPage("goals")}
                    >
                      Przejdź do celów →
                    </button>
                  </article>
                ))}
            </section>
          ))}
          {snapshot && !snapshot.connections.length && (
            <section className="panel">
              <h2>Nie masz jeszcze połączonych banków</h2>
              <p>Wybierz instytucję powyżej, aby rozpocząć autoryzację.</p>
            </section>
          )}
          {snapshot && (
            <section className="panel">
              <div className="section-header">
                <div>
                  <h2>Transakcje bankowe</h2>
                  <p>
                    Nowe zaksięgowane transakcje zatwierdź przed dodaniem do
                    budżetu. Oczekujące i blokady ({pending}) nie zmieniają
                    wyników.
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => {
                    setShowHistory(!showHistory);
                    setReviewPage(0);
                  }}
                >
                  {" "}
                  {showHistory ? "Pokaż nowe" : "Pokaż całą pobraną historię"}
                </button>
              </div>
              <label className="bank-check">
                <input
                  type="checkbox"
                  checked={
                    eligible.length > 0 &&
                    eligible.every((row) => selected.has(row.id))
                  }
                  onChange={(e) => {
                    setSelected(
                      e.target.checked
                        ? new Set(
                            eligible
                              .filter(
                                (r) =>
                                  allowDuplicates ||
                                  !bankDuplicates(data, r).length,
                              )
                              .map((r) => r.id),
                          )
                        : new Set(),
                    );
                    setConfirmed(false);
                  }}
                />
                Wybierz nowe transakcje bez wykrytych duplikatów
              </label>
              {visible.map((row) => (
                <article className="bank-transaction" key={row.id}>
                  <label className="bank-check">
                    <input
                      type="checkbox"
                      disabled={
                        !row.valid || row.status !== "BOOK" || seen.has(row.id)
                      }
                      checked={selected.has(row.id)}
                      onChange={(e) => {
                        setSelected((current) => {
                          const next = new Set(current);
                          if (e.target.checked) next.add(row.id);
                          else next.delete(row.id);
                          return next;
                        });
                        setConfirmed(false);
                      }}
                    />
                    <span>
                      <strong>{row.description}</strong>
                      <small>
                        {row.date || "Brak daty"} ·{" "}
                        {labels[row.status] || row.status}{" "}
                        {seen.has(row.id) ? "· zapisano / pominięto" : ""}
                      </small>
                    </span>
                  </label>
                  <strong>
                    {row.amount === null
                      ? "Nieznana kwota"
                      : amount(row.amount, row.currency)}
                  </strong>
                  {row.note && <small>{row.note}</small>}
                  {row.review && (
                    <p className="notice">
                      Sprawdź rodzaj transakcji
                      {!row.stable
                        ? " oraz podobne wpisy — bank nie podał stałego identyfikatora"
                        : ""}
                      .
                    </p>
                  )}
                  {!!bankDuplicates(data, row).length && (
                    <p className="notice">
                      Podobny wpis jest już w historii (ta sama data, kwota i
                      rodzaj).
                    </p>
                  )}
                  {!row.valid && (
                    <p className="notice">
                      Niepełne dane lub nieobsługiwana waluta. Ta transakcja nie
                      może zostać zaimportowana.
                    </p>
                  )}
                  {!seen.has(row.id) && row.status === "BOOK" && row.valid && (
                    <label>
                      Rodzaj
                      <select
                        value={overrides[row.id] || row.type}
                        onChange={(e) => {
                          setOverrides({
                            ...overrides,
                            [row.id]: e.target.value as BankTransaction["type"],
                          });
                          setConfirmed(false);
                        }}
                      >
                        <option value="expense">Wydatek</option>
                        <option value="income">Dochód</option>
                        <option value="refund">Zwrot</option>
                        <option value="internal">
                          Przelew między własnymi kontami
                        </option>
                      </select>
                    </label>
                  )}
                </article>
              ))}
              {!rows.length && <p>Brak nowych transakcji do sprawdzenia.</p>}
              {rows.length > 15 && (
                <div className="import-pagination">
                  <button
                    className="button secondary"
                    disabled={page === 0}
                    onClick={() => setReviewPage(page - 1)}
                  >
                    Poprzednia
                  </button>
                  <span>
                    {page + 1} / {Math.ceil(rows.length / 15)}
                  </span>
                  <button
                    className="button secondary"
                    disabled={(page + 1) * 15 >= rows.length}
                    onClick={() => setReviewPage(page + 1)}
                  >
                    Następna
                  </button>
                </div>
              )}
              {!!eligible.length && (
                <div className="bank-import-actions">
                  <label className="bank-check">
                    <input
                      type="checkbox"
                      checked={allowDuplicates}
                      onChange={(e) => {
                        setAllowDuplicates(e.target.checked);
                        setConfirmed(false);
                      }}
                    />
                    Wybrane podobne wpisy to osobne transakcje — importuj mimo
                    podobieństwa.
                  </label>
                  <label className="bank-check">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    Sprawdziłem wybrane transakcje i potwierdzam import.
                  </label>
                  <div className="bank-actions">
                    <button
                      className="button"
                      disabled={busy || !confirmed || !selected.size}
                      onClick={() => {
                        try {
                          saveLocal(
                            importBankRows(
                              latest.current,
                              snapshot,
                              eligible
                                .filter((r) => selected.has(r.id))
                                .map((r) => ({
                                  ...r,
                                  type: overrides[r.id] || r.type,
                                })),
                              allowDuplicates,
                            ),
                          );
                          setSelected(new Set());
                          setConfirmed(false);
                          setReviewPage(0);
                          toast("Transakcje bankowe dodane");
                        } catch (e) {
                          setError(bankingError(e));
                        }
                      }}
                    >
                      Importuj wybrane ({selected.size})
                    </button>
                    <button
                      className="text-button"
                      disabled={busy || !selected.size}
                      onClick={() => {
                        saveLocal({
                          ...latest.current,
                          banking: {
                            ...binding(latest.current, snapshot),
                            seen: [
                              ...new Set([
                                ...(latest.current.banking?.seen || []),
                                ...selected,
                              ]),
                            ],
                          },
                        });
                        setSelected(new Set());
                        setReviewPage(0);
                      }}
                    >
                      Pomiń wybrane na stałe
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
