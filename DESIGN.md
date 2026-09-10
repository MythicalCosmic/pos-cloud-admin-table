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
typography:
  display: { fontFamily: Hanken Grotesk, fontSize: 32px, fontWeight: 700, lineHeight: 40px }
  title: { fontFamily: Hanken Grotesk, fontSize: 24px, fontWeight: 600, lineHeight: 32px }
  body: { fontFamily: Hanken Grotesk, fontSize: 14px, fontWeight: 400, lineHeight: 22px }
  label: { fontFamily: Hanken Grotesk, fontSize: 12px, fontWeight: 600, lineHeight: 16px }
  quantity: { fontFamily: JetBrains Mono, fontSize: 30px, fontWeight: 600, lineHeight: 36px }
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
  overview-card: 12px
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
---

## Overview

Alpha POS puts restaurant activity, reporting and daily work in one readable workspace.
Its visual direction comes from the user's legacy admin reference and the earlier approved Forest theme.
**Creative North Star: "Restaurant operations"** describes the product's existing purpose.
**Key Characteristics:** full-width information, clear values, fine table rules, custom controls, restrained motion.
Implementation is authoritative. See [the detailed guide](docs/design-system.md), [tokens](src/styles/tokens.css),
and [product constraints](PRODUCT.md). The portable tokens above are a selected source-backed subset.

## Colors

Blue is the default palette. Account → Appearance selects Blue, Forest, Teal, Violet, Rose or Amber,
with Light/Dark chosen independently. All six previews show their own colors in the selected mode.
`useAlphaTheme` synchronizes HTML attributes, browser chrome and Vuetify's existing light/dark themes.
`src/config/palettes.ts` supplies first-paint CSS, loader colors, previews and the Vuetify color mirror;
`src/styles/tokens.css` retains typography, spacing, radii and elevation. Login and toast surfaces follow
the selected palette. Body/placeholder text and primary button labels meet 4.5:1 on tested surfaces.
Semantic success, warning and error colors retain their meaning. Chart revenue, expense, cash and card
use the matching chart tokens; categorical rings add distinct series colors with exact-value legends.
Chart selection adds a border, readable values and a pressed state alongside color. Series colors remain
palette-bound; treemap labels use the existing contrast helper against each fill.
**The Shared Palette Rule.** Read canonical tokens; do not hard-code a second palette inside a page.

## Typography

Hanken Grotesk carries headings, labels and prose; JetBrains Mono carries quantities and reporting figures.
Use existing UZS formatters and tabular figures. Shared type tokens establish the base scale; responsive
headings and KPI figures also adapt their size and spacing to the available width.
Long Uzbek, Russian and English labels must wrap or have an accessible full-value detail.
Detailed report cards use compact titles and quieter period/scope text below them. Metric rails retain
tabular figures, with smaller sans-serif names when the value is a person or product.
Accounting reports use the shared money formatter's exact mode to preserve decimal-string precision and
narrow no-break-space grouping without abbreviation. Unavailable cost, profit and margin remain dashes.

## Layout

The continuous dashboard orders Overview, Sales, Products, Staff and Operations; navigation jumps to sections.
Its header, today's independent order count, interval controls, section navigator and four opening Overview
cards are preserved. Below them, the wider trend panel sits beside payment shares and category ranking,
followed by a full-width recent-order ledger. Later chapters use compact metric rails with shared outer
borders and internal rules. Report panels align to their content instead of stretching to match a tall neighbor.
The dashboard surface brief records the detailed chapter composition and dataset boundaries.

Products opens its analysis with equally sized columns for sold-product and sold-category unit-share pies.
These stack at 1000px; the category map and synchronized ranking stack at 900px. Metric rails use two
columns at 650px, with the first of Sales' five metrics spanning the phone row. Report content uses a
16px rhythm and card padding reduces from 20px to 16px on phones.
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

Product Performance uses the same compact report surfaces for its custom filter toolbar, six full-result
metric cells and ledger. The metric rail moves from six to three columns at 1350px, then two at 700px.
On phones, search, sort and export each have a full row; the selected sort label wraps and its control
grows vertically. Desktop product/category columns remain sticky while the ledger scrolls internally.
Expandable phone records retain the same fields and cost evidence.

