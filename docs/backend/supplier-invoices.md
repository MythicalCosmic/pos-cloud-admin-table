# Supplier invoice stock receiving — backend implementation contract

Status: **Ready for backend implementation review**
Product decision date: **2026-09-06**
Frontend repository: `smart-pos-admin_panel`
Backend repository (read-only for frontend agents): `alpha_pos_server`

## 1. Product decision

The primary daily warehouse flow is a **direct supplier invoice receipt**:

1. Select one supplier.
2. Select one destination stock location.
3. Show only active items linked to that supplier.
4. Enter the received quantity and actual invoice unit price for each used item.
5. Calculate each line as `quantity × unit price` and show the invoice total.
6. Post once.
7. In one database transaction, add accepted quantities to stock, update item costs, save the supplier's latest prices, and increase the supplier payable.

A prior Purchase Order is **not required**. Existing Purchase Orders remain available for planned procurement and partial delivery workflows, but they must not be required for the ordinary direct-invoice flow.

This decision supersedes only the earlier requirement that every receiving must begin from a Purchase Order. It does not replace the existing stock ledger, supplier ledger, batching, costing, or permissions architecture.

## 2. Non-negotiable accounting result

Posting a supplier invoice means the business received inventory and now owes the supplier:

- stock quantity increases;
- stock value increases;
- an append-only `PURCHASE_IN` stock transaction is created for every accepted line;
- `Supplier.current_balance` increases by the canonical invoice total;
- one append-only supplier `PURCHASE` ledger transaction is created;
- no operating Expense is created;
- SAFE, BANK, and shift drawers are not changed;
- paying the supplier remains a separate, permission-gated supplier-payment workflow.

Positive supplier balance continues to mean **the business owes the supplier**.

## 3. Reuse the current domain; do not create parallel ledgers

Reuse and strengthen:

- `PurchaseReceiving` and `PurchaseReceivingItem` as the receiving/invoice aggregate;
- optional `PurchaseOrder` and `PurchaseOrderItem` linkage for planned purchases;
- `StockLevel`, `StockTransaction`, `StockBatch`, and existing unit conversion;
- `SupplierStockItem` for supplier-specific catalog and latest price;
- `SupplierTransaction` and `Supplier.current_balance` for payable;
- the existing receiving completion, idempotency, audit, and branch-scoping foundations.

Do not create a second stock balance, stock movement, supplier balance, supplier ledger, or Treasury workflow.

Preferred implementation: add one `DirectPurchaseInvoiceService` aggregate command on top of the hardened receiving completion service. Inside one outer transaction it may create a `DIRECT_INVOICE` Purchase Order and matching Receiving as internal records, then post them through the existing completion engine. The frontend must never orchestrate those internal steps.

Add only the persistence needed to distinguish and audit the document:

- a `document_type`/`source_type` value such as `DIRECT_INVOICE` versus planned `PURCHASE_ORDER`;
- supplier invoice number plus its normalized form;
- supplier invoice date;
- canonical invoice total;
- actor/post time and an immutable versioned posting manifest;
- supplier-item identity and the purchase quantity/unit/price snapshots on every line.

Direct invoices must be excluded from the normal Purchase Order planning list unless explicitly requested. If the backend developer chooses to extend `PurchaseReceiving` instead of creating an internal direct-invoice PO, that is acceptable, but there must still be one receiving system and one set of stock/supplier ledgers.

Before exposing the direct command, fix these audited production blockers in the shared services:

- filter `is_deleted=false` everywhere PO/receiving lines are serialized, totaled, checked, or posted; a soft-deleted receiving line must never add stock or debt;
- parse `order_date`, `received_date`, and `expiry_date` before date arithmetic or serialization;
- preserve and validate `supplier_stock_item_id` in nested line creation;
- reject zero/negative quantity or normal price, invalid percentages, inactive/non-purchasable items, and incompatible units;
- explicitly roll back aggregate creation if any later line fails;
- keep the production completion service's current branch locks, PASSED-only policy, base-unit snapshots, weighted cost, supplier ledger posting, rollback, and idempotent replay behavior.

