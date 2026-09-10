---
name: Alpha POS
description: Dense restaurant administration with six coordinated light and dark color palettes.
colors:
  blue-primary: "#2563EB"
  blue-hover: "#1D4ED8"
  blue-paper: "#F4F7FC"
  blue-ink: "#17243B"
  blue-surface: "#FFFFFF"
  blue-line: "#DBE3F0"
  navy-background: "#0B1220"
  navy-surface: "#111B2D"
  navy-raised: "#172236"
  navy-line: "#26354C"
  navy-text: "#F1F5FC"
  navy-primary: "#72A7FF"
  forest-primary: "#294B37"
  forest-paper: "#F8F9F4"
  forest-ink: "#25362B"
  forest-dark-background: "#111A15"
  forest-dark-surface: "#19241D"
  forest-dark-primary: "#D5E7B0"
  teal-primary: "#08766A"
  teal-dark-primary: "#67D1BB"
  violet-primary: "#7044C7"
  violet-dark-primary: "#BDA2F7"
  rose-primary: "#B52D5C"
  rose-dark-primary: "#F2A0BA"
  amber-primary: "#956000"
  amber-dark-primary: "#F1BE66"
  chart-tag-dark: "#171923"
  chart-tag-on-dark: "#FFFFFF"
  chart-tag-light: "#F4F1FA"
  chart-tag-on-light: "#302945"
typography:
  display: { fontFamily: Hanken Grotesk, fontSize: 32px, fontWeight: 700, lineHeight: 40px }
  title: { fontFamily: Hanken Grotesk, fontSize: 24px, fontWeight: 600, lineHeight: 32px }
  body: { fontFamily: Hanken Grotesk, fontSize: 14px, fontWeight: 400, lineHeight: 22px }
  label: { fontFamily: Hanken Grotesk, fontSize: 12px, fontWeight: 600, lineHeight: 16px }
  quantity: { fontFamily: JetBrains Mono, fontSize: 30px, fontWeight: 600, lineHeight: 36px }
  dashboard-heading: { fontFamily: Hanken Grotesk, fontSize: 32px, fontWeight: 600, lineHeight: "1.2", letterSpacing: "-.03em" }
  dashboard-total: { fontFamily: Hanken Grotesk, fontSize: 29px, fontWeight: 600, lineHeight: "1.3" }
  dashboard-metric: { fontFamily: Hanken Grotesk, fontSize: 21px, fontWeight: 600, lineHeight: "1.3", letterSpacing: "-.025em" }
rounded:
  xs: 6px
  sm: 8px
  md: 10px
  lg: 14px
  xl: 20px
  pill: 999px
  chart-control: 7px
  chart-control-group: 9px
  workspace-control: 11px
  dashboard-surface: 16px
  dashboard-control: 12px
  dashboard-activity: 12px
  workspace-card: 18px
spacing:
  one: 4px
  two: 8px
  three: 12px
  four: 16px
  five: 20px
  six: 24px
  seven: 32px
components:
  button-primary: { backgroundColor: "{colors.blue-primary}", textColor: "{colors.blue-surface}" }
  button-primary-hover: { backgroundColor: "{colors.blue-hover}" }
  button-secondary: { backgroundColor: "{colors.blue-surface}", textColor: "{colors.blue-ink}" }
  dashboard-card: { backgroundColor: "{colors.blue-surface}", textColor: "{colors.blue-ink}", rounded: "{rounded.dashboard-surface}", padding: "{spacing.five}" }
  dashboard-summary-card: { typography: "{typography.dashboard-total}", rounded: "{rounded.dashboard-surface}", padding: "18px" }
---

## Overview

Alpha POS puts restaurant activity, reporting and daily work in one readable workspace.
Its visual direction comes from the user's legacy admin reference and the earlier approved Forest theme.
The dashboard's approved September 10 reference adds softly raised surfaces, lightly tinted summary cards,
shaded rounded data marks and clearly separated ring sectors. These dashboard treatments use the existing
identity, fonts and six palettes; other workspaces retain their established visual rules.
Orders and the AI conversation extend these soft surfaces through ticket cards, shared analytical charts
and readable replies, without introducing another palette or typeface.
**Creative North Star: "Restaurant operations"** describes the product's existing purpose.

