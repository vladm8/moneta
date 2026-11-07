import { useRef, useState } from "react";
import {
  Search,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Upload,
  Trash2,
  Sun,
  Moon,
  Monitor,
  Archive,
  Pencil,
  Leaf,
  ChevronRight,
} from "lucide-react";
import {
  useFinance,
  SectionHeader,
  Empty,
  TransactionList,
  EntryForm,
  GoalForm,
  Progress,
  Money,
  Confirm,
  RecurringForm,
  CategoryIcon,
} from "./ui";
import {
  entriesFor,
  summary,
  categorySpent,
  shiftMonth,
  locale,
  CURRENCIES,
  emptyLedger,
  validateImport,
  csvExport,
  applyRecurring,
  type Goal,
  type Data,
  type Currency,
  type Language,
  type Page,
} from "./engine";
import { SpendingTrendCard } from "./TrendChart";
import { deleteData } from "./persistence";
import { goalPlan } from "./finance";
import { GoalPlanner } from "./GoalPlanner";
import { PortfolioSummary } from "./Portfolio";
import { TransactionImport } from "./ImportWizard";
export function Transactions() {
  const { ledger, month, t, fmt, modal } = useFinance();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState("new");
  const [importing, setImporting] = useState(false);
  const es = entriesFor(ledger, month)
    .filter(
      (e) =>
        (!category || e.categoryId === category) &&
        (!type || e.type === type) &&
        (
          e.description +
          " " +
          (ledger.categories.find((c) => c.id === e.categoryId)?.name || "")
        )
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    )
    .sort((a, b) =>
      sort === "high"
        ? b.amount - a.amount
        : sort === "low"
          ? a.amount - b.amount
          : sort === "old"
            ? a.date.localeCompare(b.date)
            : b.date.localeCompare(a.date),
    );
  const s = summary(ledger, month);
  if (importing)
    return <TransactionImport onClose={() => setImporting(false)} />;
  return (
    <>
      <div className="page-toolbar">
        <button className="button secondary" onClick={() => setImporting(true)}>
          <Upload size={16} />
          {t("Import transactions")}
        </button>
      </div>
      <div className="transaction-summary">
        <div>
          <span>{t("Income")}</span>
          <strong className="positive">+<Money value={s.income} /></strong>
        </div>
        <div>
          <span>{t("Spent")}</span>
          <strong><Money value={s.spent} /></strong>
        </div>
        <div>
          <span>{t("Saved this month")}</span>
          <strong><Money value={s.saved} /></strong>
        </div>
      </div>
      <div className="transaction-filters">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label={t("Search transactions")}
            placeholder={t("Search transactions")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label={t("Category")}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">{t("All categories")}</option>
          {ledger.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label={t("All types")}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">{t("All types")}</option>
          <option value="income">{t("Income")}</option>
          <option value="expense">{t("Expense")}</option>
          <option value="transfer">{t("Savings transfer")}</option>
          <option value="refund">{t("Refund")}</option>
          <option value="internal">{t("Internal transfer")}</option>
        </select>
        <select
          aria-label={t("Newest first")}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          {[
            ["new", "Newest first"],
            ["old", "Oldest first"],
            ["high", "Highest amount"],
            ["low", "Lowest amount"],
          ].map(([v, k]) => (
            <option key={v} value={v}>
              {t(k)}
            </option>
          ))}
        </select>
      </div>
      <section className="panel transaction-panel">
        {es.length ? (
          <>
            <div className="transaction-table-head">
              <span>
                {t("Description")} / {t("Category")}
              </span>
              <span>{t("Date")}</span>
              <span>{t("Amount")}</span>
            </div>
            <TransactionList entries={es} />
          </>
        ) : query || category || type ? (
          <Empty
            title="No matching transactions"
            description="Try a different search or filter."
            action={
              <button
                className="text-button"
                onClick={() => {
                  setQuery("");
                  setCategory("");
                  setType("");
                }}
              >
                {t("Clear filters")}
              </button>
            }
          />
        ) : (
          <Empty
            title="No transactions yet"
            description="Your first transaction starts the story."
            action={
              <button className="button" onClick={() => modal(<EntryForm />)}>
                <Plus size={16} />
                {t("Add transaction")}
              </button>
            }
          />
        )}
      </section>
    </>
  );
}
export function Analytics() {
  const { ledger, month, t, fmt, data } = useFinance();
  const current = summary(ledger, month);
  const previous = summary(ledger, shiftMonth(month, -1));
  const hasPrevious = entriesFor(ledger, shiftMonth(month, -1)).length > 0;
  const months = Array.from({ length: 6 }, (_, i) => {
    const m = shiftMonth(month, i - 5);
    return { month: m, ...summary(ledger, m) };
  });
  const max = Math.max(
    ...months.flatMap((m) => [m.income, Math.abs(m.spent)]),
    100,
  );
  const categories = ledger.categories.map((c) => ({
    ...c,
    spent: categorySpent(ledger, month, c.id),
    planned: ledger.plans[month]?.[c.id] || 0,
  }));
  const expenseCats = categories
    .map((c) => ({
      ...c,
      spent: entriesFor(ledger, month)
        .filter(
          (e) =>
            ["expense", "refund"].includes(e.type) && e.categoryId === c.id,
        )
        .reduce(
          (sum, e) => sum + (e.type === "refund" ? -e.amount : e.amount),
          0,
        ),
    }))
    .sort((a, b) => b.spent - a.spent);
  const uncategorized = entriesFor(ledger, month)
    .filter((e) => ["expense", "refund"].includes(e.type) && !e.categoryId)
    .reduce((s, e) => s + (e.type === "refund" ? -e.amount : e.amount), 0);
  return (
    <>
      <div className="comparison-metrics">
        {(["income", "spent", "saved"] as const).map((key, i) => {
          const diff = current[key] - previous[key];
          return (
            <div key={key}>
              <span>
                {t(
                  ["Monthly income", "Monthly spending", "Saved this month"][i],
                )}
              </span>
              <strong>
                <Money value={current[key]} fit />
              </strong>
              <small
                className={
                  hasPrevious
                    ? diff > 0 && key === "spent"
                      ? "negative"
                      : "positive"
                    : ""
                }
              >
                {hasPrevious ? (
                  <>
                    {diff >= 0 ? (
                      <ArrowUpRight size={14} />
                    ) : (
                      <ArrowDownRight size={14} />
                    )}{" "}
                    {diff >= 0 ? "+" : ""}
                    {fmt(diff)}{" "}
                    {previous[key]
                      ? `(${diff >= 0 ? "+" : ""}${((diff / previous[key]) * 100).toFixed(1)}%)`
                      : ""}
                  </>
                ) : (
                  t("No previous data")
                )}
              </small>
            </div>
          );
        })}
      </div>
      <div className="analytics-grid">
        <PortfolioSummary compact />
        <SpendingTrendCard />
        <section className="insights-panel">
          <span className="insight-icon">
            <Leaf size={23} />
          </span>
          <SectionHeader title="Insights from your numbers" />
          {current.income > 0 ? (
            <>
              <p>
                <strong>{fmt(current.unallocated)}</strong>{" "}
                {t("still waiting for a purpose")}.
              </p>
              {categories
                .filter((c) => c.planned > 0 && c.spent > 0)
                .slice(0, 2)
                .map((c) => (
                  <p key={c.id}>
                    <strong>
                      {c.name}: {((c.spent / c.planned) * 100).toFixed(1)}%
                    </strong>{" "}
                    {t("of your budget used")}.
                  </p>
                ))}
              <small>{t("Savings are transfers, not expenses.")}</small>
            </>
          ) : (
            <p>{t("Start recording transactions to see your patterns.")}</p>
          )}
        </section>
      </div>
      <div className="analytics-grid equal">
        <section className="panel">
          <SectionHeader title="Spending by category" />
          {expenseCats.some((c) => c.spent !== 0) || uncategorized !== 0 ? (
            <div className="horizontal-bars">
              {[
                ...expenseCats,
                ...(uncategorized
                  ? [
                      {
                        id: "uncategorized",
                        name: t("Uncategorized"),
                        spent: uncategorized,
                        color: "#8e98ac",
                      },
                    ]
                  : []),
              ]
                .filter((c) => c.spent !== 0)
                .map((c) => (
                  <div key={c.id}>
                    <div>
                      <span>{c.name}</span>
                      <strong>{fmt(c.spent)}</strong>
                    </div>
                    <Progress
                      value={
                        (Math.abs(c.spent) /
                          (expenseCats.reduce(
                            (s, c) => s + Math.abs(c.spent),
                            Math.abs(uncategorized),
                          ) || 1)) *
                        100
                      }
                      color={c.color}
                    />
                  </div>
                ))}
            </div>
          ) : (
            <Empty title="No transactions yet" />
          )}
        </section>
        <section className="panel">
          <SectionHeader title="Income & expenses" subtitle="Last six months" />
          <div className="bar-chart">
            {months.map((m) => (
              <div className="bar-column" key={m.month}>
                <div className="bar-pair">
                  <div
                    className="bar income-bar"
                    style={{ height: `${(m.income / max) * 100}%` }}
                    tabIndex={0}
                    role="img"
                    aria-label={`${m.month} ${t("Income")}: ${fmt(m.income)}`}
                  >
                    <span>{fmt(m.income, false)}</span>
                  </div>
                  <div
                    className="bar expense-bar"
                    style={{
                      height: `${(Math.abs(m.spent) / max) * 100}%`,
                      background: m.spent < 0 ? "var(--positive)" : undefined,
                    }}
                    tabIndex={0}
                    role="img"
                    aria-label={`${m.month} ${t("Spent")}: ${fmt(m.spent)}`}
                  >
                    <span>{fmt(m.spent, false)}</span>
                  </div>
                </div>
                <small>
                  {new Date(m.month + "-01T12:00:00").toLocaleDateString(
                    locale(data.language),
                    { month: "short" },
                  )}
                </small>
              </div>
            ))}
          </div>
          <div className="inline-legend">
            <span>
              <i className="dot" style={{ background: "var(--green)" }} />
              {t("Income")}
            </span>
            <span>
              <i className="dot" style={{ background: "var(--sage)" }} />
              {t("Spent")}
            </span>
          </div>
        </section>
      </div>
      <section className="performance-section">
        <SectionHeader title="Budget performance" />
        <div className="performance-table">
          <div className="performance-row table-label">
            <span>{t("Category")}</span>
            <span>{t("Planned")}</span>
            <span>{t("Actual")}</span>
            <span>{t("Remaining")}</span>
          </div>
          {categories.map((c) => (
            <div className="performance-row" key={c.id}>
              <span>
                <i className="dot" style={{ background: c.color }} />
                {c.name}
              </span>
              <span>{fmt(c.planned)}</span>
              <span>{fmt(c.spent)}</span>
              <strong className={c.planned < c.spent ? "negative" : ""}>
                {fmt(c.planned - c.spent)}
              </strong>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
function GoalDetails({ goal }: { goal: Goal }) {
  const { ledger, t, fmt, modal } = useFinance();
  const es = ledger.entries
    .filter((e) => e.goalId === goal.id && e.type === "transfer")
    .sort((a, b) => b.date.localeCompare(a.date));
  const total = goalPlan(goal, ledger).saved;
  return (
    <>
      <span className="eyebrow">{t("Savings goals")}</span>
      <h2 id="dialog-title">{goal.name}</h2>
      <p className="goal-detail-amount">
        {fmt(total)} <small>/ {fmt(goal.target)}</small>
      </p>
      <Progress value={(total / goal.target) * 100} color={goal.color} />
      <GoalPlanner goal={goal} />
      {!!goal.initialSaved && (
        <p>
          {t("Opening savings")}: {fmt(goal.initialSaved)}
        </p>
      )}
      <h3>{t("Contribution history")}</h3>
      {es.length ? (
        <TransactionList entries={es} />
      ) : (
        <Empty title="No contributions yet" />
      )}
      <button
        className="button full"
        onClick={() => modal(<EntryForm type="transfer" goalId={goal.id} />)}
      >
        <Plus size={16} />
        {t("Add contribution")}
      </button>
    </>
  );
}
export function Goals() {
  const { ledger, data, update, t, fmt, modal, updateLedger } = useFinance();
  const [archived, setArchived] = useState(false);
  const active = ledger.goals.filter((g) => g.archived === archived);
  return (
    <>
      <div className="page-toolbar">
        <label className="inline-currency">
          {t("Currency")}
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
        <button className="text-button" onClick={() => setArchived(!archived)}>
          <Archive size={16} />
          {t(archived ? "Savings goals" : "Archived goals")}
        </button>
        <button className="button" onClick={() => modal(<GoalForm />)}>
          <Plus size={16} />
          {t("Add goal")}
        </button>
      </div>
      {active.length ? (
        <div className="goals-grid">
          {active.map((g, i) => {
            const saved = goalPlan(g, ledger).saved;
            return (
              <section className="goal-card" key={g.id}>
                <div className={`goal-art art-${i % 3}`}>
                  <span className="goal-art-disc" />
                  <span className="goal-art-arch" />
                  <span className="goal-art-line" />
                  <span className="goal-art-label">
                    {String(i + 1).padStart(2, "0")} / MONETA
                  </span>
                  <CategoryIcon
                    category={{ icon: g.icon || "leaf", color: g.color }}
                  />
                </div>
                <div className="goal-card-body">
                  <div className="goal-card-heading">
                    <button onClick={() => modal(<GoalDetails goal={g} />)}>
                      <h2>{g.name}</h2>
                    </button>
                    <div className="inline-actions">
                      <button
                        className="icon-button"
                        aria-label={t("Edit") + " " + g.name}
                        onClick={() => modal(<GoalForm goal={g} />)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={t(g.archived ? "Restore" : "Archive")}
                        onClick={() =>
                          updateLedger((l) => ({
                            ...l,
                            goals: l.goals.map((x) =>
                              x.id === g.id
                                ? { ...x, archived: !x.archived }
                                : x,
                            ),
                          }))
                        }
                      >
                        <Archive size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={t("Delete") + " " + g.name}
                        onClick={() =>
                          modal(
                            <Confirm
                              title="Delete goal?"
                              description="Contributed goals are archived to preserve your balances."
                              onConfirm={() =>
                                updateLedger((l) => ({
                                  ...l,
                                  goals: saved
                                    ? l.goals.map((x) =>
                                        x.id === g.id
                                          ? { ...x, archived: true }
                                          : x,
                                      )
                                    : l.goals.filter((x) => x.id !== g.id),
                                }))
                              }
                            />,
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="goal-card-numbers">
                    <strong><Money value={saved} decimals={false} /></strong>
                    <span>/ {fmt(g.target, false)}</span>
                  </div>
                  <Progress value={(saved / g.target) * 100} color={g.color} celebrate />
                  <div className="goal-progress-label">
                    <span>
                      {saved >= g.target
                        ? t("Goal reached")
                        : `${Math.round((saved / g.target) * 100)}% ${t("of target")}`}
                    </span>
                    <span>{g.date || ""}</span>
                  </div>
                  <GoalPlanner goal={g} />
                  <button
                    className="button secondary full"
                    onClick={() =>
                      modal(<EntryForm type="transfer" goalId={g.id} />)
                    }
                    disabled={g.archived}
                  >
                    <Plus size={16} />
                    {t("Add contribution")}
                  </button>
                  <button
                    className="text-button center"
                    onClick={() => modal(<GoalDetails goal={g} />)}
                  >
                    {t("Contribution history")}
                    <ChevronRight size={14} />
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <Empty
          title="No goals yet"
          description="Make room for something that matters."
          action={
            <button
              className="button secondary"
              onClick={() => modal(<GoalForm />)}
            >
              {t("Add goal")}
            </button>
          }
        />
      )}
    </>
  );
}
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Settings({ reset }: { reset: () => void }) {
  const {
    data,
    ledger,
    t,
    fmt,
    month,
    update,
    updateLedger,
    modal,
    toast,
    demo,
    draft,
    setDraft,
    setDemo,
  } = useFinance();
  const input = useRef<HTMLInputElement>(null);
  function patch(partial: Partial<Data>) {
    update((d) => ({ ...d, ...partial }));
  }
  return (
    <div className="settings-page">
      <section className="settings-section">
        <div>
          <h2>{t("Profile & preferences")}</h2>
          <p>{t("Your preferences. Your data. Your control.")}</p>
        </div>
        <div className="settings-fields">
          <label>
            {t("Your first name")}
            <input
              value={data.name}
              maxLength={80}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </label>
          <div className="form-grid">
            <label>
              {t("Language")}
              <select
                value={data.language}
                onChange={(e) =>
                  patch({ language: e.target.value as Language })
                }
              >
                <option value="pl">Polski</option>
                <option value="en">English</option>
                <option value="uk">Українська</option>
              </select>
            </label>
            <label>
              {t("Currency")}
              <select
                value={data.currency}
                onChange={(e) => {
                  if (draft) {
                    toast("Please save your plan first.");
                    return;
                  }
                  const currency = e.target.value as Currency;
                  update((d) => ({
                    ...d,
                    currency,
                    ledgers: {
                      ...d.ledgers,
                      [currency]: d.ledgers[currency] || emptyLedger(),
                    },
                  }));
                }}
              >
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="field-help">
            {t(
              "Each currency has its own ledger. Switching never converts or relabels your existing money.",
            )}
          </p>
          <label>
            {t("Default view")}
            <select
              value={data.defaultPage}
              onChange={(e) => patch({ defaultPage: e.target.value as Page })}
            >
              {[
                ["overview", "Overview"],
                ["budget", "Budget"],
                ["transactions", "Transactions"],
                ["analytics", "Analytics"],
                ["goals", "Savings goals"],
                ["portfolio", "Portfolio"],
              ].map(([key, label]) => (
                <option key={key} value={key}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section className="settings-section">
        <div>
          <h2>{t("Appearance")}</h2>
        </div>
        <div className="theme-options">
          {(["light", "dark", "system"] as const).map((theme, i) => {
            const Icon = [Sun, Moon, Monitor][i];
            return (
              <button
                key={theme}
                className={data.theme === theme ? "selected" : ""}
                aria-pressed={data.theme === theme}
                onClick={() => patch({ theme })}
              >
                <Icon size={22} />
                <span>{t(["Light", "Dark", "System"][i])}</span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="settings-section">
        <div>
          <h2>{t("Recurring items")}</h2>
          <p>
            {t(
              "Templates apply only when you choose. Each can be applied once per month.",
            )}
          </p>
        </div>
        <div className="settings-fields">
          {ledger.recurring.length ? (
            ledger.recurring.map((r) => (
              <div className="recurring-item" key={r.id}>
                <span>
                  <strong>{r.description}</strong>
                  <small>
                    {t(r.type === "income" ? "Income" : "Expense")} · {t("Day")}{" "}
                    {r.day}
                  </small>
                </span>
                <span>{fmt(r.amount)}</span>
                <button
                  className="icon-button"
                  aria-label={t("Delete")}
                  onClick={() =>
                    updateLedger((l) => ({
                      ...l,
                      recurring: l.recurring.filter((x) => x.id !== r.id),
                    }))
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          ) : (
            <p className="muted">{t("No recurring items yet")}</p>
          )}
          <div className="inline-actions wrap">
            <button
              className="button secondary"
              onClick={() => modal(<RecurringForm />)}
            >
              <Plus size={16} />
              {t("Add template")}
            </button>
            <button
              className="text-button"
              disabled={!ledger.recurring.length}
              onClick={() => {
                updateLedger((l) => applyRecurring(l, month));
                toast("Templates applied");
              }}
            >
              {t("Apply to selected month")}
            </button>
          </div>
        </div>
      </section>
      <section className="settings-section">
        <div>
          <h2>{t("Your data")}</h2>
          <p>
            {t(
              "Stored locally in this browser, without an account or trackers. Export a backup regularly; data is not synced across devices.",
            )}
            {data.banking && (
              <span>
                {" "}
                {t(
                  "Bank connections are stored on your server. Disconnect banks before deleting their data; clearing this browser does not revoke consent.",
                )}
              </span>
            )}
          </p>
        </div>
        <div className="settings-fields">
          <div className="data-buttons">
            <button className="button secondary" onClick={() => setDemo(true)}>
              {t("Explore demo")}
            </button>
            <button
              className="button secondary"
              onClick={() =>
                download(
                  "moneta-backup.json",
                  JSON.stringify(data, null, 2),
                  "application/json",
                )
              }
            >
              <Download size={16} />
              {t("Export JSON backup")}
            </button>
            <button
              className="button secondary"
              onClick={() =>
                download(
                  `moneta-${data.currency}.csv`,
                  csvExport(ledger),
                  "text/csv;charset=utf-8",
                )
              }
            >
              <Download size={16} />
              {t("Export CSV")}
            </button>
            <button
              className="button secondary"
              disabled={demo}
              onClick={() => input.current?.click()}
            >
              <Upload size={16} />
              {t("Import backup")}
            </button>
            <input
              ref={input}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  if (file.size > 10 * 1024 * 1024)
                    throw new Error("File is too large (maximum 10 MB).");
                  const imported = validateImport(
                    JSON.parse(await file.text()),
                  );
                  modal(
                    <Confirm
                      danger={false}
                      title="Replace data with this backup?"
                      description="This replaces all currency ledgers. Export a backup first."
                      onConfirm={() => {
                        setDraft(null);
                        update(() => imported);
                        toast("Data imported");
                      }}
                    />,
                  );
                } catch (err) {
                  toast(
                    (err as Error).message.startsWith("Unexpected")
                      ? "The file is not a valid MONETA backup."
                      : (err as Error).message,
                  );
                }
              }}
            />
          </div>
          <button
            className="text-button negative"
            disabled={demo}
            onClick={() =>
              modal(
                <Confirm
                  title="Permanently delete all local data?"
                  description="This cannot be undone. Export a backup before continuing."
                  onConfirm={() => {
                    deleteData()
                      .then(reset)
                      .catch(() =>
                        toast("Could not save. Export a backup now."),
                      );
                  }}
                />,
              )
            }
          >
            <Trash2 size={16} />
            {t("Delete all data")}
          </button>
        </div>
      </section>
    </div>
  );
}