## Elevation & Depth

Use tonal surfaces, one-pixel borders and the existing shadow vocabulary. Focus rings identify keyboard position.
Hover and press feedback stay brief; pending animation conveys actual work. Respect reduced motion.
Distribution sectors preview through opacity and a small outward translation; exact rows add a quiet tonal
surface on hover and a primary border when selected. Time-series tools use short color transitions, with
chart updates honoring reduced motion. Proportional bars reflect values without animating their width.

## Shapes

Use shared components for their complete shapes. The workspace-control and workspace-card roles preserve
the established control and container silhouettes; the overview-card role belongs to the four opening totals.
Reporting cards and metric-rail outlines use the lg radius, with square, border-separated cells inside a rail.
Distribution rows use sm corners. Inset chart buttons use chart-control corners within chart-control-group
surfaces; the larger Overview metric selector uses md corners. These observed overrides supplement the
base radius tokens. Tiny swatches, tracks, plot marks and focus outlines are chart geometry, not additional
card or control radius roles.

## Components

Reuse Alpha Button, Select, MultiSelect, FormInput, DateTimeField, Modal and DataTable.
Each date endpoint combines a custom calendar and time control; validated drafts apply together.

- TimeSeriesExplorer uses the existing ECharts SVG renderer for area/columns and exact point readouts.
  Pointer exploration, previous/next controls and Arrow/Home/End keys reach values. An explicit exploration
  control reveals the point scrubber and available zoom tools. Comparisons appear only with source data.
- DistributionChart supports SVG ring sectors, strips and ranked bars. Hover or focus previews a row;
  click/tap or a row button pins it, and reset/Escape clears selection. The complete supplied dataset
  determines totals and shares even when only the leading rows are visible. Lists above 12 entries use
  the shared bounded Select to reach every row; smaller lists can expand in place. The Products pies show
  five leading rows and a visible count of the reported products/categories in their scope.
- CategoryMap synchronizes treemap selection, custom Select and exact ranked rows. Its Revenue/Units
  choice changes the measure for the same categories. Small unlabeled tiles remain available in the selector.
- ComboPareto preserves every returned product and labels whether cumulative share uses the reported
  period revenue or only the revenue represented in the chart. Its selector, step buttons and readout
  keep narrow bars accessible. An 80% statement appears only when the cumulative series reaches it.
- Staff leaderboard, primary comparison selector and Scatter share the selected person. Scatter previews
  points on hover/focus, pins through pointer or Enter/Space, and retains a full selector and exact orders,
  revenue and AOV readout. Bubble size represents AOV. Radar compares reported orders, revenue, hours and
  shifts against each measure's team maximum, with the scale explained and original values in View data.
- Affinity opens with ranked pairs and retains chord, matrix and product/pair drill-down views. Pair
  occurrences remain labeled as such; their sum is not a unique-order count.
- DailyLedger retains revenue, expenses and all order-channel columns, sorting and pagination, with subtle
  revenue bars alongside exact values. Missing source values remain dashes. ReportState uses compact
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

AI answer styles use the existing request, with the original question retained in the conversation.
Loyalty settings use a disposable draft. ShiftLedger keeps original shift details and financial safeguards.
The Alpha monogram identifies favicon and startup state; locally bundled SVG icons share stroke treatment.

## Do's and Don'ts

- Preserve fields, actions, permissions, translations, date semantics and backend contracts.
- Keep loading, error, empty, stale and populated states distinct; keep all chart categories accessible.
- Keep phone targets reachable and test full control visibility at 320px as well as 390px.
- Keep chart share scope visible and every returned category, product and person reachable through exact-value controls.
- Keep accounting-report money exact and incomplete historical cost visible through warnings and unavailable-value dashes.
- Do not invent live-looking totals or replace missing financial values with zero.
- Do not turn a displayed subset into a period-wide denominator or normalized staff measures into performance scores.
- Do not copy obsolete decorative eyebrows, oversized blank KPI stacks or clipped composer layouts.
