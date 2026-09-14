# Backend requirements — product period comparison

Requested: **2026-09-14**
Frontend route: **`/analytics/compare`**
Backend repository: **`alpha_pos_server`**

The frontend is complete against the contract below. Until this endpoint is deployed, it uses deterministic data only for **501** or an endpoint-level **404** (`ANALYTICS_COMPARISON_UNAVAILABLE` or an unstructured missing-route response), and labels that state as **Preview data**. Authentication, permission, product-not-found, validation, and server failures keep their real error state; they do not fall back to preview data.

## Required endpoint

`GET /api/admins/analytics/comparison`

The same endpoint must support the full catalog and one selected product. Do not introduce a second product-only endpoint.

### Query parameters

| Parameter | Required | Format | Meaning |
| --- | --- | --- | --- |
| `a_start` | yes | `YYYY-MM-DD` | Inclusive start of current period A |
| `a_end` | yes | `YYYY-MM-DD` | Inclusive end of current period A |
| `b_start` | yes | `YYYY-MM-DD` | Inclusive start of baseline period B |
| `b_end` | yes | `YYYY-MM-DD` | Inclusive end of baseline period B |
| `granularity` | yes | `day`, `week`, or `month` | Bucket size for `revenue_timeseries` |
| `product_id` | no | existing product identifier | When supplied, scope every aggregate and series to this product |
| `tz` | yes | IANA timezone | Frontend currently sends `Asia/Tashkent` |

Date boundaries must follow the existing business-day rules. For `Asia/Tashkent`, a date represents the configured business day (03:00 by default), not UTC midnight. Both period endpoints are inclusive. Reject invalid or excessive ranges with a structured 400/422 response.

### Product scope

Without `product_id`, calculate normal business totals for the entire catalog.

With `product_id`, calculate every field from orders/order lines that contain that product:

- revenue, net revenue, discounts, refunds, item quantity, and product-derived order count;
- revenue time series;
- hourly and weekday distributions;
- payment-method and order-type mix for qualifying orders;
- hour-by-weekday matrix;
- the selected product row in `products`.

Return 404 with a product-specific error code such as `PRODUCT_NOT_FOUND` only when the comparison endpoint itself is deployed and the identifier is invalid. During rollout, use 501 or a distinct `ANALYTICS_COMPARISON_UNAVAILABLE` code for an unavailable endpoint so it cannot be confused with a missing product.

### Response envelope

Use the standard envelope:

```json
{
  "success": true,
  "data": {
    "selection": {
      "scope": "product",
      "product_id": 42,
      "product_name": "Chicken lavash",
      "category_id": 7,
      "category_name": "Lavash"
    },
    "generated_at": "2026-09-14T10:15:00+05:00",
    "period_a": { "start": "2026-09-01", "end": "2026-09-14", "days": 14 },
    "period_b": { "start": "2026-08-01", "end": "2026-08-14", "days": 14 },
    "kpis": {
      "gross_revenue": { "a": 22500000, "b": 19800000, "delta": 2700000, "delta_pct": 13.6, "is_up_good": true },
      "net_revenue": { "a": 21800000, "b": 19000000, "delta": 2800000, "delta_pct": 14.7, "is_up_good": true },
      "orders": { "a": 390, "b": 352, "delta": 38, "delta_pct": 10.8, "is_up_good": true },
      "items_sold": { "a": 428, "b": 381, "delta": 47, "delta_pct": 12.3, "is_up_good": true },
      "aov": { "a": 55897, "b": 53977, "delta": 1920, "delta_pct": 3.6, "is_up_good": true },
      "avg_items_per_order": { "a": 1.1, "b": 1.08, "delta": 0.02, "delta_pct": 1.9, "is_up_good": true },
      "discounts": { "a": 500000, "b": 560000, "delta": -60000, "delta_pct": -10.7, "is_up_good": false },
      "refunds": { "a": 200000, "b": 240000, "delta": -40000, "delta_pct": -16.7, "is_up_good": false }
    },
    "revenue_timeseries": {
      "granularity": "day",
      "a": [{ "index": 1, "date": "2026-09-01", "value": 1450000 }],
      "b": [{ "index": 1, "date": "2026-08-01", "value": 1290000 }]
    },
    "categories": [{ "id": 7, "name": "Lavash", "a_revenue": 22500000, "b_revenue": 19800000, "a_qty": 428, "b_qty": 381, "delta_pct": 13.6 }],
    "products": [{ "id": 42, "name": "Chicken lavash", "category": "Lavash", "a_qty": 428, "b_qty": 381, "a_revenue": 22500000, "b_revenue": 19800000, "delta_pct": 13.6 }],
    "top_gainers": [{ "name": "Chicken lavash", "a": 22500000, "b": 19800000, "delta": 2700000, "delta_pct": 13.6 }],
    "top_losers": [],
    "by_hour": {
      "a": [{ "hour": 13, "value": 52 }],
      "b": [{ "hour": 12, "value": 44 }]
    },
    "by_weekday": {
      "a": [{ "weekday": 0, "value": 3400000 }],
      "b": [{ "weekday": 0, "value": 3100000 }]
    },
    "hour_weekday": {
      "a": [[0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 5, 8, 14, 18, 15, 9, 7, 9, 12, 15, 13, 8, 4, 1]],
      "b": [[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 9, 16, 15, 12, 8, 6, 8, 11, 13, 11, 7, 3, 1]]
    },
    "payment_methods": {
      "a": [{ "method": "cash", "value": 13080000, "share": 60.0 }],
      "b": [{ "method": "cash", "value": 11780000, "share": 62.0 }]
    },
    "order_types": {
      "a": [{ "type": "dine_in", "value": 242, "share": 62.1 }],
      "b": [{ "type": "dine_in", "value": 226, "share": 64.2 }]
    }
  }
}
```

