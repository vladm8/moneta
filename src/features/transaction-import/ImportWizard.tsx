import { useEffect, useMemo, useRef, useState } from "react";
import { recognizeDocument, type DocumentText } from "./documentRecognition";
import { readImage } from "./imageRecognition";
import type { PDFPage } from "./pdfImport";
import type { Worker } from "tesseract.js";
import { Upload, Plus, ArrowLeft, Check } from "lucide-react";
import { useFinance, ErrorText, Progress } from "../../ui";
import { CURRENCIES, emptyLedger, today, type Currency } from "../../engine";
import {
  commitImport,
  duplicateIndex,
  guessColumns,
  importFields,
  jsonRows,
  mappedRows,
  newImportRow,
  parseCSV,
  rowEntry,
  type ColumnMap,
  type ImportRow,
} from "./transactionImport";

export function TransactionImport({ onClose }: { onClose: () => void }) {
  const { data, update, t, toast } = useFinance();
  const [rows, setRows] = useState<ImportRow[]>([]),
    [error, setError] = useState("");
  const [csv, setCSV] = useState<string[][] | null>(null),
    [mapping, setMapping] = useState<ColumnMap | null>(null);
  const [order, setOrder] = useState<"DMY" | "MDY">("DMY");
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [raw, setRaw] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null),
    [preview, setPreview] = useState("");
  const [page, setPage] = useState(0),
    [confirmed, setConfirmed] = useState(false);
  const worker = useRef<Worker | null>(null),
    active = useRef(true);
  const [imageDocument, setImageDocument] = useState<DocumentText | null>(null);
  const [importYear, setImportYear] = useState(Number(today().slice(0, 4)));
  const [importCurrency, setImportCurrency] = useState<string>(data.currency);
  const [filter, setFilter] = useState("all");
  const [fileName, setFileName] = useState("");
  const [zoom, setZoom] = useState(false);
  const sourceRef = useRef<HTMLDetailsElement>(null);
  const [pdfPages, setPDFPages] = useState<PDFPage[]>([]);
  const [sourcePage, setSourcePage] = useState(0);
  const pdfAbort = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      pdfAbort.current?.abort();
      void worker.current?.terminate();
    };
  }, []);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  function patch(id: string, value: Partial<ImportRow>) {
    setConfirmed(false);
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...value } : r)));
  }
  async function getOCRWorker() {
    if (worker.current) return worker.current;
    const { createWorker } = await import("tesseract.js");
    const base = new URL(`${import.meta.env.BASE_URL}ocr/`, location.href).href;
    const w = await createWorker(
      data.language === "uk" ? "ukr+eng" : "pol+eng",
      1,
      {
        workerPath: base + "worker.min.js",
        corePath: base,
        langPath: base,
        logger: (m) => {
          if (active.current && m.status === "recognizing text")
            setProgress(m.progress * 100);
        },
      },
    );
    if (!active.current) {
      await w.terminate();
      return null;
    }
    worker.current = w;
    return w;
  }
  function pdfRows(pages: PDFPage[]) {
    return pages.flatMap((p, i) =>
      recognizeDocument(p, data, {
        year: importYear,
        currency: importCurrency,
      }).map((r) => ({ ...r, sourcePage: i + 1 })),
    );
  }
  async function load(file: File) {
    if (busy) return;
    setError("");
    setFileName(file.name);
    setImageDocument(null);
    setFilter("all");
    setZoom(false);
    setPDFPages([]);
    setSourcePage(0);
    setProgress(0);
    setRows([]);
    setCSV(null);
    setMapping(null);
    setRaw("");
    setConfidence(null);
    setPreview("");
    setPage(0);
    setConfirmed(false);
    if (file.size > 10 * 1024 * 1024) {
      setError("Use a file smaller than 10 MB.");
      return;
    }
    setBusy(true);
    try {
      if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
        const controller = new AbortController();
        pdfAbort.current = controller;
        const { readPDF } = await import("./pdfImport");
        const pages = await readPDF(file, {
          signal: controller.signal,
          progress: (value) => {
            if (active.current) setProgress(value);
          },
          recognize: async (image) => {
            const w = await getOCRWorker();
            if (!w) throw new DOMException("Aborted", "AbortError");
            return readImage(image, w);
          },
        });
        if (active.current) {
          setPDFPages(pages);
          const detected = pdfRows(pages);
          setRows(detected);
          if (!detected.length)
            setError(
              "No transactions detected. Correct the text or add rows manually.",
            );
        }
      } else if (/\.(png|jpe?g|webp)$/i.test(file.name)) {
        const bitmap = await createImageBitmap(file);
        const pixels = bitmap.width * bitmap.height;
        bitmap.close();
        if (pixels > 16000000)
          throw new Error("Use an image smaller than 16 megapixels.");
        setPreview(URL.createObjectURL(file));
        setProgress(0);
        const w = await getOCRWorker();
        if (!w) return;
        const result = await readImage(file, w);
        if (active.current) {
          setRaw(result.text);
          setImageDocument(result);
          setConfidence(result.confidence);
          const detected = recognizeDocument(result, data, {
            year: importYear,
            currency: importCurrency,
          }).map((r) =>
            result.confidence < 70
              ? {
                  ...r,
                  notes: [
                    ...(r.notes || []),
                    "Low OCR confidence — check against the image",
                  ],
                }
              : r,
          );
          setRows(detected);
          if (!detected.length)
            setError(
              "No transactions detected. Correct the text or add rows manually.",
            );
        }
      } else {
        const text = await file.text();
        if (/\.json$/i.test(file.name)) setRows(jsonRows(text, data));
        else if (/\.csv$/i.test(file.name)) {
          const table = parseCSV(text);
          setCSV(table);
          setMapping(guessColumns(table[0]));
        } else throw new Error("Choose CSV, JSON, PDF, PNG, JPEG or WebP.");
      }
    } catch (err) {
      if (active.current)
        setError(
          (err as Error).message.includes("JSON")
            ? "Invalid JSON transaction fields."
            : (err as Error).message,
        );
    } finally {
      await worker.current?.terminate();
      worker.current = null;
      pdfAbort.current = null;
      if (active.current) setBusy(false);
    }
  }
  const { selected, commitError, issues } = useMemo(() => {
    const selected = rows.filter((r) => r.include);
    let commitError = "";
    try {
      if (selected.length) commitImport(data, rows);
    } catch (err) {
      commitError = (err as Error).message;
    }
    // Detect duplicates against saved entries and earlier included rows, including within this file.
    const seen = new Map<string, ReturnType<typeof duplicateIndex>>();
    const issues = new Map<
      string,
      { error: string; duplicate: string | null }
    >();
    for (const r of rows) {
      let issue = "",
        duplicate = null;
      try {
        const e = rowEntry(r);
        const l =
          seen.get(r.currency) ||
          duplicateIndex(data.ledgers[r.currency as Currency] || emptyLedger());
        duplicate = l.kind(e);
        if (r.include) l.add(e);
        seen.set(r.currency, l);
      } catch (err) {
        issue = (err as Error).message;
      }
      issues.set(r.id, { error: issue, duplicate });
    }
    return { selected, commitError, issues };
  }, [data, rows]);
  const needsAttention = (r: ImportRow) =>
    !!issues.get(r.id)?.error || !!issues.get(r.id)?.duplicate;
  const visibleRows = rows.filter(
    (r) =>
      filter === "all" ||
      (filter === "attention" ? r.include && needsAttention(r) : !r.include),
  );
  const labels: Record<string, string> = {
    date: "Date",
    description: "Description",
    amount: "Amount",
    currency: "Currency",
    type: "Type",
    category: "Category",
    sourceId: "Source ID",
  };
  const typeLabels: Record<string, string> = {
    expense: "Expense",
    income: "Income",
    refund: "Refund",
    internal: "Internal transfer",
  };
  return (
    <section
      className="panel import-panel"
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f && !busy) void load(f);
      }}
      onPaste={(e) => {
        const f = Array.from(e.clipboardData.files).find((f) =>
          f.type.startsWith("image/"),
        );
        if (f && !busy) {
          e.preventDefault();
          void load(f);
        }
      }}
    >
      <button className="text-button" onClick={onClose}>
        <ArrowLeft size={16} />
        {t("Back")}
      </button>
      <h2>{t("Import transactions")}</h2>
      <p>
        {t(
          "Files and images are processed on this device. Nothing is saved until you confirm.",
        )}
      </p>
      <div className="import-upload">
        <button
          className="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={16} />
          {t("Choose file")}
        </button>
        <span>CSV · JSON · PDF · PNG · JPEG · WebP / 10 MB</span>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".csv,.json,.pdf,application/pdf,.png,.jpg,.jpeg,.webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void load(f);
            e.target.value = "";
          }}
        />
      </div>
      <p className="field-help">
        {t(
          "PDF: up to 20 pages. Text and scans are read locally. Check each row before importing.",
        )}
      </p>
      <p className="field-help">
        {t("Drop a file here or paste a screenshot with Ctrl+V.")}
      </p>
      {fileName && <p className="import-filename">{fileName}</p>}
      <details className="import-help">
        <summary>{t("Import format")}</summary>
        <p>
          {t(
            "CSV: map columns below. Currency defaults to the selected ledger. Unsigned amounts require an explicit type. Transfers between own accounts are neutral; refunds reduce expenses.",
          )}
        </p>
        <p>
          {t(
            "JSON amounts are strings in major currency units. Dates use YYYY-MM-DD. Types: expense, income, refund, internal. Optional: category, sourceId.",
          )}
        </p>
        <pre>
          {
            '{"schema":"moneta-transactions-v1","transactions":[{"date":"2026-11-04","description":"Lidl","amount":"-42.90","currency":"PLN","type":"expense"}]}'
          }
        </pre>
        <a
          className="text-button"
          href={`${import.meta.env.BASE_URL}examples/transactions.json`}
          download
        >
          {t("Download JSON example")}
        </a>
      </details>
      {busy && (
        <div role="status">
          <p>{t("Reading file locally")}</p>
          <Progress value={progress} />
        </div>
      )}
      <ErrorText error={error} />
      {csv && mapping && (
        <div className="column-mapping">
          <h3>{t("Map columns")}</h3>
          <div className="finance-columns">
            {importFields.map((f) => (
              <label key={f}>
                {t(labels[f])}
                <select
                  value={mapping[f]}
                  onChange={(e) =>
                    setMapping({ ...mapping, [f]: Number(e.target.value) })
                  }
                >
                  <option value={-1}>{t("Not mapped")}</option>
                  {csv[0].map((header, i) => (
                    <option key={i} value={i}>
                      {header}
                    </option>
                  ))}
                </select>
                <small>{mapping[f] >= 0 ? csv[1]?.[mapping[f]] : "—"}</small>
              </label>
            ))}
          </div>
          <label>
            {t("Date order")}
            <select
              value={order}
              onChange={(e) => setOrder(e.target.value as "DMY" | "MDY")}
            >
              <option value="DMY">DD/MM/YYYY</option>
              <option value="MDY">MM/DD/YYYY</option>
            </select>
          </label>
          <button
            className="button secondary"
            disabled={
              mapping.date < 0 || mapping.description < 0 || mapping.amount < 0
            }
            onClick={() => {
              setRows(mappedRows(csv, mapping, data, order));
              setConfirmed(false);
              setPage(0);
              setError("");
            }}
          >
            {t("Preview transactions")}
          </button>
        </div>
      )}
      {(preview || pdfPages.length > 0) && (
        <div className="finance-columns import-defaults">
          <label>
            {t("Year for dates without a year")}
            <input
              type="number"
              min="1900"
              max="2100"
              value={importYear}
              onChange={(e) => setImportYear(Number(e.target.value))}
            />
          </label>
          <label>
            {t("Currency for amounts without a currency")}
            <select
              value={importCurrency}
              onChange={(e) => setImportCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <p className="field-help">
            {t(
              "These settings only fill missing values when you extract again. Dates present in the document are preserved.",
            )}
          </p>
        </div>
      )}
      {preview && (
        <details ref={sourceRef} open={!rows.length}>
          <summary>{t("Source image and extracted text")}</summary>
          <button className="text-button" onClick={() => setZoom(!zoom)}>
            {t(zoom ? "Fit preview" : "Enlarge preview")}
          </button>
          <div className={zoom ? "import-source zoomed" : "import-source"}>
            <img
              src={preview}
              className="ocr-preview"
              alt={t("Source image")}
            />
          </div>
          <p>
            {t("OCR confidence")}:{" "}
            {confidence === null ? "—" : `${Math.round(confidence)}%`}.{" "}
            {t(
              "Always check dates, currencies and directions against the image.",
            )}
          </p>
          <textarea
            aria-label={t("Extracted text")}
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setImageDocument(null);
            }}
            rows={6}
          />
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => {
              setRows(
                recognizeDocument(imageDocument || { text: raw }, data, {
                  year: importYear,
                  currency: importCurrency,
                }),
              );
              setPage(0);
              setConfirmed(false);
            }}
          >
            {t("Extract again")}
          </button>
        </details>
      )}
      {!!pdfPages.length && (
        <details ref={sourceRef} open={!rows.length}>
          <summary>{t("PDF pages and extracted text")}</summary>
          <label>
            {t("PDF page")}
            <select
              value={sourcePage}
              onChange={(e) => setSourcePage(Number(e.target.value))}
            >
              {pdfPages.map((p, i) => (
                <option key={i} value={i}>
                  {i + 1} / {pdfPages.length}
                  {p.ocr ? " · OCR" : ""}
                </option>
              ))}
            </select>
          </label>
          <button className="text-button" onClick={() => setZoom(!zoom)}>
            {t(zoom ? "Fit preview" : "Enlarge preview")}
          </button>
          <div className={zoom ? "import-source zoomed" : "import-source"}>
            <img
              src={pdfPages[sourcePage].preview}
              className="ocr-preview"
              alt={`${t("PDF page")} ${sourcePage + 1}`}
            />
          </div>
          <textarea
            aria-label={t("Extracted text")}
            rows={8}
            value={pdfPages[sourcePage].text}
            onChange={(e) =>
              setPDFPages((pages) =>
                pages.map((p, i) =>
                  i === sourcePage
                    ? { ...p, text: e.target.value, boxes: undefined }
                    : p,
                ),
              )
            }
          />
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => {
              setRows(pdfRows(pdfPages));
              setPage(0);
              setConfirmed(false);
              setError("");
            }}
          >
            {t("Extract again")}
          </button>
        </details>
      )}
      {!!rows.length && (
        <>
          <div className="page-toolbar">
            <h3>
              {t("Review transactions")} · {selected.length}/{rows.length}
            </h3>
            <button
              className="text-button"
              onClick={() => {
                setRows((rs) => rs.map((r) => ({ ...r, include: false })));
                setConfirmed(false);
              }}
            >
              {t("Exclude all")}
            </button>
          </div>
          <p className="field-help">
            {t(
              "The selected type determines direction; amounts are saved as positive values. Each currency stays in its own ledger.",
            )}
          </p>
          <div className="import-actions">
            <label>
              {t("Show rows")}
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">
                  {t("All rows")} ({rows.length})
                </option>
                <option value="attention">
                  {t("Needs review")} (
                  {rows.filter((r) => r.include && needsAttention(r)).length})
                </option>
                <option value="excluded">
                  {t("Excluded")} ({rows.filter((r) => !r.include).length})
                </option>
              </select>
            </label>
            <button
              className="button secondary"
              onClick={() => {
                setRows((rs) =>
                  rs.map((r) =>
                    issues.get(r.id)?.duplicate ? { ...r, include: false } : r,
                  ),
                );
                setConfirmed(false);
                setPage(0);
              }}
            >
              {t("Exclude duplicates")}
            </button>
          </div>
          <div className="import-review">
            {visibleRows.slice(page * 20, (page + 1) * 20).map((r) => {
              const issue = issues.get(r.id)!;
              return (
                <article
                  className={`import-row ${!r.include ? "excluded" : ""}`}
                  key={r.id}
                >
                  <div className="import-row-title">
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={r.include}
                        onChange={(e) =>
                          patch(r.id, { include: e.target.checked })
                        }
                      />
                      {t("Include")} #{rows.indexOf(r) + 1}
                    </label>
                    {issue.duplicate && (
                      <span className="status-pill negative">
                        {t(
                          issue.duplicate === "source"
                            ? "Duplicate source ID"
                            : "Possible duplicate",
                        )}
                      </span>
                    )}
                  </div>
                  {r.notes?.map((note) => (
                    <p key={note} className="field-help import-note">
                      {t(note)}
                    </p>
                  ))}
                  {r.sourceText && (
                    <details className="import-source-line">
                      <summary>{t("Original row")}</summary>
                      <p>{r.sourceText}</p>
                    </details>
                  )}
                  {(preview || r.sourcePage) && (
                    <button
                      className="text-button"
                      onClick={() => {
                        if (r.sourcePage) setSourcePage(r.sourcePage - 1);
                        if (sourceRef.current) {
                          sourceRef.current.open = true;
                          sourceRef.current.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                        }
                      }}
                    >
                      {t("Compare with source")}
                      {r.sourcePage ? ` · ${r.sourcePage}` : ""}
                    </button>
                  )}
                  <div className="import-fields">
                    <label>
                      {t("Date")}
                      <input
                        type="date"
                        value={r.date}
                        onChange={(e) => patch(r.id, { date: e.target.value })}
                      />
                    </label>
                    <label>
                      {t("Description")}
                      <input
                        maxLength={160}
                        value={r.description}
                        onChange={(e) =>
                          patch(r.id, { description: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      {t("Amount")}
                      <input
                        inputMode="decimal"
                        value={r.amount}
                        onChange={(e) =>
                          patch(r.id, { amount: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      {t("Currency")}
                      <select
                        value={r.currency}
                        onChange={(e) =>
                          patch(r.id, {
                            currency: e.target.value,
                            categoryId: "",
                          })
                        }
                      >
                        <option value="">{t("Select")}</option>
                        {CURRENCIES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t("Type")}
                      <select
                        value={r.type}
                        onChange={(e) => patch(r.id, { type: e.target.value })}
                      >
                        <option value="">{t("Select")}</option>
                        {Object.entries(typeLabels).map(([v, s]) => (
                          <option key={v} value={v}>
                            {t(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t("Category")}
                      <select
                        value={r.categoryId}
                        onChange={(e) =>
                          patch(r.id, { categoryId: e.target.value })
                        }
                        disabled={r.type === "income" || r.type === "internal"}
                      >
                        <option value="">{t("Uncategorized")}</option>
                        {data.ledgers[r.currency as Currency]?.categories
                          .filter((c) => !c.archived)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                  {r.sourcePage && (
                    <small>
                      {t("PDF page")}: {r.sourcePage}
                    </small>
                  )}
                  {r.sourceId && (
                    <small>
                      {t("Source ID")}: {r.sourceId}
                    </small>
                  )}
                  {issue.error && <ErrorText error={issue.error} />}
                  {issue.duplicate === "possible" && (
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={r.allowDuplicate}
                        onChange={(e) =>
                          patch(r.id, { allowDuplicate: e.target.checked })
                        }
                      />
                      {t("This is a separate transaction; import it anyway")}
                    </label>
                  )}
                </article>
              );
            })}
          </div>
          {visibleRows.length > 20 && (
            <div className="page-toolbar import-pagination">
              <button
                className="button secondary"
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                {t("Previous")}
              </button>
              <span>
                {page + 1}/{Math.ceil(visibleRows.length / 20)}
              </span>
              <button
                className="button secondary"
                disabled={(page + 1) * 20 >= visibleRows.length}
                onClick={() => setPage(page + 1)}
              >
                {t("Next")}
              </button>
            </div>
          )}
        </>
      )}
      <button
        className="text-button"
        disabled={busy || rows.length >= 5000}
        onClick={() => {
          setRows((rs) => [
            ...rs,
            {
              ...newImportRow(data.currency),
              date: today(),
              reviewed: !preview && !pdfPages.length,
            },
          ]);
          setFilter("all");
          setConfirmed(false);
          setPage(Math.floor(rows.length / 20));
        }}
      >
        <Plus size={16} />
        {t("Add row manually")}
      </button>
      {!!rows.length && (
        <div className="import-confirm">
          <ErrorText error={commitError} />
          <label className="check-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            {t("I reviewed the selected transactions and confirm the import")}
          </label>
          <button
            className="button"
            disabled={busy || !selected.length || !!commitError || !confirmed}
            onClick={() => {
              try {
                commitImport(data, rows);
                update((d) => commitImport(d, rows));
                toast("Transactions imported");
                onClose();
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <Check size={16} />
            {t("Import selected")} ({selected.length})
          </button>
        </div>
      )}
    </section>
  );
}
