# Backend Specification — Warehouse Operator and Operational Audit

**Status:** Ready for implementation
**Date:** 2026-08-27
**Audience:** Backend developer
**Scope:** Alpha POS server (`alpha_pos_server`) and the Admin Panel API. Do not implement this as a desktop-POS-only feature.

## 1. Goal

Introduce one operational user type which can initially work as a **Warehouse Operator** and can later receive narrowly scoped **Audit** and **Expense Request** permissions without creating a second user account or a duplicate role.

The system must support:

1. Receiving products from suppliers against purchase orders, with actual received data entered by the warehouse operator.
2. Read-only supplier balances and supplier ledgers.
3. Daily attendance/audit records for employees: arrival, departure, scheduled-versus-actual time, excuses, and penalties.
4. A formal, categorized disciplinary policy (the business “Nizom”) and traceable penalties.
5. Audit of order preparation-time statuses already sent to Telegram. Every yellow or red order must have a categorized auditor comment.
6. A safe future path for expense requests, without giving a warehouse operator direct access to cashbox/treasury money movement.

This is a backend-first implementation. The frontend must consume only the APIs and permissions defined here.

## 2. Non-negotiable design rules

- Reuse the current stock receiving, supplier ledger, attendance, salary deduction, and Telegram notification foundations. **Do not create parallel receiving, supplier-balance, or Telegram systems.**
- Backend authorization is mandatory. Hiding navigation in the frontend is not authorization. Every endpoint must return `403` when the authenticated user lacks the required permission.
- All money amounts are whole **UZS integers**. API values remain numeric; the frontend formats them with grouped spaces (for example, `100 000`).
- Store event snapshots. Historical supplier movements, scheduled time, preparation time, status color, rules, categories, and penalty amounts must not change when configuration changes later.
- Use `Asia/Tashkent` for attendance date/time calculations. Return ISO-8601 datetimes and an explicit timezone in API responses.
- Completed receiving, approved penalties, and audit comments are auditable business records. Do not hard-delete them. Use controlled correction, reversal, void, or reopen actions with a reason and actor/time audit trail.
- Use database transactions and row locks for state transitions and financial/stock updates. Completion/review endpoints must be idempotent with the existing idempotency mechanism.
- Do not grant a user permission to approve their own adjustment, penalty, or expense request.

## 3. Role and permission model

### 3.1 New role

Add `WAREHOUSE` to `User.RoleChoices` and make it available in Admin Panel user management.

- It uses normal Admin Panel email/password login.
- It must not appear in the POS cashier/operator picker.
- The role alone is not sufficient: endpoint access must use the permission catalog below.
- Add an authenticated back-office guard that accepts active internal users, then enforce individual permissions. The current admin-only decorator cannot remain the only gate for warehouse/audit endpoints.

### 3.2 Base Warehouse permissions

Create these permissions in the catalog and assign them to the `WAREHOUSE` template:

| Permission | Required behavior |
|---|---|
| `stock.catalog.view` | View stock items, units, and product information needed for receiving. |
| `stock.level.view` | View stock balances by location. |
| `stock.batch.view` | View batches, expiry, and receiving history. |
| `stock.supplier.view` | View suppliers, current balance, and ledger read-only. |
| `stock.purchase.view` | View purchase orders and their remaining quantities. |
| `stock.receiving.create` | Create a receiving draft for an existing purchase order. |
| `stock.receiving.update_draft` | Edit only a receiving draft created/assigned to the user. |
| `stock.receiving.complete` | Complete a valid receiving; this posts stock and supplier debt atomically. |
| `stock.transfer.view` | View transfers. |
| `stock.transfer.create` | Create transfer requests if this is already an approved warehouse workflow. |
| `stock.count.view` | View stock counts. |
| `stock.count.create` | Create a stock-count session. |
| `stock.count.record` | Enter count lines and submit a count for review. |
| `stock.adjustment.request` | Request an adjustment with evidence; cannot post it directly. |

`WAREHOUSE` must **not** receive any of the following by default:

- supplier payment / supplier ledger mutation;
- direct stock adjustment approval or posting;
- product cost, recipe, menu, supplier master-data, user, role, settings, or licensing management;
- cashbox/treasury cash withdrawal or direct expense creation;
- payroll approval or penalty approval;
- access to unrelated financial reports.

### 3.3 Optional future capability bundles

Do not create extra cloned roles such as “warehouse-auditor.” Add these as optional permission bundles to the same user when required.

