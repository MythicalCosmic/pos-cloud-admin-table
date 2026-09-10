<script setup lang="ts" generic="R extends { [key: string]: any }">
import type { CSSProperties, VNode } from 'vue'
import { defineComponent, h } from 'vue'
import Button from './Button.vue'
import Checkbox from './Checkbox.vue'
import DesignIcon from './DesignIcon.vue'
import Pagination from './Pagination.vue'
import Skeleton from './Skeleton.vue'
import StateFill from './StateFill.vue'
import { cx } from './utils'

export type Align = 'left' | 'right' | 'center'
export type SortDir = 'asc' | 'desc'

export interface DataTableColumn<Row = any> {
  key: string
  label: string
  sortable?: boolean
  align?: Align
  width?: string | number
  cellClass?: string
  mobileFullWidth?: boolean

  /**
   * Optional cell renderer. Returns a VNode (from h()), a string, or a number.
   * For complex content prefer the scoped slot `cell.{key}` instead.
   */
  render?: (row: Row) => VNode | string | number | null | undefined
  sortValue?: (row: Row) => unknown
}

export interface DataTableSort {
  key: string | null
  dir: SortDir
}

export interface DataTablePagination {
  page: number
  perPage: number
  total: number
  onPage?: (p: number) => void
  onPerPage?: (n: number) => void
}

interface Props {
  columns: DataTableColumn<R>[]
  rows: R[]
  rowKey?: string
  loading?: boolean

  /** Controlled sort. Provide `sort` + listen to `@sort`. If omitted, internal state is used. */
  sort?: DataTableSort

  /** Initial sort for uncontrolled mode. */
  initialSort?: DataTableSort

  /** Selection set (v-model:selection). When provided, component is controlled for selection. */
  selection?: Set<string | number>

  /** Enable selection column + bulk bar. Implied when `selection` is bound. */
  selectable?: boolean

  /** Enable expand column. The `expanded` slot renders the body. */
  expandable?: boolean

  /** Controlled pagination. If omitted, internal pagination kicks in (perPage default 10). */
  pagination?: DataTablePagination

  /** Default perPage for internal pagination. */
  perPage?: number
  perPageOptions?: number[]

  /** Empty-state title / sub. */
  emptyTitle?: string
  emptySub?: string
  emptyIcon?: string

  /** Use the existing cell renderers in a phone layout, retaining every field. */
  mobileCards?: boolean
  mobileSummary?: string[]
  mobileTitleKey?: string
}

const props = withDefaults(defineProps<Props>(), {
  rowKey: 'id',
  loading: false,
  selectable: false,
  expandable: false,
  perPage: 10,
  perPageOptions: () => [10, 20, 50],
  emptyIcon: 'inbox',
  mobileCards: false,
  mobileSummary: () => [],
})

const emit = defineEmits<{
  (e: 'sort', value: DataTableSort): void
  (e: 'update:selection', v: Set<string | number>): void
  (e: 'rowClick', row: R): void
  (e: 'page', p: number): void
  (e: 'perPage', n: number): void
}>()

const { t } = useI18n({ useScope: 'global' })
const isPhone = useMediaQuery('(max-width: 700px)')
const showMobileCards = computed(() => props.mobileCards && isPhone.value)
const mobileTitleColumn = computed(() => props.columns.find(column => column.key === props.mobileTitleKey) ?? props.columns[0])
const mobileDetails = computed(() => props.expandable || (props.mobileSummary.length > 0 && props.mobileSummary.length < props.columns.length - 1))

/* ---------- helpers ---------- */
function idOf(r: R): string | number {
  return props.rowKey
    .split('.')
    .reduce<any>((value, key) => value?.[key], r) as string | number
}

/* ---------- sort (controlled / uncontrolled) ---------- */
const internalSort = ref<DataTableSort>(
  props.initialSort ?? { key: null, dir: 'asc' },
)

const currentSort = computed<DataTableSort>(() =>
  props.sort ?? internalSort.value,
)

