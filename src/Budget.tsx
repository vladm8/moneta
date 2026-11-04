import { useEffect, useState, useRef } from "react";
import {
  SlidersHorizontal,
  AlertCircle,
  Bookmark,
  Copy,
  Check,
  Plus,
  ArrowUp,
  ArrowDown,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  useFinance,
  SectionHeader,
  Empty,
  CategoryIcon,
  CategoryForm,
  CategoryDetails,
  DeleteCategoryConfirm,
  Progress,
  ErrorText,
  EntryForm,
} from "./ui";
import {
  summary,
  categorySpent,
  parseMoney,
  percentAmount,
  savePlan,
  distribute,
  presetPlan,
  shiftMonth,
  uid,
  type Category,
} from "./engine";
import { Donut } from "./Charts";
function AllocationRow({
  category,
  amount,
  income,
  onChange,
  onInvalid,
}: {
  category: Category;
  amount: number;
  income: number;
  onChange: (n: number) => void;
  onInvalid: (v: boolean) => void;
}) {
  const { t, fmt, ledger, month, modal, updateLedger, data } = useFinance();
  const editing = useRef(false);
  const [mode, setMode] = useState("amount");
  const [text, setText] = useState((amount / 100).toFixed(2));
  const [error, setError] = useState(false);
  useEffect(() => {
    if (editing.current) return;
    setText(
      mode === "amount"
        ? (amount / 100).toFixed(2)
        : income
          ? ((amount / income) * 100).toFixed(2)
          : "0.00",
    );
  }, [amount, mode, income]);
  const spent = categorySpent(ledger, month, category.id);
  const index = ledger.categories.findIndex((c) => c.id === category.id);
  function move(offset: number) {
    updateLedger((l) => {
      const a = [...l.categories];
      [a[index], a[index + offset]] = [a[index + offset], a[index]];
      return { ...l, categories: a };
    });
  }
  return (
    <div className={`allocation-row ${error ? "has-error" : ""}`}>
      <div className="allocation-row-header">
        <CategoryIcon category={category} />
        <div>
          <button
            className="category-title"
            onClick={() => modal(<CategoryDetails id={category.id} />)}
          >
            {category.name}
          </button>
          <small>
            {t(category.kind === "savings" ? "Savings transfer" : "Spent")}:{" "}
            {fmt(spent)} · {t("Remaining")}: {fmt(amount - spent)}
          </small>
        </div>
        <div className="row-actions">
          <button
            className="icon-button"
            disabled={index === 0}
            aria-label={t("Move up")}
            onClick={() => move(-1)}
          >
            <ArrowUp size={14} />
          </button>
          <button
            className="icon-button"
            disabled={index === ledger.categories.length - 1}
            aria-label={t("Move down")}
            onClick={() => move(1)}
          >
            <ArrowDown size={14} />
          </button>
          <button
            className="icon-button"
            aria-label={t("Edit") + " " + category.name}
            onClick={() => modal(<CategoryForm category={category} />)}
          >
            <Pencil size={14} />
          </button>
          <button
            className="icon-button"
            aria-label={t("Delete") + " " + category.name}
            onClick={() => modal(<DeleteCategoryConfirm id={category.id} />)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div className="allocation-controls">
        <input
          type="range"
          aria-label={category.name + " " + t("Allocation")}
          min="0"
          max={Math.max(income, amount, 100)}
          step="1"
          value={amount}
          style={
            {
              "--category": category.color,
              "--fill": `${Math.min(100, (amount / Math.max(income, amount, 100)) * 100)}%`,
            } as React.CSSProperties
          }
          onChange={(e) => {
            setError(false);
            onInvalid(false);
            onChange(Number(e.target.value));
          }}
        />
        <div className="allocation-number">
          <input
            inputMode="decimal"
            aria-label={
              category.name +
              " " +
              t(mode === "amount" ? "Amount" : "Percentage")
            }
            aria-invalid={error}
            onFocus={() => (editing.current = true)}
            onBlur={() => {
              editing.current = false;
              if (!error)
                setText(
                  mode === "amount"
                    ? (amount / 100).toFixed(2)
                    : income
                      ? ((amount / income) * 100).toFixed(2)
                      : "0.00",
                );
            }}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              try {
                const n =
                  mode === "amount"
                    ? parseMoney(e.target.value)
                    : percentAmount(income, e.target.value);
                setError(false);
                onInvalid(false);
                onChange(n);
              } catch {
                setError(true);
                onInvalid(true);
              }
            }}
          />
          <button
            className="unit-toggle"
            aria-label={t(mode === "amount" ? "Percentage" : "Amount")}
            onClick={() => {
              setMode(mode === "amount" ? "percent" : "amount");
              setError(false);
              onInvalid(false);
            }}
          >
            {mode === "amount" ? data.currency : "%"}
          </button>
        </div>
      </div>
      <div className="allocation-row-foot">
        <span>
          {income ? ((amount / income) * 100).toFixed(1) : "0"}%{" "}
          {t("of income")}
        </span>
        <span className={spent > amount ? "negative" : ""}>
          {spent > amount
            ? t("Over limit")
            : spent >= amount * 0.9 && amount
              ? t("Near limit")
              : ""}
        </span>
      </div>
      {error && <ErrorText error="Enter a valid positive amount." />}
    </div>
  );
}
function PresetSave({ plan }: { plan: Record<string, number> }) {
  const { t, updateLedger, close, toast } = useFinance();
  return (
    <>
      <h2 id="dialog-title">{t("Save as preset")}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const name = String(new FormData(e.currentTarget).get("name")).trim();
          if (!name) return;
          updateLedger((l) => ({
            ...l,
            presets: [
              ...l.presets,
              { id: uid(), name, allocations: { ...plan } },
            ],
          }));
          close();
          toast("Preset saved");
        }}
      >
        <label>
          {t("Plan name")}
          <input name="name" required maxLength={80} />
        </label>
        <button className="button">{t("Save")}</button>
      </form>
    </>
  );
}
export function Budget() {
  const { ledger, month, t, fmt, modal, toast, updateLedger, draft, setDraft } =
    useFinance();
  const plan = draft || ledger.plans[month] || {};
  const s = summary(ledger, month, plan);
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [inputRevision, setInputRevision] = useState(0);
  const [presets, setPresets] = useState(false);
  const active = ledger.categories.filter((c) => !c.archived);
  const set = (id: string, n: number) => setDraft({ ...plan, [id]: n });
  function save() {
    try {
      const clean = Object.fromEntries(
        Object.entries(plan).filter(([id]) =>
          ledger.categories.some((c) => c.id === id),
        ),
      );
      const next = savePlan(ledger, month, clean);
      updateLedger(() => next);
      setDraft(null);
      toast("Plan saved");
    } catch (e) {
      toast((e as Error).message);
    }
  }
  return (
    <>
      <div className="page-toolbar">
        <div className="inline-actions">
          <button
            className="button secondary"
            onClick={() => setPresets(!presets)}
            aria-expanded={presets}
          >
            <SlidersHorizontal size={16} />
            {t("Presets")}
          </button>
          <button
            className="button secondary"
            onClick={() => {
              const previous = ledger.plans[shiftMonth(month, -1)];
              if (previous) {
                setDraft({ ...previous });
                toast("Copied previous plan");
              } else toast("No previous plan");
            }}
          >
            <Copy size={16} />
            {t("Copy previous month")}
          </button>
        </div>
        <button className="button" onClick={() => modal(<CategoryForm />)}>
          <Plus size={17} />
          {t("Add category")}
        </button>
      </div>
      {presets && (
        <div className="preset-panel">
          <div className="preset-choices">
            {[
              ["50 / 30 / 20", "balanced", "50 / 30 / 20"],
              ["Essentials first", "essentials", "65 / 20 / 15"],
              ["Savings focused", "savings", "45 / 20 / 35"],
            ].map(([label, key, ratio]) => (
              <button
                key={key}
                onClick={() => setDraft(presetPlan(ledger, s.income, key))}
              >
                <strong>{t(label)}</strong>
                <small>
                  {ratio} · {t("Needs / wants / savings")}
                </small>
              </button>
            ))}
          </div>
          <div className="saved-presets">
            {ledger.presets.map((p) => (
              <span key={p.id}>
                <button
                  className="text-button"
                  onClick={() => setDraft({ ...p.allocations })}
                >
                  <Bookmark size={14} />
                  {p.name}
                </button>
                <button
                  className="icon-button"
                  aria-label={t("Delete") + " " + p.name}
                  onClick={() =>
                    updateLedger((l) => ({
                      ...l,
                      presets: l.presets.filter((x) => x.id !== p.id),
                    }))
                  }
                >
                  ×
                </button>
              </span>
            ))}
            <button
              className="text-button"
              disabled={s.unallocated < 0}
              onClick={() => modal(<PresetSave plan={plan} />)}
            >
              <Plus size={14} />
              {t("Save as preset")}
            </button>
          </div>
        </div>
      )}
      <div className="budget-editor-layout">
        <section className="allocation-editor">
          <SectionHeader
            title="Allocation"
            subtitle="Move the sliders. Find your balance."
          />
          {!active.length ? (
            <Empty
              title="No categories yet"
              description="Create categories to give your budget structure."
              action={
                <button
                  className="button secondary"
                  onClick={() => modal(<CategoryForm />)}
                >
                  {t("Add category")}
                </button>
              }
            />
          ) : (
            active.map((c) => (
              <AllocationRow
                key={`${c.id}:${inputRevision}`}
                category={c}
                amount={plan[c.id] || 0}
                income={s.income}
                onChange={(n) => set(c.id, n)}
                onInvalid={(v) =>
                  setInvalid((old) => {
                    const n = new Set(old);
                    v ? n.add(c.id) : n.delete(c.id);
                    return n;
                  })
                }
              />
            ))
          )}
          <div className="editor-bottom-actions">
            <button
              className="text-button"
              disabled={s.unallocated <= 0 || !active.length}
              onClick={() => {
                const extra = distribute(
                  s.unallocated,
                  active.map(() => 1),
                );
                setDraft({
                  ...plan,
                  ...Object.fromEntries(
                    active.map((c, i) => [c.id, (plan[c.id] || 0) + extra[i]]),
                  ),
                });
              }}
            >
              <Plus size={16} />
              {t("Distribute remainder")}
            </button>
            <button
              className="text-button muted"
              onClick={() =>
                setDraft(
                  Object.fromEntries(ledger.categories.map((c) => [c.id, 0])),
                )
              }
            >
              <RotateCcw size={14} />
              {t("Reset")}
            </button>
          </div>
          {ledger.categories.some((c) => c.archived) && (
            <details>
              <summary>{t("Archived categories")}</summary>
              {ledger.categories
                .filter((c) => c.archived)
                .map((c) => (
                  <button
                    className="archive-row"
                    key={c.id}
                    onClick={() => modal(<CategoryDetails id={c.id} />)}
                  >
                    {c.name}
                    <span>{fmt(plan[c.id] || 0)}</span>
                  </button>
                ))}
            </details>
          )}
        </section>
        <aside className="plan-summary panel">
          <span className="eyebrow">{t("Live preview")}</span>
          <Donut plan={plan} compact />
          <div className="summary-lines">
            <div>
              <span>{t("Monthly income")}</span>
              <button
                className="text-button"
                onClick={() => modal(<EntryForm type="income" />)}
              >
                {fmt(s.income)}
                <Plus size={14} />
              </button>
            </div>
            <div>
              <span>{t("Allocated")}</span>
              <strong>{fmt(s.allocated)}</strong>
            </div>
            <div className={s.unallocated < 0 ? "negative" : ""}>
              <span>{t("Unallocated")}</span>
              <strong>{fmt(s.unallocated)}</strong>
            </div>
          </div>
          {s.unallocated < 0 && (
            <div className="warning" role="alert">
              <AlertCircle size={18} />
              <div>
                <strong>
                  {t("Over budget by")} {fmt(-s.unallocated)}
                </strong>
                <p>{t("Reduce allocations before saving.")}</p>
              </div>
            </div>
          )}
          <button
            className="button full"
            onClick={save}
            disabled={
              s.unallocated < 0 ||
              active.some((c) => invalid.has(c.id)) ||
              !draft
            }
          >
            <Check size={17} />
            {t("Save plan")}
          </button>
          <span className="save-status">
            {t(draft ? "Unsaved changes" : "All changes saved locally")}
          </span>
          {draft && (
            <button
              className="text-button center"
              onClick={() => {
                setDraft(null);
                setInvalid(new Set());
                setInputRevision((revision) => revision + 1);
              }}
            >
              {t("Discard changes")}
            </button>
          )}
        </aside>
      </div>
      <section className="history-section">
        <SectionHeader title="Budget history" />
        {Object.keys(ledger.plans).length ? (
          <div className="history-list">
            {Object.keys(ledger.plans)
              .sort()
              .reverse()
              .slice(0, 12)
              .map((m) => (
                <div key={m}>
                  <strong>{m}</strong>
                  <span>
                    {t("Allocated")}: {fmt(summary(ledger, m).allocated)}
                  </span>
                  <span>
                    {t("Spent")}: {fmt(summary(ledger, m).spent)}
                  </span>
                </div>
              ))}
          </div>
        ) : (
          <p className="muted">{t("No monthly plans yet")}</p>
        )}
      </section>
    </>
  );
}
