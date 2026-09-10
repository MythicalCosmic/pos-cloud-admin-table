# Stock and Money Backend Follow-up

Date: 2026-09-03

Status: required before the remaining stock and supplier actions can be enabled in production

Applies to: `alpha_pos_server` and its `alpha_pos_core` submodule
Audit baseline: server `792629983ba0d96e33e3169b0053970dc5f127ab`, core `826849e52854c4b31e1592c5809dcc2981b3441c`

This document is the implementation contract for the gaps found while integrating the deployed warehouse and money-control backend. It is intentionally limited to the existing stock, supplier, and Treasury model. Do not create a parallel inventory ledger, supplier ledger, expense category table, or payment workflow.

The frontend can preflight some of these rules, but a frontend check is not a security or concurrency boundary. Every authorization, branch, balance, batch, reservation, and reversal invariant below must be enforced in the backend transaction.

## Required outcomes

The delivery is complete only when all of the following are true:

1. No outgoing manual adjustment or outgoing adjustment reversal can reduce on-hand quantity below reserved quantity.
2. A batch-tracked adjustment changes the selected eligible batch and its aggregate stock level by the same base-unit delta in one transaction.
3. Every branch-owned stock read is scoped before filtering, aggregation, pagination, and serialization.
4. Supplier balances are never disclosed by `stock.supplier.view` alone.
5. Supplier-item create and removal are branch-safe, auditable, and exposed through a real API.
6. Supplier payments and reversals are discoverable from paginated APIs without inferring IDs from notes or recent rows.
7. Manual adjustment reversal state is explicit in one multi-type paginated history API.
8. A percentage-only BANK expense succeeds through the legacy Treasury adapter, while any failed nested step rolls back the entire direct-pay operation.

## 1. Common authorization, branch, and error rules

### 1.1 Permission rules

- Enforce permission keys at the endpoint. Do not authorize by role name.
- A missing permission returns `403 PERMISSION_DENIED`.
- A missing or unresolved actor branch returns `403 BRANCH_SCOPE_REQUIRED`.
- A direct lookup of an object belonging to another branch returns `404 NOT_FOUND`; do not reveal that the ID exists.
- An explicit filter containing a location, item, supplier, or other resource outside the actor branch returns `403 STOCK_SCOPE_FORBIDDEN`. Do not silently return an empty result for an unauthorized filter.
- A global administrator must select an explicit target branch unless the request already has one unambiguous server-owned branch context. Never interpret an empty branch as permission to aggregate all branches.

### 1.2 Error envelope

All endpoints in this document use:

```json
{
  "success": false,
  "code": "STABLE_MACHINE_CODE",
  "message": "Safe operator-facing message.",
  "errors": {
    "field_name": ["Field-level explanation."]
  },
  "details": {}
}
```

Use `422` for malformed or semantically invalid input, `409` for a valid command that conflicts with current locked state, `403` for permission/scope failures, and `404` for a branch-scoped direct lookup that is not visible to the actor. Never return a partial success after one ledger or inventory write fails.

### 1.3 Numeric and idempotency rules

- Quantities are positive base-10 values with at most four decimal places. Responses use canonical decimal strings such as `"12.5000"` and never scientific notation.
- UZS amounts are whole JSON integer numbers. Do not send formatted strings such as `"100 000"`.
- Reject booleans, exponent forms, `NaN`, infinity, blank required values, and out-of-range values.
- `Idempotency-Key` is required for every adjustment, reversal, supplier payment, supplier-payment reversal, and direct Treasury expense.
- Same key, actor, branch, operation, target, and canonical payload returns the original status and body. Reusing the key with a different payload returns `409 IDEMPOTENCY_KEY_REUSED`.

## 2. Manual stock adjustment integrity

Keep these canonical mutation endpoints:

```text
POST /api/admins/stock/adjust/
Permission: stock.adjustment.approve
Idempotency-Key: required

POST /api/admins/stock/adjust/{transaction_id}/reverse/
Permission: stock.adjustment.approve
Idempotency-Key: required
```

The adjustment endpoint accepts only `ADJUSTMENT_PLUS`, `ADJUSTMENT_MINUS`, `WASTE`, and `SPOILAGE`. `reason` is required and must remain in the immutable transaction audit.