**Key Characteristics:**

- Full-width information and clear values.
- Soft dashboard surfaces and shaded data marks.
- Fine table rules and custom controls.
- Restrained motion and visible keyboard focus.

Implementation is authoritative. See [the detailed guide](docs/design-system.md), [tokens](src/styles/tokens.css),
and [product constraints](PRODUCT.md). The portable tokens above are a selected source-backed subset.

## Colors

Blue is the default palette. Account → Appearance selects Blue, Forest, Teal, Violet, Rose or Amber,
with Light/Dark chosen independently. All six previews show their own colors in the selected mode.
`useAlphaTheme` synchronizes HTML attributes, browser chrome and Vuetify's existing light/dark themes.
`src/config/palettes.ts` supplies first-paint CSS, loader colors, previews and the Vuetify color mirror;
`src/styles/tokens.css` retains typography, spacing, radii and elevation. Login and toast surfaces follow
the selected palette. Body/placeholder text and primary button labels meet 4.5:1 on tested surfaces.
Semantic success, warning and error colors retain their meaning. Payment shares retain their tender colors;
categorical rings use distinct palette series colors with exact-value legends. Dashboard time series shade
the primary series from the fourth chart color into the primary accent, and use the expense color for expenses.
Order channels share one mapping across columns, legends, ranked rows and DailyLedger: Hall uses primary,
Delivery the fourth chart color, and Pickup the third chart color, through the shared order-channel helper.
Chart selection adds a border, readable values and a pressed state alongside color. Series colors remain
palette-bound; treemap labels use the existing contrast helper against each fill. Floating chart value tags
use the explicit dark/on-dark pair. Ring labels use that pair for the emphasized sector and the light/on-light
pair for other visible labels; neither pair inherits a theme foreground that could lose contrast.
**The Shared Palette Rule.** Read canonical tokens; do not hard-code a second palette inside a page.

## Typography

Hanken Grotesk carries headings, labels and prose. Dashboard headline totals, KPI values and ring summaries
also use Hanken Grotesk with tabular figures; JetBrains Mono remains the exact-value and accounting-report face.
Use existing UZS formatters and tabular figures. Shared type tokens establish the base scale; responsive
headings and KPI figures also adapt their size and spacing to the available width.
Long Uzbek, Russian and English labels must wrap or have an accessible full-value detail.
Detailed report cards use compact titles and quieter period/scope text below them. Dashboard KPI cards retain
tabular figures, with smaller sans-serif names when the value is a person or product. Staff radar axis labels
remain 11 CSS pixels as the SVG contracts on phones; scaling the chart must not shrink the text with it.
Accounting reports use the shared money formatter's exact mode to preserve decimal-string precision and
narrow no-break-space grouping without abbreviation. Unavailable cost, profit and margin remain dashes.
Orders also uses tabular Hanken KPI and ticket totals. Assistant replies keep readable body text and
internally scrolling tables; numeric cells align right with tabular figures.

## Layout

The continuous dashboard orders Overview, Sales, Products, Staff and Operations; navigation jumps to sections.
The renewed header, today's independent order count, interval controls and sticky section navigator lead into
four tinted Overview cards. Performance and the three-column order-channel chart share an equal-width row;
payment and category ring charts form the next equal-width pair. Recent activity follows as responsive order
tiles. Later chapters use separated tinted KPI cards. Paired distributions, expense reports and staff panels
stretch deliberately to the same row height. The dashboard surface brief records chapter composition and dataset boundaries.