| Bundle | Permissions |
|---|---|
| Operational audit | `attendance.view`, `attendance.record`, `attendance.adjust.request`, `discipline.rule.view`, `discipline.case.create`, `discipline.case.view`, `prep.audit.view`, `prep.audit.review` |
| Expense requests only | `expense.request.create`, `expense.request.view_own` |

Managers and administrators may view and approve according to their existing elevated permissions. Add explicit permissions for `attendance.adjust.approve`, `discipline.rule.manage`, `discipline.case.approve`, `discipline.case.void`, `prep.audit.reopen`, `expense.request.approve`, and `expense.request.pay` rather than relying on an implicit role name.

## 4. Warehouse receiving and supplier balances

### 4.1 Existing implementation that must be reused

The following current system is the source of truth and must remain the only receiving flow:

- `PurchaseOrder` and `PurchaseOrderItem`
- `PurchaseReceiving` and `PurchaseReceivingItem`
- `StockBatch`, stock-level movement, and stock transaction posting
- `Supplier.current_balance` and append-only `SupplierTransaction`
- Existing receiving endpoints under `/api/admins/stock/`:
  - purchase-order receiving creation/listing;
  - receiving item management;
  - receiving completion;
  - supplier listing/detail/ledger;
  - supplier payment.

The backend already posts inventory and the supplier purchase ledger during receiving completion. Preserve that service and expose it through the new permissions. Do **not** add a second table called warehouse receiving or supplier debt.

### 4.2 Required access and workflow

1. Warehouse operator opens a purchase order and sees ordered, previously received, remaining, and cancelled quantities per line.
2. Warehouse operator creates a `DRAFT` receiving for the selected supplier/PO and location.
3. For every actually received line, the operator enters:
   - stock item;
   - received quantity and unit;
   - unit cost (whole UZS);
   - batch number when the item is batch-tracked;
   - expiry date when required by the item;
   - quality result (`PASSED`, `FAILED`, or `PENDING`);
   - optional note, mandatory when failed or when quantity differs from the PO beyond the configured tolerance.
4. On completion, the existing transactional service must:
   - prevent total received quantity from exceeding the allowed PO quantity, unless a manager-approved over-receipt is recorded;
   - create batches where needed;
   - update stock balances and stock transactions;
   - update PO status (`PARTIAL` / `RECEIVED` as appropriate);
   - write the supplier transaction and update `Supplier.current_balance` atomically;
   - record `received_by` as the authenticated operator;
   - make the completed receiving immutable.
5. If a completed receiving is wrong, use a reversal/correction workflow with a reason and manager approval; never edit stock/ledger history in place.

### 4.3 Supplier balance and ledger response

For an authorized warehouse operator, supplier list/detail APIs must return, read-only:

- `current_balance_uzs`;
- paginated supplier ledger with transaction type, source reference, date, debit/credit/change, balance after transaction, and creator;
- filters by supplier, date range, transaction type, and source reference.

The successful receiving-completion response must include:

```json
{
  "receiving_id": "…",
  "status": "COMPLETE",
  "supplier_id": "…",
  "supplier_balance_before_uzs": 0,
  "supplier_balance_after_uzs": 0,
  "posted_at": "2026-08-27T10:30:00+05:00"
}
```

Values shown above are illustrative only. Amounts must be numbers, not formatted strings.

The endpoint which pays a supplier (`/suppliers/{id}/pay/` or equivalent) must remain inaccessible to `WAREHOUSE` and return `403` if called directly.

## 5. Attendance and daily operational audit

### 5.1 Data model

Keep the existing `Attendance` record as the authoritative daily record. Extend it or add related auditable entities; do not replace it.

Add `EmployeeWorkSchedule`:

| Field | Requirement |
|---|---|
| `employee` | Required FK. |
| `weekday` | Required, 0–6. |
| `scheduled_start_local` / `scheduled_end_local` | Required local times. Support an overnight shift explicitly if needed. |
| `grace_minutes` | Non-negative integer; default comes from company/branch setting. |
| `effective_from` / `effective_to` | Required for historical schedule accuracy. No overlapping active rules for the same employee/day. |
| audit fields | Created/updated by and timestamps. |

Add `AttendanceAdjustmentRequest` for corrections after a record has been entered:

| Field | Requirement |
|---|---|
| `attendance` | Required FK. |
| `requested_check_in` / `requested_check_out` | Proposed timestamps, one or both. |
| `reason_category` | `MISSING_ENTRY`, `DEVICE_FAILURE`, `MANAGER_INSTRUCTION`, `DATA_ENTRY_ERROR`, `OTHER`. |
| `reason_text` | Required for `OTHER`, optional otherwise. |
| `status` | `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`. |
| request/review audit | Requester/time, reviewer/time, review note. |

