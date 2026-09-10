# Smart POS Admin Panel

Restaurant administration frontend for Smart POS / Alpha POS: sales, orders,
stock, purchasing, shifts, treasury, HR, analytics, and settings.

Built with Vue 3, TypeScript, Vite 4, Vuetify 3, Pinia, Axios, CASL, and
vue-i18n. The interface supports Uzbek, Russian, and English.

## Getting started

Use **Node 24** (see `.nvmrc`) and **Yarn 1.22.18** (pinned in `package.json`).
The barcode/QR dependency requires Node 24. `yarn.lock` is the only lockfile;
installing with npm, Bun, or pnpm creates a different dependency tree.
Switch Node versions with your version manager (`fnm use` or `nvm use`) before
running the setup commands below.

```bash
corepack enable
yarn install --frozen-lockfile
cp .env.example .env.local
# Configure VITE_BACKEND_HOST in .env.local for your backend checkout.
yarn dev:local
```

Open `http://127.0.0.1:5181`. For LAN access, use `yarn dev` instead. A working
backend and an account provided by its owner are required for real app data.
The frontend does not include a backend or default login credentials.

Installation generates the Iconify bundle. Vite maintains the checked-in type
declarations under `src/types/generated/`; keep those declarations in sync when
changing components, composables, or auto-import configuration.

## Commands

| Command | Purpose |
| --- | --- |
| `yarn dev` | Development server on port 5181, exposed to the LAN |
| `yarn dev:local` | Development server restricted to this machine |
| `yarn build` | Production bundle in `dist/`; does not type-check |
| `yarn preview` | Serve the production bundle on port 5050 |
| `yarn typecheck` | Check Vue and TypeScript without emitting files |
| `yarn lint` | Read-only lint of application source, including services |
| `yarn lint:fix` | Apply ESLint's automatic fixes |
| `yarn lint:ci` | Same lint, with warnings treated as failures |
| `yarn test:contract` | Run backend-independent Node contract tests |
| `yarn smoke:install` | Install Chromium and its system dependencies |
| `yarn smoke` | Run Playwright checks; starts Vite when needed |
| `yarn ci` | Lint, type-check, contract tests, then production build |
| `yarn build:icons` | Regenerate the local icon bundle |

There is existing lint debt across application pages; `yarn lint:ci` currently
fails. Build and type-check results do not imply that lint is clean.

Most browser specs intercept API requests with test fixtures. The authenticated
login smoke additionally requires `PW_EMAIL` and `PW_PASSWORD`; it skips when
these are absent. Use `PW_BASE_URL` and `PW_NO_SERVER=1` to target an existing
frontend. On systems where Playwright's system-dependency installer is not
supported, install the browser with `yarn playwright install chromium` and
provide the OS libraries separately.

## Project structure

```text
src/
  @core/             Retained Vuetify theme helpers and shared controls
  @iconify/          Icon build script; emitted JavaScript is ignored
  @layouts/          Retained layout framework and theme integration
  assets/           App images and custom source icons
  components/
    analytics/      Period-comparison charts and controls
    auth/           Login illustration and connection settings
    audit/          Attendance, discipline, and preparation panels
    design/         Shared interface primitives
      charts/       Active SVG charts and their shared helpers
    stock/          Item and recipe dialogs
  composables/      Shared state, API errors, formatting, and notifications
  config/           Application theme configuration
  constants/        Shared status semantics
  layouts/          Default/blank router layouts and shell components
  mocks/            Explicitly labeled period-comparison demo data
  navigation/       Navigation entries, permissions, and route labels
  pages/            Route entry points only
  plugins/          Axios, CASL, i18n, fonts, and Vuetify integration
  router/           Route guards and compatibility redirects
  services/         Domain API boundaries
  stores/           Pinia stores
  styles/           Design tokens and global styles
  types/            Domain types and generated Vue declarations
  utils/            Pure domain and formatting helpers
tests/
  contract/         Node tests for invoice and settlement behavior
  smoke/            Playwright browser checks
public/             Static files served without bundling
infra/              nginx deployment configuration
docs/               Current design guidance, contracts, and approved specs
```

`src/main.ts` boots the app; `src/App.vue` mounts the router and global UI.
The startup loader in `index.html` and `public/loader.css` stays visible until
the first route is ready, then fades out. Vite embeds its copy from the three
locale files. Loading failures and slow connections expose a reload action.
`src/layouts/default.vue` is the Alpha sidebar/topbar/mobile shell. Route files
are discovered by `vite-plugin-pages`, with `blank.vue` used for public pages.
Legacy `/dashboard`, `/shifts`, `/shift-analytics`, and `/hr-attendance` URLs and
route names remain supported through redirects in `src/router/index.ts`.

New feature components belong in `src/components/<feature>/`. Keep reusable
page sections out of `src/pages`, because files there become routes. Existing
`pages/dash/` views also support direct dashboard URLs.

## Backend and deployment

Axios clients and host validation live in `src/plugins/axios.ts`. Host priority
is a validated runtime override, then `VITE_API_HOST`, then same-origin `/api`.
The development server proxies `/api` to `VITE_BACKEND_HOST`. Production runtime
overrides are restricted by `VITE_ALLOWED_API_HOSTS` and the host validator.

API namespaces include `/api/admins`, its stock/HR/discounts/notifications/
cashbox subpaths, `/api/fiscalization`, and `/api/licensing`. Authentication uses
`POST /api/admins/auth-login` with `{ email, password }`, returning
`{ data: { token, user } }`. Backend authorization remains authoritative; the
frontend also maps warehouse access and permission metadata.

For the optional Docker stack:

```bash
cp .env.docker.example .env
# Set the required secrets and ALPHA_POS_DIR locally.
docker compose up --build
```

The default backend checkout is `../alpha_pos_server`. Compose builds the
frontend with Node 24 and Yarn, then serves it through nginx on port 5181.
`infra/nginx.conf` proxies API calls to the Compose `web` service; adjust that
upstream when deploying the frontend image separately. For a static host, use
`dist/`, configure an SPA fallback, and supply the API host at build time.

Keep environment values and credentials out of documentation and commits.
The existing `.env.production` build defaults are retained; review deployment
configuration with the project owner before publishing.

## Project guidance

Read [AGENTS.md](AGENTS.md) for product constraints and coding conventions,
[docs/README.md](docs/README.md) for current contracts and specs, and
[docs/design-system.md](docs/design-system.md) before redesigning UI.

Old design exports, ZIPs, personal assistant settings, and superseded handoff
notes were removed during the repository cleanup. Their tracked originals are
available in Git history before the cleanup (revision `97e17e8`); do not
reintroduce copies into the working tree.
