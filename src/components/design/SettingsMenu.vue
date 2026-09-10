<script setup lang="ts">
import Input from './Input.vue'
import DesignIcon from './DesignIcon.vue'
import { designId } from './ids'
import { useBusinessDay } from '@/composables/useBusinessDay'
import { useNotify } from '@/composables/useNotify'
import { useApiError } from '@/composables/useApiError'

const { t } = useI18n({ useScope: 'global' })
const biz = useBusinessDay()
const { notify } = useNotify()
const { translate } = useApiError()
const trigger = ref<HTMLButtonElement | null>(null)
const popup = ref<HTMLDialogElement | null>(null)
const workOpenInput = ref<{ focus: () => void } | null>(null)
const workCloseInput = ref<{ focus: () => void } | null>(null)
const open = ref(false)
const saving = ref(false)
const saveFeedback = ref<{ message: string; error: boolean } | null>(null)
const menuId = designId('operating-hours')
const position = ref<Record<string, string>>({})
const workOpen = ref(biz.open.value)
const workClose = ref(biz.close.value)

watch(biz.open, value => (workOpen.value = value))
watch(biz.close, value => (workClose.value = value))

// A calendar confirmation commits once; the backend remains the source of truth.
async function commit(field: 'open' | 'close') {
  if (saving.value)
    return
  saving.value = true
  saveFeedback.value = null
  try {
    await biz.save({ business_open: workOpen.value, business_close: workClose.value })
    saveFeedback.value = { message: t('Settings saved'), error: false }
    notify(t('Settings saved'), 'success')
  }
  catch (error) {
    workOpen.value = biz.open.value
    workClose.value = biz.close.value
    saveFeedback.value = { message: translate(error), error: true }
    notify(saveFeedback.value.message, 'error')
  }
  finally {
    saving.value = false
    await nextTick()
    if (open.value)
      (field === 'open' ? workOpenInput : workCloseInput).value?.focus()
  }
}

function measure() {
  if (!open.value || !trigger.value || !popup.value)
    return
  const anchor = trigger.value.getBoundingClientRect()
  const { offsetWidth: width, offsetHeight: height } = popup.value

  position.value = {
    left: `${Math.max(12, Math.min(anchor.right - width, innerWidth - width - 12))}px`,
    top: `${Math.max(12, Math.min(anchor.bottom + 8, innerHeight - height - 12))}px`,
  }
}
function close() {
  if (saving.value)
    return
  popup.value?.close()
  open.value = false
  trigger.value?.focus({ preventScroll: true })
}
async function toggle() {
  if (open.value) { close(); return }
  saveFeedback.value = null
  open.value = true
  await nextTick()
  popup.value?.showModal()
  measure()
}
function backdrop(event: MouseEvent) {
  if (event.target !== popup.value || !popup.value)
    return
  const rect = popup.value.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
    close()
}
watch([saving, saveFeedback], async () => {
  await nextTick()
  measure()
})
onMounted(() => window.addEventListener('resize', measure))
onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
  popup.value?.close()
})
</script>

<template>
  <button
    ref="trigger"
    class="iconbtn"
    :class="{ 'is-active': open }"
    :title="t('Operating hours')"
    :aria-label="t('Operating hours')"
    aria-haspopup="dialog"
    :aria-expanded="open"
    :aria-controls="menuId"
    @click="toggle"
  >
    <DesignIcon
      name="sliders"
      :size="18"
    />
  </button>
  <Teleport to="body">
    <dialog
      :id="menuId"
      ref="popup"
      class="setmenu"
      :style="position"
      :aria-labelledby="`${menuId}-title`"
      :aria-busy="saving"
      @cancel.prevent.stop="close"
      @click="backdrop"
    >
      <template v-if="open">
        <header class="setmenu__header">
          <h2 :id="`${menuId}-title`">
            {{ t('Operating hours') }}
          </h2>
          <button
            type="button"
            class="iconbtn"
            :aria-label="t('Close')"
            :disabled="saving"
            @click="close"
          >
            <DesignIcon
              name="close"
              :size="18"
            />
          </button>
        </header>
        <div class="setmenu__report">
          <div class="setmenu__label">
            {{ t('Reporting window') }}
          </div>
          <strong class="setmenu__report-value">07:00–03:00</strong>
          <p class="setmenu__hint">
            {{ t('Reporting uses the fixed 07:00–03:00 service window.') }}
          </p>
        </div>
        <div class="setmenu__working">
          <div class="setmenu__label">
            {{ t('Working hours') }}
          </div>
          <p class="setmenu__hint">
            {{ t('The open window used by the “Working hours” time filter.') }}
          </p>
          <div class="setmenu__times">
            <label class="setmenu__field">
              <span>{{ t('From') }}</span>
              <Input
                ref="workOpenInput"
                v-model="workOpen"
                type="time"
                :disabled="saving"
                :aria-label="`${t('Working hours')} ${t('From')}`"
                @change="commit('open')"
              />
            </label>
            <label class="setmenu__field">
              <span>{{ t('To') }}</span>
              <Input
                ref="workCloseInput"
                v-model="workClose"
                type="time"
                :disabled="saving"
                :aria-label="`${t('Working hours')} ${t('To')}`"
                @change="commit('close')"
              />
            </label>
          </div>
        </div>
        <p
          v-if="saving || saveFeedback"
          class="setmenu__feedback"
          :class="{ 'is-error': saveFeedback?.error }"
          :role="saveFeedback?.error ? 'alert' : 'status'"
        >
          {{ saving ? t('Saving changes…') : saveFeedback?.message }}
        </p>
      </template>
    </dialog>
  </Teleport>
</template>