The opening totals become two columns at 1250px, Performance and order channels stack at 1020px, and the
payment/category pair stacks at 650px. Products begins with equal sold-product and sold-category unit-share
pies, stacking at 1000px; category map and ranking stack at 900px. Chapter KPI grids use two columns at
650px, with Sales' first metric spanning the phone row. Report content uses a 16px rhythm and card padding
reduces from 20px to 16px on phones. Recent activity uses two phone columns with wrapping record content.
Phones use a date sheet and two-column opening totals. Customer, order and shift registers expose all fields through
phone records and details; the phone chart metric switch gets a full row above comparison and chart style.
Desktop keeps dense tables; DailyLedger uses expandable phone records with all source columns available.
The AI thread owns its scroll while the composer stays
reachable. At 480px and below, date context occupies one toolbar row and answer style plus Send/Stop the next.
Constrain internal grid columns with `minmax(0, 1fr)`; page-level clipping is not an overflow fix.
Sessions also use phone records with readable IP headings and full-width expanded IDs and device details.
Failed session refreshes retain records with a retry message and never announce success. Filter/selection remove actions use
named buttons with 40px desktop and 44px phone hit areas. Forward Modal attributes to its overlay so
domain sizing classes continue to work after teleporting.
Custom Input/Textarea wrappers own layout classes and styles; exclude those two attributes from
native field bindings so Vue does not merge a second control surface onto the input.

Orders places the shared dashboard date fields above its KPIs. Its optional insights pair two large
payment rings beneath a compact five-status strip. Equal ticket cards open details in a 640px desktop
side panel or phone sheet, preserving the register's layout; the full table remains selectable.
Phone pagination retains first/current/last pages plus previous/next arrows within the available width.
The AI workspace keeps a 232px desktop history column, the scrollable thread and a reachable composer.
Thinking Level sits below desktop history and in a shared-preference dialog on compact layouts.

Product Performance uses the same compact report surfaces for its custom filter toolbar, six full-result
metric cells and ledger. The metric rail moves from six to three columns at 1350px, then two at 700px.
On phones, search, sort and export each have a full row; the selected sort label wraps and its control
grows vertically. Desktop product/category columns remain sticky while the ledger scrolls internally.
Expandable phone records retain the same fields and cost evidence.

## Elevation & Depth

Use tonal surfaces, one-pixel borders and the existing shadow vocabulary. Focus rings identify keyboard position.
Hover and press feedback stay brief; pending animation conveys actual work. Respect reduced motion.
Dashboard cards use a fine edge mixed from text and surface, with a low two-part shadow
(`0 2px 3px -2px #15162512, 0 8px 24px -18px #15162530`). KPI backgrounds tint one edge with a chart color
and fade into the surface. Dashboard KPI hover retains its resting elevation. Shading belongs to chart marks
and useful summary surfaces; it does not change an encoded value or introduce decorative data.
Distribution sectors preview through opacity and a small outward translation; exact rows add a quiet tonal
surface on hover and a primary border when selected. Time-series tools use short color transitions, with
chart updates honoring reduced motion. Distribution bars update directly; kitchen bars use a brief width
transition on the shared actual/target scale. The sidecar records system elevation and motion separately
from the portable color, type and radius primitives.
Orders and AI use the same low surface shadow through their own scoped aliases. New completed AI replies
may reveal gradually at word and Markdown boundaries; the full response remains stored. Show full answer
ends the reveal, and reduced motion, a hidden document or a very large answer displays it immediately.
The thread follows the latest reply only while the reader is following it.

## Shapes

Use shared components for their complete shapes. The workspace-control and workspace-card roles preserve
the established control and container silhouettes. Dashboard report cards, all chapter KPI cards, date fields
and today's count use the dashboard-surface radius; dashboard action buttons and activity tiles use their
smaller dashboard roles. Product Performance keeps the lg radius for reporting panels and metric-rail outlines,
with square, border-separated cells inside its rail.
Distribution rows use sm corners. Inset chart buttons use chart-control corners within chart-control-group
surfaces; the larger Overview metric selector uses md corners. These observed overrides supplement the
base radius tokens. Rounded SVG ring sectors are real annular paths with gaps and corners constrained by
each actual share. Columns have softened ends; staff scatter marks are rounded squares. Tiny swatches,
tracks, plot marks and focus outlines are chart geometry, not additional card or control radius roles.
Orders tickets, KPIs and insight cards reuse the dashboard's softened surface radius. Its desktop detail
panel uses the workspace-card radius and changes to the softened surface radius on phones. AI message,
composer and chart surfaces follow the same family; phone messages and prompt cards use lg corners.

