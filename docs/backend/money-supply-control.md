# Backend Technical Task — Money, Raw Materials, Suppliers, Stock, and Expenses

**Status:** Ready for backend implementation

**Date:** 2026-08-31

**Backend repository:** `alpha_pos_server`

**Frontend repository:** `smart-pos-admin_panel`

**Audience:** Backend developer

**Priority:** Production accounting integrity before UI convenience

## 1. Delivery goal

Deliver one trustworthy backend contract for the Admin Panel's **Money Control** workspace. The owner must be able to see, from backend-calculated data:

- cash waiting to be reconciled from shifts;
- the current SAFE and BANK balances;
- raw-material quantity, cost, and inventory value;
- supplier payable and supplier credit balances;
- paid, approved-unpaid, and pending operating expenses;
- reconciliation/completeness problems which make a total unsafe to trust.

This task also fixes the write paths which feed that view. Do not create parallel stock, supplier, Treasury, or expense ledgers. Reuse the current `StockLevel`, `StockTransaction`, `StockBatch`, `PurchaseOrder`, `PurchaseReceiving`, `Supplier`, `SupplierTransaction`, `TreasuryAccount`, `TreasuryTransaction`, `CashboxExpense`, and HR `Expense` foundations, extending them where the contract below requires it.

The frontend is being prepared against these exact endpoints:

- `GET /api/admins/money-control/overview`
- `GET /api/admins/stock/inventory-control/`

Return `404` or `501` only until an endpoint is actually deployed. Once deployed, never turn an accounting error into an empty successful payload.

## 2. Current implementation findings that this task must resolve

These findings are from the current source and are not optional product guesses:

1. `TreasuryService.post_shift_settlement` currently puts every manager-confirmed tender into SAFE. The required rule is now CASH to SAFE and non-cash tenders to BANK.
2. `POST /api/admins/treasury/expense` accepts a category name string. The frontend also sends `category_id`, but the current service ignores that ID.
3. Treasury direct expenses move money immediately and are currently admitted by a broad staff guard.
4. HR expenses have a lifecycle and category FK, but their payment ledger is separate from Treasury. A non-cash HR payment can therefore fail to debit BANK.
5. Cashbox expenses use a different category table and currently allow a missing category.
6. `PurchaseReceivingService.complete` correctly increases stock and supplier debt in one transaction. Preserve that behavior.
7. `PurchaseOrderService.record_payment` can reduce supplier debt without identifying or debiting SAFE, BANK, or a drawer. This unfunded payment path must not remain available.
8. The supplier-wide payment path debits Treasury and reduces supplier debt, but it has no durable purchase-order allocation record or explicit cross-ledger payment object.
9. Stock levels expose quantities, and stock items expose moving-average cost, but there is no authoritative filtered inventory-value endpoint for the owner dashboard.
10. Treasury history supports only account/type pagination. Date/search/reference filters currently applied by a frontend would otherwise describe only the current page, not the filtered ledger.

## 3. Non-negotiable accounting invariants

Implement and test these invariants before exposing the overview as `COMPLETE`.

### 3.1 Double-counting rules

| Business event | Inventory | Supplier payable | SAFE/BANK | Expense / P&L |
|---|---:|---:|---:|---:|
| Receive raw materials on supplier credit | increases | increases | no change | no expense |
| Pay a supplier for already received materials | no change | decreases | decreases | no new expense |
| Return materials to supplier | decreases | decreases/creates supplier credit | normally no change | no new expense unless a separately approved loss exists |
| Consume materials for sold/produced goods | decreases | no change | no change | COGS increases |
| Waste/spoilage | decreases | no change | no change | waste expense increases |
| Direct operating expense | no change | no change | decreases when paid | expense increases once |
| Manager-confirmed shift CASH settlement | no change | no change | SAFE increases | revenue is not recognized again here |
| Manager-confirmed card/provider settlement | no change | no change | BANK increases | revenue is not recognized again here |

Receiving goods and paying the supplier are balance-sheet events. **Never report supplier payment as a second operating expense after the inventory purchase/consumption has already been recognized.**

### 3.2 Balance signs

- `Supplier.current_balance > 0`: the business owes the supplier (payable).
- `Supplier.current_balance < 0`: the supplier owes the business / supplier credit.
- `TreasuryTransaction.delta > 0`: money entered that account.
- `TreasuryTransaction.delta < 0`: money left that account.
- Quantity and monetary values must not be mixed. Never add kilograms, liters, and pieces into one quantity KPI. Aggregate stock as item counts and UZS value; show each row's quantity with its base unit.

### 3.3 Working-capital snapshot

For this workspace, return:

```text
working_capital_uzs = SAFE + BANK + unsettled drawer cash
                    + raw-material inventory value
                    - supplier payable
                    + supplier credit
```

This is a visibly named **working-capital snapshot**, not profit, revenue, net worth, or available spending money. Do not include pending expenses until paid. Return the formula in the API and return a completeness issue when any component is not trustworthy.

### 3.4 Source-of-truth and no fabricated values

- Every overview number must be derived from committed source records in one consistent database snapshot.
- Do not return zero when a source is missing, stale, ambiguous, or failed to aggregate. Return `null` for the affected amount and add a stable completeness/reconciliation issue.
- Do not calculate totals from a paginated page.
- Do not persist frontend-formatted values such as `"100 000"`.
- Do not rebuild account balances by summing unrelated operational tables at request time when an append-only authoritative ledger exists. Reconcile the balance against the ledger and report disagreement.