An attendance record must provide or derive these snapshot/report fields:

- `scheduled_start`, `scheduled_end`, `grace_minutes`;
- `check_in`, `check_out`;
- `worked_minutes`, `scheduled_minutes`, `overtime_minutes`;
- `late_minutes`, `early_leave_minutes`;
- status and source;
- absence/excuse/adjustment indicators.

Time variance must be calculated server-side from the schedule snapshot. The frontend may display it but must not be trusted to calculate penalties or late minutes.

### 5.2 Attendance APIs

Keep existing check-in/check-out APIs working. Add the following endpoints under `/api/admins/hr/` (exact router names may vary, but behavior and contract must match):

| Method and path | Permission | Behavior |
|---|---|---|
| `GET /work-schedules/` | `attendance.view` | List schedules with employee/date filters. |
| `POST /work-schedules/` | `discipline.rule.manage` or dedicated schedule-manage permission | Create schedule. |
| `PATCH /work-schedules/{id}/` | schedule-manage | Change only prospectively; preserve prior effective range. |
| `GET /attendance/` | `attendance.view` | Daily records with calculated variance and penalty summary. |
| `POST /attendance/manual-entry/` | `attendance.record` | Create the day’s initial manual arrival/departure record. |
| `POST /attendance/{id}/adjustment-requests/` | `attendance.adjust.request` | Propose historical correction; does not immediately overwrite record. |
| `POST /attendance-adjustments/{id}/approve/` | `attendance.adjust.approve` | Apply approved correction atomically and preserve original/request audit. |
| `POST /attendance-adjustments/{id}/reject/` | `attendance.adjust.approve` | Reject with reason. |
| `GET /attendance/summary/` | `attendance.view` | Paginated per-employee period table defined below. |

`POST /attendance/manual-entry/` payload:

```json
{
  "employee_id": "…",
  "work_date": "2026-08-27",
  "check_in_local": "2026-08-27T09:12:00+05:00",
  "check_out_local": "2026-08-27T18:03:00+05:00",
  "notes": "optional factual note"
}
```

Validation requirements:

- One daily attendance record per employee/business date.
- `check_out` must be later than `check_in`; overnight work requires a schedule marked as overnight.
- Reject invalid timezone, impossible dates, duplicate/manual overwrite, and future timestamps outside an explicit manager exception.
- An auditor can create the first daily record but cannot overwrite a saved record. Any later correction follows the adjustment request/approval flow.
- The creator cannot approve their own adjustment request.

### 5.3 Excuses

Add `AttendanceExcuse` (or equivalent related model) to retain the employee’s explanation separately from raw notes.

Required fields:

- attendance, employee, submitted by, submitted at;
- `category`: `MEDICAL`, `FAMILY`, `TRANSPORT`, `APPROVED_LEAVE`, `MANAGER_INSTRUCTION`, `OTHER`;
- `description`, mandatory for `OTHER`;
- status: `PENDING`, `APPROVED`, `REJECTED`;
- reviewer, reviewed time, review note.

An approved excuse can mark specified late/early/absence minutes as excused. An excused variance must not receive a final approved penalty for the same minutes. Preserve both the original variance and the approved excuse in reports.

### 5.4 Attendance summary response

`GET /attendance/summary/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&employee_id=&page=&per_page=` must return a paginated table with at least:

| Column | Meaning |
|---|---|
| Employee | ID, full name, active employment status. |
| Scheduled hours | Total scheduled minutes/hours for the period. |
| Worked hours | Total valid worked minutes/hours. |
| Overtime | Calculated overtime. |
| Late / early leave | Minutes, including an excused indicator. |
| Absences | Count of absent scheduled days. |
| Excuses | Pending/approved/rejected counts. |
| Penalties | Case count by status. |
| Approved penalty total | Whole UZS total to apply to payroll. |
| Pending penalty total | Whole UZS total not yet approved. |

Include filters for employee, location/branch (if applicable), attendance status, date range, discipline-rule category, and penalty status. Return raw integers for money/minutes plus totals for the filtered result.

## 6. Formal disciplinary policy (“Nizom”) and penalties

The existing `SalaryDeduction` record is not enough on its own because it does not preserve policy, evidence, actor, approval, or source event. Keep it as the payroll impact record, but create a dedicated disciplinary layer.

### 6.1 New models

Add `DisciplinaryRule`:

| Field | Requirement |
|---|---|
| `code` | Immutable unique human-readable code, for example `ATT-LATE-01`. |
| `category` | `ATTENDANCE`, `CONDUCT`, `QUALITY`, `PREPARATION_TIME`, `OTHER`. |
| `title`, `description` | Required policy text. |
| `default_amount_uzs` | Whole UZS integer; can be zero for warning-only rules. |
| `is_active`, `effective_from`, `effective_to` | Rule lifecycle. |
| `requires_evidence`, `requires_comment` | Defaults true for a monetary penalty. |
| audit fields | Creator/updater and timestamps. |

Add `DisciplinaryCase`:

| Field | Requirement |
|---|---|
| employee | Required subject of the case. |
| `occurred_at` / `business_date` | Required violation time/date. |
| rule | Protected FK to `DisciplinaryRule`. |
| rule snapshot | Store code, title/category, and monetary amount snapshot. |
| amount_uzs | Proposed/approved amount snapshot, whole UZS. |
| evidence | Required factual description; links to attendance and/or preparation audit when relevant. |
| excuse | Optional submitted explanation and its review state. |
| status | `DRAFT`, `SUBMITTED`, `EXCUSED`, `APPROVED`, `REJECTED`, `VOIDED`, `APPROVED_PENDING_PAYROLL`. |
| approval audit | Created by/time, reviewed by/time, review note, void/reopen reason. |
| payroll linkage | Effective payroll period and one-to-one salary deduction link after payroll application. |

Rule edits must be forward-looking. A historical case shows the saved rule/amount snapshot even if the rule is deactivated or changed later.

### 6.2 Case and payroll rules

1. An audit-enabled user can create a draft/submitted case; Manager/Admin approval is required before it becomes a payroll deduction.
2. No one may approve, reject, or void their own case.
3. A rule requiring evidence/comment cannot be submitted without it.
4. A final approved excuse prevents a final penalty for the same attendance variance. A manager must explicitly resolve any conflict.
5. Approval creates exactly one linked `SalaryDeduction`, or sets `APPROVED_PENDING_PAYROLL` when that salary period has not been generated yet.
6. Payroll generation attaches each approved pending deduction exactly once. Repeated approval, retry, or job execution must never duplicate a deduction.
7. If the salary is already paid, do not silently modify it. Reject the action or require a controlled approved carry-forward to the next payroll period.
8. Void/reversal must retain the original case and reason. It may reverse the linked unpaid payroll deduction only through a controlled transaction; never delete the original record.

### 6.3 Discipline APIs

| Method and path | Permission | Behavior |
|---|---|---|
| `GET /discipline-rules/` | `discipline.rule.view` | Read active/historical rules. |
| `POST/PATCH /discipline-rules/` | `discipline.rule.manage` | Manage policy rules prospectively. |
| `GET /discipline-cases/` | `discipline.case.view` | Paginated cases with evidence and payroll status. |
| `POST /discipline-cases/` | `discipline.case.create` | Create draft/submitted case. |
| `POST /discipline-cases/{id}/approve/` | `discipline.case.approve` | Approve and create/link payroll impact once. |
| `POST /discipline-cases/{id}/reject/` | `discipline.case.approve` | Reject with required reason. |
| `POST /discipline-cases/{id}/void/` | `discipline.case.void` | Void with required reason and controlled payroll reversal. |

## 7. Order preparation-time Telegram statuses and audit comments

### 7.1 Existing behavior to preserve

The backend already calculates the preparation result when an order becomes `READY`:

- green: `ON_TIME` when elapsed time is at or below target;
- yellow: `SLIGHTLY_LATE` when elapsed exceeds target but is at most 150% of target;
- red: `VERY_LATE` when elapsed exceeds 150% of target.

The existing server-side Telegram order-ready notification must remain the delivery mechanism. It currently updates the original order message idempotently. Do not replace it with duplicate bot messages, a second bot token, or a frontend notification.

### 7.2 New preparation-audit snapshot

Create `PreparationAudit` (one-to-one with Order) in the central server when an order first becomes `READY` and a meaningful created/ready time exists.

| Field | Requirement |
|---|---|
| `order` | Required unique protected one-to-one relation. |
| `branch/location` | Snapshot/foreign key needed for filtering. |
| `created_at_snapshot`, `ready_at_snapshot` | Source timestamps. |
| `elapsed_seconds`, `target_seconds`, `target_name_snapshot` | Immutable measured values. |
| `performance_status` | `ON_TIME`, `SLIGHTLY_LATE`, `VERY_LATE`, or `UNTRACKED`. |
| `review_required` | True for yellow/red, false for green/untracked. |
| `review_status` | `NOT_REQUIRED`, `PENDING`, `COMPLETED`, `EXCUSED`. |
| audit fields | Created time, reviewer, reviewed time, reopen actor/reason. |

