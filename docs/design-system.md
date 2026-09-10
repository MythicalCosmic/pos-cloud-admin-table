# Alpha POS design system

This guide describes the current frontend foundation. Use it to preserve
working behavior during the redesign; implementation lives in the linked
source files. [DESIGN.md](../DESIGN.md) provides a portable token summary;
[the component sidecar](../.impeccable/design.json) records preview primitives.

## Foundation

- [Palette registry](../src/config/palettes.ts) defines all six light/dark
  color schemes. Vite includes its CSS before first paint; Vuetify and appearance
  previews consume the same values. [Structural tokens](../src/styles/tokens.css)
  define spacing, typography, elevation and base radii. [Shell styles](../src/styles/design-shell.css) and
  [workspace styles](../src/styles/design-workspace.css) consume these tokens
  and define shared motion, density and component overrides.
- [Global stylesheet](../src/styles/styles.scss) controls style order.
- [Vuetify theme](../src/plugins/vuetify/theme.ts) mirrors the custom palette;
  both theme systems must be verified together.
- [Theme configuration](../src/config/theme.ts) feeds the retained layout and
  Vuetify infrastructure.
- UI typography uses Hanken Grotesk; KPI and money figures use JetBrains Mono.
  The font stylesheets are loaded by [index.html](../index.html).

## Components and layout

The renewed login and startup screens use the selected color palette
and the Alpha monogram. Blue is the default: cool light surfaces or layered navy
in dark mode. Forest retains the approved green, sage and ivory appearance. Login styles live in `src/styles/pages/login.css` and
its illustration and connection dialog in `src/components/auth/`. Startup
styles live in `public/loader.css` so they render before the application loads.
Both screens support the shared theme preference and reduced motion. The login
illustration also has a pause control. Keep loading indicators indeterminate;
the startup screen exits when the first route is ready, without a minimum delay.

The dashboard is one continuous page: Overview, Sales & Revenue, Products,
Staff & Shifts, and Operations. Its sticky navigation jumps to sections; it must
never hide them behind tabs. Styles in `src/styles/pages/dashboard.css` use the
selected palette in both light and dark modes. Account → Appearance changes
Blue, Forest, Teal, Violet, Rose or Amber and Light/Dark independently. `useAlphaTheme` persists these choices
and updates raw tokens, Vuetify and browser chrome together. Vuetify theme names
remain `light` and `dark`. Navigation, controls and charts share the palette.
All existing analytics, comparisons, chart controls, expense records, and
product/staff detail remain available while scrolling.

The global Sonner toaster appears at the top-right, with styles in
`src/styles/design-toasts.css`. It owns stacking, swipe dismissal, hover/focus
pausing, and accessible announcements. Errors have a distinct icon and readable
description; login also retains its focused inline error. Movement is disabled
when reduced motion is requested.
Toast surfaces follow the active palette; semantic accents retain their meaning.

Appearance previews use each option's own light/dark tokens. The selected check
sits over the preview so long translated names can use the whole label width.
The six choices form three desktop columns and two phone columns.

### Dashboard layout: September 9

The dashboard uses four separate summary cards, an asymmetric trend/recent-orders
layout, and a compact section directory.
All five sections remain on the page. Each start/end field opens a themed
calendar with an integrated 24-hour time control: select the date, set the time,
and confirm the endpoint. Native dialogs provide focus containment and Escape;
the calendar supports arrows, Home/End, and Page Up/Down. Small screens use a
bottom sheet. Drafts reach the existing API only after validation and Apply.
Presets and Whole day retain business-day reporting; explicit times retain one
continuous Asia/Tashkent interval, including clearly disclosed overnight rollover.
Today’s Orders is a compact card beside the page heading and actions on desktop;
phones wrap it above the compact date-sheet trigger. The card consumes the existing `/dashboard/today` snapshot
independently of the selected range, shares the overview request, and shows
loading, unavailable/retry, and genuine zero states.

Time-series explorers reuse the installed ECharts engine with modular SVG
rendering (line, bar, grid, tooltip, data zoom). Vue owns controls and accessible
point readouts. The main chart offers area/column views, a zoom navigator, and a
keyboard/touch point selector; sales and hourly charts share the renderer.
The overview starts in area mode; columns remain available. Payment and category
distributions use interactive rings with ranked exact-value rows. Show all reveals
additional rows without excluding them from the denominator. The shared component
also retains its proportional-strip variant. Products pairs a five-product unit
ring, explicitly scoped to the returned report, with the category distribution.
Sales adds a sortable, paginated DailyLedger from existing daily arrays. Missing
values remain absent, and no values or trends are fabricated.

Charts initialize near the viewport, resize with their cards, and dispose on
unmount. There is no animation loop; transitions respect reduced motion.
Time-series explorers and a category treemap supplement the retained product,
affinity, Pareto, staff and sparkline SVGs. The main series keeps its exact data
table; all explorers expose the selected point outside the SVG, and distribution
rows provide keyboard/touch selection. Dense series keep every data point while
axis labels adapt to width. Phone controls wrap and charts stay inside the page.
QA includes range validation and exact-time API parameters, point selection,
zoom/reset, series switching, refresh/error states, all three locales, both
themes, and desktop/tablet/phone widths.

