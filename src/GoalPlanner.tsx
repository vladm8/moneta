import { useFinance } from "./ui";
import { goalPlan } from "./finance";
import type { Goal } from "./engine";

export function GoalPlanner({ goal }: { goal: Goal }) {
  const { ledger, fmt, t } = useFinance();
  const p = goalPlan(goal, ledger);
  return (
    <div className="goal-planner">
      <span
        className={`status-pill ${p.status === "Completed" || p.status === "On track" ? "positive" : p.status === "Overdue" || p.status === "Behind schedule" ? "negative" : ""}`}
      >
        {t(p.status)}
      </span>
      {goal.description && <p>{goal.description}</p>}
      {!!goal.bankSaved && (
        <p>
          {t("Bank balance reserved for this goal")}:{" "}
          <strong>{fmt(goal.bankSaved)}</strong>.{" "}
          {t("Already included in progress, not added to your contributions.")}
        </p>
      )}
      <dl className="finance-facts">
        <div>
          <dt>{t("Remaining")}</dt>
          <dd>{fmt(p.remaining)}</dd>
        </div>
        <div>
          <dt>{t("Time remaining")}</dt>
          <dd>{p.days === null ? "—" : `${p.days} ${t("days")}`}</dd>
        </div>
        <div>
          <dt>{t("Monthly savings needed")}</dt>
          <dd>{p.monthly === null ? "—" : fmt(p.monthly)}</dd>
        </div>
        <div>
          <dt>{t("Weekly savings needed")}</dt>
          <dd>{p.weekly === null ? "—" : fmt(p.weekly)}</dd>
        </div>
      </dl>
      {p.remaining > 0 && p.monthly !== null && (
        <p className="planner-recommendation">
          {t("Save each month")}: <strong>{fmt(p.monthly)}</strong> ·{" "}
          {t("Target date")}: {goal.date}
        </p>
      )}
      {p.status === "Overdue" && (
        <p>
          {t(
            "The deadline has passed. Set a new date to recalculate your plan.",
          )}
        </p>
      )}
      {p.status === "Due today" && (
        <p>{t("The goal is due today. The remaining amount is needed now.")}</p>
      )}
      {!goal.date && p.remaining > 0 && (
        <p>{t("Set a deadline to calculate your savings plan.")}</p>
      )}
      <small>
        {t("Projected completion")}: {p.projected || t("Not enough history")}.{" "}
        {t(
          "Based on contributions over up to 90 days; requires 7 days of history.",
        )}
      </small>
    </div>
  );
}
