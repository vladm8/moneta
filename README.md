# MONETA

A local-first personal finance app, built with React, TypeScript and Vite. Financial ledgers remain in the browser. Optional read-only Enable Banking connections use a separately configured authenticated Node backend with encrypted storage. No analytics trackers or external font requests.

Bank connection setup, credentials, callback URLs and deployment: **[BANKING.md](BANKING.md)**. Banking is disabled until explicitly configured; the standalone app still works without the backend.

## Run

```sh
npm ci
npm run dev
npm test
npm run build
```

Open the URL printed by Vite. The production app is the static `dist/` directory.

## Public Privacy Policy and Terms

`privacy.html` and `terms.html` are standalone public pages (no login or application JavaScript). They reuse Moneta’s fonts, theme and panel styling. Edit those files when the operator details or data handling change. `npm.cmd run build` includes both pages and their CSS/fonts in `dist/`.

For the simplest HTTPS publication of these documents, run `npm.cmd run build`, then drag **only `dist/`** onto [Netlify Drop](https://app.netlify.com/drop). Retain/claim the site so the URLs remain under your control, and use the production site address shown by the host:

- Privacy Policy: `https://YOUR-SITE.netlify.app/privacy.html`
- Terms of Service: `https://YOUR-SITE.netlify.app/terms.html`

These are URL patterns, not an existing deployment. Open the actual addresses in a private browser window before entering them in Enable Banking, and use `vladislavmatviyv@gmail.com` as the operator’s data-protection contact. A static deployment hosts the documents and local finance app; it does **not** run the banking backend. Never upload `.env`, private keys or the server database.

If using the existing Node backend behind HTTPS as described in [BANKING.md](BANKING.md), it serves the same built files publicly at `/privacy.html` and `/terms.html` on your domain. No extra server routes are required. Keep the bank callback and `MONETA_ORIGIN` on the actual backend-enabled app domain; the document host can be separate.

On Windows PowerShell, use `npm.cmd` in place of `npm` (for example, `npm.cmd ci` and `npm.cmd run dev`). This avoids PowerShell blocking `npm.ps1` without changing the execution policy.

## What is included

- Polish-first onboarding, English and Ukrainian interface translations, optional isolated demo mode.
- Overview, interactive SVG allocation chart, editable categories, amount/percentage controls, sliders, presets, archive/reorder, prior-month copy and monthly history.
- Expense, income and savings-transfer entries with editing, deletion/undo, search, filters and sorting.
- Deterministic analytics: cumulative daily spending, category breakdown, six-month comparison, budget performance and month-over-month changes.
- Savings goals, contribution history and archival that preserves transfers.
- Recurring income/expense templates, explicitly applied once per month.
- Five separate currency ledgers (PLN, EUR, USD, UAH, GBP); switching currencies does not convert existing data.
- Light, dark and system themes; responsive navigation, accessible dialogs and reduced-motion support.
- IndexedDB persistence, validated JSON backup import, JSON/CSV export and explicit data deletion.

## Financial rules

Amounts are safe integer minor units. Input supports a dot or comma decimal separator and rounds half up at the third decimal. Percentage calculations use BigInt intermediates. Distribution uses largest remainders, preserving every minor unit deterministically.

`unallocated = monthly income − planned allocations`

`available = monthly income − actual expenses − savings transfers`

Allocations are plans, never transactions. Savings transfers reduce available monthly cash and increase goal savings without counting as expenses. Category progress includes expenses and transfers assigned to that category. Monthly available cash does not automatically carry forward. Expenses may exceed income because actual activity must remain recordable; new savings transfers cannot exceed available money. Budget plans cannot be saved above income. Reducing income can make an already-saved plan overallocated; the budget editor shows this and requires adjustment.

Goal savings are the opening saved amount plus their contribution history. Opening savings are not recorded as new income. Deleting a contributed goal archives it. Category deletion retains transactions as uncategorized and explicitly removes the category's historical allocations; use archive to retain full history.

Refunds reduce monthly/category spending; internal transfers affect neither income nor expenses. Available money is a monthly budget measure, not an account balance. The portfolio independently tracks manually declared holdings and debts, so budgets and goal transfers are never added to net worth. Update each declared balance in place instead of adding deposits as new holdings.

## Financial planning, portfolio and import

- Sliders snap to 5 units of the selected currency; exact manual decimal values remain supported. Both respect the remaining allocation limit.
- Goals support a currency-specific ledger, opening savings, icon, description and deadline. Savings requirements use calendar-month fractions and round upward to a cent with BigInt arithmetic. Weekly suggestions use remaining calendar days. Completion projections use observed contributions from up to 90 days and require at least 7 days of history; opening savings and future-dated contributions are excluded from pace calculations. Due-today, overdue and completed goals have explicit states.
- The Portfolio view uses the official HTTPS [NBP table A API](https://api.nbp.pl/) to convert PLN/EUR/USD/UAH/GBP holdings to the selected currency. Rates are cached in IndexedDB with publication and fetch timestamps. Integer-scaled rates and BigInt ratios produce half-up cent rounding. Missing rates produce an incomplete valuation, never a fabricated rate. Portfolio changes do not generate investment returns or historical performance.
- CSV, JSON, PDF and local OCR import is available from Transactions. PDF text extraction and scanned-page OCR run locally, with page previews (10 MB / 20 pages). See [IMPORT.md](IMPORT.md), the JSON schema and downloadable example in `public/examples/`. Every import uses an editable preview and a single final confirmation; duplicate and field validation remain enforced.
- The spending chart supports full-area pointer/touch selection, arrow-key navigation, monthly or 7/14/21-day windows and a permanently full-width chart card. Cumulative values start at the beginning of the displayed range; refunds reduce expenses.
- Notifications share `Notification.tsx` and appear at the top center, including rate updates. Use the existing `toast(message, undo?, { duration? })` context API for new notifications. Dismissal animates; hover/focus pauses the timer and Undo remains available. `liquid-glass.css` provides themed glass surfaces for notifications, dialogs, mobile navigation and compact selectors.
- Existing version-1 backups remain readable. Holdings, rate cache and goal metadata are optional extensions; legacy records are not rewritten or reclassified. `refund` and `internal` are new entry types. Backups with these extensions require this or a newer MONETA version.
- `finance.ts`, `Portfolio.tsx`, `GoalPlanner.tsx`, `features/transaction-import/`, `finance.css` and `featureStrings.ts` extend the existing state and UI patterns. `finance.test.ts` covers financial rules and compatibility.

## Architecture

- `src/engine.ts`: typed models, monetary calculations, financial commands, validation, CSV serialization, demo fixture.
- `src/persistence.ts`: versioned IndexedDB adapter. No network persistence.
- `src/App.tsx`: application state, serialized persistence, recoverable draft allocations, shell and onboarding.
- `src/ui.tsx`: forms, dialogs, accessible primitives and transaction list.
- `src/Overview.tsx`, `Budget.tsx`, `Portfolio.tsx`: dashboard and planning views.
- `src/pages/`: separate Transactions, Analytics, Goals and Settings views (formerly `Tools.tsx`).
- `src/features/transaction-import/`: import wizard, parsing, document recognition and adjacent tests. The wizard loads on demand, with preloading on pointer/focus intent; PDF and OCR engines retain their existing lazy loading.
- `src/formatting.ts`: reusable locale formatters for exact money and transaction dates.
- `src/i18n.ts`: interface translations; user-entered names remain unchanged.
- `src/styles.css`: base component layouts and responsive behavior.
- `src/fintech.css`: light/dark design tokens, glass materials, fintech layouts and motion.
- `src/AmbientBackground.tsx`: local ambient video, paused for reduced motion and hidden tabs. The original MP4 is served from `public/assets/moneta-ambient.mp4`; its extracted still frame provides the poster/fallback. No external media requests.
- `src/engine.test.ts`: monetary, category, transaction, savings, month-isolation, recurrence, import, CSV and IndexedDB tests.

## Boundaries

The financial workspace is single-browser, with no cross-device ledger synchronization, actual currency exchange, interest projections, savings withdrawals, or unattended recurring charges. Optional read-only bank integration requires the separately configured backend described in BANKING.md. NBP conversion is a reference valuation, not a bank execution quote. Export backups regularly. Clearing browser storage removes local data but does not revoke bank consent; disconnect banks first when desired. Multiple tabs do not merge concurrent edits. Demo changes are discarded when leaving demo. Draft allocations use localStorage; committed financial records use IndexedDB. Banking login protects server-held connections, not the existing local workspace.

## Interface motion

`src/motion.tsx` and `src/motion.css` provide shared native page transitions, moving navigation indicators, pointer lighting, list rearrangement and exact-value feedback. No animation dependency is required. Financial values update immediately; motion never delays saving or interpolates balances. Reduced-motion preferences disable these effects. Browsers without View Transitions retain ordinary navigation.


## Verification

See `QA.md` for the completed automated and browser checks and any verification limits.

See `OPTIMIZATION.md` for the measured optimization results and refactoring boundaries.