The snapshot is historical evidence. Never recalculate its color if product preparation targets later change. A missing target produces `UNTRACKED` and does not require a review.

The database unique constraint and READY event handling must be idempotent: an event retry cannot create two audit rows or two Telegram messages.

### 7.3 Categorized audit comment

Add configurable `PreparationAuditCategory` with active/inactive lifecycle. Seed these initial categories:

- `STAFF_SHORTAGE`
- `HIGH_ORDER_VOLUME`
- `EQUIPMENT_ISSUE`
- `KITCHEN_PROCESS`
- `PRODUCT_COMPLEXITY`
- `CASHIER_DELAY`
- `CUSTOMER_CHANGE`
- `OTHER`

Add `PreparationAuditReview` (one current review per audit in v1 is sufficient):

| Field | Requirement |
|---|---|
| preparation audit | Required relation. |
| category | Required active category. |
| comment | Required for all reviews; 10–1,000 characters. For `OTHER`, it is mandatory and must explain the reason. |
| responsible employee | Optional in v1; only populate when the responsible person is verified. Do not guess a worker. |
| linked disciplinary case | Optional; only when the review results in a formal case. |
| reviewed by / at | Required immutable audit fields. |

Yellow and red records are not operationally complete until an auditor submits this review. The review must not be optional in the frontend or backend.

### 7.4 Preparation-audit APIs

Add these endpoints under the canonical HR/audit API namespace, preferably `/api/admins/hr/` to keep employee performance audit together with attendance:

| Method and path | Permission | Behavior |
|---|---|---|
| `GET /preparation-audits/` | `prep.audit.view` | Paginated yellow/red/green audit list with snapshot and review fields. |
| `GET /preparation-audits/{id}/` | `prep.audit.view` | Detail, including order identity and review history. |
| `GET /preparation-audit-categories/` | `prep.audit.view` | Active selectable comment categories. |
| `POST /preparation-audits/{id}/review/` | `prep.audit.review` | Submit the required category/comment and optional case link. |
| `POST /preparation-audits/{id}/reopen/` | `prep.audit.reopen` | Manager/Admin-only reopen with reason. |
| `GET /audit-dashboard/` | audit view permissions | Daily/period summary for the Admin audit page. |

List filters: date range, branch/location, performance status, review status, category, cashier/creator if available, responsible employee, and pagination.

`POST /preparation-audits/{id}/review/`:

```json
{
  "category_id": "…",
  "comment": "The oven stopped heating; service ticket was opened.",
  "responsible_employee_id": null,
  "disciplinary_case_id": null
}
```

Rules:

- Green (`ON_TIME`) cannot require a comment.
- Yellow/red require exactly one completed review in v1; repeat submission must return the existing review or a conflict, not duplicate it.
- Only a Manager/Admin may reopen a completed review, with a mandatory reason.
- Closing a daily audit period/shift must return `409` while any yellow/red entry in that period remains `PENDING`.
- The audit dashboard must expose pending yellow and red counts separately.

## 8. Future expense workflow — prepare, do not enable direct cash access

The warehouse/auditor may later be asked to submit business expenses. Current direct cashbox/treasury expense routes move money immediately, so they must not be granted to this user.

Reserve the permission names now:

- `expense.request.create`
- `expense.request.view_own`
- `expense.request.view_all`
- `expense.request.approve`
- `expense.request.pay`

When this feature is implemented, use an `ExpenseRequest` approval workflow:

| Field | Requirement |
|---|---|
| category | Required approved expense category. |
| amount_uzs | Required whole UZS integer. |
| requested source | CASH or BANK; the UI may show bank-only fields only when BANK is selected. |
| description/reference/attachment | Evidence as required by category. |
| status | `PENDING`, `APPROVED`, `REJECTED`, `PAID`, `CANCELLED`. |
| actors/timestamps | Requester, approver, payer, and each state time. |
| money link | One link to the actual cashbox/treasury transaction after payment. |

Only an approved request may create the actual money movement. Requester and approver cannot be the same user. This section is architectural preparation; do not turn it on for `WAREHOUSE` in this delivery.

## 9. Audit log, data integrity, and synchronization

### 9.1 Audit trail

Every create, submit, approve, reject, complete, void, reversal, and reopen action must retain:

- actor user ID/name;
- timestamp;
- previous and new state where a state changes;
- required reason/comment where stated;
- source entity/reference.

Expose enough of this history in detail responses for the Admin Panel audit views. Never rely only on application logs.

### 9.2 Ownership and synchronization

