---
version: 1
slug: "src-pages-orders-index-vue"
primary_target: "src/pages/orders/index.vue"
related_targets: ["src/components/orders/OrderTickets.vue", "src/components/orders/OrderActions.vue", "src/components/design/OrdersInsights.vue", "src/styles/pages/orders.css"]
---

# Orders register

Mode: Operate. The September 13 refinement brings Orders into the precision command surface while preserving all six palettes, fonts, routes, fields, permissions and API contracts.

Composition: an integrated receipt identity, primary actions and the Products/Categories/Orders/Places/QR rail establish context. Shared DashboardFilters sits above four actual-value KPIs joined into one tinted rail. A single elevated register connects the status queue, toolbar, payment summary, active filters, ticket/table content and pagination. Orders defaults to All time; includeAll is an opt-in to the shared date fields. Desktop fields and the phone sheet use the same date/time controls, working-hour presets, validation and Apply behavior. Both list and stats requests use the existing Asia/Tashkent date-parameter builder, including exact intervals. Presets apply immediately; manual endpoint changes remain drafts until Apply.

Insights is optional and closed initially. A compact strip exposes all five order statuses, followed by two equal large DistributionChart pies: paid/unpaid order counts and grouped tender amounts. Status and payment selections update the existing filters. Shares display two decimals; scope labels distinguish whole filtered counts from loaded-page fallbacks. Display grouping combines CARD/HUMO/UZCARD and keeps digital tenders distinct, without changing mutation contracts. Unavailable tender data has an explicit state.

The register defaults to equal ticket cards. A semantic top edge and selection ring make ticket status and selection easier to scan; hover lift is brief and disabled for reduced motion. Each ticket keeps identity, status, channel/table, creation time, up to three item previews, preparation state, amount, payment status, selection and original actions. Further items and Details open a 640px desktop side panel, becoming a phone sheet at 700px. Complete customer, cashier, item and payment information stays available without expanding neighboring tickets. Modal supplies focus trapping, Escape and focus return.

The table view retains the twelve original columns, sorting, selection, expansion, row/bulk actions, export and server pagination. Search and status/payment/cashier/category/product/type filters remain available. Phone pagination at 650px shows first/current/last with previous/next arrows so large page counts fit. Ticket grids become two columns at 1250px and one at 650px; KPI cards become two columns at 1000px; insight pies stack at 1100px. Long labels wrap and error/empty/loading states remain distinct.

Materials: the register uses the operational work shadow, 22px outer radius and clipped connected sections. Joined KPIs use one outer frame and separators; ticket and insight surfaces retain softened inner corners and fine neutral edges. KPI figures use tabular Hanken; status tints, dashed settlement rules and exact amounts support scanning. The detail panel uses 18px desktop and 16px phone corners. State-change confirmations use a semantic symbol, concise order identity, one meaningful action and the standard X close control. Existing shared controls, local icons and UZS formatters remain authoritative.

Verification: English, Russian and Uzbek; desktop and phones including narrow widths; light/dark, keyboard and focus; filters, exact-time parameters, ticket/table switching, selection, details, actions, pagination and honest states. The final finish disposition is ship, with explicit desktop detail width resolved and no open material findings. Backend ownership and financial safeguards remain unchanged.