function toggleSort(key: string) {
  const cur = currentSort.value

  const next: DataTableSort
    = cur.key === key
      ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' }

  if (props.sort === undefined)
    internalSort.value = next
  emit('sort', next)
}

const sorted = computed<R[]>(() => {
  const s = currentSort.value
  if (!s.key)
    return props.rows
  const col = props.columns.find(c => c.key === s.key)
  const accessor = col?.sortValue ?? ((r: R) => (r as any)[s.key as string])

  const arr = props.rows.slice().sort((a, b) => {
    const av = accessor(a) as any
    const bv = accessor(b) as any
    if (av === bv)
      return 0
    if (typeof av === 'number' && typeof bv === 'number')
      return av - bv
    return String(av).localeCompare(String(bv))
  })

  if (s.dir === 'desc')
    arr.reverse()
  return arr
})

/* ---------- pagination (controlled / uncontrolled) ---------- */
const internalPage = ref(1)
const internalPp = ref(props.perPage)

const isPagControlled = computed(() => props.pagination !== undefined)

const totalItems = computed(() =>
  isPagControlled.value ? props.pagination?.total ?? sorted.value.length : sorted.value.length,
)

const pp = computed(() =>
  isPagControlled.value ? props.pagination?.perPage ?? internalPp.value : internalPp.value,
)

const totalPages = computed(() =>
  Math.max(1, Math.ceil(totalItems.value / pp.value)),
)

const curPage = computed(() => {
  const p = isPagControlled.value ? props.pagination?.page ?? internalPage.value : internalPage.value
  return Math.min(Math.max(1, p), totalPages.value)
})

const pageRows = computed<R[]>(() => {
  if (isPagControlled.value)
    return sorted.value // controlled: server provided already-paged rows
  const start = (curPage.value - 1) * pp.value
  return sorted.value.slice(start, start + pp.value)
})

/* Reset internal page when rows length changes (uncontrolled only). */
watch(
  () => props.rows.length,
  () => {
    if (!isPagControlled.value)
      internalPage.value = 1
  },
)

function goPage(n: number) {
  if (n < 1 || n > totalPages.value)
    return
  if (isPagControlled.value) {
    clearSel()
    props.pagination?.onPage?.(n)
  }
  else { internalPage.value = n }
  emit('page', n)
}

function setPp(n: number) {
  if (isPagControlled.value) {
    clearSel()
    props.pagination?.onPerPage?.(n)
  }
  else {
    internalPp.value = n
    internalPage.value = 1
  }
  emit('perPage', n)
}

/* Pagination range, page-number list, and total formatting are owned by <Pagination>. */

/* ---------- selection (controlled / uncontrolled) ---------- */
const internalSelection = ref<Set<string | number>>(new Set())

const selection = computed<Set<string | number>>(() =>
  props.selection ?? internalSelection.value,
)

const isSelectable = computed(() => props.selectable || props.selection !== undefined)

function emitSelection(next: Set<string | number>) {
  if (props.selection === undefined)
    internalSelection.value = next
  emit('update:selection', next)
}

const allOnPageSelected = computed(() => {
  const rows = pageRows.value
  return rows.length > 0 && rows.every(r => selection.value.has(idOf(r)))
})

const selectedOnPageCount = computed(() =>
  pageRows.value.reduce((count, row) => count + (selection.value.has(idOf(row)) ? 1 : 0), 0),
)

const someSelected = computed(() =>
  selectedOnPageCount.value > 0 && selectedOnPageCount.value < pageRows.value.length,
)

function toggleAll() {
  const next = new Set(selection.value)
  if (allOnPageSelected.value)
    pageRows.value.forEach(r => next.delete(idOf(r)))
  else
    pageRows.value.forEach(r => next.add(idOf(r)))
  emitSelection(next)
}

function toggleOne(id: string | number) {
  const next = new Set(selection.value)
  if (next.has(id))
    next.delete(id)
  else
    next.add(id)
  emitSelection(next)
}