## 4. Canonical shift-settlement destination

This is the approved product decision and replaces the current "every tender to SAFE" behavior:

| Tender | Treasury destination |
|---|---|
| `CASH` | `SAFE` |
| `CARD`, `UZCARD`, `HUMO`, `PAYME` | `BANK` |
| Other configured electronic/provider tender | `BANK` only after it is explicitly classified as non-cash |
| Unknown/unclassified tender | block final Treasury posting with a stable error; never guess |

Requirements:

1. Keep manager confirmation / shift reconciliation as the one recognition boundary.
2. Preserve one idempotent `SHIFT_DEPOSIT` per `(shift, tender method)`.
3. Lock the shift/reconciliation and both affected Treasury account rows in deterministic order before posting.
4. A retry returns the original posting. A retry with a different amount, branch, method classification, or destination returns `409 SETTLEMENT_POSTING_CONFLICT`.
5. Zero tender values create no ledger noise but remain in the immutable settlement manifest.
6. A signed refund reversal must debit the same account that the original tender method maps to.
7. The response must report each tender's destination and transaction ID; do not return a single `account: SAFE` field for a mixed settlement.
8. Inkassa remains a physical cash collection/audit action. It must not recognize shift revenue a second time.

Required settlement result shape:

```json
{
  "success": true,
  "data": {
    "status": "POSTED",
    "shift_id": 810,
    "branch_id": "tashkent-01",
    "total_uzs": 1450000,
    "postings": [
      {
        "method": "CASH",
        "destination": "SAFE",
        "amount_uzs": 650000,
        "treasury_transaction_id": 9001
      },
      {
        "method": "UZCARD",
        "destination": "BANK",
        "amount_uzs": 800000,
        "treasury_transaction_id": 9002
      }
    ],
    "posted_at": "2026-08-31T18:42:10+05:00"
  }
}
```

## 5. Canonical expense categories

There must be one authoritative expense-category identity used by Treasury, HR/admin expenses, and cashbox/desktop expenses.

### 5.1 Reuse and migration direction

Use the current HR `ExpenseCategory` as the canonical category catalog, or move it to a neutral finance/base app while preserving its stable IDs/UUIDs. Do not keep creating independently named categories in both `hr.ExpenseCategory` and `CashboxExpenseCategory`.

Required canonical fields:

- `id`, `uuid`, immutable unique `code`;
- `name` and optional description;
- `reporting_group` using the existing financial reporting groups;
- `is_active`, `sort_order`;
- `allowed_sources`: any of `DRAWER`, `SAFE`, `BANK`;
- `requires_receipt`, `requires_description`;
- creator/updater and timestamps.

Required behavior:

1. Category is mandatory for every new `Expense`, Treasury expense, and `CashboxExpense`.
2. An inactive category remains visible on historical records but cannot be selected for a new expense.
3. Persist `category_id` and a name/code snapshot on the financial record so history remains readable after rename/deactivation.
4. Category creation/update is Manager/Admin only through explicit permission; Warehouse can only read categories when it has expense-request capability.
5. Existing desktop category list/create routes must become compatibility aliases over this same catalog, not a second catalog.

Required endpoints:

| Method/path | Permission | Behavior |
|---|---|---|
| `GET /api/admins/expense-categories` | `expense.category.view` | Active list by default; `include_inactive=true` for authorized managers. |
| `POST /api/admins/expense-categories` | `expense.category.manage` | Create one canonical category. |
| `PATCH /api/admins/expense-categories/{id}` | `expense.category.manage` | Rename/configure prospectively; code immutable. |
| `POST /api/admins/expense-categories/{id}/deactivate` | `expense.category.manage` | Soft-deactivate; reject when already inactive idempotently. |

## 6. Unified expense lifecycle and payment

Extend/reuse the current HR `Expense` as the canonical approval record. It must own the workflow; Treasury and drawer records are payment postings linked to it.

Statuses:

```text
PENDING -> APPROVED -> PAID
PENDING -> REJECTED
PENDING -> CANCELED (requester before review)
APPROVED -> CANCELED (approver, before payment, with reason)
PAID -> VOIDED only through an authorized reversal which preserves the original
```

Required fields in addition to current fields:

- required canonical `category` plus code/name snapshots;
- `requested_source`: `DRAWER`, `SAFE`, or `BANK`;
- optional `shift` only when source is `DRAWER`;
- `fee_uzs` and optional percentage snapshot;
- private receipt attachment/reference;
- requester, approver, payer, void/reversal actor and timestamps;
- immutable link to exactly one money posting (`TreasuryTransaction` or `CashboxExpense`) and any reversal;
- branch/location ownership;
- state-transition audit rows, not only an application log.

Rules:

1. A category and positive whole-UZS amount are required when the request is created.
2. Requester cannot approve their own request. Approver cannot be the subject of a warehouse-generated request without a second reviewer.
3. Only `APPROVED` can be paid.
4. Payment is atomic: lock the expense and source balance, verify sufficient funds, create the money posting, link it, set `PAID`, and append audit history in one transaction.
5. A repeated payment command with the same idempotency key returns the original result. A different command for an already paid expense returns `409 EXPENSE_ALREADY_PAID`.
6. `SAFE`/`BANK` payments debit `TreasuryAccount`; `DRAWER` payments use only the active authorized shift and the existing cashbox/register safety checks.
7. Category is required on drawer payments. Do not permit the current optional-category behavior for new rows.
8. A fee/commission is permitted only for `BANK`. If source is `SAFE` or `DRAWER`, reject a non-zero fee with `422 FEE_BANK_ONLY`.
9. Accept either `fee_uzs` or `fee_percent`, never both. Compute the fee server-side when a percentage is used and persist both the submitted percentage snapshot and resulting integer UZS fee.
10. `fee_percent` must be a base-10 decimal from 0 through 100 with at most four decimal places. Calculate `fee_uzs = ROUND_HALF_UP(amount_uzs * fee_percent / 100)`.
11. Total source debit is `amount_uzs + fee_uzs`. The operating expense total is also that total unless the existing reporting policy records bank fees in a separate canonical fee category; whichever policy is selected must be explicit and consistent in the overview.
12. A paid expense must appear exactly once in expense reporting even though it has an approval row and a money-ledger row.
13. `POST /api/admins/treasury/expense` must no longer be a broad `pos_staff_required` instant-spend route. During compatibility, it may be a thin adapter to the canonical workflow only for an explicit `expense.direct.pay` permission, with required category ID, stable idempotency, and the same source/fee validation. The new Admin Panel must use the canonical lifecycle endpoints.

Required mutation endpoints:

| Method/path | Permission | Behavior |
|---|---|---|
| `POST /api/admins/expenses` | `expense.request.create` | Create `PENDING`; does not move money. |
| `GET /api/admins/expenses` | own/all permission | Server-filtered paginated list and filtered totals. |
| `GET /api/admins/expenses/{id}` | own/all permission | Detail, evidence, transitions, linked payment/reversal. |
| `POST /api/admins/expenses/{id}/approve` | `expense.request.approve` | Approve; enforce separation of duties. |
| `POST /api/admins/expenses/{id}/reject` | `expense.request.approve` | Reject with required reason. |
| `POST /api/admins/expenses/{id}/pay` | `expense.request.pay` | Atomic source debit and one linked payment. |
| `POST /api/admins/expenses/{id}/cancel` | requester/approve rule | Cancel before payment with reason where required. |
| `POST /api/admins/expenses/{id}/void` | `expense.request.void` | Append-only controlled reversal; never delete. |

Create request example:

```json
{
  "category_id": 17,
  "amount_uzs": 350000,
  "requested_source": "BANK",
  "expense_date": "2026-08-31",
  "description": "August internet invoice",
  "receipt_number": "INV-2026-08-991"
}
```

Pay request example:

```json
{
  "source_account": "BANK",
  "fee_percent": "1.5",
  "note": "Paid from business bank account"
}
```

Pay result example:

```json
{
  "success": true,
  "data": {
    "expense_id": 441,
    "status": "PAID",
    "amount_uzs": 350000,
    "fee_uzs": 5250,
    "total_debited_uzs": 355250,
    "source_account": "BANK",
    "treasury_transaction_id": 9104,
    "paid_by": { "id": 7, "name": "Manager One" },
    "paid_at": "2026-08-31T16:20:00+05:00"
  }
}
```

## 7. Supplier receiving, payable, and payment

### 7.1 Receiving

Preserve the current `PurchaseReceivingService.complete` transaction and strengthen its response/audit contract:

1. Calculate received value from accepted receiving lines in base units and UZS.
2. Atomically update batches/levels, PO received quantities/status, moving-average cost, supplier ledger, and `Supplier.current_balance`.
3. Failed or pending-quality items must not silently become available stock or payable value. Apply one documented rule and return it in the response; the recommended rule is only `PASSED` lines post to available stock/debt at completion, while other lines remain quarantined/pending.
4. Completion returns supplier balance before/after, received value, stock transaction IDs, and supplier transaction ID.
5. A retry cannot post stock or debt twice.
6. Receiving creates inventory and payable. It does not create an expense and does not debit Treasury.

### 7.2 Supplier payment

Create a durable `SupplierPayment` command and `SupplierPaymentAllocation` rows, or equivalent protected models, tying the supplier ledger and Treasury ledger together.

Required payment rules:

- source is only `SAFE` or `BANK`; Warehouse has no access;
- commission/fee is BANK-only;
- payment principal reduces supplier payable; fee does not reduce supplier payable;
- source debit is principal plus fee;
- payment cannot exceed the supplier's positive payable unless an explicit, separately permitted supplier-prepayment workflow is implemented;
- allocations may target open POs/receivings and must total the principal;
- when allocation mode is `AUTO_OLDEST_DUE`, allocate by payment due date then PO ID under locks;
- update each PO `amount_paid`/`payment_status` from allocation rows, not from an unfunded parallel command;
- lock supplier, source account, payment, and affected POs in a deterministic order;
- persist one cross-link to the Treasury transaction and one to the supplier ledger transaction;
- preserve payment and allocation history on reversal; never delete ledger rows.

Replace or deprecate the current `PurchaseOrderService.record_payment` path which records no source account. It must either call this funded supplier-payment service or return `410 UNFUNDED_PAYMENT_ROUTE_RETIRED`. There must be no production path that reduces payable without debiting a real source.

Canonical endpoint (keep `/suppliers/{id}/pay/` as a compatibility alias if needed):

