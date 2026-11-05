import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Wallet,
  Leaf,
  MoveUpRight,
  SlidersHorizontal,
} from "lucide-react";
import {
  useFinance,
  Money,
  SectionHeader,
  Empty,
  CategoryIcon,
  Progress,
  TransactionList,
  EntryForm,
  GoalForm,
  CategoryDetails,
} from "./ui";
import { summary, entriesFor, categorySpent } from "./engine";
import { Donut } from "./Charts";
import { PortfolioSummary } from "./Portfolio";
import { goalPlan } from "./finance";
export function Overview() {
  const { ledger, month, t, fmt, setPage, modal } = useFinance();
  const s = summary(ledger, month);
  const plan = ledger.plans[month] || {};
  const recent = [...entriesFor(ledger, month)]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);
  const goal = ledger.goals.find((g) => !g.archived);
  const saved = goal ? goalPlan(goal, ledger).saved : 0;
  return (
    <div className="overview-layout">
      <section className="panel dashboard-primary">
        <div>
          <span className="eyebrow">{t("This month")}</span>
          <h2>{t("Available money")}</h2>
          <div className="metric-value">
            <Money value={s.available} fit />
          </div>
          <p>{t("After expenses and savings transfers")}</p>
        </div>
        <div className="primary-budget-status">
          <span>{t("Remaining monthly budget")}</span>
          <strong>{fmt(s.allocated - s.spent - s.saved)}</strong>
          <Progress value={s.income > 0 ? (s.allocated / s.income) * 100 : 0} />
          <small>
            {t("Allocated")}: {fmt(s.allocated)} / {fmt(s.income)}
          </small>
          <button className="text-button" onClick={() => setPage("budget")}>
            {t("Edit budget")}
            <ArrowRight size={16} />
          </button>
        </div>
      </section>
      <div className="overview-metrics">
        <div className="metric-block">
          <div className="metric-label">
            <Wallet size={17} />
            {t("Monthly income")}
            <button
              aria-label={t("Add income")}
              className="tiny-button"
              onClick={() => modal(<EntryForm type="income" />)}
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="metric-value">
            <Money value={s.income} fit />
          </div>
          <button
            className="metric-caption text-button"
            onClick={() => setPage("transactions")}
          >
            {
              entriesFor(ledger, month).filter((e) => e.type === "income")
                .length
            }{" "}
            {t("Income sources").toLocaleLowerCase()}
            <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="metric-block">
          <div className="metric-label">
            <MoveUpRight size={17} />
            {t("Monthly spending")}
          </div>
          <div className="metric-value">
            <Money value={s.spent} fit />
          </div>
          <span className="metric-caption">{t("Expenses minus refunds")}</span>
        </div>
        <div className="metric-block savings-metric">
          <div className="metric-label">
            <Leaf size={17} />
            {t("Total savings")}
            <span className="small-star">✧</span>
          </div>
          <div className="metric-value">
            <Money value={s.totalSaved} fit />
          </div>
          <span className="metric-caption">
            {t("Across all your goals")}
            <ArrowUpRight size={15} />
          </span>
          <span className="savings-orbit orbit-one" />
          <span className="savings-orbit orbit-two" />
        </div>
      </div>
      <div className="dashboard-portfolio">
        <PortfolioSummary compact />
      </div>
      <section className="panel allocation-panel">
        <SectionHeader
          title="Your money, with a plan"
          subtitle="Give every złoty a purpose."
          action={
            <button className="text-button" onClick={() => setPage("budget")}>
              {t("Edit budget")}
              <ArrowUpRight size={16} />
            </button>
          }
        />
        <Donut />
        <div className="allocation-footer">
          <div>
            <span className="dot" style={{ background: "var(--green)" }} />
            <span>{t("Allocated")}</span>
            <strong>
              <Money value={s.allocated} decimals={false} />
            </strong>
          </div>
          <div>
            <span
              className="dot"
              style={{ background: "var(--unallocated)" }}
            />
            <span>{t("Unallocated")}</span>
            <strong className={s.unallocated < 0 ? "negative" : ""}>
              <Money value={s.unallocated} decimals={false} />
            </strong>
          </div>
        </div>
      </section>
      <section className="budget-overview">
        <SectionHeader
          title="Budget at a glance"
          subtitle="Planned vs. actual"
          action={
            <button
              className="icon-button"
              aria-label={t("Edit budget")}
              onClick={() => setPage("budget")}
            >
              <SlidersHorizontal size={18} />
            </button>
          }
        />
        {!ledger.categories.length ? (
          <Empty
            title="No categories yet"
            description="Create categories to give your budget structure."
            action={
              <button
                className="button secondary"
                onClick={() => setPage("budget")}
              >
                <Plus size={16} />
                {t("Add category")}
              </button>
            }
          />
        ) : (
          <div className="budget-preview-list">
            {ledger.categories
              .filter((c) => !c.archived)
              .slice(0, 6)
              .map((c) => {
                const amount = plan[c.id] || 0,
                  spent = categorySpent(ledger, month, c.id),
                  ratio = amount ? (spent / amount) * 100 : spent ? 100 : 0;
                return (
                  <button
                    className="budget-preview"
                    key={c.id}
                    onClick={() => modal(<CategoryDetails id={c.id} />)}
                  >
                    <CategoryIcon category={c} />
                    <div className="budget-preview-content">
                      <div>
                        <strong>{c.name}</strong>
                        <span>
                          {fmt(spent, false)} <em>/ {fmt(amount, false)}</em>
                        </span>
                      </div>
                      <Progress value={ratio} color={c.color} />
                      {spent > amount && (
                        <small className="negative">
                          {t("Over limit")} · {fmt(spent - amount)}
                        </small>
                      )}
                    </div>
                  </button>
                );
              })}
          </div>
        )}
        <div className="spending-total">
          <span>{t("Spent")}</span>
          <strong>{fmt(s.spent)}</strong>
        </div>
        <div className="quiet-note">
          <Leaf size={17} />
          <span>{t("Savings are transfers, not expenses.")}</span>
        </div>
      </section>
      <section className="activity-section">
        <SectionHeader
          title="Recent activity"
          subtitle="The little things add up."
          action={
            <button
              className="text-button"
              onClick={() => setPage("transactions")}
            >
              {t("View all")}
              <ArrowRight size={15} />
            </button>
          }
        />
        <TransactionList entries={recent} compact />
      </section>
      <section className="goal-preview">
        <SectionHeader
          title="Your next chapter"
          subtitle="Small steps. Meaningful goals."
          action={
            <button
              className="icon-button"
              aria-label={t("Add goal")}
              onClick={() => modal(<GoalForm />)}
            >
              <Plus size={18} />
            </button>
          }
        />
        {goal ? (
          <>
            <div className="goal-visual">
              <span className="goal-arch">
                <Leaf size={30} strokeWidth={1} />
              </span>
              <span className="goal-sun" />
              <span className="goal-hill" />
            </div>
            <div className="goal-preview-title">
              <h3>{goal.name}</h3>
              <span>{Math.round((saved / goal.target) * 100)}%</span>
            </div>
            <Progress value={(saved / goal.target) * 100} color={goal.color} />
            <div className="goal-preview-amount">
              <strong>{fmt(saved, false)}</strong>
              <span>/ {fmt(goal.target, false)}</span>
            </div>
            <button className="text-button" onClick={() => setPage("goals")}>
              {t("Savings goals")}
              <ArrowRight size={16} />
            </button>
          </>
        ) : (
          <Empty
            title="No goals yet"
            description="Make room for something that matters."
            action={
              <button
                className="text-button"
                onClick={() => modal(<GoalForm />)}
              >
                {t("Add goal")}
                <Plus size={15} />
              </button>
            }
          />
        )}
      </section>
    </div>
  );
}
