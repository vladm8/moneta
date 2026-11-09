import { ArrowUpRight, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  CURRENCIES,
  money,
  parseMoney,
  uid,
  type Currency,
  type Holding,
} from "./engine";
import { fetchNBPRates, portfolio, RATE_SCALE } from "./finance";
import {
  Confirm,
  Empty,
  ErrorText,
  Money,
  SectionHeader,
  useFinance,
} from "./ui";
const types: Record<Holding["type"], string> = {
  cash: "Cash",
  savings: "Savings balance",
  investment: "Investment",
  other: "Other asset",
  liability: "Liability",
};

function HoldingForm({ holding }: { holding?: Holding }) {
  const { data, update, close, t } = useFinance();
  const [error, setError] = useState("");
  return (
    <>
      <h2 id="dialog-title">{t(holding ? "Edit holding" : "Add holding")}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const f = new FormData(e.currentTarget);
            const item: Holding = {
              id: holding?.id || uid(),
              name: String(f.get("name")).trim(),
              type: String(f.get("type")) as Holding["type"],
              currency: String(f.get("currency")) as Currency,
              amount: parseMoney(String(f.get("amount"))),
              updatedAt: new Date().toISOString(),
            };
            if (!item.name) throw new Error("Enter a name.");
            update((d) => ({
              ...d,
              holdings: [
                ...(d.holdings || []).filter((h) => h.id !== item.id),
                item,
              ],
            }));
            close();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <label>
          {t("Name")}
          <input
            name="name"
            required
            maxLength={160}
            defaultValue={holding?.name}
          />
        </label>
        <div className="form-grid">
          <label>
            {t("Asset type")}
            <select name="type" defaultValue={holding?.type || "cash"}>
              {Object.entries(types).map(([v, label]) => (
                <option key={v} value={v}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Currency")}
            <select
              name="currency"
              defaultValue={holding?.currency || data.currency}
            >
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          {t("Current value")}
          <input
            name="amount"
            inputMode="decimal"
            required
            defaultValue={holding ? (holding.amount / 100).toFixed(2) : ""}
          />
        </label>
        <p className="field-help">
          {t(
            "Enter the full current value, not a deposit. Include each balance only once, even if it funds a goal.",
          )}
        </p>
        <ErrorText error={error} />
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={close}>
            {t("Cancel")}
          </button>
          <button className="button">{t("Save")}</button>
        </div>
      </form>
    </>
  );
}
export function PortfolioSummary({ compact = false }: { compact?: boolean }) {
  const { data, t, setPage } = useFinance();
  const p = portfolio(data.holdings || [], data.currency, data.exchangeRates);
  return (
    <section className={`panel portfolio-summary ${compact ? "compact" : ""}`}>
      <div className="section-header">
        <div>
          <span className="eyebrow">{t("Portfolio")}</span>
          <h2>{t("Estimated net worth")}</h2>
        </div>
        {compact && (
          <button className="text-button" onClick={() => setPage("portfolio")}>
            {t("Manage holdings")}
            <ArrowUpRight size={16} />
          </button>
        )}
      </div>
      {data.holdings?.length ? (
        <>
          <div className="metric-value">
            {p.missing ? "—" : <Money value={p.net} fit />}
          </div>
          <p>
            {p.missing
              ? t("Some rates are missing. Total valuation is unavailable.")
              : t(
                  "Declared assets minus liabilities. Budget plans and goal transfers are not added again.",
                )}
          </p>
          <dl className="finance-facts">
            <div>
              <dt>
                {t("Assets")}
                {p.missing ? ` · ${t("Partial valuation")}` : ""}
              </dt>
              <dd>
                <Money value={p.assets} />
              </dd>
            </div>
            <div>
              <dt>{t("Liabilities")}</dt>
              <dd>
                <Money value={p.liabilities} />
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <p>
          {t(
            "Add your balances to see estimated net worth. Transaction history alone is not an account balance.",
          )}
        </p>
      )}
    </section>
  );
}
function Breakdown({
  title,
  items,
}: {
  title: string;
  items: Record<string, number>;
}) {
  const { t, fmt } = useFinance();
  const total = Object.values(items).reduce((s, n) => s + n, 0);
  const palette = ["#779cff", "#a37af5", "#36c5ae", "#e8aa54", "#e5729a"];
  return (
    <section className="panel">
      <SectionHeader title={title} />
      {!total ? (
        <p>{t("No assets to display")}</p>
      ) : (
        <div className="portfolio-breakdown">
          {Object.entries(items).map(([k, v], i) => (
            <div key={k} className="breakdown-row">
              <div>
                <span>{t(types[k as Holding["type"]] || k)}</span>
                <strong>
                  {fmt(v)} · {((v / total) * 100).toFixed(1)}%
                </strong>
              </div>
              <div
                className="progress"
                role="progressbar"
                aria-label={k}
                aria-valuenow={Math.round((v / total) * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span
                  style={{
                    width: `${(v / total) * 100}%`,
                    background: `linear-gradient(90deg, ${palette[i % 5]}, ${palette[(i + 1) % 5]})`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
export function Portfolio() {
  const { data, update, t, fmt, modal, toast } = useFinance();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const mounted = useRef(true);
  const p = portfolio(data.holdings || [], data.currency, data.exchangeRates);
  async function refresh(showNotice = false) {
    setBusy(true);
    setError("");
    try {
      const rates = await fetchNBPRates();
      if (mounted.current) {
        update((d) => ({ ...d, exchangeRates: rates }));
        if (showNotice) {
          toast("Exchange rate updated", undefined, { duration: 2600 });
        }
      }
    } catch {
      if (mounted.current)
        setError(
          "Exchange rates unavailable. Saved rates are still available.",
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    if (
      !data.exchangeRates ||
      Date.now() - Date.parse(data.exchangeRates.fetchedAt) > 86400000
    )
      void refresh();
    return () => {
      mounted.current = false;
    };
  }, []);
  return (
    <div className="finance-stack">
      <div className="page-toolbar">
        <label className="inline-currency">
          {t("Display currency")}
          <select
            value={data.currency}
            onChange={(e) =>
              update((d) => ({ ...d, currency: e.target.value as Currency }))
            }
          >
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <button className="button" onClick={() => modal(<HoldingForm />)}>
          <Plus size={16} />
          {t("Add holding")}
        </button>
      </div>
      <PortfolioSummary />
      <section className="panel rate-panel">
        <div className="section-header">
          <div>
            <h2>{t("NBP reference rates")}</h2>
            <p>
              {t("Publication date")}: {data.exchangeRates?.date || "—"} ·{" "}
              {data.exchangeRates?.table || "NBP"}
            </p>
          </div>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void refresh(true)}
          >
            <RefreshCw size={16} className={busy ? "spin" : ""} />
            {t(busy ? "Loading" : "Refresh rates")}
          </button>
        </div>
        <ErrorText error={error} />
        <p>
          {t(
            "Reference estimates, not bank buy/sell rates. Saved rates remain visible when offline.",
          )}
        </p>
        {data.exchangeRates && (
          <>
            <p>
              {t("Fetched")}:{" "}
              {new Date(data.exchangeRates.fetchedAt).toLocaleString(
                data.language,
              )}{" "}
              ·{" "}
              <a href="https://api.nbp.pl/" target="_blank" rel="noreferrer">
                NBP API
              </a>
            </p>
            <div className="rate-list">
              {Object.entries(data.exchangeRates.rates)
                .filter(([c]) => c !== "PLN")
                .map(([c, r]) => (
                  <span key={c}>
                    1 {c} = {(r / RATE_SCALE).toFixed(4)} PLN
                  </span>
                ))}
            </div>
          </>
        )}
      </section>
      {(data.holdings || []).length ? (
        <section className="panel holdings-list">
          {p.rows.map((h) => (
            <article key={h.id} className="holding-row">
              <div>
                <h3>{h.name}</h3>
                {Object.values(data.banking?.links || {}).some(
                  (link) => link.holdingId === h.id,
                ) && (
                  <small>
                    {t("Bank balance snapshot. Refresh in Connected banks.")}
                  </small>
                )}
                <small>
                  {t(types[h.type])} · {t("Updated")}:{" "}
                  {new Date(h.updatedAt).toLocaleDateString(data.language)}
                </small>
              </div>
              <div className="holding-values">
                <strong>{money(h.amount, h.currency, data.language)}</strong>
                <small>
                  ≈{" "}
                  {h.converted === null ? t("Missing rate") : fmt(h.converted)}
                </small>
                {h.currency !== data.currency &&
                  data.exchangeRates?.rates[h.currency] &&
                  data.exchangeRates?.rates[data.currency] && (
                    <small>
                      1 {h.currency} ={" "}
                      {(
                        data.exchangeRates.rates[h.currency]! /
                        data.exchangeRates.rates[data.currency]!
                      ).toFixed(6)}{" "}
                      {data.currency}
                    </small>
                  )}
              </div>
              <div className="inline-actions">
                <button
                  className="icon-button"
                  aria-label={`${t("Edit")} ${h.name}`}
                  onClick={() => modal(<HoldingForm holding={h} />)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`${t("Delete")} ${h.name}`}
                  onClick={() =>
                    modal(
                      <Confirm
                        title="Delete holding?"
                        description="Your portfolio will be recalculated."
                        onConfirm={() =>
                          update((d) => ({
                            ...d,
                            holdings: d.holdings?.filter((x) => x.id !== h.id),
                          }))
                        }
                      />,
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <Empty
          title="No holdings yet"
          description="Add cash, savings, investments or debts."
        />
      )}
      {!!p.missing && (
        <p className="notice">
          {t("Partial valuation")}: {p.missing} {t("Missing rate")}
        </p>
      )}
      <div className="finance-columns">
        <Breakdown title="Assets by currency" items={p.byCurrency} />
        <Breakdown title="Assets by type" items={p.byType} />
      </div>
    </div>
  );
}