```text
POST /api/admins/stock/suppliers/{supplier_id}/payments/
Permission: stock.supplier.pay
Idempotency-Key: required
```

Payload:

```json
{
  "amount_uzs": 1200000,
  "source_account": "BANK",
  "fee_uzs": 12000,
  "allocation_mode": "EXPLICIT",
  "allocations": [
    { "purchase_order_id": 130, "amount_uzs": 700000 },
    { "purchase_order_id": 145, "amount_uzs": 500000 }
  ],
  "note": "Supplier transfer for two deliveries"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "payment_id": 88,
    "supplier": { "id": 12, "name": "Fresh Foods LLC" },
    "principal_uzs": 1200000,
    "fee_uzs": 12000,
    "total_debited_uzs": 1212000,
    "source_account": "BANK",
    "supplier_balance_before_uzs": 2100000,
    "supplier_balance_after_uzs": 900000,
    "source_balance_before_uzs": 7800000,
    "source_balance_after_uzs": 6588000,
    "supplier_transaction_id": 501,
    "treasury_transaction_id": 9110,
    "allocations": [
      {
        "purchase_order_id": 130,
        "amount_uzs": 700000,
        "payment_status": "PAID",
        "remaining_uzs": 0
      },
      {
        "purchase_order_id": 145,
        "amount_uzs": 500000,
        "payment_status": "PARTIAL",
        "remaining_uzs": 900000
      }
    ],
    "paid_at": "2026-08-31T17:10:00+05:00"
  }
}
```

## 8. Inventory valuation rules

Use **perpetual weighted-average cost** (`WEIGHTED_AVERAGE`) for this first dashboard contract because `StockItem.avg_cost_price` is already updated by receiving. Do not mix FIFO batch value for some rows with moving average for other rows.

For each filtered stock item/location row:

```text
quantity               = StockLevel.quantity in the item's base unit
available_quantity     = quantity - reserved_quantity
inventory_value_uzs    = quantity * StockItem.avg_cost_price
available_value_uzs    = available_quantity * StockItem.avg_cost_price
is_out_of_stock        = available_quantity <= 0
is_low_stock           = available_quantity <= StockItem.reorder_point
```

Rules:

1. `pending_in_quantity` and `pending_out_quantity` are displayed but not included in current inventory value.
2. Never use the frontend's old hardcoded low-stock threshold of 5.
3. When no location filter is supplied, aggregate level quantities by item across all authorized locations and return `location: null`.
4. When a location filter is supplied, return only that location and apply the item's reorder point consistently. If a future per-location reorder point exists, expose the chosen threshold source.
5. Negative quantity, negative reserved quantity, reserved greater than on-hand, missing/zero cost on positive stock, batch-vs-level disagreement, non-UZS supplier price, or duplicate preferred supplier must produce stable completeness issues.
6. Supplier balance does not change inventory valuation. The preferred supplier object is procurement context only.
7. Raw-material dashboard totals include `StockItem.item_type = RAW` only. Other item types may be queried explicitly by authorized stock pages.
8. Perform all multiplication and sums with Python `Decimal`/database decimal expressions. Never convert through `float`.
9. Aggregate unrounded Decimal values and round only the final `*_uzs` serialization to whole UZS using `ROUND_HALF_UP`.

## 9. Permissions and role boundaries

Add explicit permission keys and enforce them at every endpoint. A role name is not authorization.

| Permission | Capability |
|---|---|
| `money.control.view` | Read the consolidated owner money-control overview. |
| `money.control.reconcile` | Read detailed reconciliation evidence and run a read-only reconciliation check. |
| `stock.inventory_control.view` | Read inventory-control values and supplier procurement context. |
| `stock.supplier.balance.view` | Read supplier balances and ledgers. |
| `stock.supplier.pay` | Pay supplier from SAFE/BANK. |
| `expense.category.view` | Read active canonical expense categories. |
| `expense.category.manage` | Create/update/deactivate categories. |
| `expense.request.create` | Create a pending expense request. |
| `expense.request.view_own` | View own requests. |
| `expense.request.view_all` | View all authorized-branch requests. |
| `expense.request.approve` | Approve/reject another user's request. |
| `expense.request.pay` | Pay an approved request from an authorized account. |
| `expense.request.void` | Reverse a paid request with mandatory reason. |
| `expense.direct.pay` | Temporary legacy direct-pay adapter; Admin only by default. |
| `treasury.account.view` | Read authorized SAFE/BANK balances/history. |
| `treasury.transfer` | Move money between SAFE/BANK. |

Default assignment:

- `ADMIN`: all permissions.
- `MANAGER`: money-control read, inventory-control read, supplier balance read/pay, expense category view/manage, expense view/approve/pay, Treasury account view/transfer. Direct pay only if the business explicitly retains it.
- `WAREHOUSE`: keep the existing warehouse receiving/catalog/stock/supplier-balance read permissions. Optionally grant `expense.category.view`, `expense.request.create`, and `expense.request.view_own` later.

**Do not grant WAREHOUSE `money.control.view`, `stock.supplier.pay`, `expense.request.approve`, `expense.request.pay`, `expense.direct.pay`, `treasury.account.view`, `treasury.transfer`, cashbox direct spending, SAFE/BANK mutation, or any direct cash access. Do not modify the current "direct cash access remains disabled" warehouse decision.**