- Stock receiving remains branch-owned and follows the existing stock synchronization model.
- Attendance must retain the existing HR synchronization behavior where applicable.
- `PreparationAudit`, preparation review, policy rules, and disciplinary cases are **cloud-authoritative operational records**. Do not make READY-event audits terminal-syncable; they are generated from the central order event and must not be duplicated by local POS retry/sync.
- Integrate salary deduction links through the existing payroll synchronization rules; ensure retries cannot create duplicate deductions.

### 9.3 Migration and backfill

1. Add the `WAREHOUSE` role and permission catalog entries in a safe migration/seed path.
2. Add indexes/unique constraints for `Attendance(employee, work_date)`, schedule lookups, one `PreparationAudit` per order, one active review per audit in v1, and one salary deduction link per approved disciplinary case.
3. Do not fabricate historical preparation-audit comments or penalties. Historical orders can remain without a `PreparationAudit`; new READY events are the required starting point. A separate explicitly approved backfill may create only `UNTRACKED`/unreviewed snapshots where source timing data is reliable.
4. Existing users must not silently obtain new permissions. Only the new Warehouse role template and explicitly edited users receive them.

## 10. Required API error behavior

Use the project’s standard response envelope consistently. At minimum:

| Situation | HTTP result |
|---|---|
| Unauthenticated | `401` |
| Authenticated but lacks permission | `403` |
| Invalid input/state transition | `400` or `422`, with field errors |
| Duplicate/idempotent operation | Return original successful result when safely idempotent; otherwise `409` with stable error code |
| Draft/completed/approved record modified illegally | `409` |
| Trying to close an audit period with pending yellow/red reviews | `409` with `pending_review_count` |
| Self-approval | `403` or `409` with explicit stable error code |

All mutation errors must be safe to show in the frontend; do not return raw tracebacks.

## 11. Acceptance criteria (must be demonstrated before handoff)

### Warehouse receiving

1. A Warehouse user can log into the Admin Panel but is not shown in the POS cashier selector.
2. The user can view a supplier’s balance and ledger, purchase order lines, and current stock levels.
3. The user creates a draft receiving, records actual quantities/cost/batch/expiry/quality, and completes it once.
4. Completion atomically updates stock, PO status, supplier ledger, and supplier balance; the response returns balance before/after.
5. Retrying the completion request does not double-post stock or debt.
6. Direct calls by Warehouse to supplier payment, direct stock adjustment, settings, or direct cashbox expense endpoints return `403`.

### Attendance and discipline

1. Auditor can create one daily arrival/departure entry for an employee in `Asia/Tashkent`.
2. API calculates scheduled, worked, late, early-leave, and overtime minutes on the server.
3. Historical edits create an adjustment request; only a different authorized manager/admin can approve it.
4. A categorized excuse is retained and prevents a final penalty for the same excused variance.
5. A disciplinary case stores the rule and amount snapshot, evidence, actor, approval history, and payroll period.
6. An approved case creates/links one salary deduction only once. A paid salary is never changed silently.
7. Summary endpoint returns the requested per-worker table and correct filtered totals.

### Preparation-time audit

1. An order reaching READY still produces the current Telegram message update with its green/yellow/red result.
2. One immutable `PreparationAudit` snapshot is created per order; retrying the READY event creates no duplicate snapshot or Telegram message.
3. Green records need no review. Every yellow/red record is `PENDING` until an authorized auditor submits a category and comment.
4. A daily/period close attempt with pending yellow/red reviews returns `409` and the number outstanding.
5. A completed review is immutable to an auditor; only an authorized manager/admin can reopen it with a reason.
6. The audit dashboard returns count of green/yellow/red, pending yellow/red, categories, and review completion for the selected period.

### Security and quality

1. Permission checks are tested at endpoint level, not only through the UI.
2. State-transition, idempotency, concurrent-completion, self-approval, and double-deduction tests are included.
3. Existing Administrator and Manager behavior remains compatible.
4. API documentation/examples are delivered with the implementation, including pagination and error envelopes.

## 12. Frontend integration contract after backend delivery

After the backend is confirmed, the Admin Panel will add:

1. A Warehouse navigation area for purchase orders, receiving, stock balances, supplier balances/ledger, counts, and adjustment requests according to permissions.
2. An Audit page with Attendance, Penalties, and Preparation Audit tabs, using the above server-calculated data.
3. Mandatory categorized comment UI for every yellow/red preparation entry; users cannot mark it complete without it.
4. Read-only financial views for warehouse/audit users unless later explicitly given expense-request permission.
5. Uzbek, Russian, and English translations, responsive and keyboard-accessible forms, and grouped display of numeric UZS values without sending formatted text to the API.

No frontend role hiding or client-side calculation is a substitute for the backend requirements in this document.