## 4. V1 scope

V1 is intentionally simple:

- currency: UZS only;
- unit price input: whole UZS;
- invoice total: `sum(quantity × unit_price_uzs)`;
- no separate tax, VAT, header discount, shipping, or other-charge fields;
- the entered unit price is the final invoiced unit price;
- one invoice posts to one supplier and one stock location;
- direct invoice lines represent accepted goods only;
- free/promotional goods are supported only with an explicit `is_free` flag and reason.

Tax, header discounts, delivery charges, multi-currency/FX, multiple destination locations, and invoice attachments are future extensions. Do not guess or silently add them to payable or inventory value.

## 5. Canonical API

Base path: `/api/admins/stock`

### 5.1 Supplier items available for receiving

```text
GET /suppliers/{supplier_id}/receivable-items/?search=&page=1&per_page=100
Permission: stock.supplier.view + stock.catalog.view
```

Return only active, non-deleted, purchasable supplier links, stock items, and units in the actor's branch. Each row must include:

```json
{
  "supplier_item_id": 71,
  "supplier_id": 12,
  "stock_item_id": 44,
  "stock_item_name": "Donar go'sht",
  "stock_item_sku": "AUG26-DONAR-GOSHT",
  "item_type": "RAW",
  "purchase_unit": {
    "id": 2,
    "name": "Kilogram",
    "short_name": "kg",
    "decimal_places": 3,
    "conversion_to_base": 1
  },
  "base_unit": {
    "id": 2,
    "name": "Kilogram",
    "short_name": "kg"
  },
  "suggested_unit_price_uzs": 100000,
  "price_is_known": true,
  "last_price_update": "2026-09-06T10:00:00+05:00",
  "track_batches": false,
  "track_expiry": false,
  "default_expiry_days": null,
  "current_stock_base_quantity": 10
}
```

Rules:

- `suggested_unit_price_uzs` is `null` when the supplier price is unknown.
- Do not expose the imported placeholder zero as a known price.
- Include no supplier balance unless the actor also has `stock.supplier.balance.view`.
- Apply search/filtering before pagination and return canonical pagination metadata.
- Order by stock item name and stable link ID.

### 5.2 Invoice endpoints

```text
GET   /purchase-invoices/
POST  /purchase-invoices/receive/         # create and post in one atomic command
GET   /purchase-invoices/{invoice_id}/
POST  /purchase-invoices/{invoice_id}/reverse/
```

The primary frontend action uses `POST /purchase-invoices/receive/`. The user must not need six sequential PO/receiving requests. Persisted invoice drafts are outside v1; the frontend preserves an unsubmitted form locally while the modal is open.

Require `Idempotency-Key` on receive and reverse.

### 5.3 Create/post request

```json
{
  "supplier_id": 12,
  "location_id": 2,
  "invoice_date": "2026-09-06",
  "supplier_invoice_number": "INV-104",
  "currency": "UZS",
  "declared_total_uzs": 500000,
  "notes": "",
  "lines": [
    {
      "supplier_item_id": 71,
      "quantity": 5,
      "unit_price_uzs": 100000,
      "is_free": false,
      "free_reason": "",
      "batch_number": "",
      "expiry_date": null,
      "notes": ""
    }
  ]
}
```

JSON values are unformatted numbers. The frontend may display `100 000`, but it sends `100000`.

The frontend calculates and sends `declared_total_uzs` for confirmation. The backend independently recalculates every line and rejects a mismatch. The client does not send line totals, payable, base quantity, base cost, supplier balance, stock-before/after, or workflow status as authoritative values.

### 5.4 Canonical posted response

