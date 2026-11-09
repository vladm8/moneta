# Optimization audit — 2026-11-07

This pass preserves the existing design and the pending donut correction. Rollback checkpoint: local branch `backup/pre-optimization-20261107`. Untracked QA captures were preserved; credentials and `.banking/` were not read, moved or changed.

## Implementation

- Reuse `Intl.NumberFormat` and `Intl.DateTimeFormat` instances instead of constructing them for each transaction row. Formatting options, locales, precision and minor-unit conversion are identical. Native-output regression tests cover all five currencies, all three languages, both precisions, negative amounts and date boundaries.
- Build transaction search text/category lookups once per ledger/month change. Memoize filtering/sorting and summary results with their actual inputs. All rows remain available with their existing order, controls and animations; no virtualization or pagination changes.
- Memoize import validation/duplicate analysis by data and rows, avoiding repeated trial imports on pagination, preview zoom and confirmation changes. The actual commit still validates again.
- Load the document-import wizard on demand. Preload on hover/focus and keep the current transaction screen until loading completes. Failures use the shared localized notification system.
- Split `Tools.tsx` into four cohesive page modules. Group the import wizard, parsers, recognition and their tests in one feature directory. Remove unused imports/variables and enforce unused-symbol checks in TypeScript.
- Skip list geometry reads when reduced motion is requested and skip pointer-light frame scheduling outside supported targets. Animation timing, keyframes and easing are retained. Removed only an earlier `donut-in` definition already overridden by the later definition of the same name.

## Structure

```text
src/
  App.tsx, main.tsx            application shell and entry
  engine.ts, finance.ts       existing financial rules (formulas unchanged)
  persistence.ts              existing IndexedDB storage
  formatting.ts               cached locale formatting
  ui.tsx, Charts.tsx, ...      existing shared UI and feature components
  pages/                      Transactions, Analytics, Goals, Settings
  features/transaction-import/
    ImportWizard.tsx
    transactionImport.ts
    documentRecognition.ts, imageRecognition.ts
    pdfImport.ts, pdfText.ts
    *.test.ts
server/                       unchanged protected banking subsystem
```

No runtime dependency was added or removed: the existing packages all have active uses. Local fonts, background media, PDF resources and license notices remain intact. Broad CSS rewrites and banking refactoring were deliberately outside this pass.

## Measurements

Same machine, headless Edge, isolated browser data, default Polish demo, 1440 × 1000 desktop and 390 × 844 mobile. Browser timings below use the Vite development server; bundle sizes use the production build. These are local measurements, not production network or device benchmarks.

| Metric | Before | After |
| --- | ---: | ---: |
| Format 2,000 PLN amounts, median of seven batches | 45.3 ms | 1.5 ms |
| Initial application JS, uncompressed | 453,166 B | 423,774 B |
| Initial application JS, gzip | 142,934 B | 132,303 B |
| Render 2,000 transaction rows, one cold page load | 1,904 ms | 1,467 ms |
| Filter 2,000 rows, median of three interactions | 144 ms | 132 ms |

The on-demand wizard adds approximately 30.5 kB / 11.5 kB gzip only when requested. The smaller main bundle is the dependable loading improvement; single-run render timing and small filtering differences are indicative and subject to noise. No measured FPS, React render-count, mobile Safari or real-network improvement is claimed.

## Visual and regression verification

Full-page screenshots at matching states covered Overview, Budget, Transactions, Analytics, Goals, Portfolio, Settings, the import wizard, and mobile Overview. Eight captures matched exactly; Goals differed by at most two RGB levels, with no pixels exceeding a 10-level difference. Background video was paused at frame zero for deterministic comparison. This verifies the sampled settled states, not every animation frame or browser.

Before/after JSON measurements and screenshots are local artifacts under `qa/optimization/`. Unit tests, backend tests and production browser interaction results are recorded in QA.md.

Remaining limits: very large lists still render all rows to preserve existing interaction/layout; the lazy PDF engine retains its existing approximately 502 kB chunk-size advisory. No database schema, financial formula, provider authentication, synchronization, encryption, environment setting or persisted user data was changed.