## Components

Reuse Alpha Button, Select, MultiSelect, FormInput, DateTimeField, Modal and DataTable.
Each date endpoint combines a custom calendar and time control; validated drafts apply together.

- TimeSeriesExplorer uses the existing ECharts SVG renderer for gradient areas, shaded rounded columns
  and dark floating value tags. It retains exact point readouts.
  Pointer exploration, previous/next controls and Arrow/Home/End keys reach values. An explicit exploration
  control reveals the point scrubber and available zoom tools. Comparisons appear only with source data.
- OrderChannelChart shows three simple Hall/Delivery/Pickup columns for the complete supplied period or
  a selected date/bucket. A custom Select changes scope, and the adjacent exact counts and shares remain
  available to keyboard and touch users. Missing channel counts retain an incomplete-data notice and dashes.
- DistributionChart supports SVG ring sectors, strips and ranked bars. Hover or focus previews a row;
  click/tap or a row button pins it, and reset/Escape clears selection. The complete supplied dataset
  determines totals and shares even when only the leading rows are visible. Lists above 12 entries use
  the shared bounded Select to reach every row; smaller lists can expand in place. The Products pies show
  five leading rows and a visible count of the reported products/categories in their scope. Rings pair a
  large shaded visual with exact rows; narrow containers place the ring above a two-column legend. Value
  tags stay readable on both the emphasized and quieter sectors.
  Callers can set percentage precision; Orders uses two decimals without changing dashboard defaults.
- CategoryMap synchronizes treemap selection, custom Select and exact ranked rows. Its Revenue/Units
  choice changes the measure for the same categories. Small unlabeled tiles remain available in the selector.
- ComboPareto preserves every returned product and labels whether cumulative share uses the reported
  period revenue or only the revenue represented in the chart. Its selector, step buttons and readout
  keep narrow bars accessible. An 80% statement appears only when the cumulative series reaches it.
- Staff leaderboard, primary comparison selector and Scatter share the selected person. Scatter previews
  points on hover/focus, pins through pointer or Enter/Space, and retains a full selector and exact orders,
  revenue and AOV readout. AOV controls rounded-square mark size. Radar compares reported orders, revenue,
  hours and shifts against each measure's team maximum, with the scale explained, color-linked selectors,
  a 300-unit chart size and the original-value table open by default.
- Affinity opens with ranked pairs and retains chord, matrix and product/pair drill-down views. Pair
  occurrences remain labeled as such; their sum is not a unique-order count.
- KitchenSpeed places the actual preparation-time bar and target marker on one shared scale that includes
  overruns. Each row retains order count, actual time, target or untracked state, and a numeric overrun.
  All categories and Above target filters expose real counts and a distinct no-overrun state.
- Sales pairs colored channel rows with the latest returned expense records, four records per page.
  Previous/next controls retain access to the complete returned list without forcing a tall neighboring card.
- Recent activity retains each order's identity, status, channel, table/address, age, amount and order link
  in compact tiles. Show all reveals the remaining returned records; the Orders route remains available.
- DailyLedger retains revenue, expenses and all order-channel columns, sorting and pagination, with date
  badges and shaded revenue cells behind exact values. Missing source values remain dashes. ReportState uses compact
  contextual copy, a quiet icon and an available action; ReportSkeleton reserves report structure without
  drawing pretend data. Unavailable, zero activity, first load, stale and partial failure remain distinct.