All reads and writes must be branch/location scoped unless the authenticated Admin is explicitly global. Return `403`, not an empty list, when the permission itself is missing.

## 10. Endpoint contract — consolidated Money Control overview

```text
GET /api/admins/money-control/overview
Permission: money.control.view
```

Query parameters:

| Parameter | Required | Meaning |
|---|---:|---|
| `date_from` | no | Expense/report start, ISO `YYYY-MM-DD`; defaults to current business date. |
| `date_to` | no | Inclusive expense/report end; defaults to `date_from`; maximum 366 days. |
| `location_id` | no | Restrict inventory/drawer evidence to an authorized location. Treasury accounts remain branch-scoped and response states that scope. |

Validation:

- Parse dates server-side in `Asia/Tashkent` using the configured business-day boundary where event attribution requires it.
- Reject reversed/invalid/out-of-range dates with field errors.
- Reject unauthorized locations with `403 LOCATION_FORBIDDEN`, not an empty successful result.
- Calculate all components in one repeatable-read/consistent transaction snapshot where supported.

Full success example:

```json
{
  "success": true,
  "data": {
    "as_of": "2026-08-31T18:45:00+05:00",
    "period": {
      "date_from": "2026-08-01",
      "date_to": "2026-08-31",
      "timezone": "Asia/Tashkent"
    },
    "completeness": {
      "status": "COMPLETE",
      "issues": []
    },
    "treasury": {
      "drawer_unreconciled_uzs": 650000,
      "safe_uzs": 12500000,
      "bank_uzs": 8300000,
      "liquid_total_uzs": 21450000
    },
    "suppliers": {
      "payable_uzs": 4900000,
      "credit_uzs": 150000,
      "overdue_payable_uzs": 1200000,
      "count_with_balance": 7,
      "top_balances": [
        {
          "supplier_id": 12,
          "supplier_name": "Fresh Foods LLC",
          "balance_uzs": 2100000,
          "payable_uzs": 2100000,
          "credit_uzs": 0,
          "overdue_payable_uzs": 700000,
          "currency": "UZS"
        },
        {
          "supplier_id": 18,
          "supplier_name": "Packaging Partner",
          "balance_uzs": -150000,
          "payable_uzs": 0,
          "credit_uzs": 150000,
          "overdue_payable_uzs": 0,
          "currency": "UZS"
        }
      ]
    },
    "inventory": {
      "raw_material_value_uzs": 6200000,
      "raw_available_value_uzs": 5870000,
      "raw_item_count": 84,
      "low_stock_count": 11,
      "out_of_stock_count": 3,
      "valuation_method": "WEIGHTED_AVERAGE"
    },
    "expenses": {
      "paid_uzs": 3750000,
      "pending_uzs": 600000,
      "approved_unpaid_uzs": 420000,
      "by_category": [
        {
          "category_id": 17,
          "category_name": "Utilities",
          "paid_uzs": 1850000,
          "transaction_count": 6
        },
        {
          "category_id": 22,
          "category_name": "Repairs",
          "paid_uzs": 1900000,
          "transaction_count": 4
        }
      ]
    },
    "working_capital": {
      "amount_uzs": 22900000,
      "formula": "SAFE + BANK + DRAWER_UNRECONCILED + RAW_INVENTORY - SUPPLIER_PAYABLE + SUPPLIER_CREDIT"
    },
    "reconciliation": {
      "status": "BALANCED",
      "issues": []
    }
  }
}
```

Definitions:

- `drawer_unreconciled_uzs`: expected physical CASH from active/ended shifts which has not yet been posted by manager-confirmed settlement. Do not include non-cash provider totals in this physical drawer field.
- `liquid_total_uzs`: drawer unreconciled cash + SAFE + BANK. Do not double-count shifts already posted to Treasury.
- `payable_uzs`: sum of positive supplier balances.
- `credit_uzs`: absolute sum of negative supplier balances.
- `overdue_payable_uzs`: unpaid allocated/open-PO principal whose due date is before `as_of`; if historical data cannot support this, return `null` plus an issue, not zero.
- `expenses.paid_uzs`: canonical expenses which reached `PAID` in the requested period, including their policy-defined fees, counted once.
- category rows are sorted by `paid_uzs DESC`, then category ID and include every paid category for the period. Do not paginate this small summary.

Allowed statuses:

- completeness: `COMPLETE`, `PARTIAL`, `UNSAFE`;
- reconciliation: `BALANCED`, `WARNING`, `INCOMPLETE`.

Issue shape:

```json
{
  "code": "STOCK_LEVEL_BATCH_MISMATCH",
  "severity": "WARNING",
  "title": "Batch and level quantities differ",
  "message": "Two raw-material rows need review before inventory value is final.",
  "entity_type": "StockItem",
  "entity_id": 204,
  "amount_uzs": null,
  "details": { "location_id": 3, "difference": "2.5000" }
}
```

Stable issue codes must include at least:

- `TREASURY_LEDGER_BALANCE_MISMATCH`
- `LEGACY_SHIFT_TENDER_DESTINATION_AMBIGUOUS`
- `UNSETTLED_SHIFT_DATA_INCOMPLETE`
- `SUPPLIER_LEDGER_BALANCE_MISMATCH`
- `SUPPLIER_CURRENCY_UNSUPPORTED`
- `PURCHASE_PAYMENT_WITHOUT_FUNDING_SOURCE`
- `STOCK_COST_MISSING`
- `STOCK_LEVEL_NEGATIVE`
- `STOCK_RESERVED_EXCEEDS_ON_HAND`
- `STOCK_LEVEL_BATCH_MISMATCH`
- `EXPENSE_CATEGORY_UNMAPPED`
- `EXPENSE_PAYMENT_LINK_MISSING`
- `DUPLICATE_EXPENSE_REPORTING_SOURCE`

## 11. Endpoint contract — raw inventory control

```text
GET /api/admins/stock/inventory-control/
Permission: stock.inventory_control.view
```

Query parameters:

| Parameter | Default | Behavior |
|---|---|---|
| `item_type` | `RAW` | One valid `StockItem.ItemType`; owner workspace sends `RAW`. |
| `location_id` | all authorized | Exact location. |
| `category_id` | all | Exact category including descendants only if `include_descendants=true`. |
| `search` | blank | Server-side case-insensitive item name/SKU/barcode search. |
| `low_stock` | unset | Boolean; true returns low/out rows, false returns rows above threshold. |
| `page` | 1 | Positive integer. |
| `per_page` | 25 | 1–100. |

The summary must use the full filtered query **before pagination**. Filtering and counts must never be performed only on the returned page.

Full success example:

```json
{
  "success": true,
  "data": {
    "summary": {
      "inventory_value_uzs": 6200000,
      "available_value_uzs": 5870000,
      "raw_item_count": 84,
      "low_stock_count": 11,
      "out_of_stock_count": 3,
      "supplier_payable_uzs": 4900000,
      "supplier_credit_uzs": 150000,
      "valuation_method": "WEIGHTED_AVERAGE",
      "as_of": "2026-08-31T18:45:00+05:00"
    },
    "items": [
      {
        "stock_item": {
          "id": 204,
          "name": "Flour",
          "code": "RAW-FLOUR-01"
        },
        "category": {
          "id": 8,
          "name": "Dry goods"
        },
        "base_unit": {
          "id": 2,
          "name": "Kilogram",
          "code": "kg"
        },
        "location": null,
        "quantity": "128.5000",
        "reserved_quantity": "6.0000",
        "available_quantity": "122.5000",
        "pending_in_quantity": "40.0000",
        "pending_out_quantity": "0.0000",
        "avg_cost_uzs": "7100.0000",
        "inventory_value_uzs": 912350,
        "available_value_uzs": 869750,
        "reorder_point": "25.0000",
        "is_low_stock": false,
        "is_out_of_stock": false,
        "preferred_supplier": {
          "supplier_id": 12,
          "supplier_name": "Fresh Foods LLC",
          "price": "7000.0000",
          "currency": "UZS",
          "current_balance_uzs": 2100000,
          "lead_time_days": 2
        }
      }
    ],
    "pagination": {
      "page": 1,
      "per_page": 25,
      "total": 84,
      "total_pages": 4
    }
  }
}
```

Row ordering: `is_out_of_stock DESC`, `is_low_stock DESC`, item name, item ID. Return one deterministic preferred supplier. If data contains multiple preferred suppliers, choose the lowest stable supplier-link ID for display and return a reconciliation issue; do not silently switch on each request.

## 12. Treasury and supplier history filter support

Extend existing read APIs so details opened from Money Control are truthful:

### Treasury history

`GET /api/admins/treasury/history` must support server-side:

- `account`, `type`, `date_from`, `date_to`;
- `category_id`, `reference_type`, `reference_id`;
- `performed_by_id`, `search`, `page`, `per_page`.

Return totals for the complete filtered result: total inflow, total outflow, total fee, and row count. Search may cover description, category snapshot, reference, and actor name. It must not modify the balance calculation.

### Supplier ledger

`GET /api/admins/stock/suppliers/{id}/ledger/` must support:

- `type`, `source_account`, `date_from`, `date_to`;
- `reference_type`, `reference_id`, `search`, `page`, `per_page`.

Return filtered principal totals plus the supplier's current authoritative balance. The current balance is not the balance of only the filtered period.

Use the common pagination object:

```json
{
  "page": 1,
  "per_page": 25,
  "total": 151,
  "total_pages": 7
}
```

Reject malformed filters with field-level `422`; do not ignore them silently.

## 13. Money, Decimal, quantity, and JSON rules

1. All UZS commands are whole sums. Reject fractional input (`100.5`) instead of silently rounding it.
2. Store/compute with `Decimal`, never binary floating point.
3. New `*_uzs` response properties are JSON integer numbers, for example `100000`, so the frontend can render `100 000`. Do not send grouped strings.
4. Existing legacy endpoints may keep decimal strings during compatibility, but the two new read contracts above must follow their examples consistently.
5. Quantities and unit prices which legitimately require four decimal places are returned as canonical decimal strings, for example `"12.5000"`; never scientific notation.
6. Percentages are canonical decimal strings with at most four decimal places. Persist the submitted snapshot.
7. Reject `NaN`, infinity, booleans, empty strings, exponent forms, negative fee, and values beyond model limits with field-level errors.
8. Use `Asia/Tashkent` ISO-8601 datetimes with an offset. Dates are `YYYY-MM-DD`.
9. Currency is UZS in v1. Any non-UZS supplier price/balance must be excluded from UZS aggregation and produce `SUPPLIER_CURRENCY_UNSUPPORTED` until an approved FX-rate subsystem exists. Never convert using a hardcoded rate.

