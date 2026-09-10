# Product performance report

Frontend integrated and production reads/downloads verified on 2026-09-10.

Route: `/reports/product-performance`. The existing `/analytics/product-statistics`
route remains available. Sidebar, breadcrumbs and command palette expose the new
report to ADMIN and MANAGER; the router checks these roles. Backend enforcement
remains authoritative. Mobile users reach it through Menu → Analytics.

## API boundary

Configured authenticated client: `/api/admins`.

- `GET /reports/product-performance` returns the on-screen report.
- `GET /reports/product-performance/export?format=xlsx|pdf|csv` generates downloads.
- `GET /categories/active` supplies categories.
- `GET /users?role=CASHIER&per_page=100&page=...` supplies the optional cashier filter.

The shared query builder in `src/services/productPerformance.ts` sends identical
applied filters for screen and export. Pagination is omitted from downloads.
Defaults are `preset=today`, `sort=highest_revenue`, and 25 visible rows; users can
select 25, 50, 100, 250 or 500 rows. Summary, category and daily totals always come
from the complete backend result, never from the visible page.

Presets: `today`, `yesterday`, `last_7_days`, `last_month`, `current_month`, `custom`.
Custom ranges send inclusive `from`/`to` business dates. The returned range is
displayed verbatim as business dates; metadata exposes exact `start_at`/`end_at`.
This report uses **07:00–03:00 next day, Asia/Tashkent**, excluding 03:00–07:00.
Its date logic is independent of the older dashboard's business-day settings.
Client validation catches invalid/reversed ranges and more than 366 inclusive
dates. The default Today response bounds custom date controls; the backend also
enforces future-date validation.

Supported filters: `category_id`, `product_id`, `search` (100 characters, 300ms
debounce), `cashier_id`, `order_type` (HALL/DELIVERY/PICKUP), `order_origin`
(POS/QR/TELEGRAM), and `payment_method` (CASH/UZCARD/HUMO/CARD/PAYME/MIXED).
Product-name buttons focus the report to a product ID; a visible chip clears it.
Single-branch requests omit `branch_id`. CARD retains its backend meaning: all
terminal card tenders. A matching split tender includes the whole order once.

All six sorts are server-driven: `highest_units`, `highest_revenue`,
`highest_profit`, `lowest_profit`, `highest_profit_margin`,
`lowest_profit_margin`. Filter/sort changes reset page 1. Superseded requests are
aborted and their results ignored.

## Accounting and quality

Money remains a decimal string through the service boundary. The shared
`fmtMoney(..., { exact: true })` formatter preserves fractional amounts and
integers beyond JavaScript's safe integer range, using the existing narrow
non-breaking-space grouping. Insignificant trailing zeroes beyond two decimal
places are removed; no financial values are calculated from table rows.

Incomplete historical cost is visibly flagged. Missing cost/profit/margin stays
unavailable, never zero. The report remains usable and downloadable. Row details
preserve refund counts/amounts, net units, ingredient credits, cost source and
coverage, realized price range, current catalog price and order counts.

Historical source precedence remains backend-owned: immutable SALE_OUT cost for
the exact sold line, then a verified effective-dated cost profile, then missing.
Current recipe/catalog prices never replace old sale costs in the frontend.

## Downloads and errors

The export menu allows independent generation of each format. Only its running
format is disabled; the other formats and report controls remain usable. Files
use Content-Disposition's UTF-8 filename when supplied, then its plain filename,
then a format fallback. Path/control characters are excluded from filenames.
Object URLs are released after the browser starts the download.

The service retains X-Export-Count, X-Report-From, X-Report-To, and
X-Report-Cost-Complete metadata. Blob-encoded error envelopes are decoded before
display. Stable range/filter/format/size/authentication/permission errors have
Uzbek, Russian and English messages. Existing global 401 handling remains active.

## Verification

Production requests for the fixed custom period 2026-09-04 through 2026-09-09
returned HTTP 200 for JSON, XLSX, PDF and CSV. The filtered result contained 185
products. Verification confirmed:

- Every CSV product revenue matched its JSON decimal value; CSV totals matched
  the full JSON summary, and unknown cost/profit cells remained blank.
- XLSX summary product/unit/revenue values matched JSON. Its sheets are Summary,
  Products, Categories, Daily and Methodology.
- PDF summary product/unit/revenue values matched JSON.
- Download filename, count and business-date headers were present for all formats.

These are frontend/integration checks. Changing stock or recipe costs in
production was not performed. Backend historical immutability remains covered
by the backend's own tests; no backend code was changed.

Backend-independent contract and browser tests cover exact decimals, null cost,
query parity, pagination, all sorts, category/search/advanced filters, custom
dates, role access, export concurrency/filenames/errors, and translated
desktop/phone states.

### Confirmed backend PDF follow-up

The generated PDF's narrow Margin column wraps the missing-cost label
`Incomplete` onto two lines (the final `e` alone). Totals and downloads are
correct. In the backend PDF renderer, use an em dash for unavailable numeric
cells and retain the full explanation in Cost evidence/the report warning, or
allocate enough width to the label. Validate on an incomplete-cost, multi-page
report. This is a rendering change only; preserve the dataset and totals.
