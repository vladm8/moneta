import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  LayoutDashboard,
  ChartNoAxesCombined,
  ArrowLeftRight,
  SlidersHorizontal,
  Leaf,
  Settings as SettingsIcon,
  Plus,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  ShieldCheck,
  ArrowUpRight,
  Check,
  Menu,
  X,
  ArrowRight,
} from "lucide-react";
import {
  type Data,
  type Page,
  type Ledger,
  type Currency,
  type Language,
  initialData,
  getLedger,
  money,
  thisMonth,
  shiftMonth,
  locale,
  demoData,
  starterCategories,
  parseMoney,
  uid,
  recordEntry,
  emptyLedger,
  validateImport,
} from "./engine";
import { loadData, persistData } from "./persistence";
import { translate } from "./i18n";
import { Finance, Modal, EntryForm, ErrorText } from "./ui";
import { Overview } from "./Overview";
import { Budget } from "./Budget";
import { Transactions, Analytics, Goals, Settings } from "./Tools";
import { AmbientBackground } from "./AmbientBackground";
const navigation = [
  ["overview", "Overview", LayoutDashboard],
  ["budget", "Budget", SlidersHorizontal],
  ["transactions", "Transactions", ArrowLeftRight],
  ["analytics", "Analytics", ChartNoAxesCombined],
  ["goals", "Savings goals", Leaf],
  ["settings", "Settings", SettingsIcon],
] as const;
const headers: Record<Page, [string, string]> = {
  overview: ["Good to see you", "A little clarity. A lot more peace of mind."],
  budget: ["Plan with intention", "Move the sliders. Find your balance."],
  transactions: [
    "Every movement, in one place",
    "A clear record of what comes in and goes out.",
  ],
  analytics: [
    "A clearer financial picture",
    "Real numbers. Useful perspective.",
  ],
  goals: ["Good things are worth planning for", "Turn a someday into a plan."],
  settings: [
    "Make yourself at home",
    "Your preferences. Your data. Your control.",
  ],
};
function Welcome({
  data,
  onStart,
  onDemo,
  onSkip,
}: {
  data: Data;
  onStart: (d: Data) => void;
  onDemo: (language: Language) => void;
  onSkip: (language: Language) => void;
}) {
  const [step, setStep] = useState(0);
  const [lang, setLang] = useState<Language>(data.language);
  const [error, setError] = useState("");
  const t = (s: string) => translate(lang, s);
  return (
    <div className="onboarding">
      <AmbientBackground />
      <div className="welcome-art">
        <div className="brand">
          <span className="brand-mark">m</span>moneta
          <span className="brand-period">.</span>
        </div>
        <span className="eyebrow">{t("PERSONAL FINANCE")}</span>
        <h1>{t("A calmer relationship with money.")}</h1>
        <p>{t("A clear plan for today. More possibility for tomorrow.")}</p>
        <div className="welcome-composition">
          <div className="welcome-ring">
            <div>
              <Leaf size={27} />
              <span>{t("Your money. Your peace of mind.")}</span>
            </div>
          </div>
          <span className="floating-label label-a">
            <span className="dot" />
            {t("Needs")}
            <Check size={15} />
          </span>
          <span className="floating-label label-b">
            <Leaf size={16} />
            {t("Savings")}
          </span>
          <span className="welcome-cross">+</span>
        </div>
        <div className="welcome-foot">
          <ShieldCheck size={16} />
          {t("Your data stays in this browser.")}
        </div>
      </div>
      <div className="welcome-form">
        <select
          className="welcome-language"
          aria-label={t("Language")}
          value={lang}
          onChange={(e) => setLang(e.target.value as Language)}
        >
          <option value="pl">Polski</option>
          <option value="en">English</option>
          <option value="uk">Українська</option>
        </select>
        <div className="welcome-form-inner">
          <span className="eyebrow">01 / MONETA</span>
          <h2>{t("Welcome to MONETA")}</h2>
          <p>{t("Just a few details. Then it’s all yours.")}</p>
          {step === 0 ? (
            <div className="welcome-choices">
              <button className="button full" onClick={() => setStep(1)}>
                {t("Start your plan")}
                <ArrowRight size={18} />
              </button>
              <button
                className="button secondary full"
                onClick={() => onDemo(lang)}
              >
                {t("Explore demo")}
                <ArrowUpRight size={17} />
              </button>
              <button
                className="text-button center"
                onClick={() => onSkip(lang)}
              >
                {t("Skip for now")}
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try {
                  const d = initialData();
                  d.language = lang;
                  d.name = String(f.get("name")).trim();
                  d.currency = String(f.get("currency")) as Currency;
                  d.onboarded = true;
                  let l = emptyLedger();
                  if (f.get("categories"))
                    l.categories = starterCategories(lang);
                  const income = String(f.get("income")).trim();
                  if (income) {
                    const amount = parseMoney(income);
                    if (amount > 0)
                      l = recordEntry(l, {
                        id: uid(),
                        type: "income",
                        amount,
                        date: thisMonth() + "-01",
                        categoryId: "",
                        description: t("Monthly income"),
                      });
                  }
                  d.ledgers = { [d.currency]: l };
                  onStart(d);
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              <label>
                {t("Your first name")}
                <input name="name" maxLength={80} autoComplete="given-name" />
              </label>
              <div className="form-grid">
                <label>
                  {t("Currency")}
                  <select name="currency" defaultValue="PLN">
                    {["PLN", "EUR", "USD", "UAH", "GBP"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Monthly income (optional)")}
                  <input
                    name="income"
                    inputMode="decimal"
                    placeholder="5 000,00"
                  />
                </label>
              </div>
              <label className="checkbox-label">
                <input name="categories" type="checkbox" defaultChecked />
                {t("Start with suggested categories")}
              </label>
              {error && (
                <p className="error" role="alert">
                  {t(error)}
                </p>
              )}
              <button className="button full">
                {t("Create my space")}
                <ArrowRight size={17} />
              </button>
              <button
                className="text-button center"
                type="button"
                onClick={() => setStep(0)}
              >
                {t("Back")}
              </button>
            </form>
          )}
        </div>
        <div className="onboarding-progress">
          <span className="active" />
          <span className={step === 1 ? "active" : ""} />
          <span />
        </div>
      </div>
    </div>
  );
}
export default function App() {
  const [account, setAccount] = useState<Data>(initialData);
  const [demoState, setDemoState] = useState<Data | null>(null);
  const data = demoState || account;
  const demo = !!demoState;
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Saved");
  const [page, setPageState] = useState<Page>("overview");
  const [month, setMonthState] = useState(thisMonth);
  const [modalContent, setModalContent] = useState<ReactNode>(null);
  const [toast, setToast] = useState<{
    message: string;
    undo?: () => void;
  } | null>(null);
  const [menu, setMenu] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Record<string, number>>>(
    {},
  );
  const saveQueue = useRef(Promise.resolve());
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const t = (s: string) => translate(data.language, s);
  const ledger = getLedger(data);
  const draftKey = `${demo ? "demo" : "account"}:${data.currency}:${month}`;
  const draft = drafts[draftKey] || null;
  useEffect(() => {
    let live = true;
    loadData()
      .then((d) => {
        if (!live) return;
        if (d) {
          setAccount(d);
          setPageState(d.defaultPage);
        }
        try {
          const value = JSON.parse(
            localStorage.getItem("moneta-drafts") || "{}",
          );
          if (value && typeof value === "object" && !Array.isArray(value)) {
            const valid = Object.fromEntries(
              Object.entries(value).filter(
                ([k, v]) =>
                  /^account:(PLN|EUR|USD|UAH|GBP):\d{4}-\d{2}$/.test(k) &&
                  v &&
                  typeof v === "object" &&
                  !Array.isArray(v) &&
                  Object.values(v).every(
                    (n) =>
                      Number.isSafeInteger(n) &&
                      Number(n) >= 0 &&
                      Number(n) <= 100_000_000_00,
                  ),
              ),
            );
            setDrafts(valid as typeof drafts);
          }
        } catch {
          /* Invalid scratch drafts never replace saved plans. */
        }
        setReady(true);
      })
      .catch(() => {
        if (live) {
          setLoadError(true);
          setReady(true);
        }
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!ready || loadError) return;
    setSaveStatus("Saving…");
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(() => persistData(account))
      .then(() => setSaveStatus("Saved"))
      .catch(() => setSaveStatus("Could not save. Export a backup now."));
  }, [account, ready, loadError]);
  useEffect(() => {
    const query = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.theme =
        data.theme === "system"
          ? query.matches
            ? "dark"
            : "light"
          : data.theme);
    apply();
    query.addEventListener("change", apply);
    document.documentElement.lang = data.language;
    return () => query.removeEventListener("change", apply);
  }, [data.theme, data.language]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(
        "moneta-drafts",
        JSON.stringify(
          Object.fromEntries(
            Object.entries(drafts).filter(([k]) => k.startsWith("account:")),
          ),
        ),
      );
    } catch {
      setSaveStatus("Could not save. Export a backup now.");
    }
  }, [drafts, ready]);
  useEffect(() => {
    if (!ready) return;
    const prefix = `${demo ? "demo" : "account"}:${data.currency}:`;
    const ids = new Set(ledger.categories.map((category) => category.id));
    setDrafts((previous) => {
      let changed = false;
      const next = Object.fromEntries(
        Object.entries(previous).map(([key, plan]) => {
          if (!key.startsWith(prefix)) return [key, plan];
          const kept = Object.entries(plan).filter(([id]) => ids.has(id));
          if (kept.length !== Object.keys(plan).length) changed = true;
          return [key, Object.fromEntries(kept)];
        }),
      );
      return changed ? next : previous;
    });
  }, [ready, demo, data.currency, ledger.categories]);
  const notify = useCallback((message: string, undo?: () => void) => {
    clearTimeout(toastTimer.current);
    setToast({ message, undo });
    toastTimer.current = setTimeout(() => setToast(null), undo ? 10000 : 5000);
  }, []);
  const close = useCallback(() => setModalContent(null), []);
  const update = (fn: (d: Data) => Data) => {
    if (demo) setDemoState((d) => fn(d!));
    else setAccount(fn);
  };
  const updateLedger = (fn: (l: Ledger) => Ledger) =>
    update((d) => ({
      ...d,
      ledgers: { ...d.ledgers, [d.currency]: fn(getLedger(d)) },
    }));
  const setDraft = (p: Record<string, number> | null) =>
    setDrafts((ds) => {
      const next = { ...ds };
      if (p) next[draftKey] = p;
      else delete next[draftKey];
      return next;
    });
  const setMonth = (m: string) => {
    if (draft) {
      notify("Save or discard the current plan before changing months.");
      return;
    }
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) setMonthState(m);
  };
  const setPage = (p: Page) => {
    setPageState(p);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const setDemo = (v: boolean) => {
    setDemoState(v ? demoData(data.language) : null);
    setPage("overview");
    setMonthState(thisMonth());
    setDrafts((ds) =>
      Object.fromEntries(
        Object.entries(ds).filter(([k]) => !k.startsWith("demo:")),
      ),
    );
  };
  const reset = () => {
    setAccount(initialData());
    setDrafts({});
    setLoadError(false);
    setPage("overview");
    setMonthState(thisMonth());
  };
  if (!ready)
    return (
      <div className="loading">
        <div className="brand">
          <span className="brand-mark">m</span>moneta.
        </div>
        <span className="loading-line" />
      </div>
    );
  if (loadError)
    return (
      <div className="recovery">
        <h1>MONETA</h1>
        <p>
          {t(
            "Stored data could not be read. Import a valid backup or explicitly reset your local data.",
          )}
        </p>
        <input
          type="file"
          aria-label={t("Import backup")}
          accept=".json"
          onChange={async (e) => {
            try {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 10 * 1024 * 1024) throw new Error();
              const d = validateImport(JSON.parse(await f.text()));
              setAccount(d);
              setLoadError(false);
            } catch {
              alert(t("The file is not a valid MONETA backup."));
            }
          }}
        />
        <button
          className="button danger"
          onClick={() => {
            if (confirm(t("Permanently delete all local data?"))) reset();
          }}
        >
          {t("Delete all data")}
        </button>
      </div>
    );
  if (!data.onboarded)
    return (
      <Welcome
        data={data}
        onStart={(d) => {
          setAccount(d);
          setPage("budget");
        }}
        onDemo={(language) => {
          setDemoState(demoData(language));
          setPage("overview");
        }}
        onSkip={(language) =>
          setAccount((d) => ({ ...d, language, onboarded: true }))
        }
      />
    );
  const context = {
    data,
    ledger,
    month,
    setMonth,
    page,
    setPage,
    update,
    updateLedger,
    t,
    fmt: (n: number, decimals = true) =>
      money(n, data.currency, data.language, decimals),
    modal: setModalContent,
    close,
    toast: notify,
    demo,
    setDemo,
    draft,
    setDraft,
  };
  return (
    <Finance.Provider value={context}>
      <AmbientBackground />
      <div className="app-shell">
        <aside className={`sidebar ${menu ? "mobile-open" : ""}`}>
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setPage("overview");
            }}
            aria-label="MONETA"
          >
            <span className="brand-mark">m</span>moneta
            <span className="brand-period">.</span>
          </a>
          <span className="nav-label">{t("YOUR SPACE")}</span>
          <nav aria-label={t("YOUR SPACE")}>
            {navigation.map(([key, label, Icon]) => (
              <button
                key={key}
                className={`nav-item ${page === key ? "active" : ""} ${key === "settings" ? "settings-nav" : ""}`}
                aria-label={t(label)}
                title={t(label)}
                onClick={() => setPage(key)}
                aria-current={page === key ? "page" : undefined}
              >
                <Icon size={19} strokeWidth={1.6} />
                <span>{t(label)}</span>
                {page === key && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="privacy-note">
              <ShieldCheck size={20} />
              <strong>{t("Local & private")}</strong>
              <p>{t("Your data stays in this browser.")}</p>
            </div>
            <button className="profile" onClick={() => setPage("settings")}>
              <span className="avatar">
                {data.name?.slice(0, 1).toUpperCase() || "M"}
              </span>
              <span>
                <strong>{data.name || "MONETA"}</strong>
                <small>{t("PERSONAL FINANCE")}</small>
              </span>
              <SettingsIcon size={16} />
            </button>
          </div>
        </aside>
        {menu && (
          <div className="mobile-scrim" onClick={() => setMenu(false)} />
        )}
        <main className="main-content">
          {demo && (
            <div className="demo-banner">
              <span>
                <strong>{t("DEMO MODE")}</strong>{" "}
                {t(
                  "Sample data, a real experience. Changes here are not saved to your account.",
                )}
              </span>
              <button onClick={() => setDemo(false)}>
                {t("Exit demo")}
                <X size={14} />
              </button>
            </div>
          )}
          <div className="topbar">
            <button
              className="mobile-menu icon-button"
              aria-label={t("Overview")}
              onClick={() => setMenu(!menu)}
            >
              <Menu size={21} />
            </button>
            <div className="breadcrumb">
              <strong>{t(navigation.find((n) => n[0] === page)![1])}</strong>
              <span className="workspace-label">{t("PERSONAL FINANCE")}</span>
            </div>
            <div className="topbar-actions">
              <span
                className={`persistence-state ${saveStatus.startsWith("Could") ? "negative" : ""}`}
              >
                <span />
                {t(
                  demo
                    ? "DEMO MODE"
                    : saveStatus.startsWith("Could")
                      ? saveStatus
                      : draft
                        ? "Unsaved changes"
                        : saveStatus,
                )}
              </span>
              <button
                className="icon-button"
                aria-label={t(data.theme === "dark" ? "Light" : "Dark")}
                onClick={() =>
                  update((d) => ({
                    ...d,
                    theme: d.theme === "dark" ? "light" : "dark",
                  }))
                }
              >
                {data.theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                className="icon-button topbar-profile"
                aria-label={t("Settings")}
                onClick={() => setPage("settings")}
              >
                <span className="avatar">
                  {data.name?.slice(0, 1).toUpperCase() || "M"}
                </span>
              </button>
            </div>
          </div>
          <header className="page-header">
            <div>
              <h1>
                {t(headers[page][0])}
                {page === "overview" && data.name ? `, ${data.name}` : ""}
                <span className="heading-dot">.</span>
              </h1>
              <p>{t(headers[page][1])}</p>
            </div>
            <div className="header-actions">
              <div className="month-switcher">
                <button
                  aria-label={t("Previous month")}
                  onClick={() => setMonth(shiftMonth(month, -1))}
                >
                  <ChevronLeft size={16} />
                </button>
                <label className="month-label">
                  <span>
                    {new Date(month + "-01T12:00:00").toLocaleDateString(
                      locale(data.language),
                      { month: "long", year: "numeric" },
                    )}
                  </span>
                  <input
                    aria-label={t("Select month")}
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                  />
                </label>
                <button
                  aria-label={t("Next month")}
                  onClick={() => setMonth(shiftMonth(month, 1))}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <button
                className="button add-transaction"
                onClick={() => setModalContent(<EntryForm />)}
              >
                <Plus size={17} />
                <span>{t("Add transaction")}</span>
              </button>
            </div>
          </header>
          <div className="page-content" key={page + month}>
            {page === "overview" ? (
              <Overview />
            ) : page === "budget" ? (
              <Budget />
            ) : page === "transactions" ? (
              <Transactions />
            ) : page === "analytics" ? (
              <Analytics />
            ) : page === "goals" ? (
              <Goals />
            ) : (
              <Settings reset={reset} />
            )}
          </div>
          <footer className="app-footer">
            <span>
              MONETA<span>®</span>
            </span>
            <span>{t("Your money. Your peace of mind.")}</span>
          </footer>
        </main>
        <nav className="mobile-bottom-nav">
          {navigation.slice(0, 5).map(([key, label, Icon]) => (
            <button
              key={key}
              aria-label={t(label)}
              className={page === key ? "active" : ""}
              onClick={() => setPage(key)}
            >
              <Icon size={20} />
              <span>{t(label)}</span>
            </button>
          ))}
        </nav>
      </div>
      {modalContent && <Modal onClose={close}>{modalContent}</Modal>}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{t(toast.message)}</span>
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
            >
              {t("Undo")}
            </button>
          )}
          <button aria-label={t("Close")} onClick={() => setToast(null)}>
            <X size={15} />
          </button>
        </div>
      )}
    </Finance.Provider>
  );
}
