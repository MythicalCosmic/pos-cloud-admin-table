<script setup lang="ts">
/* Shared compact calendar: translated month names, canonical business dates,
   keyboard navigation, and exact continuous time intervals. */
import DesignIcon from './DesignIcon.vue'
import { designId } from './ids'
import TimeRange from './TimeRange.vue'
import { cx } from './utils'
import { businessToday, useBusinessDay } from '@/composables/useBusinessDay'

export interface DateRangeValue {
  from: string
  to: string
  preset?: string
  mode?: 'date' | 'time'
  fromTime?: string
  toTime?: string
}

interface Props {
  modelValue?: DateRangeValue
  value?: DateRangeValue
  align?: 'left' | 'right'
  size?: 'sm'
  placeholder?: string
  enableTime?: boolean
  /** Hide the unbounded preset where the consuming endpoint has no true all-time contract. */
  includeAll?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  align: 'left',
  placeholder: 'All time',
  enableTime: true,
  includeAll: true,
})
const emit = defineEmits<{
  (e: 'update:modelValue', v: DateRangeValue): void
  (e: 'change', v: DateRangeValue): void
}>()

const { t, te, locale } = useI18n({ useScope: 'global' })
const biz = useBusinessDay()
const pickerId = designId('date-range')
const dialogId = `${pickerId}-dialog`
const dateTabId = `${pickerId}-date-tab`
const timeTabId = `${pickerId}-time-tab`

const current = computed<DateRangeValue>(() => props.modelValue ?? props.value ?? { from: '', to: '', preset: 'all' })

