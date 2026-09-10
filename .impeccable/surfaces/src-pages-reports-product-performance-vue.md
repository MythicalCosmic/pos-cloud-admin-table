---
version: 1
slug: "src-pages-reports-product-performance-vue"
primary_target: "src/pages/reports/product-performance.vue"
related_targets: ["src/components/reports/ProductPerformanceTable.vue","src/components/reports/ProductReportExport.vue"]
---

# Product performance report

Mode: Operate. Scope: the precisely specified product-performance API integration at /reports/product-performance. Inherit the established Alpha blue/navy system, existing custom controls, six palettes and the dashboard's compact report rails. This is an accounting report extension; no new identity or invented analytical narrative.

Audience: restaurant managers/admins checking product sales, historical cost and gross profit, then exporting the same filtered dataset. Primary task: select business dates/category/search/sort in one toolbar, inspect six complete-result totals and the paginated product ledger, download XLSX/PDF/CSV. Advanced filters and row evidence stay accessible without crowding the primary task. Category and daily tabs use full backend summaries.

Authority: user's supplied Product Performance Report Frontend Integration Contract; current response verified in production. Keep the existing product-sales analytics route. Use the report's canonical 07:00–03:00 Asia/Tashkent business window, not the older dashboard date configuration. Preserve decimal strings, null costs/profit, server sorting/totals and complete filtered exports. Present unknown cost with a visible warning and dashes; do not substitute current recipe prices.

Composition: compact title/refresh, custom filter toolbar, six shallow summary cells, contextual cost warning and report dates, a wide ledger with sticky product/category columns, optional row detail, category/daily summaries, and collapsible methodology. Phones use two-column metrics, a compact header and expandable product records. Touch/keyboard selection and restrained overlay motion inherit existing components.

Implemented toolbar: date preset, category, search, sort and export use the existing custom fields. Custom business dates and the cashier/order-type/origin/payment filters open within the filter surface. At 700px and below, search, sort and export each occupy the full width. Long selected sort labels wrap in an auto-height control with a 44px minimum; the sort and export remain separate full rows at 320–390px. The compact phone header keeps Refresh as a labeled icon button.

Metrics and ledger: six cells show units sold, revenue, ingredient cost, gross profit, margin and cost coverage from the full filtered backend summary, with a restrained primary tint on Revenue. The rail uses six columns on wide screens, three at 1350px and two at 700px. The desktop ledger keeps the 220px Product and 150px Category columns sticky while the remaining measures scroll. Phone records show category, units, revenue, profit and cost status first, with the full fields and accounting evidence reachable through expansion. Product-name buttons apply a product filter and a visible removable chip identifies it. Tabs retain the full category and daily summaries.

Exact values and evidence: money uses shared `fmtMoney(..., { exact: true })`, preserving decimal-string precision and narrow no-break-space grouping independently of the global abbreviated-number preference. Absent financial values remain dashes. A visible warning identifies incomplete historical cost and each product retains a readable cost-status badge. Expanded evidence keeps refunds, net units, ingredient credits, source/coverage, realized price range, current catalog reference price and order count; it does not substitute the catalog price for historical cost.

Export interaction: the compact menu exposes XLSX, PDF and CSV for the complete applied filter set. A running format alone shows a spinner and becomes disabled; the remaining formats and report filters stay usable. The menu focuses an available item on opening, supports Arrow/Home/End navigation, returns focus to the trigger on Escape and closes when focus leaves. If the active item becomes disabled, focus moves to another available item or to the menu when all formats are busy. Its border, surface and shadow inherit Alpha tokens; the 160ms opacity/transform transition is removed for reduced motion.

Media: semantic Vue/CSS, shared DesignIcon, existing typography and palette tokens. No raster media or new chart libraries. Exact financial values dominate the report; the dashboard retains its separate interactive chart composition.

Validation: query/export parity, all six sorts, 300ms search, page reset, racing requests, null/decimal preservation, filenames and blob errors, independent export loading, ADMIN/MANAGER access, both themes/all locales at desktop and 320–390px phones. Backend PDF label wrapping is recorded in docs/backend/product-performance.md, not modified in backend code.
