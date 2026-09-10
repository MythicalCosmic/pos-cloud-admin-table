---
version: 1
slug: "src-pages-index-vue"
primary_target: "src/pages/index.vue"
related_targets: ["src/pages/dash/executive.vue","src/pages/dash/sales.vue","src/pages/dash/products.vue","src/pages/dash/staff.vue","src/pages/dash/operations.vue"]
---

# Continuous dashboard

Mode: Operate. Scope: src/pages/index.vue and the five dashboard report sections. Seed: 3d3e4b25, assigned surface candidate 5, report chapter bands. The existing blue/navy identity and six light/dark palettes remain authoritative.

The user approved the three visual previews and delegated the final choice, explicitly preserving the existing dashboard header, today count, start/end date controls, section navigator, and four opening Overview cards. Chosen comp: .impeccable/mocks/dashboard-direction-a.png, with its exact prompt in the adjacent JSON and the pinned-header/cards exception. Comp labels, dates, logos and unavailable example fields are illustrative, never app facts.

Composition: one continuous Overview, Sales, Products, Staff and Operations report. A dominant interactive trend sits beside compact payment and category analysis. A full-width recent-order ledger follows. Later chapters use shallow metric rails, compact reports and truthful empty states. All fields, routes, permissions, filters, requests and actions remain available. On phones, tables become expandable records; meaningful chart controls remain reachable without permanent navigation sliders.

Products begins with two side-by-side interactive unit-share pies, one for sold products and one for sold categories, as explicitly requested after the composition choice. Each pie pairs actual SVG ring sectors with five leading exact-value rows and a visible reported-dataset count. Both columns are equal width on desktop and stack at 1000px. More than 12 rows use the shared bounded selector, retaining access to a 241-product result without expanding a 241-row legend; shorter lists can expand in place. A full-width category-analysis card follows with the Revenue/Units switch, linked treemap and ranking, stacking its inner columns at 900px.

Media inventory: semantic Vue/CSS for controls, tables, ranked distributions and states; actual SVG sectors for directly selectable payment shares; existing ECharts SVG for time series and category treemap; SVG for Pareto, staff and product-pair charts. No raster assets belong in this production dashboard, confirmed by the asset producer. Existing fonts, palette tokens and DesignIcon remain shared.

Interaction: hover previews; click/tap pins an exact breakdown; row buttons provide keyboard equivalents. Category map, custom selector and ranking share selection. Series expose metric/area/column choices, comparison when backed by data, keyboard point navigation and optional zoom tools. Pareto retains every product with a keyboard-accessible exact-value selector. Product affinity retains ranked, chord and matrix modes. Staff comparisons use reported orders, revenue, hours and shifts, with exact values and explicit per-axis normalization; no invented performance scores.

Scatter plots orders against revenue and uses AOV for bubble size. Hover/focus previews a person's exact orders, revenue in UZS and AOV; click/tap or Enter/Space pins selection. Points have enlarged transparent hit areas, and the custom selector reaches all people including coincident points. Selection synchronizes with the staff leaderboard and primary Radar comparison. Moving away from a preview restores the pinned person's readout. Radar scales each measure to that measure's maximum across the reported team, with original values available in View data.

Truth: zero, unavailable, stale, loading and partial failure have different states. No live-looking mock data. Pair occurrences are not unique order counts. Chart share denominators and staff aggregation labels remain visible. Use shared UZS/count formatters and update en/ru/uz together. Preserve independent business-day today counts and existing canonical date construction.

Dataset scope: sold-product units use every returned Pareto product when all rows contain a valid quantity; older responses without a complete quantity set fall back to up to five positive-unit products from the available trend series. The product pie's denominator is the sum of that supplied dataset, never the overview's full-period units. Category unit shares use every returned category and their unit sum. Limiting the visible legend does not limit either pie's sectors or denominator. Pareto cumulative percentages prefer a positive reported period total, then complete monotonic reported cumulative shares, then complete reported shares, and finally the sum of displayed product revenues. Its scope copy distinguishes reported period revenue from chart revenue, and no 80% claim appears if the reported cumulative series does not reach that level. The staff non-cancellation summary is labeled as an average across staff, not a weighted order-wide rate.

Verification: desktop/tablet/320–390px phones, all locales, light/dark and six palettes, hover/tap/keyboard, meaningful loading/error/empty/populated states, exact totals, filters, sorting, pagination, refresh and export. Node24/Yarn1.22.18 lint, vue-tsc, contract tests and production build. The separate product-performance API report and exports are now integrated at /reports/product-performance; AI chat remains separate queued work.