function ymd(d: Date): string {
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function parseYmd(s: string | null | undefined): Date | null {
  if (!s) return null
  const m = String(s).split('-')
  if (m.length < 3) return null
  const d = new Date(+m[0], +m[1] - 1, +m[2])
  return Number.isNaN(d.getTime()) ? null : d
}
function startOfDay(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function addMonths(d: Date, n: number): Date { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function sameDay(a: Date | null, b: Date | null): boolean {
  return !!(a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate())
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WD = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

type PresetKey = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'prevmonth' | 'year' | 'all'

function presetRange(key: PresetKey, today: Date): [Date | null, Date | null] {
  const tt = startOfDay(today)
  switch (key) {
    case 'today': return [tt, tt]
    case 'yesterday': { const y = addDays(tt, -1); return [y, y] }
    case '7d': return [addDays(tt, -6), tt]
    case '30d': return [addDays(tt, -29), tt]
    case 'month': return [new Date(tt.getFullYear(), tt.getMonth(), 1), tt]
    case 'prevmonth': {
      const s = new Date(tt.getFullYear(), tt.getMonth() - 1, 1)
      const e = new Date(tt.getFullYear(), tt.getMonth(), 0)
      return [s, e]
    }
    case 'year': return [new Date(tt.getFullYear(), 0, 1), tt]
    case 'all': return [null, null]
    default: return [null, null]
  }
}

const PRESETS: { key: PresetKey, label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'prevmonth', label: 'Last month' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
]

const visiblePresets = computed(() => props.includeAll
  ? PRESETS
  : PRESETS.filter(preset => preset.key !== 'all'))

// Only two presets: operating-hour bounds and whole business day. A clock pair
// is an exact interval from the first selected date to the final selected date,
// not a repeated per-day filter.
const TIME_PRESETS = computed<{ key: string, label: string, from: string, to: string }[]>(() => [
  { key: 'open', label: 'Working hours', from: biz.open.value, to: biz.close.value },
  { key: 'allday', label: 'Whole day', from: '', to: '' },
])

function fmtShort(d: Date): string {
  if (!String(locale.value).startsWith('uz'))
    return new Intl.DateTimeFormat(String(locale.value), { day: 'numeric', month: 'short', year: 'numeric' }).format(d)

  // Some browser ICU builds return M08/M09 for Uzbek month names.
  return `${d.getDate()} ${t(MONTHS[d.getMonth()])} ${d.getFullYear()}`
}

function fmtLong(d: Date): string {
  if (!String(locale.value).startsWith('uz'))
    return new Intl.DateTimeFormat(String(locale.value), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)

  return `${t(`wd_${WD[(d.getDay() + 6) % 7]}`)}, ${fmtShort(d)}`
}

function matchPreset(from: Date | null, to: Date | null, today: Date): string | null {
  if (!from && !to) return 'all'
  for (const p of PRESETS) {
    if (p.key === 'all') continue
    const [a, b] = presetRange(p.key, today)
    if (a && b && from && to && sameDay(from, a) && sameDay(to, b)) return p.key
  }
  return null
}

const today = ref(businessToday())
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)

const mode = ref<'date' | 'time'>(props.enableTime ? ((current.value.mode as any) || 'date') : 'date')
const from = ref<Date | null>(parseYmd(current.value.from))
const to = ref<Date | null>(parseYmd(current.value.to))
const fromTime = ref<string>(current.value.fromTime || '')
const toTime = ref<string>(current.value.toTime || '')
const hover = ref<Date | null>(null)
const focusedDate = ref<Date>(from.value || to.value || today.value)
const view = ref<Date>(
  from.value ? new Date(from.value.getFullYear(), from.value.getMonth(), 1)
    : new Date(today.value.getFullYear(), today.value.getMonth(), 1),
)

function refreshToday() {
  today.value = businessToday()
}

watch(open, (v) => {
  if (v) {
    refreshToday()
    const vf = parseYmd(current.value.from)
    const vt = parseYmd(current.value.to)
    from.value = vf
    to.value = vt
    hover.value = null
    mode.value = props.enableTime ? ((current.value.mode as any) || 'date') : 'date'
    fromTime.value = current.value.fromTime || ''
    toTime.value = current.value.toTime || ''
    focusedDate.value = vf || vt || today.value
    view.value = vf
      ? new Date(vf.getFullYear(), vf.getMonth(), 1)
      : new Date(today.value.getFullYear(), today.value.getMonth(), 1)
  }
})

/* Click-outside: pointerdown-capture — Teleport-safe because we also check popRef */
const popRef = ref<HTMLElement | null>(null)
function onDocPointer(e: PointerEvent) {
  if (!open.value) return
  const tgt = e.target as Node | null
  if (tgt && root.value?.contains(tgt)) return
  if (tgt && popRef.value?.contains(tgt)) return
  open.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) {
    e.preventDefault()
    closePicker(true)
  }
}

function closePicker(restoreFocus = false) {
  open.value = false
  if (restoreFocus)
    nextTick(() => triggerRef.value?.focus())
}

function onTriggerKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowDown') return
  e.preventDefault()
  if (!open.value) open.value = true
  nextTick(() => focusDay(focusedDate.value))
}

// Anchor position — popover is Teleported to <body> to escape sibling-card
// stacking contexts, so we compute its (fixed) left/top from the trigger rect.
const popPos = ref<{ left: number; top: number; width: number; maxHeight: number } | null>(null)

function measure() {
  const el = root.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const gap = 6
  const vw = window.innerWidth
  const vh = window.innerHeight
  const isMobile = vw <= 768
  const popW = Math.min(480, vw - 16)
  if (isMobile) {
    popPos.value = {
      left: 12,
      top: 12,
      width: Math.max(0, vw - 24),
      maxHeight: Math.max(120, vh - 86),
    }
    return
  }
  const wantRight = props.align === 'right'
  const left = wantRight
    ? Math.max(8, Math.min(rect.right - popW, vw - popW - 8))
    : Math.max(8, Math.min(rect.left, vw - popW - 8))
  const below = vh - rect.bottom - gap - 12
  const above = rect.top - gap - 12
  const openAbove = below < 420 && above > below
  const maxHeight = Math.max(120, openAbove ? above : below)
  const top = openAbove
    ? Math.max(12, rect.top - gap - Math.min(520, maxHeight))
    : rect.bottom + gap
  popPos.value = { left, top, width: popW, maxHeight }
}

watch(open, (v) => {
  if (v) {
    nextTick(measure)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
  }
  else {
    window.removeEventListener('resize', measure)
    window.removeEventListener('scroll', measure, true)
  }
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer, true)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer, true)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', measure)
  window.removeEventListener('scroll', measure, true)
})