## 14. Atomicity, idempotency, and concurrency

All money/stock mutations must use `transaction.atomic` and the existing HTTP idempotency mechanism, strengthened as follows:

- Require `Idempotency-Key` for shift settlement, receiving completion, supplier payment, expense pay, expense void, Treasury transfer, and any legacy direct payment adapter.
- Scope the stored key by authenticated actor, branch, endpoint operation, and target resource. Store a canonical request hash and the completed response.
- Same key + same canonical payload returns the original status/body.
- Same key + different payload returns `409 IDEMPOTENCY_KEY_REUSED`.
- Lock rows before rechecking state. A pre-lock status check is not sufficient.
- Lock multiple accounts/POs in deterministic primary-key order to avoid deadlocks.
- Add database uniqueness constraints for one shift+tender posting, one money posting per Expense, one supplier payment command per idempotency identity, one supplier/Treasury ledger link per SupplierPayment, and one allocation row per payment+PO.
- A failed operation must roll back every stock, account, supplier, PO, workflow, and audit change.
- Append-only ledger records must be corrected with linked reversal rows. Do not update or hard-delete them.

Concurrency tests must execute two real database transactions, not only call the service twice sequentially.

## 15. Audit trail

Every create, approve, reject, pay, receive-complete, transfer, reverse, void, category change, and settlement posting must preserve:

- actor ID and display snapshot;
- branch/location;
- timestamp;
- previous/new workflow state;
- amount, fee, source/destination, category snapshot;
- request/idempotency identity;
- source entity type/ID/UUID;
- reason/comment where required;
- linked ledger transaction IDs.

Expose action history in expense and supplier-payment detail responses. Application logs alone do not satisfy this requirement.

The overview read itself need not create one audit row per refresh, but access to the sensitive workspace should be present in normal security/access logs without storing response amounts in plaintext logs unnecessarily.

## 16. Error contract

Use one safe envelope throughout new endpoints:

```json
{
  "success": false,
  "code": "EXPENSE_ALREADY_PAID",
  "message": "This expense has already been paid.",
  "errors": {
    "status": ["Expected APPROVED but found PAID."]
  },
  "details": {
    "expense_id": 441
  }
}
```

HTTP/status rules:

| Situation | Status |
|---|---:|
| Unauthenticated | `401` |
| Permission or branch denied | `403` |
| Entity absent | `404` |
| Invalid field/value | `422` |
| Illegal state, concurrent conflict, reused key | `409` |
| Retired unfunded legacy route | `410` |
| Temporarily undeployed endpoint only | `501` |
| Unexpected server failure | `500`, stable public message, no traceback |

Insufficient balance is `422 INSUFFICIENT_FUNDS` with `available_uzs` and `required_uzs`. Do not disclose another branch's balances in an authorization failure.

## 17. Migrations, backfill, and compatibility

### 17.1 Category unification

1. Create the canonical category FK/snapshots without dropping old fields.
2. Match old cashbox categories to canonical categories only by an explicit deterministic mapping migration approved in a dry run. Do not merge solely by case-insensitive name when reporting groups differ.
3. Create clearly flagged migrated canonical rows where no match exists.
4. Backfill Treasury category FK from the mapping. Unmatched rows remain readable, contribute to total paid expense only when their source is proven, and create `EXPENSE_CATEGORY_UNMAPPED`.
5. Switch writes to canonical IDs, then compatibility reads, and remove old writes only in a later migration.

### 17.2 Shift settlement correction

Existing non-cash `SHIFT_DEPOSIT` rows in SAFE cannot be silently rewritten because the ledger is append-only and businesses may already have manually transferred money.

Deliver two management commands:

```text
python manage.py audit_money_control --branch <id> --as-of <iso> --output <json>
python manage.py reclassify_legacy_shift_tenders --branch <id> --cutoff <iso> --dry-run
```

The dry run must list each candidate old non-cash deposit, linked shift/tender, amount, possible related transfer, and whether it is safe or ambiguous. Only explicitly approved safe rows may receive append-only paired reclassification entries (SAFE debit, BANK credit) with a unique link to the original transaction. Ambiguous rows remain unchanged and surface `LEGACY_SHIFT_TENDER_DESTINATION_AMBIGUOUS` until manually resolved. Establish a cutover timestamp after which all new settlements use the canonical mapping.

### 17.3 Supplier payments

1. Find legacy PO payments which reduced supplier debt without a funding source.
2. Do not invent a SAFE/BANK source. Mark them as legacy unfunded evidence and surface `PURCHASE_PAYMENT_WITHOUT_FUNDING_SOURCE`.
3. Backfill allocations only when PO/payment references and amount are provable.
4. Reconcile every `Supplier.current_balance` to append-only ledger balance. Repair only through a reviewed adjustment/reversal command.

### 17.4 Expense deduplication

Classify current HR expense payment rows, CashboxExpense rows, and Treasury expenses by durable references. Do not sum duplicate representations of the same business payment. Produce a dry-run report of missing and duplicate links before the overview is allowed to return `COMPLETE`.

### 17.5 Rolling compatibility

