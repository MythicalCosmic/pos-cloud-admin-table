<script setup lang="ts">
import DesignIcon from './DesignIcon.vue'
import { designId } from './ids'
import { fieldContextKey } from './fieldContext'

const props = withDefaults(defineProps<{
  modelValue?: string | number | null
  type?: 'date' | 'datetime-local' | 'month' | 'time'
  min?: string
  max?: string
  disabled?: boolean
  readonly?: boolean
  required?: boolean
  error?: boolean | string
}>(), { modelValue: '', type: 'date' })

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()
const classes = computed(() => String(attrs.class || '').split(/\s+/).filter(Boolean))
const controlClasses = computed(() => classes.value.filter(name => name.startsWith('control--')))
const wrapperClasses = computed(() => classes.value.filter(name => name !== 'control' && !name.startsWith('control--')))
const field = inject(fieldContextKey, null)
const { t, locale } = useI18n({ useScope: 'global' })
const id = designId('date-input')
const trigger = ref<HTMLButtonElement | null>(null)
const popup = ref<HTMLDialogElement | null>(null)
const hidden = ref<HTMLInputElement | null>(null)
const hourInput = ref<HTMLInputElement | null>(null)
const open = ref(false)
const choosingMonth = ref(false)
const selected = ref('')
const focused = ref('')
const month = ref(new Date())
const hours = ref('00')
const minutes = ref('00')
const style = ref<Record<string, string>>({})
const pad = (v: number | string) => String(v).padStart(2, '0')
const ymd = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const parse = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`)
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const hasTime = computed(() => ['time', 'datetime-local'].includes(props.type))
const invalid = computed(() => !!props.error || !!field?.invalid.value)
const label = computed(() => String(attrs['aria-label'] || field?.label.value || attrs.placeholder || t(props.type === 'time' ? 'Time' : 'Date')))
const time = computed(() => `${pad(hours.value)}:${pad(minutes.value)}`)

const candidate = computed(() => {
  if (props.type === 'time')
    return time.value
  if (props.type === 'month')
    return selected.value.slice(0, 7)
  return selected.value + (hasTime.value ? `T${time.value}` : '')
})

const validTime = computed(() => /^\d{1,2}$/.test(hours.value) && Number(hours.value) < 24 && /^\d{1,2}$/.test(minutes.value) && Number(minutes.value) < 60)

const canApply = computed(() => !!candidate.value && (!hasTime.value || validTime.value)
  && (!props.min || candidate.value >= props.min) && (!props.max || candidate.value <= props.max))

const display = computed(() => {
  const value = String(props.modelValue || '')
  if (!value)
    return String(attrs.placeholder || t(props.type === 'time' ? 'Time' : 'Select date'))
  if (props.type === 'time')
    return value.slice(0, 5)
  const date = parse(props.type === 'month' ? `${value}-01` : value)
  if (Number.isNaN(date.getTime()))
    return value

  const datePart = props.type === 'month'
    ? `${t(months[date.getMonth()])} ${date.getFullYear()}`
    : `${date.getDate()} ${t(months[date.getMonth()])} ${date.getFullYear()}`

  return datePart + ((hasTime.value && value.includes('T')) ? ` · ${value.split('T')[1].slice(0, 5)}` : '')
})

const monthLabel = computed(() => `${t(months[month.value.getMonth()])} ${month.value.getFullYear()}`)

const days = computed(() => {
  const start = new Date(month.value.getFullYear(), month.value.getMonth(), 1, 12)

  start.setDate(1 - (start.getDay() + 6) % 7)
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start)

    date.setDate(date.getDate() + i)

    const key = ymd(date)
    return { key, day: date.getDate(), muted: date.getMonth() !== month.value.getMonth(), disabled: !allowed(key) }
  })
})

function allowed(date: string) {
  const comparable = props.type === 'month' ? date.slice(0, 7) : date
  return (!props.min || comparable >= props.min.slice(0, comparable.length)) && (!props.max || comparable <= props.max.slice(0, comparable.length))
}
function allowedMonth(index: number) {
  const value = `${month.value.getFullYear()}-${pad(index + 1)}`
  return (!props.min || value >= props.min.slice(0, 7)) && (!props.max || value <= props.max.slice(0, 7))
}
function setDisplayedMonth(date: Date) {
  month.value = date

  const prefix = `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const preferredDay = Math.min(Number(focused.value.slice(-2)) || 1, lastDay)
  let next = `${prefix}-${pad(preferredDay)}`
  if (props.min && next < props.min.slice(0, 10))
    next = boundDate(props.min)
  if (props.max && next > props.max.slice(0, 10))
    next = boundDate(props.max)
  focused.value = (next.startsWith(prefix) && allowed(next)) ? next : ''
}
function measure() {
  if (!trigger.value || !popup.value || !open.value)
    return
  const anchor = trigger.value.getBoundingClientRect()
  const width = popup.value.offsetWidth
  const height = popup.value.offsetHeight

  style.value = { left: `${Math.max(8, Math.min(anchor.left, innerWidth - width - 8))}px`, top: `${anchor.bottom + height + 16 < innerHeight ? anchor.bottom + 8 : Math.max(8, innerHeight - height - 8)}px` }
}
function boundDate(value: string) { return value.length === 7 ? `${value}-01` : value.slice(0, 10) }
function initialDate(value: string) {
  let date = (props.type === 'month' && value) ? `${value}-01` : value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    date = ymd(new Date())
  if (props.type !== 'time') {
    if (props.min && date < props.min.slice(0, 10))
      date = boundDate(props.min)
    if (props.max && date > props.max.slice(0, 10))
      date = boundDate(props.max)
  }
  return date
}
function prepareSelection() {
  const value = String(props.modelValue || '')
  const date = initialDate(value)

  selected.value = date
  focused.value = date
  month.value = parse(date)

  const initialTime = props.type === 'time' ? value : value.split('T')[1]

  ;[hours.value, minutes.value] = (initialTime || '00:00').split(':')
}
async function show() {
  if (props.disabled || props.readonly)
    return
  prepareSelection()
  choosingMonth.value = props.type === 'month'
  open.value = true
  await nextTick()
  popup.value?.showModal()
  measure()
  if (props.type === 'time')
    hourInput.value?.focus()
  else focusDay()
}
function close() {
  popup.value?.close()
  open.value = false
  trigger.value?.focus({ preventScroll: true })
}
function commit(value: string) {
  emit('update:modelValue', value)
  if (hidden.value) {
    hidden.value.value = value
    hidden.value.dispatchEvent(new Event('input', { bubbles: true }))
    hidden.value.dispatchEvent(new Event('change', { bubbles: true }))
  }
  close()
}
function choose(date: string) {
  selected.value = date
  focused.value = date
  if (props.type === 'date')
    commit(date)
  else nextTick(() => { hourInput.value?.focus(); hourInput.value?.select() })
}
function focusDay() {
  nextTick(() => popup.value?.querySelector<HTMLElement>(`[data-date="${focused.value}"], [aria-selected="true"]`)?.focus())
}
function chooseMonth(index: number) {
  if (!allowedMonth(index))
    return
  const value = `${month.value.getFullYear()}-${pad(index + 1)}`
  if (props.type === 'month') { commit(value); return }
  setDisplayedMonth(parse(`${value}-01`))
  choosingMonth.value = false
  focusDay()
}
function changeYear(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (Number.isInteger(value) && value >= 1 && value <= 9999)
    setDisplayedMonth(new Date(value, month.value.getMonth(), 1, 12))
}
function moveMonth(offset: number) {
  setDisplayedMonth(new Date(month.value.getFullYear(), month.value.getMonth() + offset, 1, 12))
}
function calendarKey(event: KeyboardEvent) {
  const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  const date = parse(focused.value)
  if (event.key in offsets) { date.setDate(date.getDate() + offsets[event.key]) }
  else if (event.key === 'Home' || event.key === 'End') { date.setDate(date.getDate() - (date.getDay() + 6) % 7 + (event.key === 'End' ? 6 : 0)) }
  else if (event.key === 'PageUp' || event.key === 'PageDown') {
    event.preventDefault()
    moveMonth(event.key === 'PageDown' ? 1 : -1)
    focusDay()
    return
  }
  else { return }
  event.preventDefault()
  if (!allowed(ymd(date)))
    return
  focused.value = ymd(date)
  month.value = date
  focusDay()
}
function backdrop(event: MouseEvent) {
  if (!popup.value || event.target !== popup.value)
    return
  const box = popup.value.getBoundingClientRect()
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)
    close()
}
function focus() { trigger.value?.focus() }
defineExpose({ focus })
onMounted(() => { window.addEventListener('resize', measure) })
onBeforeUnmount(() => { window.removeEventListener('resize', measure); popup.value?.close() })
</script>