function pick(d: Date) {
  if (!from.value || (from.value && to.value)) {
    from.value = d; to.value = null; hover.value = null
  }
  else if (d.getTime() < from.value.getTime()) {
    to.value = from.value; from.value = d
  }
  else {
    to.value = d
  }
}

function emitChange(v: DateRangeValue) {
  emit('update:modelValue', v)
  emit('change', v)
}

/* Date range and exact clock bounds travel together. Whole business day has
   empty clock fields so the server resolves its canonical 07:00→03:00 window. */
function emitCombined(dateFrom: Date | null, dateTo: Date | null, preset?: string) {
  const tval = dateTo || dateFrom
  const hasExactTime = !!(dateFrom && tval && fromTime.value && toTime.value)
  emitChange({
    from: dateFrom ? ymd(dateFrom) : '',
    to: tval ? ymd(tval) : '',
    preset: preset ?? matchPreset(dateFrom, tval, today.value) ?? undefined,
    mode: mode.value,
    fromTime: hasExactTime ? fromTime.value : '',
    toTime: hasExactTime ? toTime.value : '',
  })
}

function applyPreset(key: PresetKey) {
  refreshToday()
  const [a, b] = presetRange(key, today.value)
  from.value = a; to.value = b; hover.value = null
  if (!a) clearTime()
  if (a) view.value = new Date(a.getFullYear(), a.getMonth(), 1)
  emitCombined(a, b, key)
  closePicker(true)
}

function apply() {
  emitCombined(from.value, to.value || from.value)
  closePicker(true)
}

function applyTime() {
  const vf = parseYmd(current.value.from) || from.value
  const vt = parseYmd(current.value.to) || to.value
  if (!vf) return
  emitCombined(vf, vt)
  closePicker(true)
}

function applyTimePreset(p: { from: string, to: string }) {
  fromTime.value = p.from
  toTime.value = p.to
}

function clear() {
  from.value = null; to.value = null; hover.value = null
  clearTime()
}
function clearTime() {
  fromTime.value = ''; toTime.value = ''
}

const valFrom = computed(() => parseYmd(current.value.from))
const valTo = computed(() => parseYmd(current.value.to))
const activePreset = computed(() => matchPreset(valFrom.value, valTo.value, today.value))
const draftActive = computed(() => matchPreset(from.value, to.value, today.value))
const hasDraftDate = computed(() => !!from.value)
const hasPartialTime = computed(() => Boolean(fromTime.value) !== Boolean(toTime.value))
const canApplyTime = computed(() => hasDraftDate.value && !hasPartialTime.value)

function rangeEndForTime(dateFrom: Date, dateTo: Date, startTime: string, endTime: string): Date {
  return sameDay(dateFrom, dateTo) && endTime <= startTime ? addDays(dateTo, 1) : dateTo
}

const triggerLabel = computed(() => {
  const placeholder = te(props.placeholder) ? t(props.placeholder) : props.placeholder
  let base: string
  if (activePreset.value && activePreset.value !== 'all') {
    const p = PRESETS.find(x => x.key === activePreset.value)
    base = p ? t(p.label) : placeholder
  }
  else if (valFrom.value && valTo.value) {
    base = sameDay(valFrom.value, valTo.value)
      ? fmtShort(valFrom.value)
      : `${fmtShort(valFrom.value)} – ${fmtShort(valTo.value)}`
  }
  else if (valFrom.value) {
    base = `${t('From')} ${fmtShort(valFrom.value)}`
  }
  else {
    base = placeholder
  }
  // Exact interval mode must show both date-times, including an overnight end.
  const tf = current.value.fromTime
  const tt = current.value.toTime
  if (tf && tt && valFrom.value && valTo.value) {
    const end = rangeEndForTime(valFrom.value, valTo.value, tf, tt)
    base = `${fmtShort(valFrom.value)} ${tf} – ${fmtShort(end)} ${tt}`
  }
  return base
})