function clearSel() {
  emitSelection(new Set())
}

const selectedRows = computed<R[]>(() =>
  props.rows.filter(r => selection.value.has(idOf(r))),
)

// Server-paginated tables only have row data for the visible page. Never keep
// stale IDs after filters or data refreshes: bulk-action slots receive rows,
// and retaining an ID without its row can target the wrong/empty selection.
watch(
  () => props.rows.map(idOf),
  ids => {
    if (!isPagControlled.value || selection.value.size === 0)
      return
    const visible = new Set(ids)
    const next = new Set([...selection.value].filter(id => visible.has(id)))
    if (next.size !== selection.value.size)
      emitSelection(next)
  },
)

/* ---------- expand (always internal) ---------- */
const expanded = ref<Set<string | number>>(new Set())
function toggleExpand(id: string | number) {
  const next = new Set(expanded.value)
  if (next.has(id))
    next.delete(id)
  else
    next.add(id)
  expanded.value = next
}

function mobileColumns(row: R) {
  return props.columns.filter(column => column.key !== mobileTitleColumn.value?.key && (!props.mobileSummary.length || expanded.value.has(idOf(row)) || props.mobileSummary.includes(column.key)))
}

/* ---------- column meta ---------- */
const slots = useSlots()
const hasRowActions = computed(() => !!slots['row-actions'])

const colCount = computed(() =>
  props.columns.length
  + (isSelectable.value ? 1 : 0)
  + (hasRowActions.value ? 1 : 0)
  + (props.expandable ? 1 : 0),
)

function thClass(c: DataTableColumn<R>) {
  return cx(
    c.align === 'right' && 'num',
    c.align === 'center' && 'center',
    c.sortable && 'sortable',
  )
}

function tdClass(c: DataTableColumn<R>) {
  return cx(
    c.align === 'right' && 'num',
    c.align === 'center' && 'center',
    c.cellClass,
  )
}

function thStyle(c: DataTableColumn<R>): CSSProperties {
  if (c.width === undefined)
    return {}
  return { width: typeof c.width === 'number' ? `${c.width}px` : c.width }
}

const tableInstance = getCurrentInstance()
const hasOnRowClick = computed(() => !!tableInstance?.vnode.props?.onRowClick)

function rowStyle(): CSSProperties {
  /* v3 decision #2: row click no longer toggles expand — pointer cursor only when
     a real row-click handler is wired. */
  return hasOnRowClick.value ? { cursor: 'pointer' } : { cursor: 'default' }
}

function emitRowClick(row: R) {
  /* v3 decision #2: chevron is the canonical expand toggle.
     Row clicks no longer toggle expand when expandable. */
  emit('rowClick', row)
}

/**
 * Functional wrapper that invokes a column's `render(row)` and returns a VNode.
 * Lets us call user-supplied render functions from the template without `<component :is>`.
 */
const ColRender = defineComponent({
  name: 'DataTableColRender',
  props: {
    render: { type: Function, required: true },
    row: { type: null, required: true },
  },
  setup(p) {
    return () => {
      const out = (p.render as (row: any) => any)(p.row)
      if (out === null || out === undefined)
        return null
      return typeof out === 'object' ? out : h('span', null, String(out))
    }
  },
})

/* ---------- skeleton sizing ---------- */
const skeletonRowCount = computed(() => (pp.value > 10 ? 10 : pp.value))
function skeletonWidth(c: number) {
  if (c === 0)
    return '40%'
  if (c === colCount.value - 1)
    return '50%'
  return '70%'
}
</script>

