# MONETA

A local-first personal finance app, built with React, TypeScript and Vite. No accounts, bank connections, analytics trackers or external font requests. The optional hosted deployment is private; all financial records remain in the visitor's browser.

## Run

```sh
npm ci
npm run dev
npm test
npm run build
```

Open the URL printed by Vite. The production app is the static `dist/` directory.

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

Goal savings are computed from their transfer history. Deleting a contributed goal archives it. Category deletion retains transactions as uncategorized and explicitly removes the category's historical allocations; use archive to retain full history.

## Architecture

- `src/engine.ts`: typed models, monetary calculations, financial commands, validation, CSV serialization, demo fixture.
- `src/persistence.ts`: versioned IndexedDB adapter. No network persistence.
- `src/App.tsx`: application state, serialized persistence, recoverable draft allocations, shell and onboarding.
- `src/ui.tsx`: forms, dialogs, accessible primitives and transaction list.
- `src/Charts.tsx`, `Overview.tsx`, `Budget.tsx`, `Tools.tsx`: feature views.
- `src/i18n.ts`: interface translations; user-entered names remain unchanged.
- `src/styles.css`: base component layouts and responsive behavior.
- `src/fintech.css`: light/dark design tokens, glass materials, fintech layouts and motion.
- `src/AmbientBackground.tsx`: local ambient video, paused for reduced motion and hidden tabs. The original MP4 is served from `public/assets/moneta-ambient.mp4`; its extracted still frame provides the poster/fallback. No external media requests.
- `src/engine.test.ts`: monetary, category, transaction, savings, month-isolation, recurrence, import, CSV and IndexedDB tests.

## Boundaries

This release is a single-browser app, with no cross-device synchronization, bank integration, currency exchange, interest projections, savings withdrawals, or unattended recurring charges. Export backups regularly. Clearing browser storage removes local data. Multiple tabs do not merge concurrent edits. Demo changes are discarded when leaving demo. Draft allocations use browser localStorage; committed records use IndexedDB. A hosted access gate, when present, belongs to the hosting provider rather than MONETA's account system.

## Verification

See `QA.md` for the completed automated and browser checks and any verification limits.