### Dashboard data and interaction

Vue owns the chart controls, accessible readouts, and retained custom SVG
renderers. No extra chart dependency or decorative visualization is introduced.
Category-speed details are shown once in Products
on the continuous page, and remain available on the standalone Operations route.

All sections use the existing business-day date/time contract. Identical
concurrent requests share an in-flight promise; no previous snapshot is cached
by the transport. At most four dashboard reads run simultaneously, keeping the
first-screen requests ahead of lower sections and limiting backend load.
Refresh waits for section requests and reports partial failures. Request
generation guards prevent older responses overwriting a newer
range. Optional 60-second polling pauses when the document is hidden. Same-range
failures retain the last successful content with a stale notice; a changed range
clears old values. Failed requests must not be presented as zero business activity.

The reading path is headline totals, trend and recent orders, sales and costs,
menu behavior, staff performance, and service. Navigation uses section links,
section headings, 1–5 shortcuts, and an active-section indicator. Jumping focuses
the destination without unmounting content. Chart metric and comparison choices
survive refresh. Dashboard Export offers the backend's complete product-performance
report as Excel, PDF or CSV for the applied business dates, with its 07:00–03:00
scope shown before download. Exact-time selections display a clear scope notice.
A separate Dashboard snapshot CSV preserves the loaded totals, payments,
returned products/categories and recent orders with the exact reporting window;
missing values remain blank. Each report format has independent loading/error
feedback, and the menu fits above phone navigation with keyboard support. The main
series also has a keyboard-accessible exact-value table; chart-adjacent keys,
visible rankings and records provide touch alternatives.

The phone layout uses the same section order and 44px controls. Large charts
adapt to available width. Customer and order registers use DataTable phone
records; shifts uses its ledger and expandable original shift cards. Every field
and action remains available through these layouts and details. Other dense report
tables scroll inside their cards without removing columns. Motion is limited to a short initial entrance and interaction
feedback, disabled under reduced motion. With all charts mounted, unusually long
backend series remain the primary DOM cost; there is no continuous redraw.
Date-axis tick spacing accounts for label length; dense bars retain every data
point and tooltip while showing value labels only when they fit. Affinity's
numbered arcs correspond to full product names in its adjacent directory.
Product category charts include every returned category, with shares calculated
from the complete category total rather than a truncated six-category subset.
QA covers desktop/mobile, Uzbek/Russian/English, light/dark, focus and scrolling,
loading/empty/partial/error/populated states, shared refresh, and date changes.

Reuse [design primitives](../src/components/design) for headers, cards, filters,
forms, tables, dialogs, skeletons, empty states, and status badges. Many existing
pages still use Vuetify directly; follow the surrounding surface's convention.

Active custom SVG charts and shared chart helpers live in
[design/charts](../src/components/design/charts). Period comparison uses the
approved [ECharts components](../src/components/analytics/compare). Do not add
another chart library.

The [default shell](../src/layouts/default.vue) combines the desktop sidebar,
topbar, and mobile tabs. Keep pages full-width with moderate density. The
global topbar date picker and sidebar live widget are intentionally absent;
pages may own their date range.

A typical page contains a header, KPI row, filters, table, and action dialogs.
Domain dialogs live under `src/components/<feature>/`, outside the routes tree.

## Interaction rules

- Preserve API fields, filters, columns, route behavior, permission checks, and
  every existing action while restyling.
- Use minimalist dialogs: an X close control, no redundant Cancel button, no
  colored/gradient header, and consistent input density. Prices use integers
  unless fractional pricing is required.
- Use tabular figures and the existing
  [UZS formatters](../src/components/design/utils/format.ts). Do not introduce
  competing number formatters.
- Use `useNotify` and the global Sonner toaster for feedback. Sonner also
  supports titles, descriptions, and retry actions directly.
- New visible strings must be added together to the Uzbek, Russian, and English
  files in [locales](../src/plugins/i18n/locales).
- Use actual backend values and explicit loading, error, and empty states.
  Period comparison is the sole approved, visibly labeled demo-data exception.

## Review before handoff

Check desktop and mobile, light and dark themes, long Uzbek/Russian labels,
text wrapping, spacing, alignment, keyboard navigation, focus entry/return,
and loading/error/empty/populated states. For mutations, verify duplicate-submit
protection and visible server errors. Correct repeated UI issues globally.

### Shared workspace renewal: September 9

`src/styles/design-workspace.css` owns the consistent page headers, KPI
composition, readable table spacing, custom form density and dialog surfaces.
All active domain pages use the shared input primitives. `FormInput`,
`FormSelect` and `FormSwitch` bridge Vuetify form validation to Alpha controls;
retain their original model types, validation rules and server error messages.
Login inputs and the AI composer remain bespoke controls built for their
respective flows. Native HTML underpins typing, numeric input, radios and range
sliders; browser-provided date/time/select popups are replaced throughout the
active workspace.

