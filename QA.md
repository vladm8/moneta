# MONETA validation

Latest validation: 5 November 2026. Earlier checks are retained below with their original scope.

## Entrance animations — 5 November 2026

- Removed active-tab dots from the sidebar; selected-tab surface, icon styling and `aria-current` remain.
- Added a critical HTML logo loader before JavaScript/data loading, followed by short welcome and dashboard entrances. No artificial loading delay or blocking overlay is added after content is ready.
- Production build passed. In isolated Edge, delayed the JavaScript response to verify the initial loader, then verified welcome/dashboard animations, settled transforms, absence of navigation dots and no horizontal overflow at 390 px. Reduced-motion mode disables the entrances. No browser runtime errors were observed.

## Financial features — 5 November 2026

- 68 Vitest cases passed across the existing engine suite and `finance.test.ts`. New coverage includes five-unit slider steps and exact inputs, calendar-month fractions and expired goals, integer FX rounding, missing rates, net worth without adding goals/plans, CSV/JSON parsing, duplicate overrides, neutral internal transfers, refunds, legacy backups and IndexedDB round trips.
- A 5,000-row import into a 10,000-entry ledger preserves existing records. Duplicate detection uses per-currency indexes and batched appends, avoiding a full ledger scan/copy per imported row. Reused entry IDs cannot overwrite existing records.
- TypeScript and the optimized Vite build passed. OCR code is lazy-loaded; local worker/core/model assets are included in the production output.
- In an isolated Edge/Chromium context seeded with synthetic demo records: changed a slider by keyboard in five-unit steps, saved an exact 2600.23 allocation, created a goal with 5000 opening savings, added a contribution and edited it, and added PLN/EUR assets and a liability.
- Fetched a real NBP response: table `215/A/NBP/2026`, publication date 2026-11-04. Publication and fetch timestamps are displayed separately; no test exchange rates were used in browser screenshots.
- Imported CSV income, expense, refund and internal-transfer rows through the editable preview and confirmation. Ran the actual local Tesseract worker on a synthetic transaction image, recognized two transactions, individually reviewed them and confirmed the import. Verified holdings, goals, contributions and imported entries after reloading.
- Inspected desktop dark and mobile dark/light screenshots. Checked document overflow at 1440, 390 and 320 px across the new overview, portfolio and import views; goals were also checked at 390 px. Fixed missing card padding during visual review. No uncaught browser errors in these flows.
- New artifacts `qa/finance-*` contain synthetic test data only. Full-page mobile screenshots include the fixed bottom navigation at its viewport position; scrolling makes underlying content accessible.
- Format and privacy details are in `IMPORT.md`. OCR requires review and can need manual corrections for bank-specific layouts, omitted years/currencies or unclear images. A real iPhone/Safari check has not been performed.

## Visual redesign — 4 November 2026

- Preserved the financial engine, storage schema, persistence, context state and form commands. Changed presentation, section order, theme materials and decorative media only.
- Verified all six pages in an isolated Edge/Chromium demo session at 360, 390, 768, 1024 and 1440 pixels. No document horizontal overflow; decorative shapes remain clipped inside their cards.
- Inspected dark/light desktop and mobile screenshots, transaction and category dialogs. Fixed secondary-button contrast and aligned settings fields. Added accessible names to compact sidebar buttons.
- Added an expense through the existing form; added, edited and deleted a temporary category. The selected color checkmark is centered with zero horizontal/vertical offset.
- Actual supplied MP4: 1600 × 1200, 3.9 seconds, about 1.3 MB. Verified muted playback, looping and resume after reduced-motion preference changes. With reduced motion enabled before loading, the video stays paused and no MP4 source is loaded; the 44 KB still-frame poster remains available.
- No JavaScript errors in the checked flows. Existing 40 tests passed; TypeScript and Vite build passed.
- Screenshots prefixed `qa/redesign-` contain isolated demo data. Original 3 November screenshots remain for comparison. Real-device Safari/iOS and screen-reader testing remain outside this verification.

## Automated

- TypeScript check and optimized Vite production build.
- 40 passing Vitest cases covering integer rounding, percentage allocation, remainder distribution, budget overflow, categories, transaction edits, monthly isolation, savings contributions, recurring templates, locale formatting, CSV injection escaping, import validation and IndexedDB round trips.
- Dependency installation/audit reports zero known vulnerabilities after updating the test runner.

## Browser verification

Tested the application in the integrated Chromium browser using an explicitly named local test profile (`Test QA`) and the isolated demo.