### 2.1 Canonical create payload

```json
{
  "stock_item_id": 41,
  "location_id": 7,
  "unit_id": 3,
  "batch_id": 88,
  "movement_type": "WASTE",
  "quantity": "2.5000",
  "reason": "Damaged during unloading"
}
```

`batch_id` is required when `StockItem.track_batches=true`. It must be rejected when the item is not batch tracked; an unrelated batch must never be accepted merely as transaction annotation.

### 2.2 Locked available-quantity invariant

For `ADJUSTMENT_MINUS`, `WASTE`, `SPOILAGE`, and a reversal whose resulting movement is outgoing, lock the aggregate `StockLevel` and calculate:

```text
available_quantity = quantity - reserved_quantity
required_quantity  = absolute signed base-unit delta
```

Reject the command unless `required_quantity <= available_quantity`. Checking only `StockLevel.quantity` is incorrect. A successful write must always preserve:

```text
0 <= StockLevel.reserved_quantity <= StockLevel.quantity
```

The check and update must occur under the same row lock and transaction. Do not rely on the value previously returned to the frontend.

On conflict return:

```json
{
  "success": false,
  "code": "INSUFFICIENT_AVAILABLE_STOCK",
  "message": "The selected location has insufficient unreserved stock.",
  "errors": {
    "quantity": ["Quantity exceeds unreserved stock."]
  },
  "details": {
    "on_hand_quantity": "10.0000",
    "reserved_quantity": "8.0000",
    "available_quantity": "2.0000",
    "required_quantity": "3.0000"
  }
}
```

Status: `409`.

### 2.3 Batch eligibility and reservation invariant

Inside the same atomic block, load the batch with `select_for_update` and require all of the following:

- batch, item, and location have the actor branch;
- batch belongs to the selected item and location;
- item is batch tracked;
- `batch.status == AVAILABLE`;
- `batch.quality_status == PASSED`;
- `batch.expiry_date` is null or is on/after the current `Asia/Tashkent` local date;
- `0 <= batch.reserved_quantity <= batch.current_quantity` before and after the command;
- for an outgoing delta, `required_quantity <= batch.current_quantity - batch.reserved_quantity`;
- the aggregate level also has enough unreserved quantity;
- the selected unit is the item's base unit or an active `StockItemUnit` configured for that item.

Use these stable failures:

| Condition | Status | Code |
|---|---:|---|
| tracked item without batch | 422 | `STOCK_BATCH_REQUIRED` |
| untracked item with batch | 422 | `STOCK_BATCH_NOT_ALLOWED` |
| wrong item/location/branch | 422 | `STOCK_BATCH_SCOPE_INVALID` |
| status is not `AVAILABLE` | 409 | `STOCK_BATCH_NOT_AVAILABLE` |
| quality is not `PASSED` | 409 | `STOCK_BATCH_QUALITY_BLOCKED` |
| expired batch | 409 | `STOCK_BATCH_EXPIRED` |
| insufficient unreserved batch quantity | 409 | `INSUFFICIENT_AVAILABLE_BATCH_STOCK` |
| pre-existing level/batch reservation corruption | 409 | `STOCK_INTEGRITY_CONFLICT` |

Update `StockBatch.current_quantity` and `StockLevel.quantity` by exactly the same signed base quantity. Reservations are not modified by an adjustment. If either save, transaction creation, audit creation, or idempotency completion fails, roll back both quantities and all related rows.

For a batch-tracked item/location, validate that the aggregate active batch quantity and reservations remain coherent with the level. If legacy data is already inconsistent, reject the mutation with `STOCK_INTEGRITY_CONFLICT` and report it for reconciliation; do not make the discrepancy larger.

### 2.4 Reversal rules

The reversal body is:

```json
{
  "reason": "Original adjustment was entered against the wrong item"
}
```

Required behavior:

- Lock the original transaction and the possible existing reversal first.
- Only an original direct `StockAdjustment` or `StockWaste` transaction can be reversed.
- A reversal row cannot itself be reversed through this endpoint.
- Enforce one reversal per original with the existing one-to-one/database constraint.
- Use the original immutable `base_quantity` snapshot. Do not reconvert the submitted quantity through a unit conversion that may have changed since posting.
- For a batch transaction, lock and mutate the same batch and apply all eligibility and reservation rules from section 2.3.
- Reversing an `ADJUSTMENT_PLUS` is outgoing and must pass both level and batch unreserved-availability checks.
- Reversing `ADJUSTMENT_MINUS`, `WASTE`, or `SPOILAGE` is incoming.
- Preserve the original row. Create a linked `StockAdjustmentReversal` transaction with `reversal_of` set to the original.
- A second reversal with a new key returns `409 STOCK_ADJUSTMENT_ALREADY_REVERSED` and includes `reversal_transaction_id`.

Successful adjustment and reversal responses must include:

```json
{
  "success": true,
  "data": {
    "transaction_id": 501,
    "transaction_number": "TRX-000501",
    "movement_type": "ADJUSTMENT_MINUS",
    "quantity_before": "10.0000",
    "quantity_after": "7.5000",
    "base_quantity_delta": "-2.5000",
    "batch_id": 88,
    "reversal_of_transaction_id": null,
    "is_reversal": false,
    "is_reversed": false,
    "reversal_transaction_id": null
  }
}
```

## 3. Dedicated paginated adjustment history

Add this endpoint; the frontend must not have to fetch four independent transaction lists and merge only their first pages:

```text
GET /api/admins/stock/adjustments/
Permission: stock.adjustment.approve
```

Supported query parameters:

| Parameter | Meaning |
|---|---|
| `page`, `per_page` | Server pagination; maximum `per_page=100`. |
| `types` | Comma-separated subset of `ADJUSTMENT_PLUS,ADJUSTMENT_MINUS,WASTE,SPOILAGE`. Multiple values are one OR filter. |
| `stock_item_id` | Exact authorized-branch item. |
| `location_id` | Exact authorized-branch location. |
| `batch_id` | Exact authorized-branch batch. |
| `date_from`, `date_to` | Inclusive ISO dates in the business timezone. |
| `search` | Transaction number, item name/SKU, reason, or actor name. |
| `reversal_state` | `ALL`, `OPEN`, `REVERSED`, or `REVERSAL`. Default `ALL`. |

Filter first, then count and paginate. Order by `created_at DESC, id DESC`. Return original manual adjustments plus their linked reversal rows. Reject unknown filters or types with field-level `422`; do not silently ignore them.

Each row must use this shape:

```json
{
  "transaction_id": 501,
  "transaction_number": "TRX-000501",
  "movement_type": "WASTE",
  "stock_item": {"id": 41, "name": "Flour", "sku": "RAW-001"},
  "location": {"id": 7, "name": "Main warehouse"},
  "batch": {"id": 88, "batch_number": "FLOUR-20260901"},
  "unit": {"id": 3, "short_name": "kg"},
  "quantity": "2.5000",
  "base_quantity": "2.5000",
  "base_quantity_delta": "-2.5000",
  "quantity_before": "10.0000",
  "quantity_after": "7.5000",
  "unit_cost": "7000.0000",
  "total_cost_uzs": 17500,
  "reason": "Damaged during unloading",
  "actor": {"id": 9, "name": "Warehouse Manager"},
  "created_at": "2026-09-03T10:15:00+05:00",
  "is_reversal": false,
  "reversal_of_transaction_id": null,
  "is_reversed": true,
  "reversal_transaction_id": 509,
  "allowed_actions": [],
  "action_block_reason": "ALREADY_REVERSED"
}
```

`batch` is `null` for unbatched rows. `allowed_actions` is a server-owned record-level decision. It contains `"REVERSE"` only when the actor has permission, the row is an unreversed original, and a reversal is currently eligible. A concurrent mutation may still invalidate it, so the POST endpoint must recheck everything under locks. Stable block reasons include `ALREADY_REVERSED`, `NOT_AN_ADJUSTMENT`, `REVERSAL_ROW`, `INSUFFICIENT_AVAILABLE_STOCK`, `BATCH_NOT_ELIGIBLE`, and `STOCK_INTEGRITY_CONFLICT`.

