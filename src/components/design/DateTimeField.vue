<script setup lang="ts">
import DesignIcon from './DesignIcon.vue'
import { designId } from './ids'

const props = defineProps<{
  date: string
  time?: string
  defaultTime: string
  label: string
  placeholder?: string
  max: string
  invalid?: boolean
  describedBy?: string
}>()

const emit = defineEmits<{ (e: 'select', value: { date: string; time: string }): void }>()
const { t, locale } = useI18n({ useScope: 'global' })
const id = designId('datetime')
const trigger = ref<HTMLButtonElement | null>(null)
const dialog = ref<HTMLDialogElement | null>(null)
const hourInput = ref<HTMLInputElement | null>(null)
const open = ref(false)
const selected = ref(props.date)
const focused = ref(props.date)
const month = ref(new Date())
const hour = ref('00')
const minute = ref('00')
const position = ref({ left: '12px', top: '12px' })
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const pad = (value: number | string) => String(value).padStart(2, '0')
const ymd = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const parse = (date: string) => new Date(`${date}T12:00:00`)

function formatDate(value: string) {
  if (!value)
    return props.placeholder || t('Date')
  const date = parse(value)

  if (String(locale.value).startsWith('uz'))
    return `${date.getDate()} ${t(months[date.getMonth()])} ${date.getFullYear()}`
  return new Intl.DateTimeFormat(String(locale.value), { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

const monthLabel = computed(() => `${t(months[month.value.getMonth()])} ${month.value.getFullYear()}`)

const weeks = computed(() => {
  const start = new Date(month.value.getFullYear(), month.value.getMonth(), 1, 12)

  start.setDate(1 - (start.getDay() + 6) % 7)
  return Array.from({ length: 6 }, (_, week) => Array.from({ length: 7 }, (__, day) => {
    const date = new Date(start)

    date.setDate(start.getDate() + week * 7 + day)
    return { date: ymd(date), day: date.getDate(), muted: date.getMonth() !== month.value.getMonth() }
  }))
})

const timeValid = computed(() => /^\d{1,2}$/.test(hour.value) && Number(hour.value) <= 23
  && /^\d{1,2}$/.test(minute.value) && Number(minute.value) <= 59)

const timeValue = computed(() => `${pad(hour.value)}:${pad(minute.value)}`)
const canNext = computed(() => ymd(new Date(month.value.getFullYear(), month.value.getMonth() + 1, 1)) <= props.max)

function measure() {
  if (!open.value || !trigger.value || !dialog.value)
    return
  const anchor = trigger.value.getBoundingClientRect()
  const width = dialog.value.offsetWidth
  const height = dialog.value.offsetHeight
  const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12))
  const below = anchor.bottom + 8
  const top = below + height <= window.innerHeight - 12 ? below : Math.max(12, window.innerHeight - height - 12)

  position.value = { left: `${left}px`, top: `${top}px` }
}

function focusDay() {
  nextTick(() => dialog.value?.querySelector<HTMLButtonElement>(`[data-date="${focused.value}"]`)?.focus())
}

async function show() {
  selected.value = props.date || props.max
  focused.value = selected.value
  month.value = new Date(parse(selected.value).getFullYear(), parse(selected.value).getMonth(), 1, 12)
  ;[hour.value, minute.value] = (props.time || props.defaultTime).split(':')
  open.value = true
  await nextTick()
  dialog.value?.showModal()
  measure()
  focusDay()
}

function close() {
  dialog.value?.close()
  open.value = false
  trigger.value?.focus({ preventScroll: true })
}

function backdrop(event: MouseEvent) {
  const popup = dialog.value

  if (!popup || event.target !== popup)
    return
  const rect = popup.getBoundingClientRect()

  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
    close()
}

function changeMonth(delta: number) {
  const next = new Date(month.value.getFullYear(), month.value.getMonth() + delta, 1, 12)

  if (ymd(next) > props.max)
    return
  month.value = next
  focused.value = ymd(next)
}

function onCalendarKey(event: KeyboardEvent) {
  const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  const next = parse(focused.value)

  if (event.key in offsets) { next.setDate(next.getDate() + offsets[event.key]) }
  else if (event.key === 'Home' || event.key === 'End') { next.setDate(next.getDate() - (next.getDay() + 6) % 7 + (event.key === 'End' ? 6 : 0)) }
  else if (event.key === 'PageUp' || event.key === 'PageDown') {
    next.setDate(1)
    next.setMonth(next.getMonth() + (event.key === 'PageDown' ? 1 : -1))
  }
  else { return }
  event.preventDefault()
  focused.value = ymd(next) > props.max ? props.max : ymd(next)
  month.value = new Date(parse(focused.value).getFullYear(), parse(focused.value).getMonth(), 1, 12)
  focusDay()
}

function selectDay(date: string) {
  selected.value = date
  focused.value = date
  nextTick(() => {
    hourInput.value?.focus()
    hourInput.value?.select()
  })
}

function confirm() {
  if (!timeValid.value || !selected.value)
    return
  emit('select', { date: selected.value, time: timeValue.value })
  close()
}

function onDialogKey(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !dialog.value)
    return
  const controls = Array.from(dialog.value.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), input:not(:disabled)'))
  const first = controls[0]
  const last = controls[controls.length - 1]

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  }
  else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