`DateInput` supports dates, months, 24-hour times and combined date/time values.
It preserves ISO models, min/max constraints, month/year navigation, keyboard
selection and focus restoration. `MultiSelect` supports searchable options and
editable tags without coercing IDs. `useActionDialog` replaces browser confirm
and prompt dialogs; `Modal` maintains a stack so Escape and focus trapping apply
only to the foremost dialog. Server mutations must still own their busy guard
and show an honest error when persistence fails.
Modal forwards caller attributes to its overlay, preserving domain sizing classes.
Input and Textarea keep layout classes/styles on their outer control and forward
other attributes to the native field; binding an undefined class does not undo
Vue's class merging. Filter and selection removal use named native buttons with
40px desktop and 44px phone hit areas.

Sessions uses DataTable phone records with IP headings and full-width expanded
IDs and device descriptions. Failed refreshes retain the last records, show a
retry message, and do not report success.

Input primitives own their border, padding and icons: do not wrap `Input`,
`Select` or `Textarea` in another `.control`. Pass size modifiers to the
primitive; date/time triggers own their control height and keep their values on
one line. The operating-hours panel uses a native dialog so nested time pickers
retain focus and Escape closes only the active layer. Save feedback is also
shown inside the panel. Empty/error table content belongs outside the horizontal
table scroller so it stays readable on phones.

The icon system is a local Lucide subset generated by
`scripts/build-interface-icons.cjs`. Semantic aliases and the Vuetify adapter
keep existing call sites working. SVG nodes render without HTML injection, use
`currentColor`, and share a 1.75px stroke. Brand marks remain separate. Hanken
Grotesk and JetBrains Mono are self-hosted in `public/fonts`; their licenses ship
alongside the fonts, and runtime no longer depends on Google Fonts.

The sidebar uses a fixed brand/search area, primary routes, and expandable
domain groups. Search includes only permitted routes. Group preferences persist,
and the active route's group opens automatically. Nested routes select the
longest matching destination; navigating to a parent still works. Compact mode
keeps accessible names and live counts, while the mobile drawer always retains
full labels. The `/` shortcut focuses page search; Escape clears it before
closing the mobile drawer. Navigation content remains permission-filtered by the
existing access composable.

AI uses a dedicated conversation workspace with searchable history, pins,
rename/delete, copy/export, optional date context and starter/follow-up prompts.
Requests are single-flight and abortable. Failed or stopped responses support
retry, and drafts cannot be consumed by a request running in another chat.
Loading shows actual elapsed time; completed answers display immediately.
Malformed chart responses expose their content instead of spinning forever or
inventing values. Rendered Markdown remains sanitized.

Shifts use a settlement overview and detailed records in list/card views, with
search, sort, status filters, load-more pagination and export of the loaded
scope. Keep all settlement amounts, defensive status mappings and
CASH/HUMO/PAYME contracts unchanged. Unknown or missing financial data must not
be shown as zero.

Settings now separate module selection, stock configuration and notification
setup into structured editing sections. Notification templates retain editing,
preview and toggling; logs retain pagination and queue actions. Loyalty keeps
all customer columns, sorting, phone lookup, reward progress and redemption.
Forecasting adds searchable preparation suggestions and CSV export using the
returned quantities. License setup/status and public error screens use the same
palette, controls and explicit recovery states.

Dialogs use the X for dismissal and keep footer space for meaningful actions.
Dirty category drafts use an explicit discard confirmation; dismissing that
confirmation preserves the form and restores focus. Stacked dialogs trap focus
and handle Escape only in the topmost layer.

### Blue reporting and operational registers: September 9

The legacy-inspired Blue palette adds separate KPI cards, multicolor category and
payment rings, and compact report tables. It changes presentation, not metric
definitions or endpoint contracts. Today's count remains independent of the
selected interval. The Alpha favicon replaces the old purple mark.

`DataTable` optionally renders `mobileCards` with `mobileSummary`. Its existing
cell slots, selection, bulk actions, expansion, sorting and pagination remain the
source for both layouts. Bulk actions wrap; long status labels fit their record.
Orders collapses phone filters behind Filters while preserving active chips,
status/cashier/category/product/type controls and full order details.

Loyalty is the customer workspace: a full-width register, a compact program
summary, and a two-column phone KPI grid. Summary values describe the loaded top
customer list, not a fabricated global customer total. Phone lookup and redemption
remain available. Settings open a draft in a minimal dialog; dismissal discards
edits and saves have duplicate-submit protection and visible server errors.

Shifts defaults to `ShiftLedger`, with the original cards selectable and expandable
for complete details. Keep settlement-unavailable labels, source provenance and
null-versus-zero distinctions. Receive-money still submits CASH, combined-terminal
HUMO and PAYME only; financial rules and backend ownership remain unchanged.

The AI composer offers Auto, Brief and Actions through the existing query API.
The visible question remains unchanged, retries retain their request context,
and new long answers begin at their heading unless the user is reading history.
History, pinning, search, export, stop and recovery remain available. On narrow
phones, context has its own toolbar row; style and Send/Stop share the next row.
The inner thread grid must shrink to its workspace so controls remain fully
visible at 320px. Pending feedback is indeterminate and reduced-motion aware.