- Keep current URLs during one frontend release where safe, but route writes through canonical services.
- Response fields may be added; do not remove currently consumed fields in the same deployment.
- Deploy schema first, then dual-read/backfill, then canonical writes/endpoints, then frontend, then retire old writes.
- Existing valid Administrator/Manager operations must remain reachable through the new permissions after seeds/migrations run.
- Existing users must not silently receive sensitive new permissions except through the explicitly approved role template migration.

## 18. Required automated acceptance tests

### Settlement

1. Mixed shift: CASH increases SAFE; UZCARD/HUMO/PAYME/CARD increase BANK.
2. Same idempotency key/payload returns identical postings; no duplicate deltas.
3. Same key/different payload returns `409`.
4. Unknown tender blocks posting without partial account changes.
5. Concurrent settlement calls create one posting per tender.
6. Refund reversal debits the original tender destination.

### Receiving and supplier payable

1. Completing a receiving increases base stock quantity/value and supplier payable by the accepted received value, atomically.
2. A failure on any receiving line leaves stock, batches, PO, supplier ledger, and balance unchanged.
3. Retry/concurrent completion does not duplicate stock or debt.
4. Supplier payment debits source by principal+fee, reduces payable by principal, updates allocations/PO statuses, and cross-links both ledgers.
5. SAFE payment with fee is rejected; BANK payment with fee succeeds.
6. Payment above payable/allocation remainder is rejected without mutation.
7. The old unfunded PO-payment route cannot reduce debt.
8. WAREHOUSE can read permitted supplier balances but supplier payment returns `403` and no mutation.

### Expenses/categories

1. Every new drawer/SAFE/BANK expense rejects missing/inactive/disallowed category.
2. Category identity is the same from Admin, Treasury, and desktop/cashbox list endpoints.
3. Request creation moves no money.
4. Self-approval fails; a different authorized approver succeeds.
5. Only approved expense can be paid; one payment creates one source debit and one reporting expense.
6. BANK percentage fee calculation uses Decimal/ROUND_HALF_UP and persists snapshot; other sources reject fees.
7. Concurrent/retried pay creates one posting.
8. Void creates linked reversal rows and never deletes original records.

### Inventory-control endpoint

1. Summary totals use all filtered rows, not the current page.
2. Location/category/search/low-stock filters work individually and together.
3. Reorder point, not hardcoded 5, determines low stock.
4. Aggregate-across-locations returns one row per item; location filter returns exact location rows.
5. Values are calculated with weighted-average Decimal cost and correctly rounded only on serialization.
6. Missing cost, negative level, reserved overflow, batch mismatch, and multiple preferred supplier each produce the expected issue.
7. No mixed-unit aggregate quantity is returned.

### Overview/reconciliation/security

1. The full example shape is contract-tested, including null/issue behavior.
2. A settled shift is not counted again in `drawer_unreconciled_uzs`.
3. Supplier credit is separated from payable.
4. Paid expense appears once even when approval and payment ledger records both exist.
5. Working-capital formula uses exact returned components.
6. Unauthorized role/location returns `403`; it never receives zeroed sensitive values.
7. WAREHOUSE has no direct cash/Treasury/supplier-payment access after permission seeding.
8. Treasury and supplier history filters operate before pagination and their totals cover the full result.

## 19. Performance requirements

- Overview: target p95 under 800 ms for one branch with one year of ordinary operational data.
- Inventory-control page: target p95 under 500 ms at `per_page=25`.
- Do not introduce N+1 queries for item/category/unit/preferred supplier or supplier balances.
- Add indexes for active item/type/category, level item/location, supplier balance, PO supplier/payment due/status, expense status/date/category/branch, Treasury transaction account/type/date/reference, and supplier transaction supplier/type/date/reference as justified by query plans.
- Provide `EXPLAIN` evidence for the two new read endpoints on production-like data.
- A short cache is allowed only if keyed by branch/location/filters/permission scope and invalidated by every contributing money/stock mutation. The response must still include `as_of`. Prefer correct database aggregates first.

## 20. Delivery and rollout checklist

Backend handoff is complete only when all items below are supplied:

1. Code and migrations pushed with server/core revision hashes.
2. Permission catalog/role seeds applied and verified.
3. Both new GET endpoints match the exact contracts above.
4. Canonical category and expense write paths are live; old unsafe writes are blocked or adapters call the canonical service.
5. CASH-to-SAFE and noncash-to-BANK is active after a recorded cutover timestamp.
6. Supplier payments are funded and cross-ledger linked; unfunded PO payment is retired.
7. Dry-run reports for category mapping, legacy shift reclassification, legacy supplier payments, and expense deduplication are reviewed.
8. Production backfill/reclassification steps are explicitly listed with rollback/reversal procedure. Do not run ambiguous financial correction automatically.
9. Focused tests above pass, plus Django checks, migration-drift check, and relevant existing finance/shift/stock tests.
10. OpenAPI/Postman examples are updated.
11. One Administrator response and one forbidden WAREHOUSE response are captured for both permission boundaries.
12. Health checks pass after migrations and workers/services restart.

In the completion message, state:

- server and core revision hashes;
- migration names and whether production migrations ran;
- cutover timestamp and legacy rows left ambiguous;
- exact endpoint paths;
- focused and regression test counts;
- any response field which differs from this contract.

The frontend integration must not be declared complete from screenshots alone. The new pages will be connected to these endpoints and tested against real empty, populated, permission-denied, validation-error, reconciliation-warning, and retry/concurrency outcomes.