```json
{
  "success": true,
  "data": {
    "invoice": {
      "id": 91,
      "receiving_number": "RCV-20260906-0001",
      "supplier_invoice_number": "INV-104",
      "source_type": "DIRECT_INVOICE",
      "status": "POSTED",
      "invoice_date": "2026-09-06",
      "posted_at": "2026-09-06T10:30:00+05:00",
      "supplier": { "id": 12, "name": "Donar go'sht" },
      "location": { "id": 2, "name": "Main warehouse" },
      "currency": "UZS",
      "line_count": 1,
      "subtotal_uzs": 500000,
      "total_uzs": 500000,
      "lines": [
        {
          "id": 101,
          "supplier_item_id": 71,
          "stock_item_id": 44,
          "stock_item_name": "Donar go'sht",
          "purchase_quantity": 5,
          "purchase_unit": "kg",
          "purchase_unit_price_uzs": 100000,
          "base_quantity": 5,
          "base_unit": "kg",
          "base_unit_cost_uzs": 100000,
          "line_total_uzs": 500000,
          "stock_quantity_before": 10,
          "stock_quantity_after": 15,
          "previous_average_cost_uzs": 80000,
          "new_average_cost_uzs": 86666.6667,
          "stock_transaction_id": 501
        }
      ],
      "supplier_transaction_id": 701,
      "purchase_order_id": 130,
      "receiving_id": 72,
      "supplier_balance_before_uzs": 200000,
      "supplier_balance_after_uzs": 700000,
      "created_by": { "id": 9, "name": "Warehouse User" },
      "posted_by": { "id": 9, "name": "Warehouse User" },
      "allowed_actions": []
    }
  }
}
```

Amounts and quantities returned to this frontend must be unformatted JSON numbers. Dates use `YYYY-MM-DD`; datetimes use Asia/Tashkent ISO-8601 offsets.

## 6. Header validation

- Supplier is required, active, non-deleted, and in the actor branch.
- Location is required, active, non-deleted, in the actor branch, and permitted for the actor.
- Currency must be exactly `UZS` in v1.
- Invoice date is required, valid ISO date, and cannot be in the future in Asia/Tashkent.
- Server `posted_at` is always the actual posting timestamp; never copy the invoice date into it.
- Supplier invoice number is optional. Trim it and store a normalized value.
- A non-empty supplier invoice number must be unique per branch and supplier, including historical/reversed documents. Return `409 DUPLICATE_SUPPLIER_INVOICE` instead of silently creating another.
- When the supplier provides no number, require `supplier_invoice_number` to be empty and generate a visible internal invoice number; never invent a supplier number.
- `declared_total_uzs` is required, a non-negative whole UZS integer, and must equal the independently calculated total.
- Notes are optional and limited to 1000 characters.
- At least one valid line is required.

## 7. Line validation

- The client identifies a line by `supplier_item_id`, not an arbitrary stock item ID.
- Under a lock, verify the link belongs to the selected supplier and actor branch.
- Supplier, link, stock item, purchase unit, and base unit must all be active/non-deleted.
- The stock item must be purchasable.
- The purchase unit is taken from the supplier link and is not freely replaceable by the client in v1.
- `pack_size` is a procurement hint only. Never multiply stock implicitly by `pack_size`. If a box/bag must convert to base stock, configure a real item unit conversion.
- Quantity must be finite, greater than zero, within model limits, and use no more decimals than the unit permits.
- Normal unit price must be a whole UZS integer greater than zero.
- Zero price is accepted only when `is_free=true` and `free_reason` is non-empty.
- Reject negative values, booleans, empty numeric strings, exponent notation, NaN, and infinity with field-level errors.
- Prevent duplicate supplier-item lines unless distinct batch/expiry lots are intentionally required. Same item/unit/batch/expiry must be merged or rejected, never double-posted accidentally.
- For a batch-tracked item, batch number is required.
- For an expiry-tracked item, expiry date is required and must be later than the invoice date.
- Direct-invoice lines are accepted goods. Set quality to `PASSED`. Rejected/pending goods do not belong in the posted direct invoice and must not affect available stock or payable.

## 8. Authoritative totals and rounding

Use `Decimal`; never binary float.

For each line:

```text
line_total_uzs = round_half_up(quantity × purchase_unit_price_uzs, 1 UZS)
```