- Product Performance combines the shared custom date, category, search and sort controls with optional
  advanced filters. Its units, revenue, ingredient cost, gross profit, margin and cost-coverage cells reflect
  the complete filtered result. The product ledger retains server sorting/pagination and expandable
  accounting evidence; category and daily views use full backend summaries. Product-name buttons focus
  the report, with a visible chip to clear that selection. Incomplete historical cost stays visible in a
  contextual warning and row status, alongside unavailable-value dashes.
- ProductReportExport opens a compact XLSX/PDF/CSV menu whose caption identifies the complete filtered
  export scope. Each format has its own pending state and duplicate guard; other formats and report
  controls remain usable during generation. Opening focuses an available item, Arrow/Home/End keys
  navigate, and Escape closes and restores the trigger. Focus moves to an available item when the current
  one becomes busy. The existing surface, border and shadow tokens support a short, reduced-motion-aware
  overlay transition.
- Dashboard Export uses that report menu for ADMIN/MANAGER product-performance exports covering the applied
  business dates, with the backend's 07:00–03:00 scope disclosed. Exact-time selections show a scope notice;
  the separate loaded Dashboard snapshot CSV retains the exact reporting window and unavailable-value blanks.
- DashboardFilters and DateRangeFields share the same desktop controls and phone sheet. Orders opts into
  All time, with empty endpoints, while working-hour and explicit-time selections use the existing date
  parameter builder. Manual date/time drafts validate before Apply; presets retain their immediate behavior.
- OrdersInsights exposes five status filters, a paid/unpaid count ring and a grouped tender-amount ring.
  Scope labels distinguish full filtered counts from loaded-page fallbacks. Display grouping combines
  CARD/HUMO/UZCARD while retaining digital tenders; payment mutation contracts remain unchanged.
- OrderTickets keeps compact item previews, preparation state, payment, amount, selection and actions.
  Full item/customer/cashier/payment details open in the shared Modal with focus containment and restoration.
  The original twelve table columns, sorting, export, pagination and row/bulk actions remain available.
- ProgressiveReply reveals only a new completed answer. It changes presentation, not the stored answer
  or the existing JSON response from `/ai/query/`; this is not backend token streaming. Copy/export and
  history retain the complete content. Reading earlier messages stops automatic scrolling.
- ThinkingLevel is a keyboard-accessible Low/Medium/High/Max range with matching labels, defaulting to Low.
  Desktop and dialog views share a page preference. Preview and disconnected copy remain explicit; it sends
  no model or effort field. The dialog's repeated label is visually hidden locally while retaining its input association.
- AIChartBlock reuses TimeSeriesExplorer, DistributionChart and selectable ranked bars, retaining all
  returned series, exact-value tables and accessible selectors. Malformed data remains available as a
  fallback instead of invented values. History snippets omit fenced payloads; Markdown remains sanitized.

AI answer styles use the existing request, with the original question retained in the conversation.
Loyalty settings use a disposable draft. ShiftLedger keeps original shift details and financial safeguards.
The Alpha monogram identifies favicon and startup state; locally bundled SVG icons share stroke treatment.

## Do's and Don'ts

- Preserve fields, actions, permissions, translations, date semantics and backend contracts.
- Keep loading, error, empty, stale and populated states distinct; keep all chart categories accessible.
- Keep phone targets reachable and test full control visibility at 320px as well as 390px.
- Keep chart share scope visible and every returned category, product and person reachable through exact-value controls.
- Keep order-channel colors consistent and chart tags readable across all six light/dark palettes.
- Keep preparation targets as markers on the actual-time scale, so overruns remain visible.
- Keep accounting-report money exact and incomplete historical cost visible through warnings and unavailable-value dashes.
- Do not invent live-looking totals or replace missing financial values with zero.
- Do not turn a displayed subset into a period-wide denominator or normalized staff measures into performance scores.
- Do not copy obsolete decorative eyebrows, oversized blank KPI stacks or clipped composer layouts.
