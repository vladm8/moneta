import {
  Download,
  Monitor,
  Moon,
  Plus,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef } from "react";
import {
  applyRecurring,
  csvExport,
  CURRENCIES,
  emptyLedger,
  validateImport,
  type Currency,
  type Data,
  type Language,
  type Page,
} from "../engine";
import { deleteData } from "../persistence";
import { Confirm, RecurringForm, useFinance } from "../ui";
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
