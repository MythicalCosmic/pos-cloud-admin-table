# Alpha POS design system

This guide describes the current frontend foundation. Use it to preserve
working behavior and the implemented visual boundaries; implementation lives in the linked
source files. [DESIGN.md](../DESIGN.md) provides a portable token summary;
[the component sidecar](../.impeccable/design.json) records preview primitives.

## Foundation

- [Palette registry](../src/config/palettes.ts) defines all six light/dark
  color schemes. Vite includes its CSS before first paint; Vuetify and appearance
  previews consume the same values. [Structural tokens](../src/styles/tokens.css)
  define spacing, typography, elevation and base radii. [Shell styles](../src/styles/design-shell.css) and
  [workspace styles](../src/styles/design-workspace.css) consume these tokens
  and define shared motion, density and component overrides. [Operations styles](../src/styles/design-operations.css)
  load after the shared workspace layer and apply only to operational pages and their dialog/popover context.
- [Global stylesheet](../src/styles/styles.scss) controls style order.
- [Vuetify theme](../src/plugins/vuetify/theme.ts) mirrors the custom palette;
  both theme systems must be verified together.
- [Theme configuration](../src/config/theme.ts) feeds the retained layout and
  Vuetify infrastructure.
- UI typography uses Hanken Grotesk. Dashboard KPI values and chart summaries
  use tabular Hanken figures; exact-value rows and accounting reports retain
  JetBrains Mono. The font stylesheets are loaded by [index.html](../index.html).

## Components and layout

The login and startup screens use the selected color palette
and the Alpha monogram. Blue is the default: cool light surfaces or layered navy
in dark mode. Forest retains the approved green, sage and ivory appearance. Login styles live in `src/styles/pages/login.css` and
its illustration and connection dialog in `src/components/auth/`. Startup
styles live in `public/loader.css` so they render before the application loads.
Both screens support the shared theme preference and reduced motion. The login
station diagram also has a pause control. On desktop the connected Alpha POS
diagram accompanies sign-in; below 900px the story content gives way to the form.
Public error pages pair a readable status code and explanation with a route home.
Keep loading indicators indeterminate;
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
The September 13 polish places the dashboard title and local symbol, independent
Today’s Orders snapshot, freshness status and existing actions inside one softly
raised identity panel. The section directory uses a separate floating surface,
and later section headings gain compact domain symbols. On phones the export and
refresh actions become icon-sized while retaining their accessible names.

The global Sonner toaster appears at the top-right, with styles in
`src/styles/design-toasts.css`. It owns stacking, swipe dismissal, hover/focus
pausing, and accessible announcements. Errors have a distinct icon and readable
description; login also retains its focused inline error. Movement is disabled
when reduced motion is requested.
Toast surfaces follow the active palette; semantic accents retain their meaning.

Appearance previews use each option's own light/dark tokens. The selected check
sits over the preview so long translated names can use the whole label width.
The six choices form three desktop columns and two phone columns.

### Operational pages: precision command surface

The operations redesign applies across catalog, customers, HR, finance, stock,
analytics, settings, notifications, licensing and Orders. Dashboard, AI and the
shared shell keep their approved appearance. The
[operations brief](../.impeccable/surfaces/src-pages.md) records the chosen
command-surface direction and the route boundary.

[WorkspacePage](../src/components/design/workspace/WorkspacePage.vue) is the
explicit opt-in on 72 route roots. It provides the context used by PageHeader,
Kpi and DataTable. Modal also recognizes operational routes when hosted globally.
WorkspaceHeader integrates a solid primary symbol tile, title and existing actions
with a lower rail of permitted related routes. The current link uses
the longest matching destination; route metadata, CASL and warehouse access
checks remain in the navigation path. Semantic domain aliases extend the local SVG set.

Identity panels use 26px corners, a static primary wash, restrained dot texture
and the work shadow. Actual-value KPI cells join inside a 22px rail with one-pixel
separators and no separate cell shadows. Registers use the same 22px surface
family and two-part elevation, with a stronger dark-theme definition. Their
corners clip the command bar, records and anchored pagination. The category
directory uses this integrated frame; Products and dining-table grids retain
their open domain layouts. Controls use 13px corners and a four-pixel primary
focus ring. Catalog cards and warehouse link groups retain 14px corners.

