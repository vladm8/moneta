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

## Limits

No real-device Safari/iOS test, screen-reader audit, penetration test or cross-device sync test was performed. Multi-tab concurrent editing is not supported. Recurring entries require explicit application. No bank connection, actual currency exchange, savings withdrawal or overdraft budgeting mode is included. NBP conversion estimates portfolio values only; imported historical transactions remain in their original currency ledgers. Browser storage is not a backup; JSON export is the backup mechanism.

## Publication status

The source repository is https://github.com/vladm8/moneta. This update includes the financial features, mobile fixes, entrance animations and dark theme by default. The production build is verified locally; no live web deployment is claimed.