const hasValue = computed(() => !!(valFrom.value || valTo.value))

const draftLabel = computed(() => {
  if (from.value && to.value)
    return sameDay(from.value, to.value)
      ? fmtShort(from.value)
      : `${fmtShort(from.value)} – ${fmtShort(to.value)}`
  if (from.value) return `${fmtShort(from.value)} – …`
  return t('Select a start date')
})

const draftTimeLabel = computed(() => {
  if (fromTime.value || toTime.value)
    return `${fromTime.value || '00:00'} – ${toTime.value || '23:59'}`
  return t('Any time')
})

interface Cell { date: Date | null }

function buildCells(month: Date): Cell[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const startWd = (first.getDay() + 6) % 7 // Mon first
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells: Cell[] = []
  for (let i = 0; i < startWd; i++) cells.push({ date: null })
  for (let d = 1; d <= daysIn; d++)
    cells.push({ date: new Date(month.getFullYear(), month.getMonth(), d) })
  while (cells.length % 7 !== 0) cells.push({ date: null })
  return cells
}

const maxT = computed(() => today.value.getTime()) // disable future days

function cellClass(d: Date): string {
  const tt = d.getTime()
  const disabled = tt > maxT.value
  const isFrom = !!(from.value && sameDay(d, from.value))
  const fromT = from.value ? from.value.getTime() : null
  const toT = to.value ? to.value.getTime() : null
  const previewT = (from.value && !to.value && hover.value) ? hover.value.getTime() : toT
  const isTo = !!(previewT != null && sameDay(d, new Date(previewT)))
  const lo = fromT != null ? Math.min(fromT, previewT ?? fromT) : null
  const hi = fromT != null ? Math.max(fromT, previewT ?? fromT) : null
  const inRange = lo != null && hi != null && tt > lo && tt < hi
  const isEdge = isFrom || isTo
  const single = isFrom && isTo
  return cx(
    'drp-cell',
    disabled && 'is-disabled',
    sameDay(d, today.value) && 'is-today',
    inRange && 'in-range',
    isEdge && 'is-edge',
    isFrom && !single && 'is-start',
    isTo && !single && 'is-end',
    single && 'is-single',
  )
}

function cellDisabled(d: Date): boolean {
  return d.getTime() > maxT.value
}

function cellSelected(d: Date): boolean {
  if (!from.value) return false
  const end = to.value || from.value
  const tt = d.getTime()
  return tt >= from.value.getTime() && tt <= end.getTime()
}

function shiftMonthDate(d: Date, amount: number): Date {
  const first = new Date(d.getFullYear(), d.getMonth() + amount, 1)
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), lastDay))
}

async function focusDay(target: Date) {
  const next = target.getTime() > maxT.value ? new Date(today.value) : target
  focusedDate.value = next
  view.value = new Date(next.getFullYear(), next.getMonth(), 1)
  await nextTick()
  popRef.value
    ?.querySelector<HTMLButtonElement>(`[data-date="${ymd(next)}"]`)
    ?.focus()
}

function onDayKey(e: KeyboardEvent, d: Date) {
  let target: Date | null = null
  if (e.key === 'ArrowLeft') target = addDays(d, -1)
  else if (e.key === 'ArrowRight') target = addDays(d, 1)
  else if (e.key === 'ArrowUp') target = addDays(d, -7)
  else if (e.key === 'ArrowDown') target = addDays(d, 7)
  else if (e.key === 'Home') target = addDays(d, -((d.getDay() + 6) % 7))
  else if (e.key === 'End') target = addDays(d, 6 - ((d.getDay() + 6) % 7))
  else if (e.key === 'PageUp') target = shiftMonthDate(d, -1)
  else if (e.key === 'PageDown') target = shiftMonthDate(d, 1)
  if (!target) return
  e.preventDefault()
  void focusDay(target)
}