Response envelope:

```json
{
  "success": true,
  "data": {
    "adjustments": [],
    "pagination": {
      "page": 1,
      "per_page": 25,
      "total": 151,
      "total_pages": 7
    }
  }
}
```

Also add `is_reversal`, `reversal_of_transaction_id`, `is_reversed`, and `reversal_transaction_id` to the shared stock-transaction serializer used by existing `/transactions/` and `/transactions/item/{id}/` responses. This makes compatibility readers truthful even when they do not use the new endpoint.

## 4. Branch-scope every stock read

The following audited reads currently must be corrected at minimum:

| Area | Endpoints |
|---|---|
| Items | `GET /items/`, `/items/search/`, `/items/stats/`, `/items/barcode/{barcode}/`, `/items/{id}/` |
| Levels | `GET /levels/`, `/levels/item/{id}/`, `/levels/location/{id}/`, `/low-stock/` |
| Transactions | `GET /transactions/`, `/transactions/item/{id}/`, and the new `/adjustments/` |
| Batches | `GET /batches/`, `/batches/{id}/`, `/batches/expiring/`, `/batches/expired/` |

All paths above retain their current functional permissions (`stock.catalog.view`, `stock.level.view`, `stock.batch.view`, or `stock.manage` as applicable) and additionally require a resolved actor branch.

Implementation requirements:

1. Resolve the actor branch in the view and pass it as a required service/repository argument. Do not depend on `SyncManager` to scope ordinary queries; it intentionally does not.
2. Start every queryset with `branch_id=actor_branch` and `is_deleted=false` for branch-owned models.
3. Validate `stock_item_id`, `location_id`, and `batch_id` filters against the same branch before running the main query.
4. Apply branch scope before search, status/date filters, annotations, totals, counts, ordering, and pagination.
5. Scope nested branch-owned relations too. A corrupted cross-branch relation must never be serialized.
6. Item detail `include_levels`, item suppliers, batch recent transactions, low-stock totals, transaction summaries, expiring counts, expired values, and pagination totals must contain only the selected branch.
7. Global catalog models explicitly marked with `SYNC_PULL_SCOPE='global'`, such as stock units/categories, may remain global. Their joins must not remove the branch restriction on the item/level/batch/link being read.
8. Apply the same rule to every other branch-owned stock read discovered during implementation, even if it is not listed in the table.

Do not solve this by filtering the serialized array after querying. That leaks global totals and produces broken pagination.

## 5. Supplier balance permission boundary

`stock.supplier.view` allows supplier identity, contacts, terms, active state, and product associations. It does not grant access to balances or ledger-derived totals.

Required behavior:

- `GET /api/admins/stock/suppliers/` and `GET /api/admins/stock/suppliers/{id}/` remain available with `stock.supplier.view`.
- Only include `current_balance` and `current_balance_uzs` when the actor also has `stock.supplier.balance.view`.
- When balance permission is absent, omit those fields rather than returning zero. Include `balance_visible: false` so clients can distinguish redaction from a real zero balance.
- When permission is present, include `balance_visible: true` and the authoritative balance fields.
- Any ledger total, supplier-payment object, payment status, or payment action also requires `stock.supplier.balance.view`.
- `GET /suppliers/{id}/ledger/`, payment list, and payment detail return `403` without `stock.supplier.balance.view`.
- Supplier payment and reversal require both `stock.supplier.pay` and `stock.supplier.balance.view`; do not treat one key as implicitly granting the other.
- Supplier search, item-to-supplier lookup, nested supplier serialization, exports, and Money Control serializers must use the same redaction helper. Do not leave an alternate serializer that exposes the value.

Add permission-matrix tests with a user holding only `stock.supplier.view`, only `stock.supplier.balance.view`, both, and neither.

## 6. Secure supplier-item create and removal

Keep create and add a real item-specific endpoint:

```text
POST /api/admins/stock/suppliers/{supplier_id}/items/
Permission: stock.manage

DELETE /api/admins/stock/suppliers/{supplier_id}/items/{supplier_item_id}/
Permission: stock.manage
```

The create body remains compatible with the current contract:

```json
{
  "stock_item_id": 41,
  "unit_id": 3,
  "price": "7000.0000",
  "currency": "UZS",
  "supplier_sku": "SUP-FLOUR-25",
  "supplier_name": "Flour 25 kg",
  "min_order_qty": "1.0000",
  "pack_size": "25.0000",
  "lead_time_days": 2,
  "is_preferred": true,
  "notes": "Order before noon"
}
```

Inside one transaction, explicitly scope and lock:

- active, non-deleted supplier by `supplier_id` and actor branch;
- active, non-deleted stock item by `stock_item_id` and actor branch;
- the selected active global unit;
- the item's base/alternative-unit relation proving that the unit is configured for the item;
- existing active or soft-deleted link for this supplier/item;
- all active preferred links for this item and branch when `is_preferred=true`.

Write `SupplierStockItem.branch_id` explicitly from the actor/supplier branch. Never let a cloud default or blank branch choose the ownership. Require supplier and item to have the same branch. Clear preferred status only for active links belonging to that item and branch.

Validation requirements:

- price, minimum order quantity, and pack size use base-10 Decimal and at most four decimal places;
- price is non-negative; order quantity and pack size are greater than zero;
- link currency is a supported three-letter currency and matches the supplier's currency for this workflow;
- unit must be the item base unit or an active configured alternative unit;
- duplicate active link returns `409 SUPPLIER_ITEM_ALREADY_EXISTS`;
- wrong-branch direct IDs return `404` without mutation;
- incompatible unit returns `422 SUPPLIER_ITEM_UNIT_INVALID`.

Removal rules:

- Verify that `supplier_item_id` belongs to the supplier in the URL and to the actor branch.
- Use soft deletion compatible with sync/audit history; never delete past purchase/receiving evidence.
- If a non-terminal purchase order or receiving still depends on the link, return `409 SUPPLIER_ITEM_IN_USE` with safe reference counts.
- If the removed link was preferred, do not silently choose a replacement. Leave none preferred unless a separate explicit command selects one.
- Re-adding the same supplier/item may safely restore and overwrite the soft-deleted link after validation, rather than creating an ambiguous duplicate.
- Audit create, restore, preferred change, and removal with actor, branch, supplier ID, stock item ID, link ID, and before/after values.

Success response for DELETE:

```json
{
  "success": true,
  "data": {
    "supplier_item_id": 71,
    "supplier_id": 12,
    "stock_item_id": 41,
    "is_deleted": true
  },
  "message": "Item removed from supplier"
}
```

## 7. Supplier payment and reversal discoverability

Preserve the existing funded payment and reversal commands, and make the collection readable:

```text
GET  /api/admins/stock/suppliers/{supplier_id}/payments/
Permission: stock.supplier.balance.view

POST /api/admins/stock/suppliers/{supplier_id}/payments/
Permissions: stock.supplier.pay AND stock.supplier.balance.view
Idempotency-Key: required

GET  /api/admins/stock/suppliers/{supplier_id}/payments/{payment_id}/
Permission: stock.supplier.balance.view

POST /api/admins/stock/suppliers/{supplier_id}/payments/{payment_id}/reverse/
Permissions: stock.supplier.pay AND stock.supplier.balance.view
Idempotency-Key: required

GET  /api/admins/stock/suppliers/{supplier_id}/ledger/
Permission: stock.supplier.balance.view
```

### 7.1 Payment list

The GET collection supports `page`, `per_page` (maximum 100), `status`, `source_account`, `date_from`, and `date_to`. Filter before pagination and order by `paid_at DESC, id DESC`.

Return the same canonical payment representation as payment detail, plus:

```json
{
  "success": true,
  "data": {
    "payments": [
      {
        "payment_id": 88,
        "status": "POSTED",
        "supplier": {"id": 12, "name": "Fresh Foods LLC"},
        "principal_uzs": 1200000,
        "fee_uzs": 12000,
        "total_debited_uzs": 1212000,
        "source_account": "BANK",
        "supplier_transaction_id": 501,
        "treasury_transaction_id": 9110,
        "supplier_reversal_transaction_id": null,
        "treasury_reversal_transaction_id": null,
        "paid_at": "2026-09-03T10:15:00+05:00",
        "reversed_at": null,
        "reversal_reason": null,
        "allowed_actions": ["REVERSE"],
        "action_block_reason": null
      }
    ],
    "pagination": {
      "page": 1,
      "per_page": 25,
      "total": 1,
      "total_pages": 1
    }
  }
}
```

