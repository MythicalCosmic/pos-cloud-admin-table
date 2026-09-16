# Smart POS Admin Panel — Agent Guide

Reviewed against the current source during the 2026-09-08 repository cleanup.
Read this file before changing the repository. The latest explicit user
instruction and current implementation take precedence over older notes.

## Source of truth

1. Current source and the user's latest explicit decision.
2. This guide and [the current design guidance](docs/design-system.md).
3. Current contracts under [docs/backend](docs/backend), including their dated
   deployment/verification notes.
4. Approved specs under [docs/specs](docs/specs). These describe intent, not
   proof that a feature is implemented.
5. Git history for superseded reviews, handoffs, and operating notes.

README.md documents setup, commands, and the directory map. There is no
separate CLAUDE.md or machine-specific assistant memory to maintain. The
original durable UX and dialog feedback has been incorporated below.

## User priorities

- UX/UI quality is the top priority. A working feature must also look deliberate
  and consistent. Inspect truncation, overflow, spacing, alignment, responsive
  behavior, keyboard/focus behavior, loading/error/empty/populated states, and
  both light and dark themes after UI changes.
- Dialogs are minimalist: no redundant Cancel button when X closes the dialog;
  no colored/gradient headers; integer prices unless fractional pricing is a
  real requirement; consistent control sizing and density.
- Correct reported UI patterns globally, not only on the named page.
- Restyling must preserve API calls, fields, routes, permissions, translations,
  filters, table columns, and actions. Flag necessary logic changes.
- All visible strings must work in Uzbek, Russian, and English. Update all
  three files in `src/plugins/i18n/locales/` together.
- Prefer real backend data and honest states. Never invent live-looking
  business values. Compare Periods is the approved, visibly labeled demo-data
  exception until its backend endpoint is available.
- Use tabular figures for money/quantities and existing UZS formatters with
  comma thousands grouping (1,240,000; owner decision 2026-09-16) and a
  narrow no-break space before the unit. Do not fork number formatters.

## Architecture and file placement

This is a Vue 3 + TypeScript + Vite 4 SPA using Vuetify 3, Alpha design
primitives, Pinia, Axios, CASL, vue-i18n, Sonner, and file-based routing.

- `src/main.ts` installs plugins, icons, global styles, and optional Sentry.
- `src/App.vue` mounts routed content, the command palette, shortcut help,
  scroll-to-top, and the global Sonner toaster.
- `src/layouts/default.vue` is the active Alpha shell with DesignSidebar,
  DesignTopbar, and MobileTabBar. `blank.vue` serves public pages. Layout helper
  components are explicitly excluded from layout discovery.
- `src/pages/**` contains route entry points. Domain dialogs belong under
  `src/components/<feature>/`; new helpers must not become accidental routes.
  `src/pages/dash/` views serve both the hub and their existing direct URLs.
- `/` is one continuous dashboard with Overview, Sales, Products, Staff, and
  Operations sections; navigation jumps within the page instead of hiding views.
  `/dashboard` redirects to `/`; `/shifts` and `/shift-analytics` redirect to
  `/shifts-analytics`; `/hr-attendance` redirects to `/audit?tab=attendance`.
  Legacy route names remain in `src/router/index.ts`.
- Shared primitives live in `src/components/design/`; custom SVG charts and
  their helpers live in its `charts/` subdirectory. Compare Periods uses
  ECharts under `src/components/analytics/compare/`. Do not add chart libraries.
- Domain API boundaries live in `src/services/`. Many older page SFCs still
  own state and HTTP calls; don't turn a cleanup into an unreviewable rewrite.
- Application theme configuration is `src/config/theme.ts`. The six light/dark
  palettes in `src/config/palettes.ts` supply first-paint CSS, appearance previews,
  and the Vuetify mirror in `src/plugins/vuetify/theme.ts`. Structural tokens live
  in `src/styles/tokens.css`; global style order is `src/styles/styles.scss`.
- Keep the retained `src/@core` theme/control and `src/@layouts` framework
  internals stable. They remain part of the current boot/theme integration.
- Auto-imports cover Vue, Vue Router, VueUse, vue-i18n, Pinia, and composables.
  Vuetify components are auto-resolved; custom design components are explicitly
  imported. Vite maintains checked-in declarations in `src/types/generated/`.
  Regenerate them through Vite after changing auto-import inputs.
- Aliases are defined in `vite.config.ts` and `tsconfig.json`. `@themeConfig`
  points at `src/config/theme.ts`. There is no `@axios` or `@validators` alias;
  use the configured client at `@/plugins/axios`.

## Navigation

Audit all relevant sources when adding, renaming, or removing routes:

- Desktop sidebar: `src/layouts/components/DesignSidebar.vue`.
- Mobile tabs: `src/layouts/components/MobileTabBar.vue`.
- Breadcrumb/title labels: `src/navigation/routeLabels.ts`, consumed by
  `src/layouts/components/DesignTopbar.vue`.
- Command palette: arrays under `src/navigation/vertical/`.
- Warehouse access map: `src/navigation/access.ts` and
  `src/composables/useUserAccess.ts`.