function setViewMonth(amount: number) {
  const next = addMonths(view.value, amount)
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  view.value = next
  focusedDate.value = new Date(
    next.getFullYear(),
    next.getMonth(),
    Math.min(focusedDate.value.getDate(), lastDay),
  )
}
function gotoPrev() { setViewMonth(-1) }
const canGotoNext = computed(() =>
  addMonths(view.value, 1).getTime()
  <= new Date(today.value.getFullYear(), today.value.getMonth(), 1).getTime(),
)
function gotoNext() {
  if (canGotoNext.value) setViewMonth(1)
}

function setMode(m: 'date' | 'time') {
  mode.value = m
}

function onModeKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  e.preventDefault()
  mode.value = mode.value === 'date' ? 'time' : 'date'
  nextTick(() => {
    const id = mode.value === 'date' ? dateTabId : timeTabId
    document.getElementById(id)?.focus()
  })
}
</script>

<template>
  <div ref="root" :class="cx('drp', size === 'sm' && 'drp--sm')">
    <button
      ref="triggerRef"
      type="button"
      :class="cx('drp-trigger', hasValue && 'has-value', open && 'is-open')"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-controls="dialogId"
      @click="open = !open"
      @keydown="onTriggerKey"
    >
      <DesignIcon name="calendar" :size="17" />
      <span class="drp-trigger__label">{{ triggerLabel }}</span>
      <DesignIcon name="chevdown" :size="15" class="drp-trigger__chev" />
    </button>

    <Teleport to="body">
    <div
      v-if="open"
      :id="dialogId"
      ref="popRef"
      :class="cx('drp-pop', 'drp-pop--col', 'drp-pop--fixed', align === 'right' && 'drp-pop--right')"
      role="dialog"
      :aria-label="t('Date range')"
      :style="popPos ? {
        left: popPos.left + 'px',
        top: popPos.top + 'px',
        width: popPos.width + 'px',
        maxHeight: popPos.maxHeight + 'px',
        right: 'auto',
        bottom: 'auto',
      } : undefined"
    >
      <div v-if="enableTime" class="drp-modebar">
        <div
          class="seg"
          style="width: 100%;"
          role="tablist"
          :aria-label="t('Date range')"
        >
          <button
            :id="dateTabId"
            type="button"
            :class="cx('seg__btn', mode === 'date' && 'is-active')"
            style="flex: 1;"
            role="tab"
            :aria-selected="mode === 'date'"
            :tabindex="mode === 'date' ? 0 : -1"
            @click="setMode('date')"
            @keydown="onModeKey"
          >
            <DesignIcon name="calendar" :size="15" />
            {{ t('Date range') }}
          </button>
          <button
            :id="timeTabId"
            type="button"
            :class="cx('seg__btn', mode === 'time' && 'is-active')"
            style="flex: 1;"
            role="tab"
            :aria-selected="mode === 'time'"
            :tabindex="mode === 'time' ? 0 : -1"
            @click="setMode('time')"
            @keydown="onModeKey"
          >
            <DesignIcon name="clock" :size="15" />
            {{ t('Time interval') }}
          </button>
        </div>
      </div>

      <div
        v-if="mode === 'date'"
        class="drp-body"
        role="tabpanel"
        :aria-labelledby="enableTime ? dateTabId : undefined"
      >
        <div class="drp-presets">
          <button
            v-for="p in visiblePresets"
            :key="p.key"
            type="button"
            :class="cx('drp-preset', draftActive === p.key && 'is-active')"
            :aria-pressed="draftActive === p.key"
            @click="applyPreset(p.key)"
          >
            {{ t(p.label) }}
          </button>
        </div>

        <div class="drp-cal">
          <div class="drp-cal__head">
            <button
              type="button"
              class="drp-nav"
              :title="t('Previous month')"
              :aria-label="t('Previous month')"
              @click="gotoPrev"
            >
              <DesignIcon name="chevleft" :size="17" />
            </button>
            <div class="drp-cal__titles">
              <span>{{ t(MONTHS[view.getMonth()]) }} {{ view.getFullYear() }}</span>
            </div>
            <button
              type="button"
              class="drp-nav"
              :title="t('Next month')"
              :aria-label="t('Next month')"
              :disabled="!canGotoNext"
              @click="gotoNext"
            >
              <DesignIcon name="chevright" :size="17" />
            </button>
          </div>

          <div class="drp-months" @mouseleave="hover = null">
            <div class="drp-month">
              <div class="drp-wd">
                <span
                  v-for="w in WD"
                  :key="w"
                  role="columnheader"
                >{{ t(`wd_${w}`) }}</span>
              </div>
              <div
                class="drp-grid"
                role="grid"
                :aria-label="`${t(MONTHS[view.getMonth()])} ${view.getFullYear()}`"
              >
                <template v-for="(c, i) in buildCells(view)" :key="i">
                  <span
                    v-if="!c.date"
                    class="drp-cell is-empty"
                    role="gridcell"
                    aria-hidden="true"
                  />
                  <button
                    v-else
                    type="button"
                    :class="cellClass(c.date)"
                    :disabled="cellDisabled(c.date)"
                    role="gridcell"
                    :data-date="ymd(c.date)"
                    :aria-label="fmtLong(c.date)"
                    :aria-selected="cellSelected(c.date)"
                    :aria-current="sameDay(c.date, today) ? 'date' : undefined"
                    :tabindex="sameDay(c.date, focusedDate) ? 0 : -1"
                    @click="pick(c.date)"
                    @focus="focusedDate = c.date"
                    @keydown="onDayKey($event, c.date)"
                    @mouseenter="hover = c.date"
                  >
                    <span class="drp-num">{{ c.date.getDate() }}</span>
                  </button>
                </template>
              </div>
            </div>
          </div>

          <div class="drp-foot">
            <span class="drp-foot__draft">{{ draftLabel }}</span>
            <div class="drp-foot__actions">
              <button v-if="from || to" type="button" class="drp-clear" @click="clear">
                {{ t('Clear') }}
              </button>
              <button type="button" class="btn btn--ghost btn--sm" @click="closePicker(true)">
                {{ t('Cancel') }}
              </button>
              <button
                type="button"
                class="btn btn--primary btn--sm"
                :disabled="!from"
                @click="apply"
              >
                {{ t('Apply') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        v-else
        class="drp-time"
        role="tabpanel"
        :aria-labelledby="enableTime ? timeTabId : undefined"
      >
        <div class="drp-time__label">
          {{ t('Set an exact time interval') }}
        </div>
        <p
          v-if="!hasDraftDate"
          class="drp-time__hint"
          role="status"
          style="margin: 0; color: rgb(var(--v-theme-text-secondary)); font-size: var(--fs-sm); line-height: 1.45;"
        >
          {{ t('Choose a date range before setting a time interval.') }}
        </p>
        <div class="drp-time__chips">
          <button
            v-for="p in TIME_PRESETS"
            :key="p.key"
            type="button"
            :class="cx('drp-timechip', fromTime === p.from && toTime === p.to && 'is-active')"
            :aria-pressed="fromTime === p.from && toTime === p.to"
            :disabled="!hasDraftDate"
            @click="applyTimePreset(p)"
          >
            {{ t(p.label) }}
          </button>
        </div>
        <div class="drp-time__custom">
          <span class="drp-time__customlabel">{{ t('Custom') }}</span>
          <TimeRange
            :from="fromTime"
            :to="toTime"
            :disabled="!hasDraftDate"
            @update:from="(v: string) => fromTime = v"
            @update:to="(v: string) => toTime = v"
          />
        </div>
        <div class="drp-foot" style="margin-top: auto;">
          <span class="drp-foot__draft">{{ draftTimeLabel }}</span>
          <div class="drp-foot__actions">
            <button v-if="fromTime || toTime" type="button" class="drp-clear" @click="clearTime">
              {{ t('Clear') }}
            </button>
            <button type="button" class="btn btn--ghost btn--sm" @click="closePicker(true)">
              {{ t('Cancel') }}
            </button>
            <button
              type="button"
              class="btn btn--primary btn--sm"
              :disabled="!canApplyTime"
              @click="applyTime"
            >
              {{ t('Apply') }}
            </button>
          </div>
        </div>
      </div>
    </div>
    </Teleport>
  </div>
</template>