1. Onboarded with 5,000 PLN income and suggested categories.
2. Allocated 500 PLN to Food, saved, changed it to 700 PLN and saved again.
3. Verified the chart at 14% Food / 86% unallocated.
4. Added a 100 PLN Food expense and refreshed the app.
5. Verified persisted income 5,000 PLN, allocation 700 PLN, expense 100 PLN, and available money 4,900 PLN.
6. Switched to December and verified empty income, allocations and expenses; November remained intact.
7. Entered a 6,000 PLN allocation; saving was disabled and the warning showed the exact 1,000 PLN excess.
8. Inspected responsive overview, allocation editor, analytics and contribution form at a 390-pixel viewport. Fixed an oversized range-input track found during inspection.
9. Added a 250 PLN contribution in demo; goal savings increased from 6,000 to 6,250 PLN.
10. Checked Ukrainian UI labels and dark appearance on mobile.
11. Inspected the desktop demo with clearly labeled sample data.
12. Checked browser logs: no runtime errors or warnings during the verified flows.
13. Checked the minimum 320-pixel viewport, fixed intrinsic grid overflow and verified `scrollWidth === clientWidth`.

Screenshots are in `qa/`. They contain explicitly labeled demo data, not personal financial records.

## PDF import — 2026-11-05

- Build and 70 automated tests passed, including visual-order reconstruction of PDF text and review gating.
- Headless Edge: synthetic two-page text PDF produced two transactions with distinct dates and currencies; per-row and whole-import confirmation were required before saving.
- A scanned PDF was rasterized and read by the actual local Tesseract worker. The amount, currency and description were editable in the existing import form.
- Verified page selection, a 390 px mobile layout without horizontal overflow, rejection of a 21-page document and a damaged PDF, and no browser runtime errors in these flows.
- Screenshots: `qa/pdf-import-desktop.png` and `qa/pdf-import-mobile.png`. These use synthetic data. Password-protected files have an explicit error path; real bank layouts and real-device Safari still require testing.

## Chart interaction and import confirmation — 2026-11-05

- Build and all 89 automated tests pass. Window bounds cover month edges and leap February; series tests cover refunds, empty ranges and exclusion of non-expense flows.
- Headless Edge: pointer movement anywhere above/below the curve selects the nearest day without moving the chart. Checked keyboard arrows/Home, touch input, 7/14/21-day windows, previous/next windows and a populated synthetic range total.
- Expanded/collapsed the chart, verified an active 420 ms layout animation and restored width; checked 390 px mobile layout without horizontal overflow. Reduced-motion preference skips expansion animations.
- Imported a synthetic 25-row PDF into the preview: no individual PDF/OCR review checkboxes or bulk-review button, one final confirmation enables import; editing resets that final confirmation. Duplicate/validation rules remain active. Pagination displays Polish labels and is separated from rows by at least 24 px.
- Synthetic screenshots: `qa/chart-expanded.png`, `qa/chart-mobile.png`. No runtime errors occurred in the verified flow. Earlier per-row-review observations below describe the previous import workflow and are superseded by this change.

## Shared liquid glass and notifications — 2026-11-05

- Rate, transaction-save and delete notifications use the same top-center portal on desktop and mobile, with animated entrance/dismissal, Close and optional Undo. Rate messages keep their shorter duration; Undo messages keep a longer duration. Hover/focus pauses automatic dismissal.
- Checked actual UI flows with controlled NBP responses: automatic dismissal, manual close, deletion and restoring via Undo, repeat notifications, mobile centering and no horizontal overflow. Glass dialogs were visually inspected after opening animations in dark desktop and light mobile modes. Reduced-motion preference disables notification movement. No runtime errors occurred.
- New shared material covers dialogs, mobile bottom navigation, month/metric selectors, segmented controls, chart range controls and the theme switch. Financial cards retain their existing presentation.
- Synthetic screenshots: `qa/glass-notification.png`, `qa/glass-modal-dark.png`, `qa/glass-modal-light.png`, `qa/glass-mobile-dark.png`. The previous corner-only rate notice is superseded by this shared implementation.

## Mobile spending chart — 2026-11-05