The sidebar intentionally exposes a curated subset of valid routes. The
app-wide date picker and sidebar live widget are intentionally hidden. Pages
may own local date ranges. Full-width, moderately dense pages are the current
direction, rather than a universal 1440px maximum.

## Backend, authentication, and permissions

Backend code belongs to the backend developer; never modify it directly. The
current backend repository is `alpha_pos_server` (older `alpha_pos` references
are historical). When an API change is needed, prepare a precise request for
the user/backend developer, wait for delivery confirmation, then review and
integrate it. Do not contact anyone through messaging tools without explicit
user authorization.

Axios clients are defined in `src/plugins/axios.ts`:

- Default: `/api/admins`.
- Stock/HR/discounts/notifications/cashbox: matching `/api/admins/*` namespaces.
- Fiscalization: `/api/fiscalization`.
- Unauthenticated licensing: `/api/licensing`.

Host resolution is validated `localStorage.apiHost`, then `VITE_API_HOST`, then
relative same-origin. Dev `/api` proxying uses `VITE_BACKEND_HOST`. Production
runtime overrides are restricted by `VITE_ALLOWED_API_HOSTS` and the validator;
changes here are a credential boundary because Bearer tokens go to that host.

Authenticated clients attach the JSON-stored `localStorage.accessToken`.
A 401 clears authentication and redirects to login; license-related 503s
redirect to licensing setup. Login uses `POST /api/admins/auth-login` with
`{ email, password }` and expects `{ data: { token, user } }`.
`/auth-me` and `/app-settings` hydrate business-day and working-hour settings.

Non-warehouse sessions retain broad CASL behavior. Warehouse access and
route-level permission metadata are checked by the frontend access map and
router guards. Backend permission enforcement is the security boundary; do
not remove these frontend checks or claim CASL alone enforces all roles.

Response envelopes and pagination vary. Pages often normalize
`res.data?.data ?? res.data` and accept several collection/total keys. Confirm
contracts before simplifying. Mutations need duplicate-submit guards and
visible server errors. The Axios interceptor reuses idempotency keys for
selected operations; other paths and explicit per-operation keys must be
checked at the call site.

## Domain decisions to preserve

- Business day defaults to 03:00 Asia/Tashkent. `business_day_start`,
  `business_open`, and `business_close` are backend-owned.
- Backend order status is `CANCELED` (one L). Public order identity prefers
  `order_number`, then `display_id`.
- Keep Orders' 1C export removed. Preserve status/cashier/category/type filters.
- Compare Periods may use deterministic, clearly labeled demo data while
  `/analytics/comparison` is unavailable. Its any-error fallback can conceal
  auth/outage failures; do not expand that pattern.
- The receive-money dialog counts Cash, Card, and Payme. Card is the combined
  terminal amount sent as `HUMO`; Payme remains `PAYME`. Submit only
  `CASH`/`HUMO`/`PAYME`, not separate `CARD` or `UZCARD` confirmations.
  Tender-specific reporting remains unchanged. Cash settles to SAFE and
  cards/Payme to BANK.
- `docs/specs/money-and-shifts.md` is a historical target state. The frontend
  Inkassa page was removed on 2026-09-05. Historical transaction labels and
  backend records remain valid; do not erase or remap them during unrelated work.
- Some cash-sale paths may not create `OrderPayment`; preserve the defensive
  `expected_cash` reconciliation fallback without backend proof to remove it.
- Running shifts defensively accept `OPEN`/`ACTIVE`; confirm the contract
  before narrowing that mapping.
- QR generation uses the local browser encoder in `src/utils/qrCode.ts`.
  Preserve private menu tokens within the app; don't restore an external QR API.

## Verification and hygiene

Use Node 24 and Yarn 1.22.18. `yarn.lock` is the only package lockfile. Do not
upgrade dependencies or generate alternate lockfiles incidentally.

Before handing off:

1. Inspect Git status and preserve unrelated user changes.
2. Run relevant lint/type checks, `yarn test:contract`, and `yarn build` for
   source/configuration changes. Build alone does not type-check.
3. For UI work, verify desktop/mobile, both themes, keyboard/focus, long
   translated labels, and loading/error/empty/populated states.
4. Verify duplicate submissions and server-error display for mutations.
5. Never report a check as passing unless it executed successfully.

`yarn lint` is read-only; `yarn lint:fix` applies automatic fixes. Lint covers
application source (including services) while excluding retained framework
internals and generated declarations. The cleanup baseline had substantial
pre-existing lint debt; keep strict checks honest rather than suppressing it.

Node contract tests are backend-independent. Most Playwright specs intercept
API requests; the login smoke requires explicitly supplied `PW_EMAIL` and
`PW_PASSWORD`. CI runs lint, typecheck, contract tests, and build; the browser
job is opt-in through `workflow_dispatch`.

Keep secrets and `.env` values out of output. Preserve existing deployment
configuration unless changing it is part of the task. Keep build output,
archives, temporary design exports, screenshots, test artifacts, and personal
assistant settings out of Git. Old tracked exports/notes can be recovered from
revision `97e17e8`; don't create a new archive directory for them.

Existing areas requiring separate product/backend review include inconsistent
response/pagination contracts, deep-link/filter behavior, parallel token/theme
layers, and large page components. Verify current code before assuming an old
TODO or review still applies.
