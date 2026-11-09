import { Plus, Search, Upload } from "lucide-react";
import { useMemo, useState, type ComponentType } from "react";
import { entriesFor, summary } from "../engine";
import { Empty, EntryForm, Money, TransactionList, useFinance } from "../ui";
let importModule:
  | Promise<typeof import("../features/transaction-import/ImportWizard")>
  | undefined;
function loadImport() {
  return (importModule ??=
    import("../features/transaction-import/ImportWizard").catch((error) => {
      importModule = undefined;
      throw error;
    }));
}
const preloadImport = () => {
  void loadImport().catch(() => {});
};

export function Transactions() {
  const { ledger, month, t, modal, toast } = useFinance();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState("new");
  const [importing, setImporting] = useState(false);
  const [ImportComponent, setImportComponent] = useState<ComponentType<{
    onClose: () => void;
  }> | null>(null);
  const searchIndex = useMemo(() => {
    const names = new Map(ledger.categories.map((c) => [c.id, c.name]));
    return entriesFor(ledger, month).map((entry) => ({
      entry,
      text: `${entry.description} ${names.get(entry.categoryId) || ""}`.toLocaleLowerCase(),
    }));
  }, [ledger.entries, ledger.categories, month]);
  const es = useMemo(() => {
    const normalizedQuery = query.toLocaleLowerCase();
    return searchIndex
      .filter(
        ({ entry: e, text }) =>
          (!category || e.categoryId === category) &&
          (!type || e.type === type) &&
          text.includes(normalizedQuery),
      )
      .map(({ entry }) => entry)
      .sort((a, b) =>
        sort === "high"
          ? b.amount - a.amount
          : sort === "low"
            ? a.amount - b.amount
            : sort === "old"
              ? a.date.localeCompare(b.date)
              : b.date.localeCompare(a.date),
      );
  }, [searchIndex, category, type, query, sort]);
  const s = useMemo(() => summary(ledger, month), [ledger, month]);
  async function openImport() {
    try {
      const module = await loadImport();
      setImportComponent(() => module.TransactionImport);
      setImporting(true);
    } catch {
      toast("Could not load transaction import. Try again.", undefined, {
        variant: "error",
      });
    }
  }
  if (importing && ImportComponent)
    return <ImportComponent onClose={() => setImporting(false)} />;
  return (
    <>
      <div className="page-toolbar">
        <button
          className="button secondary"
          onClick={openImport}
          onMouseEnter={preloadImport}
          onFocus={preloadImport}
        >
          <Upload size={16} />
          {t("Import transactions")}
        </button>
      </div>
      <div className="transaction-summary">
        <div>
          <span>{t("Income")}</span>
          <strong className="positive">
            +<Money value={s.income} />
          </strong>
        </div>
        <div>
          <span>{t("Spent")}</span>
          <strong>
            <Money value={s.spent} />
          </strong>
        </div>
        <div>
          <span>{t("Saved this month")}</span>
          <strong>
            <Money value={s.saved} />
          </strong>
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