For full-catalog scope, return `selection.scope = "all_products"`, all product/category rows, and the same aggregate fields. `by_branch` and `by_cashier` may be included using `{ id, name, a, b, delta_pct }` rows.

### Calculation rules

- Money is integer UZS. Avoid binary float values for money in JSON.
- `delta = a - b`.
- `delta_pct = ((a - b) / abs(b)) * 100` rounded consistently to one decimal.
- When `b = 0` and `a > 0`, return `delta_pct: null` (the frontend labels this as New).
- When both values are zero, return `delta_pct: 0`.
- `is_up_good` is `false` for discounts and refunds; it is `true` for sales, orders, units, AOV, profit, and margin.
- `weekday` is `0` for Monday through `6` for Sunday.
- `hour` is an integer from `0` through `23` in the requested timezone.
- Include zero buckets for missing hours/weekdays so periods align consistently.
- Return deterministic ordering: products by A revenue descending, categories by A revenue descending, and time buckets ascending.
- Omit `gross_profit` and `margin_pct` when authoritative COGS is unavailable. Do not estimate them.

### Authorization and errors

- Apply the existing analytics-view permission used by the product analytics routes.
- Enforce product/branch access on the backend; frontend route checks are not a security boundary.
- Preserve the normal 401 and 403 behavior.
- Return structured error fields (`success`, `code`, `message`, and field details where relevant).

### Acceptance checks

1. August 1–31 versus September 1–30 returns independent inclusive business-day totals and correctly aligned time buckets.
2. Supplying `product_id=42` makes the KPI totals reconcile with product 42's row and series.
3. Omitting `product_id` returns the full catalog.
4. Payment and order-type shares in each period total approximately 100%, allowing rounding.
5. Product and category totals reconcile with the documented gross/net basis.
6. Empty valid periods return zero KPIs and empty/zero series with HTTP 200, not 404.
7. A real authentication, permission, validation, or outage error remains distinguishable from an unavailable feature response.

## Dashboard peak-hour and best-product fields

No new dashboard endpoint is required. The frontend consumes the fields already documented in `GET /api/admins/dashboard/today`:

```json
{
  "today": {
    "orders": 42,
    "peak_hour": 13
  },
  "top_products_today": [
    { "product_id": 42, "product_name": "Chicken lavash", "quantity": 28, "revenue": 1400000 }
  ]
}
```

Please verify these fields are present in the deployed response and that `top_products_today` is ordered by the backend's authoritative best-seller rule. The frontend treats the first row as today's winner. `peak_hour` may also use `{ "hour": 13, "orders": 11, "revenue": 690000 }`; the UI will show those supporting values when supplied. Missing fields are shown as unavailable rather than replaced with generated numbers.
