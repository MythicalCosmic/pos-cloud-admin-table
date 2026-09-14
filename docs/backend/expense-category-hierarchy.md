# Expense category hierarchy and reviewed reclassification

Frontend integrated against the deployed backend contract on 2026-09-14.

Production revisions:

- server: `8a8990798eb69237f785a067c627a73ccc8a63d0`
- shared server core: `56895eb25a1d1a5383e9a63b771395d8d9c1b054`
- migration: `hr.0013_expense_category_hierarchy`

The desktop backend can safely receive the additive fields, but its separate UI
will show parent and child categories as a flat list until that client is updated.
Existing categories remain top level and `UNCLASSIFIED`; imported pending
expenses are not reclassified automatically.

## Category contract

The canonical `/api/admins/expense-categories` CRUD and deactivate routes are
unchanged. Category records may now include `parent_id`, `parent`, `depth`,
`path`, `cost_behavior`, direct/descendant/subtree expense counts, child counts,
and `is_selectable`. The hierarchy is limited to a top-level category and one
subcategory level.

List requests support `parent_id`, `roots_only`, and `cost_behavior`. Create and
update requests send `parent_id` (`null` for a root) and `cost_behavior`.
Category codes remain immutable. A root with active children is a grouping node:
it cannot receive a new expense and its children must be deactivated before the
root can be deactivated.

Supported cost behavior values are `UNCLASSIFIED`, `FIXED`, `VARIABLE`, `MIXED`,
and `ONE_TIME`. They are descriptive backend-owned classifications; the frontend
does not infer accounting behavior from them.

During a rolling deployment, missing hierarchy fields are treated as a legacy
top-level selectable category. Stable hierarchy errors remain visible from the
server, including parent-not-found/inactive, depth-exceeded, active-children,
and group-only errors.

## Expense usage and historical evidence

Expense and Treasury category pickers include only active categories whose
`is_selectable` value is not explicitly false, then apply the existing
`allowed_sources` rule. Labels use `path.join(' / ')` and show cost behavior as
context.

Embedded category data on an expense is immutable historical evidence. List and
detail views render that response snapshot, including its parent, path, cost
behavior, and reporting group; they do not replace it with current category
catalog data.

Expense list requests can send `category_id`, `include_subcategories`,
`category_parent_id`, `cost_behavior`, `reporting_group`, and `source_account`.
The backend applies filters and totals before pagination.

## Reviewed pending-expense reclassification

`POST /api/admins/expenses/reclassify` requires both
`expense.category.manage` and `expense.request.approve`, plus an
`Idempotency-Key` header. The frontend exposes it only in a dedicated review
mode that fixes the status filter to `PENDING` and selects rows from the current
page. Maximum backend batch size is 500.

The first request always sends `dry_run: true` and shows the backend's exact row
count, UZS total, current-category breakdown, source breakdown, and target
classification. The apply request uses the reviewed IDs and target, a required
reason, `dry_run: false`, and a fresh operation key. The same apply key is reused
if the transport retries the operation, preventing duplicate audit events.

Any invalid row rejects the whole backend transaction. A no-change or stale
category/status response is shown as a recoverable conflict with an explicit
reload action. Success clears the selection and reloads the server-backed list.
Approved, paid, rejected, canceled, and voided expenses are never exposed to
this flow.

## Frontend integration points

- Category management: `src/pages/hr-expense-categories/index.vue`
- Expense creation, filters, snapshots, and review mode:
  `src/pages/hr-expenses/index.vue`
- Treasury direct-expense category picker: `src/pages/treasury/index.vue`
- API normalization: `src/services/expenseControlApi.ts`
- Shared hierarchy helpers: `src/utils/expenseCategories.ts`
- Types: `src/types/expenseControl.ts`
