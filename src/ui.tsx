import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Plus,
  X,
  Check,
  Home,
  ShoppingBasket,
  Car,
  Sparkles,
  ShoppingBag,
  Leaf,
  Heart,
  Coffee,
  Plane,
  BookOpen,
  Wallet,
  Gift,
  Trash2,
  Pencil,
  Archive,
  RotateCcw,
} from "lucide-react";
import type {
  Data,
  Ledger,
  Category,
  Goal,
  Entry,
  Page,
  Recurring,
} from "./engine";
import {
  uid,
  colors,
  icons,
  parseMoney,
  recordEntry,
  addCategory,
  removeCategory,
  today,
  summary,
  categorySpent,
  CURRENCIES,
  emptyLedger,
  type Currency,
} from "./engine";
export type FinanceContext = {
  data: Data;
  ledger: Ledger;
  month: string;
  setMonth: (s: string) => void;
  page: Page;
  setPage: (p: Page) => void;
  update: (f: (d: Data) => Data) => void;
  updateLedger: (f: (l: Ledger) => Ledger) => void;
  t: (s: string) => string;
  fmt: (n: number, decimals?: boolean) => string;
  modal: (content: ReactNode) => void;
  close: () => void;
  toast: (s: string, undo?: () => void) => void;
  demo: boolean;
  setDemo: (v: boolean) => void;
  draft: Record<string, number> | null;
  setDraft: (p: Record<string, number> | null) => void;
};
export const Finance = createContext<FinanceContext>(null!);
export const useFinance = () => useContext(Finance);
const iconMap: Record<string, typeof Home> = {
  home: Home,
  basket: ShoppingBasket,
  car: Car,
  sparkles: Sparkles,
  bag: ShoppingBag,
  leaf: Leaf,
  heart: Heart,
  coffee: Coffee,
  plane: Plane,
  book: BookOpen,
  wallet: Wallet,
  gift: Gift,
};
export function CategoryIcon({
  category,
  size = 18,
}: {
  category?: Partial<Category>;
  size?: number;
}) {
  const Icon = iconMap[category?.icon || "wallet"] || Wallet;
  return (
    <span
      className="category-icon"
      style={
        { "--category": category?.color || "#8e98ac" } as React.CSSProperties
      }
    >
      <Icon size={size} />
    </span>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const { t } = useFinance();
  return (
    <div className="empty">
      <span className="empty-symbol">
        <Leaf size={26} strokeWidth={1.3} />
      </span>
      <h3>{t(title)}</h3>
      {description && <p>{t(description)}</p>}
      {action}
    </div>
  );
}
export function Money({
  value,
  decimals = true,
  fit = false,
}: {
  value: number;
  decimals?: boolean;
  fit?: boolean;
}) {
  const { fmt } = useFinance();
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  const textRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const text = textRef.current;
    const container = text?.parentElement;
    if (!fit || !text || !container) return;
    const resize = () => {
      text.style.fontSize = "inherit";
      const fontSize = parseFloat(getComputedStyle(text).fontSize);
      const available = container.clientWidth;
      const width = text.getBoundingClientRect().width;
      if (available > 0 && width > available)
        text.style.fontSize = `${(fontSize * available) / width}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [fit, shown, fmt, decimals]);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      current.current = value;
      return;
    }
    const from = current.current;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 350);
      const n = Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3)));
      current.current = n;
      setShown(n);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <span className="number" ref={textRef}>
      {fmt(shown, decimals)}
    </span>
  );
}
export function Modal({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const active = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button,input,select,textarea,[tabindex="0"]',
        ) || [],
      ).filter((e) => !e.hasAttribute("disabled"));
    focusables()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = focusables();
        const first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      active?.focus();
    };
  }, [onClose]);
  const { t } = useFinance();
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        ref={ref}
      >
        <button
          className="icon-button modal-close"
          aria-label={t("Close")}
          onClick={onClose}
        >
          <X size={20} />
        </button>
        {children}
      </div>
    </div>
  );
}
export function Confirm({
  title,
  description,
  onConfirm,
  danger = true,
}: {
  title: string;
  description: string;
  onConfirm: () => void;
  danger?: boolean;
}) {
  const { t, close } = useFinance();
  return (
    <>
      <span className="eyebrow">MONETA</span>
      <h2 id="dialog-title">{t(title)}</h2>
      <p className="dialog-description">{t(description)}</p>
      <div className="form-actions">
        <button className="button secondary" onClick={close}>
          {t("Cancel")}
        </button>
        <button
          className={`button ${danger ? "danger" : ""}`}
          onClick={() => {
            onConfirm();
            close();
          }}
        >
          {t(danger ? "Delete" : "Import backup")}
        </button>
      </div>
    </>
  );
}
export function ErrorText({ error }: { error: string }) {
  const { t } = useFinance();
  return error ? (
    <p className="error" role="alert">
      {t(error)}
    </p>
  ) : null;
}
export function EntryForm({
  entry,
  type = "expense",
  goalId,
}: {
  entry?: Entry;
  type?: Entry["type"];
  goalId?: string;
}) {
  const { ledger, month, t, fmt, updateLedger, close, toast } = useFinance();
  const [kind, setKind] = useState(entry?.type || type);
  const [error, setError] = useState("");
  const initialDate = month === today().slice(0, 7) ? today() : month + "-01";
  return (
    <>
      <span className="eyebrow">{t("Every movement, in one place")}</span>
      <h2 id="dialog-title">
        {t(
          entry
            ? "Edit transaction"
            : kind === "income"
              ? "Add income"
              : kind === "transfer"
                ? "Add contribution"
                : "Add transaction",
        )}
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            const item: Entry = {
              id: entry?.id || uid(),
              type: kind,
              amount: parseMoney(String(f.get("amount"))),
              description: String(f.get("description")).trim(),
              date: String(f.get("date")),
              categoryId:
                kind === "income" ? "" : String(f.get("category") || ""),
              ...(kind === "transfer" ? { goalId: String(f.get("goal")) } : {}),
              ...(entry?.recurringId ? { recurringId: entry.recurringId } : {}),
              ...(entry?.sourceId ? { sourceId: entry.sourceId } : {}),
            };
            const next = recordEntry(ledger, item);
            updateLedger(() => next);
            toast("Transaction saved");
            close();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        {!entry && (
          <div className="segmented">
            {(["expense", "income", "transfer"] as const).map((k) => (
              <button
                type="button"
                key={k}
                className={kind === k ? "active" : ""}
                onClick={() => setKind(k)}
              >
                {t(
                  k === "expense"
                    ? "Expense"
                    : k === "income"
                      ? "Income"
                      : "Savings transfer",
                )}
              </button>
            ))}
          </div>
        )}
        <label>
          {t("Amount")}
          <input
            name="amount"
            required
            autoFocus
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={entry ? (entry.amount / 100).toFixed(2) : ""}
            className="amount-input"
          />
        </label>
        {kind === "transfer" && (
          <>
            <p className="field-help">
              {t("Available")}: {fmt(summary(ledger, month).available)}
            </p>
            <label>
              {t("Savings goals")}
              <select
                name="goal"
                required
                defaultValue={entry?.goalId || goalId}
              >
                {ledger.goals
                  .filter((g) => !g.archived || g.id === entry?.goalId)
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
              </select>
            </label>
          </>
        )}
        {kind !== "income" && (
          <label>
            {t("Category")}
            <select
              name="category"
              defaultValue={
                entry?.categoryId ||
                (kind === "transfer"
                  ? ledger.categories.find((c) => c.kind === "savings")?.id
                  : "") ||
                ""
              }
            >
              <option value="">{t("Uncategorized")}</option>
              {ledger.categories
                .filter((c) => !c.archived || c.id === entry?.categoryId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label>
          {t("Description")}
          <input
            name="description"
            maxLength={160}
            required
            defaultValue={
              entry?.description ||
              (goalId ? ledger.goals.find((g) => g.id === goalId)?.name : "")
            }
          />
        </label>
        <label>
          {t("Date")}
          <input
            name="date"
            type="date"
            required
            defaultValue={entry?.date || initialDate}
          />
        </label>
        <ErrorText error={error} />
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={close}>
            {t("Cancel")}
          </button>
          <button className="button">
            <Check size={16} />
            {t("Save transaction")}
          </button>
        </div>
      </form>
    </>
  );
}
export function CategoryForm({ category }: { category?: Category }) {
  const { t, ledger, updateLedger, toast, close, modal } = useFinance();
  const [color, setColor] = useState(
    category?.color || colors[ledger.categories.length % colors.length],
  );
  const [icon, setIcon] = useState(category?.icon || "home");
  const [error, setError] = useState("");
  return (
    <>
      <span className="eyebrow">{t("Budget")}</span>
      <h2 id="dialog-title">
        {t(category ? "Edit category" : "Add category")}
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            const c: Category = {
              id: category?.id || uid(),
              name: String(f.get("name")).trim(),
              color,
              icon,
              archived: category?.archived || false,
              kind: String(f.get("kind")) as Category["kind"],
            };
            const others = {
              ...ledger,
              categories: ledger.categories.filter(
                (c) => c.id !== category?.id,
              ),
            };
            addCategory(others, c);
            updateLedger((l) => ({
              ...l,
              categories: category
                ? l.categories.map((x) => (x.id === category.id ? c : x))
                : [...l.categories, c],
            }));
            toast("Category saved");
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
            maxLength={80}
            defaultValue={category?.name}
          />
        </label>
        <label>
          {t("Group")}
          <select name="kind" defaultValue={category?.kind || "needs"}>
            <option value="needs">{t("Needs")}</option>
            <option value="wants">{t("Wants")}</option>
            <option value="savings">{t("Savings")}</option>
          </select>
        </label>
        <label>
          {t("Color")}
          <div className="swatches">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                style={{ background: c }}
                aria-label={c}
                aria-pressed={color === c}
                className={color === c ? "selected" : ""}
                onClick={() => setColor(c)}
              >
                {color === c && <Check size={16} />}
              </button>
            ))}
            <input
              aria-label={t("Color")}
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </div>
        </label>
        <label>
          {t("Icon")}
          <div className="icon-options">
            {icons.map((i) => (
              <button
                type="button"
                key={i}
                className={icon === i ? "selected" : ""}
                onClick={() => setIcon(i)}
                aria-label={t(i.charAt(0).toUpperCase() + i.slice(1))}
                aria-pressed={icon === i}
              >
                <CategoryIcon category={{ icon: i, color }} />
              </button>
            ))}
          </div>
        </label>
        <ErrorText error={error} />
        <div className="form-actions">
          {category && (
            <button
              type="button"
              className="text-button negative category-delete-action"
              onClick={() => modal(<DeleteCategoryConfirm id={category.id} />)}
            >
              <Trash2 size={16} />
              {t("Delete")}
            </button>
          )}
          <button type="button" className="button secondary" onClick={close}>
            {t("Cancel")}
          </button>
          <button className="button">{t("Save")}</button>
        </div>
      </form>
    </>
  );
}
export function DeleteCategoryConfirm({ id }: { id: string }) {
  const { updateLedger } = useFinance();
  return (
    <Confirm
      title="Delete category?"
      description="Transactions are kept and moved to Uncategorized. Historical allocations in this category are removed. Archive to preserve history."
      onConfirm={() => updateLedger((ledger) => removeCategory(ledger, id))}
    />
  );
}
export function CategoryDetails({ id }: { id: string }) {
  const { ledger, month, t, fmt, modal, updateLedger, setPage, close } =
    useFinance();
  const c = ledger.categories.find((c) => c.id === id);
  if (!c) return null;
  const spent = categorySpent(ledger, month, id),
    budget = ledger.plans[month]?.[id] || 0;
  const history = ledger.entries.filter(
    (e) => e.date.startsWith(month) && e.categoryId === id,
  );
  return (
    <>
      <CategoryIcon category={c} />
      <h2 id="dialog-title">{c.name}</h2>
      <div className="detail-stats">
        <div>
          <small>{t("Planned")}</small>
          <strong>{fmt(budget)}</strong>
        </div>
        <div>
          <small>
            {t(c.kind === "savings" ? "Savings transfer" : "Spent")}
          </small>
          <strong>{fmt(spent)}</strong>
        </div>
        <div>
          <small>{t("Remaining")}</small>
          <strong>{fmt(budget - spent)}</strong>
        </div>
      </div>
      <div className="inline-actions">
        <button
          className="button secondary"
          onClick={() => {
            setPage("budget");
            close();
          }}
        >
          {t("Edit budget")}
        </button>
        <button
          className="icon-button"
          aria-label={t("Edit")}
          onClick={() => modal(<CategoryForm category={c} />)}
        >
          <Pencil size={17} />
        </button>
        <button
          className="icon-button"
          aria-label={t(c.archived ? "Restore" : "Archive")}
          onClick={() => {
            updateLedger((l) => ({
              ...l,
              categories: l.categories.map((x) =>
                x.id === id ? { ...x, archived: !x.archived } : x,
              ),
            }));
            close();
          }}
        >
          {c.archived ? <RotateCcw size={17} /> : <Archive size={17} />}
        </button>
        <button
          className="icon-button"
          aria-label={t("Delete")}
          onClick={() => modal(<DeleteCategoryConfirm id={id} />)}
        >
          <Trash2 size={17} />
        </button>
      </div>
      <h3>{t("Recent activity")}</h3>
      <TransactionList entries={history} />
    </>
  );
}
export function GoalForm({ goal }: { goal?: Goal }) {
  const { t, data, update, close, toast } = useFinance();
  const [error, setError] = useState("");
  return (
    <>
      <span className="eyebrow">{t("Your next chapter")}</span>
      <h2 id="dialog-title">{t(goal ? "Edit goal" : "Add goal")}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            const amount = parseMoney(String(f.get("target")));
            if (!amount) throw new Error("Enter an amount greater than zero.");
            const item: Goal = {
              id: goal?.id || uid(),
              name: String(f.get("name")).trim(),
              target: amount,
              date: String(f.get("date")),
              color: goal?.color || colors[0],
              archived: goal?.archived || false,
              initialSaved: parseMoney(String(f.get("initialSaved") || "0")),
              description: String(f.get("description") || "").trim(),
              icon: String(f.get("icon") || "leaf"),
              createdAt: goal?.createdAt || today(),
            };
            if (!item.name) throw new Error("Enter a name.");
            const currency = (
              goal ? data.currency : String(f.get("currency"))
            ) as Currency;
            update((d) => {
              const l = d.ledgers[currency] || emptyLedger();
              return {
                ...d,
                currency,
                ledgers: {
                  ...d.ledgers,
                  [currency]: {
                    ...l,
                    goals: goal
                      ? l.goals.map((g) => (g.id === goal.id ? item : g))
                      : [...l.goals, item],
                  },
                },
              };
            });
            toast("Goal saved");
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
            maxLength={80}
            required
            defaultValue={goal?.name}
          />
        </label>
        <label>
          {t("Target amount")}
          <input
            name="target"
            inputMode="decimal"
            required
            defaultValue={goal ? (goal.target / 100).toFixed(2) : ""}
          />
        </label>
        <label>
          {t("Target date (optional)")}
          <input name="date" type="date" defaultValue={goal?.date} />
        </label>
        <div className="form-grid">
          <label>
            {t("Currency")}
            <select
              name="currency"
              defaultValue={data.currency}
              disabled={!!goal}
            >
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            {t("Opening savings")}
            <input
              name="initialSaved"
              inputMode="decimal"
              required
              defaultValue={((goal?.initialSaved || 0) / 100).toFixed(2)}
            />
          </label>
        </div>
        <p className="field-help">
          {t(
            "Opening savings are existing money, not income. Add later deposits as contributions.",
          )}
        </p>
        <label>
          {t("Icon")}
          <select name="icon" defaultValue={goal?.icon || "leaf"}>
            {icons.map((icon) => (
              <option key={icon} value={icon}>
                {t(icon[0].toUpperCase() + icon.slice(1))}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Description")}
          <textarea
            name="description"
            maxLength={500}
            defaultValue={goal?.description}
          />
        </label>
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
export function RecurringForm() {
  const { t, ledger, updateLedger, close, toast } = useFinance();
  const [error, setError] = useState("");
  return (
    <>
      <h2 id="dialog-title">{t("Add template")}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const f = new FormData(e.currentTarget);
            const amount = parseMoney(String(f.get("amount")));
            if (!amount) throw new Error("Enter an amount greater than zero.");
            const item: Recurring = {
              id: uid(),
              type: String(f.get("type")) as Recurring["type"],
              amount,
              description: String(f.get("description")).trim(),
              categoryId: String(f.get("category")),
              day: Number(f.get("day")),
            };
            updateLedger((l) => ({ ...l, recurring: [...l.recurring, item] }));
            toast("Template saved");
            close();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <label>
          {t("Income")} / {t("Expense")}
          <select name="type">
            <option value="income">{t("Income")}</option>
            <option value="expense">{t("Expense")}</option>
          </select>
        </label>
        <label>
          {t("Description")}
          <input name="description" required maxLength={160} />
        </label>
        <label>
          {t("Amount")}
          <input name="amount" required inputMode="decimal" />
        </label>
        <label>
          {t("Category")}
          <select name="category">
            <option value="">{t("Uncategorized")}</option>
            {ledger.categories
              .filter((c) => !c.archived)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          {t("Day of month")}
          <input
            name="day"
            type="number"
            required
            min="1"
            max="31"
            defaultValue="1"
          />
        </label>
        <ErrorText error={error} />
        <div className="form-actions">
          <button className="button">{t("Save")}</button>
        </div>
      </form>
    </>
  );
}
export function TransactionList({
  entries,
  compact = false,
}: {
  entries: Entry[];
  compact?: boolean;
}) {
  const { ledger, t, fmt, modal, updateLedger, toast, data } = useFinance();
  if (!entries.length)
    return (
      <Empty
        title="No transactions yet"
        description="Your first transaction starts the story."
      />
    );
  return (
    <div className={`transaction-list ${compact ? "compact" : ""}`}>
      {entries.map((e) => {
        const cat = ledger.categories.find((c) => c.id === e.categoryId);
        return (
          <div className="transaction" key={e.id}>
            <CategoryIcon
              category={
                cat || {
                  icon: e.type === "income" ? "wallet" : "leaf",
                  color: e.type === "income" ? "#2d6a50" : "#b598bd",
                }
              }
            />
            <button
              className="transaction-name"
              onClick={() => modal(<EntryForm entry={e} />)}
            >
              <strong>{e.description}</strong>
              <small>
                {cat?.name ||
                  t(
                    e.type === "refund"
                      ? "Refund"
                      : e.type === "internal"
                        ? "Internal transfer"
                        : e.type === "income"
                          ? "Income"
                          : e.type === "transfer"
                            ? "Savings transfer"
                            : "Uncategorized",
                  )}
              </small>
            </button>
            <span className="transaction-date">
              {new Date(e.date + "T12:00:00").toLocaleDateString(
                data.language,
                { day: "numeric", month: "short" },
              )}
            </span>
            <span className={`transaction-amount ${e.type}`}>
              <span>
                {e.type === "income" || e.type === "refund"
                  ? "+"
                  : e.type === "expense"
                    ? "−"
                    : "↗"}
              </span>
              {fmt(e.amount)}
            </span>
            {!compact && (
              <button
                className="icon-button delete-transaction"
                aria-label={t("Delete") + " " + e.description}
                onClick={() =>
                  modal(
                    <Confirm
                      title="Delete this transaction?"
                      description="Your balances will be recalculated."
                      onConfirm={() => {
                        updateLedger((l) => ({
                          ...l,
                          entries: l.entries.filter((x) => x.id !== e.id),
                        }));
                        toast("Transaction deleted", () =>
                          updateLedger((l) => ({
                            ...l,
                            entries: [...l.entries, e],
                          })),
                        );
                      }}
                    />,
                  )
                }
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
export function Progress({ value, color }: { value: number; color?: string }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={Math.min(100, Math.max(0, Math.round(value)))}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span
        style={{
          width: `${Math.min(100, Math.max(0, value))}%`,
          background: color,
        }}
      />
    </div>
  );
}
export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const { t } = useFinance();
  return (
    <div className="section-header">
      <div>
        <h2>{t(title)}</h2>
        {subtitle && <p>{t(subtitle)}</p>}
      </div>
      {action}
    </div>
  );
}
export {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Plus,
  X,
  Check,
  Trash2,
  Pencil,
  Archive,
  RotateCcw,
};