`allowed_actions` contains `REVERSE` only for a funded `POSTED` payment in the actor branch when the actor has both required permissions and all linked rows are present. `REVERSED` and `LEGACY_UNFUNDED` payments return no reverse action and a stable block reason.

Payment detail and reversal responses must include all four original/reversal ledger IDs, current `status`, `reversed_at`, `reversal_reason`, `action_history`, `allowed_actions`, and `action_block_reason`. The client must never discover a payment ID by parsing a note or treating supplier ID in `reference_id` as a payment ID.

### 7.2 Ledger row links and signs

Extend each supplier ledger row with:

```json
{
  "id": 502,
  "type": "PAYMENT_REVERSAL",
  "supplier_payment_id": 88,
  "payment_status": "REVERSED",
  "principal_uzs": 1200000,
  "change_uzs": 1200000,
  "fee_uzs": -12000,
  "source_total_change_uzs": 1212000,
  "is_reversal": true,
  "reversal_of_transaction_id": 501,
  "reversal_transaction_id": null,
  "allowed_actions": [],
  "action_block_reason": "PAYMENT_REVERSED"
}
```

Sign contract:

| Row type | `principal_uzs` | `change_uzs` payable delta | `fee_uzs` fee delta | `source_total_change_uzs` |
|---|---:|---:|---:|---:|
| `PAYMENT` | positive magnitude | negative | positive | `-(principal + fee)` |
| `PAYMENT_REVERSAL` | positive magnitude | positive | exact negative of original fee | exact positive original principal plus fee |

For example, a BANK payment of 1,200,000 with 12,000 fee has `source_total_change_uzs=-1212000`; its reversal has `source_total_change_uzs=1212000`. The filtered ledger fee total is the signed sum, so a payment and full reversal net to zero fee.

Derive `supplier_payment_id` and reversal links from the protected `SupplierPayment.supplier_transaction` and `SupplierPayment.supplier_reversal` relations. Do not rewrite append-only `SupplierTransaction` rows merely to change their legacy generic `reference_type/reference_id`. New payments must always persist both protected links atomically. Fetch the relations with `select_related`/prefetching so ledger serialization does not create an N+1 query.

For an original `PAYMENT` ledger row, `allowed_actions` mirrors the linked payment. Reversal rows and unrelated ledger types return no payment action.

## 8. Treasury percentage-only direct expense and rollback

Keep the compatibility adapter:

```text
POST /api/admins/treasury/expense
Permission: expense.direct.pay
Idempotency-Key: required
```

This must remain a thin adapter to the canonical Expense create -> approve -> pay lifecycle. It must not create a second expense or Treasury implementation.

### 8.1 Preserve omission of fee fields

The view and `ExpenseService.direct_pay` must distinguish an omitted field from numeric zero. Do not default an absent `fee_uzs`, `fee`, or `commission` to `0` before the mutual-exclusivity check.

Valid percentage-only request:

```json
{
  "category_id": 17,
  "amount_uzs": 350000,
  "source_account": "BANK",
  "fee_percent": "1.5",
  "description": "August internet invoice",
  "expense_date": "2026-09-03"
}
```

Expected fee is `5250`, calculated with `Decimal` and `ROUND_HALF_UP`. Persist the submitted `fee_percent` snapshot and calculated `fee_uzs`; debit BANK by `355250`.

Rules:

- both fee inputs omitted: fee is zero;
- only `fee_uzs` supplied: use that whole UZS amount;
- only `fee_percent` supplied: calculate the fee;
- both supplied, including an explicitly supplied zero amount: `422 VALIDATION_ERROR` on both fields;
- a non-zero fee or percentage-derived fee is BANK-only; SAFE/DRAWER returns `422 FEE_BANK_ONLY`;
- percentage is 0 through 100 with at most four decimal places;
- category must be active and allowed for the chosen source.

### 8.2 Atomic rollback