Desktop pages have 24px side padding. At 700px and below they use 14px, with
12px at 360px and below. Actions get their own phone row, related navigation
scrolls internally, and joined metric rails use two columns. Products gives
its main catalog count the full first row. Creation and mutation actions stay in
visible page or section headers. WorkspaceToolbar collapses filters
behind Search & filters while preserving their values. DataTable defaults to
expandable phone records in this context, reusing cell slots, selection, sorting,
pagination and actions; explicit mobile props still take precedence. Phone
records have their own fine frame within the register. Labels wrap; record
actions remain 44px, heading actions 46px and filter toggles 48px high.

Products defaults to cards with a complete table alternative, category color,
name, description, exact price, selection, actions and expandable source details.
Its create/edit flow uses shared Modal with the existing POS preview and fields.
Categories keeps full names, saved POS color swatches, status, counts and direct
edit/reorder actions within its clipped directory. Places pairs an area directory with table cards, retaining
search, actual status counts, capacities and all area/table mutations. Its columns
stack at 800px. Warehouse groups permitted purchasing, inventory and movement
links beside the receiving guide; it does not add live-looking stock metrics.

Settings uses short side introductions and aligned switch rows on one editing
plane, stacking at 1100px. Operational task dialogs have neutral headers with a
semantic symbol, concise title and X close control. The body holds the task;
the footer holds meaningful completion actions. Teleported dialogs and
select/calendar menus carry workspace-overlay/workspace-popover context.
Phone forms become full-width bottom sheets with a 94dvh height cap, one-column
fields, safe-area footer spacing and 50px form controls. Inline Field errors
announce through role=alert and associate error/hint text with the invalid
control. Existing validation rules, dirty-draft confirmation, duplicate guards,
visible server errors and topmost-only focus/Escape handling remain intact.

Motion stays brief: controls use 160ms feedback, row emphasis 150ms, metrics
180ms and dialog opacity/transform 220ms. Hover/press movement is small; records
have no repeated entrance choreography. Reduced motion removes transitions.
The washes and local SVG symbols are static, and backdrop blur is limited to
the dialog layer; there is no new continuous rendering loop for operational pages.

### Dashboard layout: September 10

The approved soft-chart reference applies to the full dashboard, including its
heading, date controls and KPI cards. It supersedes the earlier header/cards
exception and previous composition's visual styling. The existing five continuous
sections, fonts, six palettes and all data/actions remain authoritative.

The dashboard uses four tinted summary cards, an equal-width Performance and
Order channels pair, then equally sized large payment and category pies. Recent
activity follows as responsive order tiles with identity, status, channel,
table/address, age, amount and links. Show all retains every returned record.
Later sections use separate tinted KPI cards; paired distributions, expense
reports and staff panels share their row height. Dashboard cards, date fields
and today's counter have softly rounded 16px corners, a fine edge mixed from
text and surface, and a restrained two-part shadow. This remains a dashboard rule;
Product Performance uses the separately scoped operational surfaces and joined metric rail.

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
point readouts. The main chart offers area/column views, optional exploration and
zoom tools, and a keyboard/touch point selector; sales and hourly charts share the
renderer. Primary series shade from the fourth chart color into primary, while
expenses retain the expense color. Columns have softly rounded ends, areas fade
into the plot, and selected values use dark floating tags with white text.

OrderChannelChart presents three simple Hall/Delivery/Pickup columns for the
whole supplied period or a selected date/bucket, with exact counts and shares.
The shared `orderChannelColors.ts` maps Hall to primary, Delivery to the fourth
chart color and Pickup to the third chart color across the column chart, sales
rankings and DailyLedger. Missing counts remain unavailable with a scope notice.