- Chart geometry scales to 190–240 px tall on narrow containers; desktop retains 360 px. Mobile header/readout spacing is tighter, date labels are compact, and the range selector uses four equal touch targets with short day labels.
- Edge mobile emulation at 320/390/430 px: card below 560 px tall, no horizontal overflow, labels fit one row, correct cumulative amounts and week length, tap selection and stable readout layout. Cancelled touches restore the previous selection. A native touch swipe across the plot scrolls the page and preserves the selected day.
- Inspected dark and light screenshots after layout settled: `qa/trend-mobile-320.png`, `qa/trend-mobile-390.png`, `qa/trend-mobile-430.png`, `qa/trend-mobile-light.png`. Desktop keeps long labels and full height. No runtime errors in the verified flow; real-device Safari remains untested.

## Limits

### Recognition improvements — 2026-11-05

- 86 tests cover positioned Revolut debit/credit/balance columns, pending rows, empty statements, wrapped descriptions, FX details, Polish/English/Ukrainian dates, inferred values, whole-unit amounts and OCR statuses.
- Read-only verification against the user-provided eight-page statement: 57 completed rows, 2 pending rows excluded, no invalid date/type/description. Extracted incoming/outgoing sums match both non-empty currency summaries exactly. Private source text/images are not stored in this repository.
- Actual Tesseract OCR in Edge read three synthetic rows correctly on both light and dark screenshots, preserving amounts, signs, dates and currencies.
- UI checked: today is the default even from a historical month, manual import rows use today, bulk review works, editing a row revokes review, mobile width 390 px does not overflow, no runtime errors. Synthetic screenshot: `qa/import-review-mobile.png`.

No real-device Safari/iOS test, screen-reader audit, penetration test or cross-device sync test was performed. Multi-tab concurrent editing is not supported. Recurring entries require explicit application. Actual currency exchange, savings withdrawal and overdraft budgeting are not included. Optional bank connections now require the separate backend described in BANKING.md; live provider authorization has not been tested without credentials. NBP conversion estimates portfolio values only; imported historical transactions remain in their original currency ledgers. Browser storage is not a backup; JSON export is the backup mechanism.

### Enable Banking integration — 2026-11-06

- `npm run test:banking`: 21 backend tests passed (Node test runner). Coverage includes signed JWT verification, password verification, AES-GCM persistence/isolation, owner/login/expiry/single-use state, full mocked authorization, cancellation, production opt-in, application configuration, pagination/cycles/rate limits/network errors, normalization, pending reconciliation, immutable references/fallback duplicates, balances, partial failure, inclusive date chunks, reconnection, expiry, revocation and HTTP authentication/CSRF/logout.
- `npm test`: 99 tests passed, including 10 new frontend finance/persistence tests. Covered existing budget integration, category suggestions, preservation of manual edits/notes, deleted-entry tombstones, invalid and pending rows, user/environment binding, old manual/PDF duplicates, multiple currencies, internal transfers, asset replacement, negative balances and nonduplicated goal backing.
- `npm run build`: TypeScript and production build passed. Existing lazy PDF bundle size advisory remains; no banking secrets are included in the browser build.
- Headless Edge with synthetic banking API: desktop 1440 px and mobile 390/320 px. Verified institution discovery, booking-only import, confirmation, balance-to-holding linking, goal reservation, repeated synchronization, no horizontal overflow and no runtime errors. Screenshots: `qa/banking-1440.png`, `qa/banking-390.png`, `qa/banking-320.png`.
- A synthetic `.pem` probe returned HTTP 403 from Vite, confirming its private-file deny configuration. Temporary probe and browser script removed after QA.
- No real banking credentials were created or used, and no live bank connection or deployment is claimed. Sandbox/Restricted Production setup and exact callback addresses are documented in BANKING.md. The backend requires Node 24.14+; built-in SQLite currently emits an experimental-feature advisory.

## Publication status
### Production optimization and cleanup — 2026-11-07

