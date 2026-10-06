# Compact AssetRow

Full files updated: `src/components/AssetRow.tsx`, `src/components/AssetLogo.tsx`,
`src/lib/format.ts`, `src/app/globals.css`, `src/app/(app)/explore/page.tsx`.
Tests added: `src/lib/format.test.ts`, `scripts/test-asset-row-layout.mjs`.

The default is `density="compact"` and `showTag={true}`. List logos are 36px,
symbol 17px, company line 12px, price 16px (15px at 320px), currency code 11px.
Prices use central `formatPrice`: four decimals below 1, two otherwise, grouping,
and an em dash for invalid/absent prices. Rounded percentage sign/arrow/tone share
`formatAssetChange`, including negative-zero handling. Quantities, market-value
precedence, symbol routes, watch callbacks, category labels and 20-stock pagination
are preserved. The watch button remains separate from the stretched row link, so
there are no nested interactive elements or accidental watch-click navigation.

Removed/replaced: 88px minimum, 16px vertical padding, 48px list logo, large title
symbol typography, 6px tag gap, 4px name gap, $-prefixed row prices and plain change
text. Removed search's 0px row-padding/flex override. No sparkline or after-hours
row existed, so none was added or removed. List card now uses 4px/16px padding;
the heading gap remains 12px and the status text wraps at 12px.

Actual current AssetRow consumers are the investment lists and search dropdown.
Homepage holdings use a different expanding `StockHoldingCard`; it was inspected
and left intact to preserve its information and expand/collapse behavior. There
is no separate watchlist page with duplicate AssetRow markup. The investment
list's existing watch buttons still use this central row. Detail-page logos retain
their explicitly supplied size; this change does not shrink stock-detail headers.

Measured in headless Edge with the real React row/CSS and 20-row fixtures:

| Width | Original tagged list | Compact tagged list/search | No tag | Skeleton |
| --- | --- | --- | --- | --- |
| 320 | 110.28px | 75.98px | 56.00px | 75.98px |
| 360 | 110.28px | 75.98px | 56.50px | 75.98px |
| 390 | 110.28px | 75.98px | 56.50px | 75.98px |
| 430 | 110.28px | 75.98px | 56.50px | 75.98px |
| 768 | 110.28px | 75.98px | 56.50px | 75.98px |
| 1280 | 110.28px | 75.98px | 56.50px | 75.98px |

Before changes, search had a separate 88px height due to its old override.
Checks cover positive/negative/zero/tiny-negative percentages; prices 0.2619,
1.20, 1,234.56 and 12,345.67; five-letter symbols, very long company names,
missing row price; routes/watch callbacks and no horizontal page/price overflow.
Compact screenshots use the locally built Noto Sans Thai faces. Baseline captures
were taken before editing with the fixture's browser fallback font. CSS line-box
heights were unchanged by loading the real font in the final fixture.

Before/after 360px and 1280px screenshots are saved in
`C:/Users/Porpeang-PC/AppData/Local/Temp/investkub-asset-row-qa/`.
The browser fixture uses an anchor adapter for Next Link, not a logged-in live
application screenshot. Rendering optimization is `content-visibility: auto`
and `contain-intrinsic-size: auto 72px`; no new library was added.

Checks passed: 101 unit tests, TypeScript and lint. No SQL or API changes.