Wrap the entire direct adapter lifecycle in one outer `transaction.atomic`. After create, approve, pay, and every nested Treasury/cashbox call, treat either `status >= 400` **or** `result.success != true` as failure, call `transaction.set_rollback(True)`, and return the original safe error. Exceptions must also roll back naturally.

A failed operation must leave all of these unchanged:

- `Expense` and transition rows;
- `TreasuryAccount` balance;
- `TreasuryTransaction` rows;
- cashbox expense/payment rows;
- idempotency completion state and audit rows.

The success body is the canonical expense payment result and includes `expense_id`, `amount_uzs`, `fee_percent`, `fee_uzs`, `total_debited_uzs`, `source_account`, and the one linked Treasury/cashbox transaction ID.

## 9. Default role-template parity

Update the backend `DEFAULT_ROLE_PERMISSIONS` templates to match the permissions
needed by the delivered warehouse/money workflows. In particular, the default
`MANAGER` role must include `stock.catalog.view` anywhere it includes
`stock.manage`; otherwise a newly created Manager can reach stock management but
cannot load the catalog needed to use it. Keep backend defaults and the Admin
Panel reset templates in `src/pages/settings/roles.vue` identical.

Add a backend test that creates or resets a Manager using the default template
and asserts that the resulting effective permission list includes
`stock.catalog.view`. Do not require an operator to repair each new Manager role
manually in the frontend.

## 9A. Data repair and migration requirements

Before enabling the new actions in production:

1. Backfill blank `SupplierStockItem.branch_id` only when supplier and stock item have the same non-empty branch. Report mismatches for manual repair; do not guess.
2. Report active supplier-item links whose supplier and item branches differ, whose unit is not configured for the item, or where more than one active preferred supplier exists for an item/branch.
3. Verify every funded `SupplierPayment` has its original Treasury and supplier transaction, and every reversed payment has both reversal links.
4. Report `SupplierTransaction` PAYMENT/PAYMENT_REVERSAL rows that cannot be associated with exactly one payment. Do not fabricate reverse capability for legacy unfunded rows.
5. Report levels where reserved exceeds on-hand and tracked item/location totals that disagree with active batches. Do not auto-correct financial or stock quantities during schema migration.
6. Add indexes needed for branch-first reads and history ordering, justified by query plans. At minimum review `(branch_id, created_at)`, `(branch_id, movement_type, created_at)`, and supplier payment/ledger branch indexes.

Provide a dry-run report before applying any corrective data command. Ledger corrections must use reviewed append-only reversal/adjustment commands, never direct row edits.

## 10. Required acceptance tests

Tests must assert database state as well as response bodies. Concurrency tests must use separate real database transactions; calling the service twice sequentially is not a concurrency test.

### 10.1 Adjustment and reservation tests

1. Level `quantity=10`, `reserved=8`; outgoing 3 returns `409 INSUFFICIENT_AVAILABLE_STOCK` and leaves every row unchanged.
2. Outgoing exactly 2 succeeds and preserves `reserved <= quantity`.
3. Two concurrent outgoing commands that each pass an unlocked precheck cannot together consume reserved stock; at most the safe command set commits.
4. Reversing a PLUS adjustment obeys the same unreserved-level check.
5. A failed transaction/audit write rolls back level and transaction creation.

### 10.2 Batch tests

1. Tracked item without `batch_id` is rejected; untracked item with `batch_id` is rejected.
2. Wrong branch, item, or location batch is rejected without disclosing cross-branch data.
3. `QUARANTINE`, `RESERVED`, `EXPIRED`, `CONSUMED`, failed-quality, and date-expired batches are rejected.
4. Batch `current=10`, `reserved=8`; outgoing 3 is rejected even when the aggregate level has more available stock.
5. Aggregate level with insufficient unreserved stock rejects even when the selected batch alone has enough.
6. PLUS and safe outgoing operations update batch and level by identical base-unit deltas and preserve reservations.
7. Alternative-unit adjustment uses the configured conversion once; reversal uses the stored original base quantity even after the conversion record changes.
8. Concurrent adjustment/reservation and adjustment/quarantine attempts cannot violate eligibility or `reserved <= current`.
9. Any failure leaves batch, level, transaction, audit, and idempotency state unchanged.