Payment and category distributions use interactive shaded ring sectors with
ranked exact-value rows. `roundedSector.ts` constrains gaps and corners to the
actual share. The emphasized sector uses a dark value tag with white text; other
visible tags use the fixed light background and dark text pair. Show all reveals
additional rows without excluding them from the denominator. More than 12 rows
use the bounded shared Select. The component retains proportional-strip and
ranked-bar variants. Products pairs equally large sold-product and sold-category
unit-share pies, each with five leading rows and a visible reported-dataset count;
the full supplied dataset still determines sectors and shares. Its category
treemap and ranking retain Revenue/Units switching and linked selection.

Sales pairs colored channel rows with four returned expense records per page,
keeping the record range and previous/next controls visible. DailyLedger keeps
sorting, pagination and every source column, with date badges and shaded revenue
cells behind exact values. Missing values remain absent, and no values or trends
are fabricated.

Staff scatter uses shaded rounded-square marks; AOV controls their size, with
exact AOV retained in the readout. Hover/focus previews and click/tap or Enter/Space
pins a person, synchronized with the leaderboard and primary comparison selector.
Radar uses a 300-unit chart size with responsive labels held at 11 CSS pixels.
It normalizes each measure against the reported team maximum, identifies people
through color-linked selectors, and opens the original-value table by default.

KitchenSpeed plots actual preparation time and a target marker on one shared
scale that includes overruns. Category rows retain order counts, actual/target
minutes, an untracked state where needed and a numeric overrun. All categories
and Above target filters use actual counts and distinguish no overruns from
missing data. It appears once in Products on the continuous dashboard and remains
available on the standalone Operations route.

Charts initialize near the viewport, resize with their cards, and dispose on
unmount. There is no animation loop; transitions respect reduced motion.
Time-series explorers and a category treemap supplement the retained product,
affinity, Pareto, staff and sparkline SVGs. The main series keeps its exact data
table; all explorers expose the selected point outside the SVG, and distribution
rows provide keyboard/touch selection. Dense series keep every data point while
axis labels adapt to width. Phone controls wrap and charts stay inside the page.
Opening totals become two columns at 1250px, Performance and channels stack at
1020px, product/category unit pies stack at 1000px, and the category map/ranking
stacks at 900px. Payment and category pies stack at 650px. Narrow distribution
containers put the ring above a two-column legend; recent activity uses two phone columns.
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

The reading path is headline totals, performance and channels, shares and recent activity, sales and costs,
menu behavior, staff performance, and service. Navigation uses section links,
section headings, 1–5 shortcuts, and an active-section indicator. Jumping focuses
the destination without unmounting content. Chart metric and comparison choices
survive refresh. Dashboard Export offers ADMIN/MANAGER the backend's complete product-performance
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
forms, tables, dialogs, skeletons, empty states, and status badges. Retained
Vuetify form adapters preserve validation and model contracts inside operational pages.
Use WorkspacePage for their visual context; do not copy its overrides into the
protected Dashboard or AI layouts.

Active custom SVG charts and shared chart helpers live in
[design/charts](../src/components/design/charts). Period comparison uses the
approved [ECharts components](../src/components/analytics/compare). Do not add
another chart library.

The [default shell](../src/layouts/default.vue) combines the desktop sidebar,
topbar, and mobile tabs. Keep pages full-width with moderate density. The
global topbar date picker and sidebar live widget are intentionally absent;
pages may own their date range.

Operational pages lead with identity and action, related tasks, available summaries
and the domain work area. Choose a register, catalog, directory or editing section
to suit the task.
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

### Shared controls and shell

`src/styles/design-workspace.css` owns the shared baseline for headers, tables,
custom controls and dialogs. The scoped operations layer supplies the current
operational composition and materials described above.
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
Loading shows actual elapsed time. A new completed answer may reveal gradually
through ProgressiveReply; the full server reply is already stored. Show full
answer, reduced motion, hidden documents and very large replies bypass the reveal.
Malformed chart responses expose their content instead of spinning forever or
inventing values. Rendered Markdown remains sanitized.
Its September 13 finish keeps the conversation structure intact while adding a
more defined outer frame, a quiet static primary wash, thin semantic prompt
accents, a highlighted history control and a stronger composer focus surface.

