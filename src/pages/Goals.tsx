import { Archive, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { CURRENCIES, type Currency, type Goal } from "../engine";
import { goalPlan } from "../finance";
import { GoalPlanner } from "../GoalPlanner";
import {
  CategoryIcon,
  Confirm,
  Empty,
  EntryForm,
  GoalForm,
  Money,
  Progress,
  TransactionList,
  useFinance,
} from "../ui";
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
                    <strong>
                      <Money value={saved} decimals={false} />
                    </strong>
                    <span>/ {fmt(g.target, false)}</span>
                  </div>
                  <Progress
                    value={(saved / g.target) * 100}
                    color={g.color}
                    celebrate
                  />
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