### 10.3 Branch read tests

Create two branches with similarly named items, locations, batches, and transactions. For every endpoint listed in section 4:

1. branch A receives no branch B row, nested object, count, sum, summary, or pagination total;
2. direct branch B IDs return `404` to branch A;
3. branch B filter IDs return `403` to branch A;
4. unresolved branch returns `403 BRANCH_SCOPE_REQUIRED`;
5. an explicit global-admin target branch returns only that branch;
6. query-count assertions prevent new N+1 behavior.

### 10.4 Supplier permissions and supplier-item tests

1. `stock.supplier.view` alone receives identity/catalog data, `balance_visible=false`, and no balance fields through list, detail, search, or nested serializers.
2. Adding `stock.supplier.balance.view` exposes the authoritative balance and permits ledger/payment reads.
3. Ledger/payment endpoints return `403` without balance permission.
4. Payment/reversal returns `403` unless both pay and balance permissions are present, with no mutation.
5. Cross-branch supplier, item, link, and preferred-state attacks return `404` and change nothing.
6. Incompatible unit is rejected; configured base/alternative units succeed.
7. Preferred clearing is limited to the same branch/item.
8. DELETE soft-removes the exact URL-scoped link; a repeated delete is idempotent or returns one documented `404`, never removes another link.
9. An in-use link returns `409 SUPPLIER_ITEM_IN_USE`; historical evidence remains readable.
10. Safe re-add restores a deleted link without duplicates.

### 10.5 Supplier payment discovery tests

1. Payment collection pagination/filtering totals cover the full filtered branch result.
2. Ledger PAYMENT row exposes the real `supplier_payment_id`, `POSTED`, and `REVERSE` only when eligible.
3. Reversal changes payment status to `REVERSED`, removes the action, and cross-links both reversal transactions.
4. Original ledger row exposes `reversal_transaction_id`; reversal row exposes `reversal_of_transaction_id`.
5. A payment of 1,200,000 plus 12,000 fee serializes signed source delta `-1212000`; reversal serializes `1212000` and fee `-12000`; net fee total is zero.
6. A second reversal is a deterministic `409` and creates no additional row.
7. Another branch cannot list, inspect, or reverse the payment.
8. Payment and ledger list query counts remain bounded.

### 10.6 Adjustment history tests

1. One request returns all four manual movement types in deterministic global order.
2. Filters are applied before pagination and total calculation.
3. Original/reversal links and `is_reversed` fields remain correct outside the first page.
4. `allowed_actions` is correct for open, reversed, reversal, blocked-reservation, and ineligible-batch records.
5. Existing transaction endpoints expose the four reversal metadata fields.
6. Cross-branch rows and totals never appear.

### 10.7 Treasury direct-expense tests

1. BANK request with only `fee_percent="1.5"` succeeds for 350,000, stores fee 5,250, and debits 355,250.
2. Omitted fee fields produce zero fee.
3. Explicit `fee_uzs=0` plus `fee_percent` is rejected as two supplied modes.
4. SAFE/DRAWER non-zero fee is rejected without mutation.
5. Invalid/inactive category, approval failure, account insufficiency, Treasury failure, and cashbox failure each leave no orphan Expense, transition, ledger, audit, or completed idempotency result.
6. Same key/same body replays one payment; same key/different body returns `409`.
7. Two concurrent identical commands create and debit exactly once.

### 10.8 Default-role tests

- A Manager created from backend defaults receives `stock.catalog.view` together
  with `stock.manage`.
- Backend defaults and the documented Admin Panel reset template contain the same
  stock/money permission set.

## 11. Delivery evidence

The backend handoff must include:

- server and core commit hashes;
- migration names and migration-drift result;
- exact list of changed endpoints;
- focused test command and passing test count;
- concurrency-test database engine used;
- permission matrix result;
- branch-isolation result for every endpoint in section 4;
- dry-run data-quality report and any unresolved production rows;
- public health result after deployment.

Do not report this follow-up complete while any endpoint still relies on frontend preflight, recent-page inference, role-name authorization, an unscoped repository call, or a partial-write error path.
