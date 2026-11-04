# MONETA validation

Validated on 3 November 2026.

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

No real-device Safari/iOS test, screen-reader audit, penetration test or cross-device sync test was performed. Multi-tab concurrent editing is not supported. Recurring entries require explicit application. No bank connection, automatic currency conversion, savings withdrawal or overdraft budgeting mode is included. Browser storage is not a backup; JSON export is the backup mechanism.

## Publication status

The production build is complete locally. Publication is pending explicit permission to send source code to the private Sites repository; automatic approval review blocked that network action. No successful source upload or live deployment has been confirmed.