<template>
  <div
    class="data-table"
    :aria-busy="loading ? 'true' : undefined"
  >
    <span
      v-if="loading"
      class="visually-hidden"
      role="status"
    >{{ t('Loading') }}</span>
    <!-- Bulk action bar -->
    <div
      v-if="isSelectable && selection.size > 0"
      class="bulkbar"
    >
      <Checkbox
        :model-value="allOnPageSelected"
        :indeterminate="someSelected"
        :aria-label="t('Select')"
        @update:model-value="toggleAll"
      />
      <span class="bulkbar__count">{{ t('{count} selected', { count: selection.size }) }}</span>
      <div class="bulkbar__actions">
        <slot
          name="bulk-actions"
          :selected="selectedRows"
          :clear="clearSel"
        />
        <Button
          variant="ghost"
          size="sm"
          @click="clearSel"
        >
          {{ t('Clear') }}
        </Button>
      </div>
    </div>

    <div
      v-if="showMobileCards"
      class="mobile-records"
    >
      <template v-if="loading">
        <div
          v-for="n in 3"
          :key="n"
          class="mobile-record mobile-record--loading"
        >
          <Skeleton
            w="45%"
            :h="16"
          /><Skeleton
            w="75%"
            :h="14"
          /><Skeleton
            w="60%"
            :h="14"
          />
        </div>
      </template>
      <template v-else-if="!pageRows.length">
        <slot name="empty">
          <StateFill
            :icon="emptyIcon"
            :title="emptyTitle ?? t('No results')"
            :sub="emptySub ?? t('Nothing matches your filters.')"
          />
        </slot>
      </template>
      <template v-else>
        <div
          v-if="isSelectable"
          class="mobile-records__select"
        >
          <Checkbox
            :model-value="allOnPageSelected"
            :indeterminate="someSelected"
            :aria-label="t('Select all')"
            @update:model-value="toggleAll"
          /><span>{{ t('Select all') }}</span>
        </div>
        <article
          v-for="r in pageRows"
          :key="idOf(r)"
          class="mobile-record"
          :class="{ 'is-selected': selection.has(idOf(r)) }"
        >
          <header class="mobile-record__head">
            <Checkbox
              v-if="isSelectable"
              :model-value="selection.has(idOf(r))"
              :aria-label="`${t('Select')} ${idOf(r)}`"
              @update:model-value="toggleOne(idOf(r))"
            />
            <strong v-if="mobileTitleColumn">
              <slot
                :name="`cell.${mobileTitleColumn.key}`"
                :row="r"
                :value="r[mobileTitleColumn.key]"
                :mobile="true"
              >
                <ColRender
                  v-if="mobileTitleColumn.render"
                  :render="mobileTitleColumn.render"
                  :row="r"
                /><template v-else>{{ r[mobileTitleColumn.key] }}</template>
              </slot>
            </strong>
            <button
              v-if="mobileDetails"
              class="mobile-record__expand"
              type="button"
              :aria-expanded="expanded.has(idOf(r))"
              @click="toggleExpand(idOf(r))"
            >
              {{ t(expanded.has(idOf(r)) ? 'Show less' : 'Details') }}<DesignIcon
                :name="expanded.has(idOf(r)) ? 'sortup' : 'chevdown'"
                :size="15"
              />
            </button>
          </header>
          <dl class="mobile-record__fields">
            <div
              v-for="column in mobileColumns(r)"
              :key="column.key"
              :class="{ 'mobile-record__field--wide': column.mobileFullWidth }"
            >
              <dt>{{ column.label }}</dt>
              <dd>
                <slot
                  :name="`cell.${column.key}`"
                  :row="r"
                  :value="r[column.key]"
                  :mobile="true"
                >
                  <ColRender
                    v-if="column.render"
                    :render="column.render"
                    :row="r"
                  /><template v-else>
                    {{ r[column.key] }}
                  </template>
                </slot>
              </dd>
            </div>
          </dl>
          <div
            v-if="expandable && expanded.has(idOf(r))"
            class="mobile-record__detail"
          >
            <slot
              name="expanded"
              :row="r"
            />
          </div>
          <footer
            v-if="hasRowActions"
            class="mobile-record__actions"
          >
            <slot
              name="row-actions"
              :row="r"
            />
          </footer>
        </article>
      </template>
    </div>
    <div
      v-else
      class="tablewrap"
      tabindex="0"
      :aria-label="t('Table')"
    >
      <table
        class="dtable"
        :aria-busy="loading ? 'true' : undefined"
      >
        <thead>
          <tr>
            <th
              v-if="expandable"
              style="width: 40px;"
            />
            <th
              v-if="isSelectable"
              style="width: 44px;"
              scope="col"
            >
              <Checkbox
                :model-value="allOnPageSelected"
                :indeterminate="someSelected"
                :aria-label="t('Select')"
                @update:model-value="toggleAll"
              />
            </th>
            <th
              v-for="c in columns"
              :key="c.key"
              :class="thClass(c)"
              :style="thStyle(c)"
              scope="col"
              :aria-sort="c.sortable && currentSort.key === c.key
                ? (currentSort.dir === 'asc' ? 'ascending' : 'descending')
                : undefined"
            >
              <button
                v-if="c.sortable"
                type="button"
                class="table-sort"
                @click="toggleSort(c.key)"
              >
                <span>{{ c.label }}</span>
                <span :class="cx('sort-ic', currentSort.key === c.key && 'is-active')">
                  <DesignIcon
                    :name="currentSort.key === c.key ? (currentSort.dir === 'asc' ? 'sortup' : 'sortdown') : 'sort'"
                    :size="13"
                  />
                </span>
              </button>
              <template v-else>
                {{ c.label }}
              </template>
            </th>
            <th
              v-if="hasRowActions"
              class="num"
              style="width: 120px;"
            >
              {{ t('Actions') }}
            </th>
          </tr>
        </thead>

        <!-- Loading skeleton -->
        <tbody v-if="loading">
          <tr
            v-for="r in skeletonRowCount"
            :key="`sk-${r}`"
          >
            <td
              v-if="expandable"
              style="width: 40px;"
            />
            <td
              v-if="isSelectable"
              style="width: 44px;"
            >
              <Skeleton
                :w="18"
                :h="18"
                :r="4"
              />
            </td>
            <td
              v-for="(c, ci) in columns"
              :key="`sk-${r}-${c.key}`"
            >
              <Skeleton
                :h="14"
                :w="skeletonWidth(ci + (isSelectable ? 1 : 0) + (expandable ? 1 : 0))"
              />
            </td>
            <td
              v-if="hasRowActions"
              class="num"
            >
              <Skeleton
                :h="14"
                w="60%"
              />
            </td>
          </tr>
        </tbody>

        <!-- Body -->
        <tbody v-else>
          <!-- Data rows -->
          <template
            v-for="r in pageRows"
            :key="idOf(r)"
          >
            <tr
              :class="cx(selection.has(idOf(r)) && 'is-selected')"
              :style="rowStyle()"
              :tabindex="hasOnRowClick ? 0 : undefined"
              @click="emitRowClick(r)"
              @keydown.enter.self="emitRowClick(r)"
              @keydown.space.self.prevent="emitRowClick(r)"
            >
              <td
                v-if="expandable"
                style="width: 40px;"
              >
                <button
                  class="iconaction"
                  :title="expanded.has(idOf(r)) ? t('close') : t('Expand')"
                  :aria-label="expanded.has(idOf(r)) ? t('close') : t('Expand')"
                  :aria-expanded="expanded.has(idOf(r))"
                  @click.stop="toggleExpand(idOf(r))"
                >
                  <DesignIcon
                    name="chevright"
                    :size="16"
                    :style="{
                      transform: expanded.has(idOf(r)) ? 'rotate(90deg)' : 'none',
                      transition: 'transform .15s',
                    }"
                  />
                </button>
              </td>
              <td v-if="isSelectable">
                <Checkbox
                  :model-value="selection.has(idOf(r))"
                  :aria-label="`${t('Select')} ${idOf(r)}`"
                  @update:model-value="toggleOne(idOf(r))"
                />
              </td>
              <td
                v-for="c in columns"
                :key="c.key"
                :class="tdClass(c)"
              >
                <slot
                  :name="`cell.${c.key}`"
                  :row="r"
                  :value="(r as any)[c.key]"
                  :mobile="false"
                >
                  <ColRender
                    v-if="c.render"
                    :render="c.render"
                    :row="r"
                  />
                  <template v-else>
                    {{ (r as any)[c.key] }}
                  </template>
                </slot>
              </td>
              <td
                v-if="hasRowActions"
                class="num"
              >
                <div
                  class="row-actions"
                  @click.stop
                >
                  <slot
                    name="row-actions"
                    :row="r"
                  />
                </div>
              </td>
            </tr>
            <tr
              v-if="expandable && expanded.has(idOf(r))"
              class="row-expand"
            >
              <td :colspan="colCount">
                <div class="expand-inner">
                  <slot
                    name="expanded"
                    :row="r"
                  />
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- Keep empty/error messages inside the visible card, outside the wide table. -->
    <div
      v-if="!showMobileCards && !loading && !pageRows.length"
      class="data-table__empty"
    >
      <slot name="empty">
        <StateFill
          :icon="emptyIcon"
          :title="emptyTitle ?? t('No results')"
          :sub="emptySub ?? t('Nothing matches your filters.')"
        />
      </slot>
    </div>

    <!-- Pagination footer (decision #3: delegated to <Pagination>) -->
    <Pagination
      v-if="!loading && totalItems > 0"
      :page="curPage"
      :per-page="pp"
      :pages="totalPages"
      :total="totalItems"
      :per-page-options="perPageOptions"
      @page="goPage"
      @per-page="setPp"
    />
  </div>
</template>

<style scoped>
/* Layout-only safeguards. All visual styling comes from
   src/styles/design-shell.css (verbatim ported alpha-design-system.css). */
.row {
  display: flex;
  align-items: center;
}
.mobile-records { display: grid; gap: 10px; padding: 12px; }
.mobile-records__select { display: flex; align-items: center; gap: 9px; min-height: 44px; color: var(--text-secondary); font-size: 12px; }
.mobile-record { min-width: 0; padding: 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
.mobile-record.is-selected { border-color: var(--primary-border); background: var(--primary-weak); }
.mobile-record--loading { display: grid; gap: 18px; min-height: 144px; }
.mobile-record__head { display: flex; align-items: center; gap: 10px; min-height: 36px; }
.mobile-record__head > strong { min-width: 0; flex: 1; font-size: 14px; overflow-wrap: anywhere; }
.mobile-record__expand { display: flex; align-items: center; gap: 4px; min-height: 44px; flex-shrink: 0; color: var(--primary); font-size: 11px; }
.mobile-record__expand:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 5px; }
.mobile-record__fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 12px; margin: 10px 0 0; }
.mobile-record__fields > div { min-width: 0; }
.mobile-record__fields > .mobile-record__field--wide { grid-column: 1 / -1; }
.mobile-record__fields dt { margin-bottom: 4px; color: var(--text-secondary); font-size: 11px; }
.mobile-record__fields dd { margin: 0; font-size: 13px; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.mobile-record__detail { border-top: 1px solid var(--border); margin-top: 14px; padding-top: 14px; }
.mobile-record__actions { display: flex; gap: 6px; justify-content: flex-end; border-top: 1px solid var(--border); padding-top: 8px; margin-top: 14px; }
.mobile-record__fields :deep(.nowrap) { white-space: normal; }
.mobile-record__fields :deep(.badge) { max-width: 100%; height: auto; min-height: 22px; padding-block: 2px; white-space: normal; overflow-wrap: anywhere; }
.mobile-record__fields :deep(.badge--dot::before) { flex-shrink: 0; }
.mobile-record__fields :deep(.prep-time) { min-width: 0; }
.bulkbar { flex-wrap: wrap; }
.bulkbar__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-inline-start: auto; }
@media (max-width: 700px) {
  .bulkbar__actions { flex-basis: 100%; margin-inline-start: 0; }
  .bulkbar__actions :deep(.btn) { min-height: 44px; }
}
</style>