onMounted(() => { window.addEventListener('resize', measure) })
onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
  dialog.value?.close()
})
</script>

<template>
  <div class="datetime-field">
    <span
      :id="`${id}-label`"
      class="datetime-field__label"
    >{{ label }}</span>
    <button
      :id="id"
      ref="trigger"
      class="datetime-field__trigger"
      type="button"
      :aria-labelledby="`${id}-label`"
      :aria-expanded="open"
      :aria-controls="`${id}-popup`"
      :aria-invalid="invalid || undefined"
      :aria-describedby="[`${id}-value`, describedBy].filter(Boolean).join(' ')"
      aria-haspopup="dialog"
      @click="show"
      @keydown.down.prevent="show"
    >
      <DesignIcon
        name="calendar"
        :size="18"
      />
      <span
        :id="`${id}-value`"
        class="datetime-field__value"
      >
        <span>{{ formatDate(date) }}</span>
        <span class="datetime-field__time"><DesignIcon
          name="clock"
          :size="13"
        />{{ time || t('Whole day') }}</span>
      </span>
      <DesignIcon
        name="chevdown"
        :size="16"
      />
    </button>

    <Teleport to="body">
      <dialog
        :id="`${id}-popup`"
        ref="dialog"
        class="datetime-pop"
        :style="position"
        :aria-labelledby="`${id}-heading`"
        @cancel.prevent="close"
        @click="backdrop"
        @keydown.stop="onDialogKey"
      >
        <div class="datetime-pop__head">
          <div>
            <h2 :id="`${id}-heading`">
              {{ label }}
            </h2><p>{{ t('dash_datetime_hint') }}</p>
          </div>
          <button
            type="button"
            :aria-label="t('Close')"
            @click="close"
          >
            <DesignIcon
              name="close"
              :size="18"
            />
          </button>
        </div>
        <div class="datetime-pop__month">
          <button
            type="button"
            :aria-label="t('Previous month')"
            @click="changeMonth(-1)"
          >
            <DesignIcon
              name="chevleft"
              :size="18"
            />
          </button>
          <strong aria-live="polite">{{ monthLabel }}</strong>
          <button
            type="button"
            :disabled="!canNext"
            :aria-label="t('Next month')"
            @click="changeMonth(1)"
          >
            <DesignIcon
              name="chevright"
              :size="18"
            />
          </button>
        </div>
        <table
          class="datetime-pop__calendar"
          role="grid"
          :aria-label="monthLabel"
          @keydown="onCalendarKey"
        >
          <thead>
            <tr>
              <th
                v-for="weekday in weekdays"
                :key="weekday"
                scope="col"
              >
                {{ t(weekday) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(week, index) in weeks"
              :key="index"
            >
              <td
                v-for="day in week"
                :key="day.date"
              >
                <button
                  type="button"
                  :data-date="day.date"
                  :class="{ 'is-muted': day.muted, 'is-today': day.date === max }"
                  :disabled="day.date > max"
                  :aria-label="formatDate(day.date)"
                  :aria-pressed="day.date === selected"
                  :tabindex="day.date === focused ? 0 : -1"
                  @click="selectDay(day.date)"
                  @focus="focused = day.date"
                >
                  {{ day.day }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="datetime-pop__clock">
          <div class="datetime-pop__step">
            <span><DesignIcon
              name="clock"
              :size="16"
            />{{ t('Time') }}</span><small>{{ t('dash_tashkent_time') }}</small>
          </div>
          <div class="datetime-pop__time-inputs">
            <label>{{ t('dash_hour') }}<input
              ref="hourInput"
              v-model="hour"
              type="text"
              inputmode="numeric"
              maxlength="2"
              autocomplete="off"
              :aria-invalid="!timeValid"
              @blur="hour = pad(hour)"
              @keydown.enter.prevent="confirm"
            ></label>
            <span aria-hidden="true">:</span>
            <label>{{ t('dash_minute') }}<input
              v-model="minute"
              type="text"
              inputmode="numeric"
              maxlength="2"
              autocomplete="off"
              :aria-invalid="!timeValid"
              @blur="minute = pad(minute)"
              @keydown.enter.prevent="confirm"
            ></label>
            <span class="datetime-pop__format">{{ t('dash_24hour') }}</span>
          </div>
          <p
            v-if="!timeValid"
            class="datetime-pop__error"
            role="alert"
          >
            {{ t('dash_clock_invalid') }}
          </p>
        </div>
        <div class="datetime-pop__foot">
          <span>{{ formatDate(selected) }}<b>{{ timeValid ? timeValue : '—' }}</b></span>
          <button
            type="button"
            :disabled="!timeValid"
            @click="confirm"
          >
            {{ t('dash_datetime_done') }}<DesignIcon
              name="check"
              :size="16"
            />
          </button>
        </div>
      </dialog>
    </Teleport>
  </div>
</template>

<style scoped>
.datetime-field { min-width: 0; display: grid; gap: 8px; }
.datetime-field__label { font-size: 12px; color: var(--text-secondary); font-weight: 600; }
.datetime-field__trigger { min-width: 0; width: 100%; min-height: 60px; display: flex; align-items: center; gap: 12px; padding: 10px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-2); color: var(--text); text-align: left; transition: border-color 150ms, background 150ms; }
.datetime-field__trigger:hover { border-color: var(--primary); background: var(--primary-weak); }
.datetime-field__trigger[aria-expanded="true"] { border-color: var(--primary); }
.datetime-field__trigger > svg { flex-shrink: 0; color: var(--text-secondary); }
.datetime-field__trigger > svg:last-child { margin-left: auto; }
.datetime-field__value { min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 6px 14px; font-size: 14px; font-weight: 600; line-height: 1.25; font-variant-numeric: tabular-nums; }
.datetime-field__time { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-secondary); font-weight: 500; }
.datetime-field__trigger:focus-visible, .datetime-pop button:focus-visible, .datetime-pop input:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
.datetime-pop { position: fixed; margin: 0; width: 358px; max-width: calc(100vw - 24px); max-height: calc(100dvh - 24px); padding: 20px; overflow: auto; border: 1px solid var(--border); border-radius: 22px; color: var(--text); background: var(--surface); box-shadow: 0 12px 50px #0003, 0 2px 8px #0001; }
.datetime-pop[open] { animation: datetime-enter 180ms ease-out; }
.datetime-pop::backdrop { background: #00000012; }
.datetime-pop__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.datetime-pop__head h2 { margin: 0; font-size: 17px; line-height: 1.3; letter-spacing: -.02em; }
.datetime-pop__head p { margin: 5px 0 0; font-size: 12px; color: var(--text-secondary); line-height: 1.5; }
.datetime-pop__head button, .datetime-pop__month button { flex: 0 0 40px; display: grid; place-items: center; min-height: 40px; border-radius: 10px; color: var(--text-secondary); }
.datetime-pop button:hover:not(:disabled) { background: var(--primary-weak); color: var(--primary); }
.datetime-pop__head button { margin: -8px -8px 0 0; }
.datetime-pop__month { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 15px 0 6px; }
.datetime-pop__month strong { font-size: 14px; text-align: center; }
.datetime-pop button:disabled { opacity: .3; cursor: default; }
.datetime-pop__calendar { width: 100%; border-collapse: separate; border-spacing: 2px; table-layout: fixed; font-variant-numeric: tabular-nums; }
.datetime-pop__calendar th { height: 28px; color: var(--text-secondary); font-size: 10px; font-weight: 600; text-align: center; }
.datetime-pop__calendar td { padding: 0; text-align: center; }
.datetime-pop__calendar button { position: relative; width: 100%; min-height: 40px; border-radius: 10px; font-size: 13px; font-weight: 600; }
.datetime-pop__calendar button.is-muted { color: var(--text-secondary); font-weight: 400; }
.datetime-pop__calendar button.is-today::after { content: ''; position: absolute; width: 4px; height: 4px; bottom: 4px; left: calc(50% - 2px); border-radius: 50%; background: currentColor; }
.datetime-pop .datetime-pop__calendar button[aria-pressed="true"] { background: var(--primary); color: var(--on-primary); }
.datetime-pop__clock { margin-top: 15px; padding-top: 16px; border-top: 1px solid var(--border); }
.datetime-pop__step { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.datetime-pop__step > span { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600; }
.datetime-pop__step small { font-size: 10px; color: var(--text-secondary); }
.datetime-pop__time-inputs { display: flex; align-items: flex-end; gap: 10px; margin-top: 12px; }
.datetime-pop__time-inputs label { display: grid; gap: 5px; color: var(--text-secondary); font-size: 10px; }
.datetime-pop__time-inputs input { width: 70px; height: 48px; border: 1px solid var(--border); border-radius: 11px; background: var(--surface-2); color: var(--text); text-align: center; font: 22px var(--font-mono); font-variant-numeric: tabular-nums; }
.datetime-pop__time-inputs > span { padding-bottom: 11px; color: var(--text-secondary); }
.datetime-pop__time-inputs .datetime-pop__format { margin-left: auto; font-size: 11px; }
.datetime-pop__error { margin: 8px 0 0; color: var(--error); font-size: 12px; }
.datetime-pop__foot { display: flex; flex-direction: column; gap: 12px; margin-top: 18px; }
.datetime-pop__foot > span { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; color: var(--text-secondary); font-size: 12px; }
.datetime-pop__foot b { color: var(--text); font-variant-numeric: tabular-nums; }
.datetime-pop .datetime-pop__foot button { display: flex; justify-content: center; align-items: center; gap: 9px; min-height: 44px; border-radius: 11px; background: var(--primary); color: var(--on-primary); font-size: 13px; font-weight: 700; }
:global(body:has(.datetime-pop[open])) { overflow: hidden; }
@keyframes datetime-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 900px) { .datetime-field__value { display: grid; gap: 4px; font-size: 13px; } .datetime-field__trigger { gap: 6px; padding: 9px 10px; } .datetime-field__trigger > svg:first-child { display: none; } }
@media (max-width: 600px) {
  .datetime-pop { top: auto !important; bottom: max(12px, env(safe-area-inset-bottom)); left: 12px !important; width: calc(100vw - 24px); max-height: calc(100dvh - 24px); padding: 18px; }
  .datetime-pop::backdrop { background: #0006; }
  .datetime-pop__calendar { border-spacing: 1px; }
  .datetime-pop__calendar button, .datetime-pop__head button, .datetime-pop__month button { min-height: 44px; }
}
@media (max-width: 360px) { .datetime-pop { padding: 10px; } .datetime-field__trigger { padding: 8px; } .datetime-field__value { font-size: 12px; } .datetime-field__trigger > svg:last-child { display: none; } }
@media (prefers-reduced-motion: reduce) { .datetime-pop[open] { animation: none; } .datetime-field__trigger { transition: none; } }
</style>