For the invoice:

```text
subtotal_uzs = sum(line_total_uzs)
total_uzs    = subtotal_uzs
```

Free lines have zero line total. Reject a negative or overflowed total. The canonical supplier payable increase is exactly `total_uzs`.

## 9. Unit conversion and automatic cost update

The supplier price and inventory cost are different representations and both must be saved.

### 9.1 Immutable invoice price

Every posted line permanently stores:

- purchase quantity;
- purchase unit and its conversion snapshot;
- actual purchase unit price;
- line total;
- calculated base quantity;
- calculated base-unit cost.

Later catalog price changes must never rewrite historical invoice lines.

### 9.2 Supplier's latest price

After a successful post of a normal paid line:

- set `SupplierStockItem.price` to the submitted purchase-unit price;
- set currency to UZS;
- set `last_price_update` and the source invoice reference;
- mark the price explicitly known, for example `price_is_known=true` and `price_source=INVOICE`;
- remove only the exact temporary unknown-price marker from imported link notes while preserving any other note text.

Do not update the supplier's known price from a free/promotional line. Do not update supplier prices before the complete receive transaction commits successfully.

For a backdated invoice, keep the line history but do not replace the current suggested price when a newer non-reversed invoice price already exists. Compare invoice date, posted timestamp, and stable invoice ID deterministically.

### 9.3 Stock item's latest and weighted-average cost

Convert before costing:

```text
base_quantity       = purchase_quantity × conversion_to_base
base_unit_cost_uzs  = line_total_uzs ÷ base_quantity
```

Group all lines for the same stock item and update once under locks:

```text
new_average =
  ((old_base_quantity × old_average_cost)
   + received_inventory_value)
  ÷ (old_base_quantity + received_base_quantity)
```

- `StockItem.last_cost_price` becomes the newest posted base-unit cost.
- `StockItem.avg_cost_price` becomes the perpetual weighted average, rounded to four decimals.
- The stock item list/detail and recipe costing must use `avg_cost_price` as the current inventory cost.
- Keep the legacy/manual `cost_price` field unchanged until its product meaning is formally retired; do not silently overwrite manual configuration.
- If old quantity is zero, the new average is the received base-unit cost.
- If positive old stock has no valid cost basis, fail closed with `STOCK_COST_BASIS_MISSING`; do not silently value old stock at zero.
- Do not mix purchase-unit quantity with base-unit price or base quantity with purchase-unit price.

Example:

- existing stock: 10 kg at average 80,000 UZS/kg;
- invoice: 5 kg at 100,000 UZS/kg;
- stock becomes 15 kg;
- latest cost becomes 100,000 UZS/kg;
- new average becomes `(10×80,000 + 5×100,000) / 15 = 86,666.6667` UZS/kg;
- supplier latest price becomes 100,000 UZS/kg;
- supplier payable increases by 500,000 UZS.

## 10. Price-change protection

When a supplier item has a known prior price, calculate the percentage change.

- When confirmation is required, return old price, new price, difference, and percentage in the `409 PRICE_CHANGE_CONFIRMATION_REQUIRED` response.
- A change of 30% or more requires `price_change_confirmed=true` and a non-empty reason on that line before posting.
- This confirmation is an audit safeguard, not a reason to overwrite the invoice's real price.
- Unknown placeholder prices do not trigger the comparison.
- A price warning or failed validation must not change supplier price, stock cost, stock quantity, or supplier balance.

## 11. Atomic post sequence

`POST /purchase-invoices/receive/` must execute as one database transaction:

1. Resolve authenticated actor and branch; do not accept branch ownership from the request body.
2. Lock supplier, location, supplier-item links, stock items, affected stock levels/batches, and supplier balance rows in deterministic ID order.
3. Revalidate all header and line rules under those locks.
4. Calculate canonical quantities, costs, line totals, and invoice total, and compare it with `declared_total_uzs`.
5. Create the internal direct-invoice PO/receiving records, or equivalent receiving-backed document, without exposing a fake send/confirm lifecycle.
6. Persist the immutable invoice/receiving snapshots.
7. Create batches where required.
8. Add base quantities to the destination stock level.
9. Create exactly one `PURCHASE_IN` stock transaction per posted lot. Its unit cost is per base unit and its total cost equals the line inventory value.
10. Update grouped stock-item latest/average cost.
11. Update supplier-specific latest prices.
12. Create one supplier `PURCHASE` ledger row for the invoice total and update `Supplier.current_balance`.
13. Mark the invoice posted and save actor/time/idempotency/posting-manifest evidence.
14. Return the canonical posted result.

Any failure rolls back every header, line, batch, stock level, stock transaction, cost, supplier price, PO status, supplier ledger, supplier balance, audit, and idempotency completion change.

All soft-deleted rows must be excluded explicitly. Do not use unfiltered reverse related managers for totals or posting.

## 12. Idempotency and concurrency

- Scope idempotency by actor, branch, operation, and target or create-command identity.
- Store a canonical payload hash and the completed status/body.
- Same key and same canonical payload returns the exact original response and IDs.
- Same key with different data returns `409 IDEMPOTENCY_KEY_REUSED`.
- Two concurrent submissions with the same business/idempotency identity produce one posted invoice, one set of stock movements, and one supplier ledger row.
- Add database uniqueness for the posting identity and supplier ledger reference.
- Lock all stock items/levels in sorted ID order to avoid deadlocks.

## 13. Permissions

Add explicit permissions; do not require broad `stock.manage`:

| Permission | Purpose |
|---|---|
| `stock.purchase_invoice.view` | List and view direct invoices in the actor branch. |
| `stock.purchase_invoice.receive` | Atomically create and post a direct supplier invoice. |
| `stock.purchase_invoice.correct` | Manager/Admin-only reversal or correction. |

The default Warehouse template receives view and receive. Manager/Admin receive branch-wide view and correction. Supplier payment, Treasury, expense, direct stock adjustment, supplier master-data mutation, and permissions management remain unavailable to Warehouse.

The automatic supplier-price update is an internal consequence of a valid invoice post and does not require granting Warehouse general supplier catalog edit access.

Return canonical `allowed_actions` per record. Direct API calls outside permission or branch scope return 403/404 with no mutation; never return a successful empty result for a forbidden target.

## 14. Posted and correction behavior

- Posted invoices are immutable.
- A posted mistake is never fixed by editing/deleting stock or ledger history.
- V1 correction is a Manager/Admin-only linked full reversal with a mandatory reason and idempotency key.
- Reversal creates compensating stock and supplier-ledger records, preserves the original, and recomputes the latest non-reversed supplier price.
- Block reversal when the backend cannot safely prove the received quantity remains available/unconsumed. Return the affected items/batches with `409 INVOICE_REVERSAL_STOCK_CONSUMED`.
- After reversal, the user may create a corrected replacement invoice linked to the original.
- Partial line/value correction may be added later only as an append-only delta workflow; never mutate posted rows in place.

## 15. List/detail contract

`GET /purchase-invoices/` supports server-side filters before pagination:

- search by internal receiving number or supplier invoice number;
- supplier;
- location;
- status;
- invoice date range;
- posted date range;
- stock item;
- creator/poster.

List rows include internal number, supplier invoice number, supplier, location, invoice date, post time, line count, total, status, creator/poster, and allowed actions. Supplier balance fields remain permission-gated.

Detail includes canonical lines, snapshots, totals, stock transaction IDs, supplier transaction ID, balance before/after when permitted, action history, reversal/replacement links, and allowed actions. Avoid N+1 queries.

## 16. Stable errors

At minimum support:

- `SUPPLIER_NOT_FOUND`
- `LOCATION_NOT_FOUND`
- `SUPPLIER_ITEM_NOT_FOUND`
- `SUPPLIER_ITEM_MISMATCH`
- `UNIT_CONVERSION_MISSING`
- `DUPLICATE_INVOICE_LINE`
- `DUPLICATE_SUPPLIER_INVOICE`
- `PRICE_REQUIRED`
- `PRICE_CHANGE_CONFIRMATION_REQUIRED`
- `BATCH_REQUIRED`
- `EXPIRY_REQUIRED`
- `STOCK_COST_BASIS_MISSING`
- `INVOICE_ALREADY_POSTED`
- `INVOICE_REVERSAL_STOCK_CONSUMED`
- `IDEMPOTENCY_KEY_REQUIRED`
- `IDEMPOTENCY_KEY_REUSED`
- `STOCK_SCOPE_FORBIDDEN`

Return field-level validation errors and a safe user-facing message. Never expose stack traces or silently coerce invalid values to zero.

## 17. Backward compatibility and migration

- Existing PO-based receiving continues to work.
- Existing receiving rows are backfilled with `source_type=PURCHASE_ORDER` and supplier from their Purchase Order.
- Existing stock/supplier ledgers are not rewritten.
- Direct invoices are excluded from the normal Purchase Order planning list unless explicitly requested by document type.
- Add a `price_is_known` (or equivalent explicit state) to supplier items. Backfill the September imported placeholder-price links as unknown using their exact marker; do not treat every legitimate zero/free historical record as a normal known price.
- Do not invent invoice numbers, prices, balances, stock quantities, or financial history in a migration.
- Provide a dry-run migration report and migration drift check.

## 18. Required tests

Backend delivery is not complete without focused tests for:

1. Atomic direct post with one and multiple lines.
2. Existing stock plus weighted-average calculation.
3. Alternative purchase unit conversion into base quantity/cost.
4. Supplier latest price update and unknown-placeholder transition.
5. Free line: stock increases, payable stays zero for that line, known supplier price is preserved.
6. Price-change confirmation threshold and audit reason.
7. Batch/expiry requirements.
8. Supplier mismatch, inactive/deleted records, incompatible unit, duplicate line, duplicate supplier invoice, and future date.
9. PASSED-only direct invoice behavior.
10. Supplier balance before/after and exactly one supplier ledger transaction.
11. Proof that no Expense or Treasury transaction is created.
12. Failure on the last line rolls back all earlier stock/cost/price/debt changes.
13. Exact idempotent replay, changed-payload conflict, and two real concurrent post transactions.
14. Warehouse/Manager/Admin permission matrix and cross-branch ID attacks.
15. Soft-deleted line exclusion from totals and posting.
16. Safe full reversal, blocked consumed-stock reversal, and repeated reversal retry.
17. Existing PO receiving regression tests.
18. List filters/totals before pagination and an N+1 query bound.

## 19. Frontend integration contract

After the backend is delivered, the frontend will make `/stock/receiving` the primary Supplier Invoices page:

- one wide, minimalist invoice editor;
- supplier, destination, invoice date, optional supplier invoice number, and notes;
- searchable supplier-product table;
- `Product | Unit | Quantity | Unit price | Line total | Remove`;
- only rows with a quantity become invoice lines;
- known latest price is suggested but editable;
- unknown imported price stays blank and is required before posting;
- `MoneyInput` displays `100 000` while sending numeric `100000`;
- sticky product count and invoice total;
- changing supplier with entered lines requires confirmation because the lines will be cleared;
- final confirmation explicitly says stock and supplier payable will increase;
- posted records are read-only; correction is a separate Manager/Admin action;
- desktop/mobile, keyboard/focus, light/dark, loading, empty, error, and retry states;
- all visible strings in Uzbek, Russian, and English.

Purchase Orders remain as the advanced planned-purchase flow. The frontend must not emulate atomic posting by chaining the legacy endpoints.

## 20. Backend delivery evidence requested

When ready, the backend developer must provide:

- root and core commit hashes;
- migrations applied;
- exact route list and permission seed changes;
- one successful request/response using the example calculation;
- one exact idempotent replay response;
- one forbidden Warehouse financial action response;
- focused test count and command results;
- production deployment revision and health result.