- Preserved pending donut changes in checkpoint branch `backup/pre-optimization-20261107`. Split `Tools.tsx` into `src/pages/`; moved eight import-related files into `src/features/transaction-import/` and updated imports/tests. Banking source, API configuration, storage and financial formulas unchanged.
- Cached locale formatters; memoized transaction lookup/filtering and import validation; deferred importer loading with pointer/focus preloading and localized error notifications. TypeScript now rejects unused locals/parameters. All dependencies have active uses and were retained. Removed one overridden CSS keyframe definition; effective animations unchanged.
- `npm test -- --maxWorkers=1`: 101 tests passed across seven files. `npm run test:banking`: 21 tests passed. Production TypeScript/Vite build passed. One simultaneous test run timed out while starting workers during a long host interruption; the complete single-worker rerun passed.
- Same-condition local formatting benchmark: 2,000 calls, median seven batches, 45.3 ms → 1.5 ms. Main production JS: 453,166 → 423,774 bytes; gzip 142,934 → 132,303 bytes (7.4% less). Importer now a deferred 30,455-byte chunk. Details and timing limitations in `OPTIMIZATION.md`; raw JSON under `qa/optimization/`.
- Nine matched-state full-page screenshot comparisons (seven desktop pages, importer and mobile Overview). Eight exactly equal; Goals maximum channel difference 2/255, zero pixels above threshold 10. Video paused at frame zero. No redesign or animation-timing change; this does not establish frame-by-frame equivalence in every browser.
- Headless Edge against the production preview verified importer absent from startup requests, on-demand loading, income create/edit, reviewed JSON import, delete, filtering, chart range/keyboard, exact 500-cent slider step, bounded donut geometry, 390 px layout and reduced motion. No runtime errors. Earlier 2,000-row render/filter measurements remain indicative rather than a reliable production latency claim.
- Existing PDF chunk-size and experimental Node SQLite advisories remain. No real-device Safari, production network, frame-rate or render-count measurement was made.

### Donut rendering correction — 2026-11-07

- Removed share interpolation after the reported distortion; slider values now directly determine SVG geometry. Long arcs are split into at most quarter-circle arcs, ring width remains constant, and SVG overflow is contained.
- Production build passed. Headless Edge checked actual segment bounding boxes for zero allocation, full/near-full allocation, repeated zero crossings, 55 slider steps and mobile width. All paths remained within the ring bounds, without runtime errors. Visually reviewed `qa/donut-stable.png`.

### Motion refinement — 2026-11-07

- Donut geometry now follows interpolated shares instead of CSS path morphing; ring thickness stays fixed. Sidebar icons remain stationary. Overview cards enter individually with 70 ms stagger, including mobile, without an overlapping page snapshot animation.
- Production build passed. Headless Edge verified repeated slider changes and both extremes, finite SVG paths without competing path transitions, sidebar hover, ordered card delays, 390 px layout and reduced motion. No runtime errors. Backend suite: 21 tests passed. Local visual captures: `qa/smooth-budget.png`, `qa/smooth-overview.png`.

### Interface motion — 2026-11-07

- Production build and all 99 Vitest tests passed. No new animation dependency or banking logic changes.
- Headless Edge with isolated synthetic data verified exact amounts after an income save, modal Escape/return focus, chart keyboard interaction without replaying its line animation, goal completion feedback, transaction filtering, budget slider increments, mobile navigation indicator geometry, rapid navigation and reduced-motion behavior. No runtime errors or mobile horizontal overflow at 390 px.
- Visually reviewed desktop chart and mobile overview captures. Screenshots: `qa/motion-overview.png`, `qa/motion-chart.png`, `qa/motion-mobile.png`. No real-device Safari or measured frame-rate claim; unsupported View Transitions use ordinary navigation.


### Public legal pages — 2026-11-07

- Built standalone `privacy.html` and `terms.html` with the existing Vite build. Anonymous HTTP 200 access verified in a fresh browser with JavaScript disabled; both pages contain no scripts, set no cookies, and link to each other correctly. Desktop 1440 px and mobile 390 px checks found no horizontal overflow or failed resource requests. Mobile screenshots: `qa/legal-privacy-390.png`, `qa/legal-terms-390.png`. Desktop screenshot capture was unavailable in the test browser; DOM/layout checks passed.
- Documents describe local financial storage/imports, optional read-only server integration, Restricted Mode, retention/deletion and operator-supplied contact details. README explains static HTTPS publication and distinguishes document hosting from backend deployment. No live hosting deployment was performed.

### Bank discovery and autocomplete — 2026-11-07

- TypeScript and Vite production build passed. Headless Edge with a synthetic API verified automatic bank loading, matching suggestions, country changes, keyboard selection, persistent available-bank choices after a search with no matches, and shared glass error notifications. Checked desktop 1440 px and mobile 390 px with no horizontal overflow or runtime errors. Screenshots: `qa/bank-search-1440.png`, `qa/bank-search-390.png`.
- A read-only check against the configured Enable Banking Sandbox returned Bank Millennium, Mock ASPSP and Genome for Poland; ING was absent. No authorization or account-data request was made. Bank names in the UI always come from the provider response.

The source repository is https://github.com/vladm8/moneta. This update includes the financial features, mobile fixes, entrance animations and dark theme by default. The production build is verified locally; no live web deployment is claimed.