Shifts use a settlement overview and detailed records in list/card views, with
search, sort, status filters, load-more pagination and export of the loaded
scope. Keep all settlement amounts, defensive status mappings and
CASH/HUMO/PAYME contracts unchanged. Unknown or missing financial data must not
be shown as zero.
The overview cards and activity toolbar use the operational work depth, with a
quiet primary wash on physical cash, compact selection rings and semantic record
edges. The list/card structure and every reconciliation action remain unchanged.

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
The visible question remains unchanged and retries retain their request context.
The thread follows the latest reply only while the reader remains near the end;
scrolling into history preserves that reading position and exposes Jump to latest.
History, pinning, search, export, stop and recovery remain available. On narrow
phones, context has its own toolbar row; style and Send/Stop share the next row.
The inner thread grid must shrink to its workspace so controls remain fully
visible at 320px. Pending feedback is indeterminate and reduced-motion aware.

### Orders and AI extensions: September 10–13

Orders now participates in the operational command surface. Its integrated
identity panel pairs the receipt symbol and actions with a permission-aware rail
for Products, Categories, Orders, Places and QR Codes. Four actual-value KPIs join
inside one tinted rail, followed by a single elevated register that contains the
status queue, filters, payment summary, view switch, records and pagination.

Orders places `DashboardFilters` above its joined KPIs. Desktop and
phone use the same `DateRangeFields`; Orders opts into All time with empty date
endpoints. Presets, working hours, explicit times and Apply retain the existing
Asia/Tashkent date-parameter builder for both list and stats requests. Status,
payment, cashier, category, product, order-type and search filters remain intact.

Optional insights begin with a compact five-status strip, followed by equal
large paid/unpaid-count and tender-amount rings using `DistributionChart`.
Percentages use two decimals. Full filtered counts and loaded-page fallbacks
have explicit scope labels. Tender display groups CARD/HUMO/UZCARD together;
Payme, Click and other returned tender types remain distinct. This display
grouping does not change payment submission contracts.

Orders defaults to equal ticket cards, with the original twelve-column table
available through the view switch. Tickets retain selection, item previews,
preparation state, settlement and original actions. Their semantic top edges make
status visible without adding decorative noise. Complete details open in a
640px desktop side panel or phone sheet, keeping neighboring tickets stationary.
The shared Modal retains focus containment, Escape and focus return. Sorting,
export, row/bulk actions and server pagination remain available. At 650px and
below, shared pagination shows first/current/last pages and adjacent-page arrows,
keeping even registers with thousands of pages within the phone width.
Order state confirmations use a concise identity callout, semantic icon and one
meaningful full-width phone action; X and Escape dismiss without a redundant
footer close button.

AI uses a defined outer frame with approved soft inner surfaces, a 232px desktop
history column and a reachable composer. Prompt cards use two-pixel semantic
accents and the active composer receives a clear primary focus ring.
`ProgressiveReply` reveals new replies only after the existing
`/ai/query/` JSON request completes. The store retains the complete answer;
this is presentation, not backend token streaming. Reveal advances at word and
Markdown boundaries over 650–6000ms, with Show full answer available. Reduced
motion, a hidden document or answers above 60,000 characters display immediately.
History, search, pinning, rename/delete, copy/export, retry and abort remain intact.

`ThinkingLevel` offers Low/Medium/High/Max, defaults to Low, and shares one page
preference between the history footer and compact dialog. Native range keyboard
behavior, named step buttons and value labels remain accessible. Preview and
the disconnected explanation stay visible; no effort/model field is added to
requests. Its repeated dialog label is visually hidden by component-local CSS
so teleporting preserves both the minimal header and accessible input name.

Assistant prose and tables remain readable, with right-aligned tabular numeric
cells and internal table scrolling. Charts reuse `TimeSeriesExplorer`,
`DistributionChart` and selectable ranked bars with all returned series, exact
tables and data fallbacks. Fenced payloads are omitted from history snippets;
the saved content and sanitized Markdown rendering remain intact. See the
[Orders brief](../.impeccable/surfaces/src-pages-orders-index-vue.md) and
[AI brief](../.impeccable/surfaces/src-pages-ai-assistant-index-vue.md).
