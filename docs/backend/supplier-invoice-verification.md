# Supplier invoice integration verification — 2026-09-07

**Current status: backend deployment confirmed; the existing frontend invoice editor is connected.** The earlier route-not-found blocker below is resolved. Frontend runtime integration was already pushed in `92a5aaf`; the deployed backend matches that contract, so no additional endpoint rewiring or desktop installer is needed.

## Source examined

- Server: `7ab4589`, branch `feature/direct-supplier-invoices`.
- Core: `6393830abfd9d19298a688fd45122b9d358216bf`, pinned by the server commit.
- Server handoff: `docs/supplier-invoice-implementation.md` and its synthetic request, response, replay, and validation evidence.
- Published deployment documentation: server `da83c6076eb9ed34bac8256d66ff414ec1c953dd`. Its changes after the deployed runtime revision are documentation/evidence only. This committed report was used for the follow-up; the separately named `SUPPLIER_INVOICE_DELIVERY_2026-09-07.md` was not present in the local repositories or searched delivery folders.
- Core source: `stock/views/purchase_invoice_views.py` and `stock/services/purchase_invoices/`.
- The backend working tree was not changed. Remote refs were fetched for inspection.

## Post-deployment verification

The follow-up independently confirmed:

- `GET /healthz` returns HTTP 200 and `ok 7ab458987aaac00e1aadda7a3b4f330f8def0f22`.
- An unauthenticated invoice-list request now returns HTTP 401 instead of route-not-found.
- In the signed-in local admin panel, invoice history loads its honest empty state without the unavailable-backend warning.
- The editor lists all 22 suppliers. Selecting Milliy cola loads its eight receivable products from the new contract, with unknown prices blank and no preview warning.
- An unsubmitted check of quantity `12` and unit price `100000` displays `100 000` and totals `1 200 000 UZS`. Review opens the final confirmation with the correct supplier, location, date, quantity, and price. The final posting action is enabled; it was not clicked.

The backend's committed `deployed.json` and `migration-applied.json` report all three migrations applied, all five application services updated, no pending migrations, and preserved pre-existing accounting values. Its `canary-verified.json` records actual isolated HTTP posting, exact retry, permission rejection, list/detail, and reversal checks. These are backend-provided deployment evidence, not accounting mutations repeated by the frontend agent.

The follow-up's focused invoice-page/service/type ESLint check passed using `node node_modules/eslint/bin/eslint.js`. The `yarn eslint` shortcut was unavailable in this checkout, so the installed ESLint entry point was invoked directly. The public frontend URL serves successfully but opens its login page in the available session; authenticated interactive verification used `http://localhost:5181/stock/purchase-invoices` with the production backend. All unsubmitted test inputs were discarded afterward.

The expanded frontend contract suite passed **26/26** tests with `node --test tests/contract/purchaseInvoiceApi.test.cjs tests/contract/purchaseInvoicePage.test.cjs`. Five additional regressions cover the deployed catalog shape/blank unknown prices, 102-item pagination, non-postable legacy preview, fail-closed authorization/outage errors, and stale responses after switching suppliers. These tests use isolated in-memory transports and make no production requests. Runtime source is unchanged from the previously typechecked and built `92a5aaf` integration.

## Earlier verification — before the rollout

Origin: `https://pos.78.111.90.65.nip.io`

At approximately 2026-09-07 12:26 UTC / 17:26 Asia/Tashkent:

| Read-only check | Actual result |
| --- | --- |
| `GET /healthz` | `ok 229f53622dc29ca5c271f74124927c17a8b39a36` |
| `GET /api/admins/stock/purchase-invoices/` | HTTP 404, route not found |
| `GET /api/admins/stock/purchase-invoices/receive/` | HTTP 404, route not found |

The GET on the receive URL only checks route registration; it does not post an invoice. The delivered view requires POST, so a deployed copy would reject GET with method-not-allowed rather than route-not-found.

The authenticated local frontend also showed the unavailable-history state and loaded existing supplier products only in preview mode. No production invoice, supplier balance, price, or stock quantity was changed by verification.

## Frontend adjustments to the delivered contract

- Handle the actual price-warning response: one flat `details` object with `line_index`, `old_price_uzs`, `new_price_uzs`, `difference_uzs`, and `percentage`. Map it to the submitted line even when the server omits `supplier_item_id`.
- Preserve affected stock/batch IDs in errors even when no item name is included.
- Match backend creator/poster filter names, pagination, aggregate totals, action history, and reversal/replacement metadata.
- Add typed reverse transport and optional replacement linkage. Correction buttons are not part of this integration change.
- Use the new invoice permissions across navigation, supplier shortcuts, and editor commands.
- Enforce backend quantity and UZS limits before submitting, and preserve stable keys for identical retries.
- Ignore stale history responses and reset history after a successful post.
- Display saved invoice notes, free-product reasons, price-change reasons, and translated posted/reversed labels.

## Historical deployment request — resolved

The request below is retained as an audit trail, not a new task for the backend developer.

> Please verify the production invoice rollout. The public `/healthz` reported server `229f53622dc29ca5c271f74124927c17a8b39a36`, while the invoice implementation is server `7ab4589` with core `6393830abfd9d19298a688fd45122b9d358216bf`. Both invoice list and receive URLs returned route-not-found. Deploy the invoice commit (or a later release containing it), including its pinned core, and apply `base.0065_direct_supplier_invoices`, `stock.0018_direct_supplier_invoices`, and `stock.0019_direct_invoice_backfill`. Then send the final server/core revisions, migration confirmation, and an authenticated successful read of `/api/admins/stock/purchase-invoices/` and `/api/admins/stock/suppliers/{id}/receivable-items/`. If production uses a different origin, provide that origin. Do not create test invoices in restaurant accounts.

## Verification scope

Checks executed for frontend runtime integration `92a5aaf`:

- Both contract regression files: 21 tests passed, zero failures.
- `yarn typecheck`: passed.
- `yarn build`: passed; existing unresolved asset warnings remain.
- Focused ESLint on the invoice page, service, types, navigation access, and warehouse page: passed. A broader navigation check reported 13 existing template-formatting warnings, not a clean warning-free result.
- Browser inspection against real supplier catalog data: desktop and 390px mobile, light/dark themes, grouped money display, keyboard focus, unavailable/preview states, and disabled preview posting. No horizontal overflow or browser-console errors were observed during these checks.

Frontend contract regression tests exercise the delivered response shapes and numeric request/idempotency behavior with isolated test data. Backend test counts in the handoff are evidence supplied by the backend developer, not tests rerun against production by the frontend agent.

The frontend follow-up does not create synthetic production invoices. Live create/post, weighted-cost persistence, supplier-ledger posting, and replay were not repeated against restaurant data; those mutations require an appropriate test environment or a real authorized receipt. The backend's isolated HTTP evidence covers these operations.

## Operator handoff

Open `/stock/purchase-invoices`, choose **New supplier invoice**, select the supplier and destination, and enter quantities/prices for the received products. Unused zero/blank-quantity rows are omitted. Review the total, then use the final receive action only for a real delivery. The backend atomically increases stock and supplier payable and saves receipt/cost/price evidence; payment remains separate and does not withdraw money from SAFE/BANK.

The API/type layer supports reversal/replacement, but this editor does not expose correction buttons. Desktop **1.0.44** remains unchanged; the invoice editor is an admin-panel feature.
