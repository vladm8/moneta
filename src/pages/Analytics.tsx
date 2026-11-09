import { ArrowDownRight, ArrowUpRight, Leaf } from "lucide-react";
import {
  categorySpent,
  entriesFor,
  locale,
  shiftMonth,
  summary,
} from "../engine";
import { PortfolioSummary } from "../Portfolio";
import { SpendingTrendCard } from "../TrendChart";
import { Empty, Money, Progress, SectionHeader, useFinance } from "../ui";
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