## 13. Post-deployment integration findings — required follow-up

Verified on 2026-08-28 against server `f6f1486386af` and core `cf5dcee9500d`. These are backend contract defects, not optional frontend changes.

1. **Parse receiving dates before model assignment.** In receiving create and receiving-item add/update, parse `received_date` and `expiry_date` with `date.fromisoformat`, return a field-level `400`/`422` for invalid values, and serialize only real `date` values. Add tests for valid ISO dates, invalid dates, an expiry-tracked item, and an omitted receiving date. The frontend temporarily omits `received_date`; expiry-tracked lines remain unavailable until this is fixed.
2. **Normalize transfer receipt quantity keys.** JSON object keys are strings. In transfer receive, use `received_quantities.get(str(item.id))` (or normalize the map once) before falling back to shipped quantity. Add tests proving zero, partial, and full receipts for an item ID supplied as a JSON key. Until fixed, the frontend exposes only an explicitly labelled full-receipt action.
3. **Validate and convert transfer units.** A transfer item may use only the stock item's base unit or a configured conversion. Convert the entered amount to the base quantity before availability checks and stock posting, while retaining display-unit metadata. Reject unrelated units. Until fixed, the frontend intentionally omits `unit_id` so the server uses the base unit.
4. **Enforce stock-count ownership on every recorder action.** Non-Admin users with `stock.count.record` may start, record, and complete only counts whose `counted_by_id` matches the authenticated user. Include `counted_by_id` in brief list rows so the UI can hide unavailable actions. Preserve the existing self-approval rejection and add cross-user Start/Complete tests.
5. **Make adjustment approval queues reachable.** `GET /adjustment-requests/` must accept `stock.adjustment.approve` without also requiring `stock.adjustment.request`; request creation must still require the request permission. Do not treat `stock.manage` as an implicit permission unless that implication is implemented centrally and tested.
6. **Return record-level action metadata.** Receiving list/detail rows should expose `received_by_id` and canonical `allowed_actions`; adjustment rows already expose `requested_by` and should keep it. Add tests ensuring self-review and cross-owner receiving actions are not advertised.
7. **Make audit read dependencies explicit.** Mutation permissions must not be sufficient to enter a tab whose list endpoint requires a separate view permission. Either guarantee the required view permissions in role assignment or return a capability payload the frontend can use. Discipline creation also needs a permission-safe employee lookup. The audit dashboard should return the subsets authorized for attendance, discipline, or preparation users instead of failing discipline-only users.
8. **Return cashier display identity in preparation audits.** Include at least `cashier: { id, name }` (or an equivalent stable display field) so the audit table does not have to show `#<id>`.
9. **Make shipped-transfer cancellation inventory-safe.** Either reject `cancel` once a transfer is `IN_TRANSIT`, or atomically restore both `StockLevel` and every decremented `StockBatch.current_quantity`. Add a regression test proving level and batch totals remain coherent. Until fixed, the frontend permits cancellation only for `DRAFT`, `REQUESTED`, and `APPROVED` transfers and rechecks the latest state before posting.
10. **Reject negative stock-count entries.** `counted_quantity` must be a finite decimal greater than or equal to zero. Enforce this in the service, not only in model/UI validation, and add tests for negative, malformed, zero, and positive values. The frontend blocks negative submissions as a temporary safety boundary.
11. **Validate adjustment-request units.** Require the stock item's base unit or a configured conversion and reject unrelated units; never treat an unconvertible display quantity as a base-unit quantity. Add create and approval tests for base, valid converted, and unrelated units. Until fixed, the frontend locks new adjustment requests to the selected item's base unit.
12. **Version prospective Nizom rule changes.** Editing an already-effective rule must close the existing effective range and create a successor row; it must not move the historical row's `effective_from` in place. Preserve disciplinary-case snapshots and add tests proving past dates still resolve the old rule while future dates resolve the replacement. Until fixed, the frontend disables editing rules that have already taken effect.
13. **Validate Nizom effective-date ranges in the service.** Reject `effective_to < effective_from` on create and PATCH with field-level `400`/`422` errors instead of allowing the database check constraint to raise an `IntegrityError`/`500`. Cover equal, forward, and reversed ranges in API tests. The frontend also validates the range, but that is not a security boundary.
14. **Expose over-receipt approval state.** Receiving detail and the approval response must include `over_receipt_approved_by_id`, approval time/reason, the approved quantity or tolerance, and canonical `allowed_actions`. Without persisted approval metadata in the serializer, a receiver cannot safely distinguish an authorized overage after refresh, so the frontend continues to reject quantities above the PO remainder.
15. **Expose receiving-correction queues.** Add permission-filtered correction list/detail endpoints (or serialize correction history in receiving detail) with correction ID, receiving identity, reason, status, requester/reviewer IDs and names, timestamps, review note, and `allowed_actions`. The current POST request/review endpoints cannot support a discoverable reviewer queue because no GET surface returns correction IDs. The frontend may submit a completed-receiving correction request and show its returned ID/status, but cannot safely implement review until this read contract exists.
16. **Enforce source-batch integrity inside transfer transactions.** `StockTransferItemService.add_item` must require `batch_id` when the selected item has `track_batches=true`. Validate that the batch belongs to the item and source location, is `AVAILABLE`, has `quality_status=PASSED`, is not expired, and has enough unreserved quantity. Recheck those conditions under the same row lock used by approval/shipping so a concurrent quarantine, expiry, or consumption cannot bypass the rule. Add request, approve, ship, quick-transfer, and concurrency tests for missing, wrong-location, wrong-item, quarantined, failed-quality, expired, and insufficient batches. The frontend selects eligible batches and blocks unsafe request/approve/ship actions, but its preflight check is not a transactional security boundary.
17. **Repair and validate batch-consumption endpoints.** Both `batch_consume` and `batch_auto_consume` call service methods without the required `movement_type` argument and therefore raise `TypeError` before domain validation. Supply a server-owned movement type (do not trust an arbitrary client value), require a non-empty audit reason/reference appropriate to the operation, and reject non-`AVAILABLE`, failed-quality, expired, or insufficient batches while holding the batch and aggregate level locks. Add API tests proving the batch, stock level, and transaction remain atomic on success and rollback together on failure. Until fixed, the frontend keeps these admin mutations read-only.
18. **Make manual adjustments batch-aware or reject them server-side.** `/adjust/` and adjustment-request approval currently change `StockLevel` while leaving `StockBatch.current_quantity` unchanged even when the item is batch tracked; passing `batch_id` only annotates the transaction. Require and lock an eligible batch for a batch-tracked adjustment, update batch and aggregate quantities atomically, and test increases, decreases, insufficient stock, rollback, and concurrent updates. If exact batch adjustment is not supported yet, return a deterministic `409`/`422` instead of accepting the mutation. The frontend currently blocks direct and requested adjustments for batch-tracked items, including the item-detail adjustment shortcut.
19. **Make Warehouse user permission and role changes Admin-only and atomic.** `PATCH /api/admins/users/{id}` is currently admitted by `manager_required`; a non-Admin Manager can submit any valid named `permissions` even though only the wildcard is rejected. Restrict all per-user permission mutation to Admin, validate that the target is eligible for the assigned permissions, and audit the exact grant/revoke delta. A transition into `WAREHOUSE` must atomically require an email plus a new password of at least eight characters and apply the current Warehouse role template; a transition out must atomically clear Warehouse permissions and require credentials valid for the destination role (for POS roles, a new four-digit PIN). Never retain a Warehouse password or permissions on a cashier/waiter account, and never leave a converted Warehouse account with a four-digit PIN and an empty permission set. Either accept an Admin-only `permissions` list during user creation in the same transaction or provide a dedicated Admin-only endpoint; the frontend must never need a create-then-PATCH sequence that can create a user but fail to apply its access. Return `{ data: { user } }` with the final committed permission list. Add endpoint tests for Admin and Manager actors, wildcard and unknown permission keys, transitions in both directions, rollback, create retry without duplication, audit metadata, and existing-user template independence. Until fixed, the frontend locks role changes into or out of `WAREHOUSE`; newly created Warehouse users inherit the server template, and only an Admin sees narrow per-user audit/expense-request bundle controls.
20. **Make transfer approval read dependencies internally consistent.** Transfer list/detail requires `stock.transfer.view`, while the frontend's required batch-safety preflight also reads catalog and batch records (`stock.catalog.view` and `stock.batch.view`). The deployed Manager template grants `stock.manage` but none of those read permissions, even though approve/ship/receive actions accept `stock.manage`. Either grant every required read dependency to the approval role or expose one permission-gated, authoritative transfer-preflight endpoint that returns item tracking and eligible source-batch evidence. The final approve/ship transaction must still revalidate and lock the batch as required by item 16. Add a role-template/API test proving the intended approver can list, inspect, preflight, and act without unrelated broad access. Until fixed, the frontend exposes these actions only where the required read contracts are available (Administrators satisfy all checks).

Required regression checks: empty JSON objects must be accepted by count actions; cross-user mutations must return `403`; the date and transfer tests above must run against the same deployed API contract used by the Admin Panel.