<template>
  <div
    class="date-input"
    :class="[{ 'is-error': invalid, 'is-disabled': disabled, 'date-input--time': type === 'time' }, wrapperClasses]"
    :style="attrs.style as any"
  >
    <button
      :id="String(attrs.id || id)"
      ref="trigger"
      type="button"
      class="control date-input__trigger"
      :class="controlClasses"
      :title="display"
      :disabled="disabled"
      :aria-label="attrs['aria-label'] || !field?.labelId ? label : undefined"
      :aria-labelledby="attrs['aria-label'] ? undefined : field?.labelId"
      :aria-describedby="[`${id}-value`, attrs['aria-describedby'], field?.descriptionId.value].filter(Boolean).join(' ')"
      :aria-invalid="invalid || undefined"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="show"
      @keydown.down.prevent="show"
    >
      <DesignIcon
        :name="type === 'time' ? 'clock' : 'calendar'"
        :size="18"
      />
      <span
        :id="`${id}-value`"
        class="date-input__value"
        :class="{ 'is-placeholder': !modelValue }"
      >{{ display }}</span>
      <DesignIcon
        name="chevdown"
        :size="15"
      />
    </button>
    <input
      ref="hidden"
      type="hidden"
      :value="modelValue || ''"
      :name="attrs.name as string"
      @input="(attrs.onInput as any)?.($event)"
      @change="(attrs.onChange as any)?.($event)"
    >
    <Teleport to="body">
      <dialog
        ref="popup"
        class="calendar-popover"
        :style="style"
        :aria-label="label"
        @cancel.prevent.stop="close"
        @click="backdrop"
        @keydown.stop
      >
        <template v-if="open">
          <header class="calendar-popover__header">
            <span>{{ label }}</span><button
              type="button"
              class="iconbtn"
              :aria-label="t('Close')"
              @click="close"
            >
              <DesignIcon
                name="close"
                :size="18"
              />
            </button>
          </header>
          <div
            v-if="type !== 'time'"
            class="calendar-popover__navigation"
          >
            <button
              type="button"
              class="iconbtn"
              :aria-label="t(choosingMonth ? 'Previous year' : 'Previous month')"
              @click="moveMonth(choosingMonth ? -12 : -1)"
            >
              <DesignIcon
                name="chevleft"
                :size="18"
              />
            </button>
            <input
              v-if="choosingMonth"
              class="calendar-popover__year"
              inputmode="numeric"
              maxlength="4"
              :value="month.getFullYear()"
              :aria-label="t('Year')"
              @change="changeYear"
            ><button
              v-else
              class="calendar-popover__month-switch"
              type="button"
              aria-live="polite"
              @click="choosingMonth = true"
            >
              {{ monthLabel }}<DesignIcon
                name="chevdown"
                :size="14"
              />
            </button>
            <button
              type="button"
              class="iconbtn"
              :aria-label="t(choosingMonth ? 'Next year' : 'Next month')"
              @click="moveMonth(choosingMonth ? 12 : 1)"
            >
              <DesignIcon
                name="chevright"
                :size="18"
              />
            </button>
          </div>
          <div
            v-if="choosingMonth"
            class="calendar-popover__months"
            role="group"
            :aria-label="t('Month')"
          >
            <button
              v-for="(name, index) in months"
              :key="name"
              type="button"
              :aria-pressed="selected.slice(0, 7) === `${month.getFullYear()}-${pad(index + 1)}`"
              :disabled="!allowedMonth(index)"
              @click="chooseMonth(index)"
            >
              {{ t(name) }}
            </button>
          </div>
          <div
            v-else-if="type !== 'time'"
            class="calendar-popover__grid"
            @keydown="calendarKey"
          >
            <span
              v-for="day in weekdays"
              :key="day"
              class="calendar-popover__weekday"
            >{{ t(day) }}</span>
            <button
              v-for="day in days"
              :key="day.key"
              type="button"
              :data-date="day.key"
              :class="{ 'is-muted': day.muted, 'is-selected': day.key === selected, 'is-today': day.key === ymd(new Date()) }"
              :tabindex="focused === day.key ? 0 : -1"
              :disabled="day.disabled"
              :aria-label="new Intl.DateTimeFormat(String(locale), { dateStyle: 'full' }).format(parse(day.key))"
              :aria-pressed="day.key === selected"
              @click="choose(day.key)"
            >
              {{ day.day }}
            </button>
          </div>
          <div
            v-if="hasTime"
            class="calendar-popover__time"
          >
            <span>{{ t('Time') }}</span><div class="calendar-popover__segments">
              <input
                ref="hourInput"
                v-model="hours"
                inputmode="numeric"
                maxlength="2"
                :aria-label="t('Hours')"
                @keydown.enter.prevent="canApply && commit(candidate)"
              ><span>:</span><input
                v-model="minutes"
                inputmode="numeric"
                maxlength="2"
                :aria-label="t('Minutes')"
                @keydown.enter.prevent="canApply && commit(candidate)"
              >
            </div>
          </div>
          <footer class="calendar-popover__footer">
            <button
              v-if="!required"
              type="button"
              class="btn btn--ghost btn--sm"
              @click="commit('')"
            >
              {{ t('Clear') }}
            </button>
            <button
              v-if="type === 'date' && allowed(ymd(new Date()))"
              type="button"
              class="btn btn--secondary btn--sm"
              @click="commit(ymd(new Date()))"
            >
              {{ t('Today') }}
            </button>
            <button
              v-if="hasTime"
              type="button"
              class="btn btn--primary btn--sm"
              :disabled="!canApply"
              @click="commit(candidate)"
            >
              <DesignIcon
                name="check"
                :size="16"
              />{{ t('Apply') }}
            </button>
          </footer>
        </template>
      </dialog>
    </Teleport>
  </div>
</template>
