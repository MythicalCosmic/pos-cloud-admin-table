<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useMediaQuery } from '@vueuse/core'
import Input from '@/components/design/Input.vue'
import Select from '@/components/design/Select.vue'
import type { ChatMessage } from '@/stores/aiAssistant'
import { useAIAssistantStore } from '@/stores/aiAssistant'
import type { DateRangeValue } from '@/components/design/DateRangePicker.vue'
import type { AIPageContext } from '@/composables/useAIPageContext'
import AssistantHistory from '@/components/ai/AssistantHistory.vue'
import AssistantPresence from '@/components/ai/AssistantPresence.vue'
import ProgressiveReply from '@/components/ai/ProgressiveReply.vue'
import ThinkingLevel from '@/components/ai/ThinkingLevel.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Button from '@/components/design/Button.vue'
import Modal from '@/components/design/Modal.vue'
import DateRangeFields from '@/components/design/DateRangeFields.vue'
import { buildDateParams, businessPreset } from '@/composables/useBusinessDay'
import { useNotify } from '@/composables/useNotify'
import '@styles/pages/ai-assistant.css'

const { t, locale } = useI18n({ useScope: 'global' })
const store = useAIAssistantStore()
const { notify: toast } = useNotify()
const { chats, activeId, generating, notify, permission, loadingChatIds, chatErrors, suggestions } = storeToRefs(store)
const active = computed(() => chats.value.find(chat => chat.id === activeId.value))
const messages = computed(() => active.value?.messages ?? [])
const isGenerating = computed(() => !!generating.value && generating.value === activeId.value)
const hydrating = computed(() => active.value?.serverId !== undefined && loadingChatIds.value.some(id => String(id) === String(active.value?.serverId)))
const historyFailed = computed(() => active.value?.serverId !== undefined && chatErrors.value[String(active.value.serverId)])
const compact = useMediaQuery('(max-width: 1100px)')
const historyOpen = ref(false)
const historyHidden = ref(false)
const thinkingOpen = ref(false)
const thinkingLevel = ref(0)
const AI_MESSAGE_MAX_LENGTH = 10_000
const draft = ref('')
const answerStyle = ref('auto')
const answerStyles = computed(() => ['auto', 'brief', 'actions'].map(value => ({ value, label: t(`ai_answer_${value}`) })))
const scrollRef = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const followLatest = ref(true)
const copiedId = ref<string | null>(null)
const liveReplyIds = ref(new Set<string>())
const finishedReplyIds = ref(new Set<string>())
const revealingId = ref<string | null>(null)
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined
let copyTimer: ReturnType<typeof setTimeout> | undefined
let restoringDraft = false

const prompts = [
  { icon: 'trend', title: 'ai_workspace_sales', detail: 'ai_workspace_sales_detail', query: 'How were sales today?' },
  { icon: 'box', title: 'ai_workspace_products', detail: 'ai_workspace_products_detail', query: 'What are my top products?' },
  { icon: 'wallet', title: 'ai_workspace_payments', detail: 'ai_workspace_payments_detail', query: 'Break down today\'s payments' },
  { icon: 'package', title: 'ai_workspace_stock', detail: 'ai_workspace_stock_detail', query: 'What is running low on stock?' },
]

const followups = ['ai_workspace_followup_summary', 'ai_workspace_followup_table', 'ai_workspace_followup_actions']
const pendingSeconds = computed(() => Math.max(0, Math.floor((now.value - (messages.value.find(message => message.streaming)?.ts ?? now.value)) / 1000)))
const title = computed(() => (active.value?.title && active.value.title !== 'New chat') ? active.value.title : t('New chat'))
const date = (ts: number) => new Intl.DateTimeFormat(String(locale.value), { hour: '2-digit', minute: '2-digit' }).format(ts)
const notificationBlocked = computed(() => permission.value === 'denied' || permission.value === 'unsupported')
const notificationLabel = computed(() => notificationBlocked.value ? t('Notifications blocked in browser settings') : t(notify.value ? 'Notifications on' : 'Notify me'))

function setVisibility() { store.setChatVisible(!document.hidden) }
onMounted(() => {
  setVisibility()
  store.loadMeta()
  document.addEventListener('visibilitychange', setVisibility)
  ticker = setInterval(() => {
    if (isGenerating.value)
      now.value = Date.now()
  }, 1000)
})
onBeforeUnmount(() => {
  store.setChatVisible(false)
  document.removeEventListener('visibilitychange', setVisibility)
  clearInterval(ticker)
  clearTimeout(copyTimer)
})

function resizeComposer() {
  const el = textareaRef.value
  if (!el)
    return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 180)}px`
}
function jumpToLatest() {
  followLatest.value = true
  if (scrollRef.value)
    scrollRef.value.scrollTop = messages.value.length ? scrollRef.value.scrollHeight : 0
}
function onScroll() {
  const el = scrollRef.value
  if (el)
    followLatest.value = el.scrollHeight - el.scrollTop - el.clientHeight < 100
}
watch(() => messages.value.filter(message => message.streaming).map(message => message.id), ids => {
  if (ids.some(id => !liveReplyIds.value.has(id)))
    liveReplyIds.value = new Set([...liveReplyIds.value, ...ids])
}, { flush: 'sync' })
function shouldReveal(message: ChatMessage) {
  return liveReplyIds.value.has(message.id) && !finishedReplyIds.value.has(message.id) && messages.value.at(-1)?.id === message.id
}
async function followReply() {
  const wasFollowing = followLatest.value

  await nextTick()
  if (wasFollowing && scrollRef.value)
    scrollRef.value.scrollTop = scrollRef.value.scrollHeight
}
function finishReply(id: string) {
  finishedReplyIds.value = new Set([...finishedReplyIds.value, id])
  if (revealingId.value === id)
    revealingId.value = null
}
watch(() => ({ count: messages.value.length, content: messages.value.at(-1)?.content, streaming: messages.value.at(-1)?.streaming, hydrating: hydrating.value }), followReply)
watch(activeId, async () => {
  restoringDraft = true
  revealingId.value = null
  liveReplyIds.value = new Set(messages.value.filter(message => message.streaming).map(message => message.id))
  draft.value = active.value?.draft ?? ''
  followLatest.value = true
  await nextTick()
  restoringDraft = false
  resizeComposer()
  jumpToLatest()
}, { immediate: true })
watch(draft, async value => {
  if (!restoringDraft && activeId.value)
    store.setDraft(activeId.value, value)
  await nextTick()
  resizeComposer()
})
function selectChat(id: string) {
  store.selectChat(id)
  historyOpen.value = false
}
async function newChat() {
  store.newChat()
  historyOpen.value = false
  await nextTick()
  textareaRef.value?.focus()
  jumpToLatest()
}
async function usePrompt(value: string) {
  draft.value = value
  await nextTick()
  textareaRef.value?.focus()
}

const rangeOpen = ref(false)
const range = ref<DateRangeValue | null>(null)
const rangeDraft = ref<DateRangeValue>({ ...businessPreset('today'), preset: 'today', mode: 'date' })

const rangeLabel = computed(() => {
  if (!range.value)
    return t('ai_workspace_date_context')
  const value = range.value
  const label = value.from === value.to ? value.from : `${value.from} → ${value.to}`
  return (value.fromTime && value.toTime) ? `${label} · ${value.fromTime}–${value.toTime}` : label
})

function openRange() {
  rangeDraft.value = { ...(range.value ?? { ...businessPreset('today'), preset: 'today', mode: 'date' }) }
  rangeOpen.value = true
}
function applyRange(value: DateRangeValue) {
  range.value = { ...value }
  rangeOpen.value = false
}
function context(): AIPageContext {
  const params = buildDateParams(range.value)
  return {
    route: '/ai-assistant',
    route_label: t('AI Assistant'),
    ...(range.value ? { range_from: params.from_at ?? params.from, range_to: params.to_at ?? params.to } : {}),
  }
}
function submit() {
  const text = draft.value.trim()
  if (!text || generating.value || hydrating.value || historyFailed.value)
    return
  const instruction = answerStyle.value === 'brief' ? t('ai_answer_brief_instruction') : answerStyle.value === 'actions' ? t('ai_answer_actions_instruction') : ''

  store.send(instruction ? `${text}\n\n${instruction}` : text, instruction ? text : undefined, context())
  draft.value = ''
  if (activeId.value)
    store.setDraft(activeId.value, '')
  followLatest.value = true
}
function onComposerKey(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    submit()
  }
}
async function copyMessage(message: ChatMessage) {
  try {
    await navigator.clipboard.writeText(message.content)
    copiedId.value = message.id
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { copiedId.value = null }, 1800)
  }
  catch { toast(t('ai_workspace_copy_error'), 'error') }
}
function regenerate(index: number) {
  if (generating.value)
    return
  const prompt = [...messages.value.slice(0, index)].reverse().find(message => message.role === 'user')
  if (prompt)
    store.send(prompt.request ?? prompt.content, prompt.content, prompt.context ?? context())
}
function exportChat() {
  if (!active.value || !messages.value.length)
    return
  const content = `# ${title.value}\n\n${messages.value.filter(message => !message.streaming).map(message => `## ${message.role === 'user' ? t('You') : t('AI Assistant')}\n\n${message.content}`).join('\n\n---\n\n')}`
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')

  link.href = url
  link.download = `alpha-pos-${title.value.replace(/[^\p{L}\p{N}\s-]/gu, '').trim().slice(0, 60) || 'chat'}.md`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const renameId = ref<string | null>(null)
const renameValue = ref('')
const renaming = ref(false)
const renameError = ref('')
function openRename(id: string) {
  historyOpen.value = false
  renameId.value = id
  renameValue.value = chats.value.find(chat => chat.id === id)?.title ?? ''
  renameError.value = ''
}
async function saveRename() {
  if (!renameId.value || !renameValue.value.trim() || renaming.value)
    return
  renaming.value = true

  const saved = await store.renameChat(renameId.value, renameValue.value)

  renaming.value = false
  if (saved)
    renameId.value = null
  else renameError.value = t('ai_workspace_rename_error')
}
const deleteId = ref<string | null>(null)
const deleting = ref(false)
const deleteError = ref('')
function openDelete(id: string) {
  historyOpen.value = false
  deleteId.value = id
  deleteError.value = ''
}
async function deleteChat() {
  if (!deleteId.value || deleting.value || generating.value === deleteId.value)
    return
  deleting.value = true

  const removed = await store.deleteChat(deleteId.value)

  deleting.value = false
  if (removed)
    deleteId.value = null
  else deleteError.value = t('Could not delete chat. Please try again.')
}
</script>

<template>
  <div
    class="ai-workspace"
    :class="{ 'is-focused': historyHidden || compact }"
  >
    <aside
      v-if="!compact && !historyHidden"
      class="ai-workspace__history"
      :aria-label="t('ai_workspace_library')"
    >
      <AssistantHistory
        @select="selectChat"
        @new="newChat"
        @rename="openRename"
        @delete="openDelete"
      />
      <ThinkingLevel v-model="thinkingLevel" />
    </aside>
    <section
      class="ai-workspace__thread"
      :aria-label="t('AI Assistant')"
    >
      <header class="assistant-header">
        <div class="assistant-header__identity">
          <button
            type="button"
            class="assistant-icon-button"
            :aria-label="t('ai_workspace_toggle_history')"
            :title="t('ai_workspace_toggle_history')"
            :aria-expanded="compact ? historyOpen : !historyHidden"
            @click="compact ? historyOpen = !historyOpen : historyHidden = !historyHidden"
          >
            <DesignIcon
              name="layout"
              :size="19"
            />
          </button>
          <div class="assistant-header__titles">
            <h1>{{ t('AI Assistant') }}</h1><p :title="title">
              {{ title }}
            </p>
          </div>
        </div>
        <div class="assistant-header__actions">
          <button
            v-if="compact || historyHidden"
            type="button"
            class="assistant-icon-button"
            :aria-label="t('ai_thinking_level')"
            :title="t('ai_thinking_level')"
            :aria-expanded="thinkingOpen"
            @click="thinkingOpen = true"
          >
            <DesignIcon
              name="sliders"
              :size="18"
            />
          </button>
          <button
            v-if="active"
            type="button"
            class="assistant-icon-button"
            :aria-label="t('Rename chat')"
            :title="t('Rename chat')"
            @click="openRename(active.id)"
          >
            <DesignIcon
              name="edit"
              :size="17"
            />
          </button>
          <button
            type="button"
            class="assistant-icon-button"
            :aria-label="notificationLabel"
            :title="notificationLabel"
            :aria-pressed="notify"
            :disabled="notificationBlocked"
            @click="store.toggleNotify()"
          >
            <DesignIcon
              :name="notify ? 'bell' : 'belloff'"
              :size="18"
            />
          </button>
          <button
            v-if="messages.length"
            type="button"
            class="assistant-icon-button"
            :aria-label="t('Export chat')"
            :title="t('Export chat')"
            :disabled="isGenerating"
            @click="exportChat"
          >
            <DesignIcon
              name="download"
              :size="18"
            />
          </button>
          <Button
            v-if="compact || historyHidden"
            icon="plus"
            @click="newChat"
          >
            <span>{{ t('New chat') }}</span>
          </Button>
        </div>
      </header>

      <div
        ref="scrollRef"
        class="assistant-scroll"
        @scroll="onScroll"
      >
        <div
          class="assistant-content"
          :class="{ 'is-welcome': !messages.length && !hydrating && !historyFailed }"
        >
          <div
            v-if="hydrating"
            class="assistant-loading"
            role="status"
            :aria-label="t('ai_workspace_loading_history')"
          >
            <AssistantPresence busy />
            <div class="assistant-loading__body">
              <strong>{{ t('ai_workspace_loading_history') }}</strong><span /><span /><span />
            </div>
          </div>
          <div
            v-else-if="historyFailed"
            class="assistant-thread-error"
            role="alert"
          >
            <DesignIcon
              name="alert"
              :size="24"
            /><h2>{{ t('ai_workspace_chat_error') }}</h2><p>{{ t('ai_workspace_chat_error_detail') }}</p>
            <Button
              icon="refresh"
              @click="active && store.selectChat(active.id)"
            >
              {{ t('Retry') }}
            </Button>
          </div>
          <div
            v-else-if="!messages.length"
            class="assistant-welcome"
          >
            <div class="assistant-welcome__hero">
              <div><h2>{{ t('ai_workspace_welcome') }}<span>{{ t('ai_workspace_welcome_accent') }}</span></h2><p>{{ t('ai_workspace_intro') }}</p></div>
              <AssistantPresence large />
            </div>
            <div class="assistant-welcome__label">
              <span>{{ t('ai_workspace_start_with') }}</span><DesignIcon
                name="arrowdown"
                :size="15"
              />
            </div>
            <div class="assistant-prompts">
              <button
                v-for="prompt in prompts"
                :key="prompt.title"
                type="button"
                class="assistant-prompt"
                @click="usePrompt(t(prompt.query))"
              >
                <span class="assistant-prompt__icon"><DesignIcon
                  :name="prompt.icon"
                  :size="21"
                /></span>
                <strong>{{ t(prompt.title) }}</strong><span>{{ t(prompt.detail) }}</span><DesignIcon
                  class="assistant-prompt__arrow"
                  name="arrowright"
                  :size="18"
                />
              </button>
            </div>
            <div
              v-if="suggestions.length"
              class="assistant-suggestions"
            >
              <h3>{{ t('Suggested for you') }}</h3><button
                v-for="suggestion in suggestions.slice(0, 3)"
                :key="suggestion.query"
                type="button"
                @click="usePrompt(t(suggestion.query))"
              >
                <DesignIcon
                  name="sparkle"
                  :size="16"
                /><span>{{ t(suggestion.query) }}</span><DesignIcon
                  name="arrowright"
                  :size="15"
                />
              </button>
            </div>
          </div>
          <template v-else>
            <article
              v-for="(message, index) in messages"
              :key="message.id"
              class="assistant-message"
              :class="{ 'is-user': message.role === 'user', 'is-error': message.error, 'is-stopped': message.stopped }"
              :aria-label="t(message.role === 'user' ? 'You' : 'AI Assistant')"
            >
              <div class="assistant-message__identity">
                <AssistantPresence
                  v-if="message.role === 'assistant'"
                  :busy="message.streaming || revealingId === message.id"
                /><span
                  v-else
                  class="assistant-message__user"
                ><DesignIcon
                  name="user"
                  :size="18"
                /></span><strong>{{ t(message.role === 'user' ? 'You' : 'AI Assistant') }}</strong><time :datetime="new Date(message.ts).toISOString()">{{ date(message.ts) }}</time>
              </div>
              <div
                v-if="message.role === 'user'"
                class="assistant-message__question"
              >
                {{ message.content }}
              </div>
              <div
                v-else-if="message.streaming"
                class="assistant-pending"
                role="status"
                aria-live="polite"
              >
                <div class="assistant-pending__label">
                  <strong>{{ t('ai_workspace_waiting') }}</strong><span aria-hidden="true">{{ pendingSeconds }}{{ t('ai_workspace_seconds') }}</span>
                </div>
                <p>{{ t(pendingSeconds >= 25 ? 'ai_workspace_waiting_long' : 'ai_workspace_waiting_detail') }}</p>
                <div
                  class="assistant-pending__lines"
                  aria-hidden="true"
                >
                  <span /><span /><span />
                </div>
              </div>
              <div
                v-else-if="message.error || message.stopped"
                class="assistant-message__notice"
                :role="message.error ? 'alert' : 'status'"
              >
                <DesignIcon
                  :name="message.error ? 'alert' : 'stop'"
                  :size="19"
                /><p>{{ message.content }}</p>
              </div>
              <ProgressiveReply
                v-else
                :content="message.content"
                :animate="shouldReveal(message)"
                class="assistant-message__answer"
                @start="revealingId = message.id"
                @finish="finishReply(message.id)"
                @progress="followReply"
              />
              <div
                v-if="!message.streaming && revealingId !== message.id"
                class="assistant-message__actions"
              >
                <button
                  v-if="!message.error && !message.stopped"
                  type="button"
                  @click="copyMessage(message)"
                >
                  <DesignIcon
                    :name="copiedId === message.id ? 'check' : 'copy'"
                    :size="15"
                  />{{ t(copiedId === message.id ? 'Copied' : 'Copy') }}
                </button>
                <button
                  v-if="message.role === 'user'"
                  type="button"
                  :disabled="!!generating"
                  @click="usePrompt(message.content)"
                >
                  <DesignIcon
                    name="edit"
                    :size="15"
                  />{{ t('ai_workspace_reuse') }}
                </button>
                <button
                  v-else-if="index === messages.length - 1"
                  type="button"
                  :disabled="!!generating"
                  @click="regenerate(index)"
                >
                  <DesignIcon
                    name="refresh"
                    :size="15"
                  />{{ t(message.error || message.stopped ? 'Retry' : 'Regenerate') }}
                </button>
              </div>
            </article>
            <div
              v-if="!generating && !revealingId && messages.at(-1)?.role === 'assistant' && !messages.at(-1)?.error && !messages.at(-1)?.stopped"
              class="assistant-followups"
            >
              <span>{{ t('ai_workspace_explore_more') }}</span><button
                v-for="key in followups"
                :key="key"
                type="button"
                @click="usePrompt(t(key))"
              >
                {{ t(key) }}<DesignIcon
                  name="plus"
                  :size="14"
                />
              </button>
            </div>
          </template>
        </div>
      </div>

      <div class="assistant-compose">
        <div
          v-if="revealingId"
          class="assistant-reveal-control"
        >
          <span><span aria-hidden="true" />{{ t('ai_reply_appearing') }}</span>
          <button
            type="button"
            @click="finishReply(revealingId)"
          >
            {{ t('ai_show_full_answer') }}<DesignIcon
              name="chevdown"
              :size="14"
            />
          </button>
        </div>
        <button
          v-if="!followLatest && messages.length"
          type="button"
          class="assistant-latest"
          @click="jumpToLatest"
        >
          <DesignIcon
            name="arrowdown"
            :size="16"
          />{{ t('Jump to latest') }}
        </button>
        <div
          v-if="generating && !isGenerating"
          class="assistant-background"
          role="status"
        >
          <DesignIcon
            name="sparkle"
            :size="16"
          /><span>{{ t('ai_workspace_background') }}</span><button
            type="button"
            @click="selectChat(generating)"
          >
            {{ t('ai_workspace_view_reply') }}<DesignIcon
              name="arrowright"
              :size="15"
            />
          </button>
        </div>
        <form
          class="assistant-composer"
          @submit.prevent="submit"
        >
          <label
            class="sr-only"
            for="assistant-message-input"
          >{{ t('Message the assistant…') }}</label>
          <textarea
            id="assistant-message-input"
            ref="textareaRef"
            v-model="draft"
            rows="2"
            :maxlength="AI_MESSAGE_MAX_LENGTH"
            :placeholder="t('ai_workspace_placeholder')"
            :aria-describedby="historyFailed ? undefined : 'assistant-composer-hint'"
            @keydown="onComposerKey"
          />
          <div class="assistant-composer__toolbar">
            <div class="assistant-composer__context">
              <button
                type="button"
                :class="{ 'has-range': !!range }"
                :title="rangeLabel"
                @click="openRange"
              >
                <DesignIcon
                  name="calendar"
                  :size="16"
                /><span>{{ rangeLabel }}</span><DesignIcon
                  name="chevdown"
                  :size="13"
                />
              </button><button
                v-if="range"
                type="button"
                :aria-label="t('ai_workspace_clear_context')"
                @click="range = null"
              >
                <DesignIcon
                  name="close"
                  :size="15"
                />
              </button>
            </div>
            <Select
              v-model="answerStyle"
              class="assistant-answer-style"
              :options="answerStyles"
              :aria-label="t('ai_answer_style')"
              :disabled="!!generating"
              size="sm"
            />
            <button
              v-if="isGenerating"
              type="button"
              class="assistant-send is-stop"
              :aria-label="t('Stop generating')"
              @click="$event.detail < 2 && store.stop()"
            >
              <DesignIcon
                name="stop"
                :size="18"
              /><span>{{ t('Stop generating') }}</span>
            </button>
            <button
              v-else
              type="submit"
              class="assistant-send"
              :disabled="!draft.trim() || !!generating || hydrating || historyFailed"
              :aria-label="t('Send')"
            >
              <span>{{ t('Send') }}</span><DesignIcon
                name="arrowup"
                :size="20"
              />
            </button>
          </div>
        </form>
        <div
          id="assistant-composer-hint"
          class="assistant-compose__hint"
        >
          <span>{{ t('ai_workspace_hint') }}</span><span>{{ t('ai_workspace_keyboard') }}</span>
        </div>
      </div>
    </section>

    <Modal
      :open="compact && historyOpen"
      :title="t('ai_workspace_library')"
      :width="440"
      @close="historyOpen = false"
    >
      <AssistantHistory
        v-if="historyOpen"
        compact
        @select="selectChat"
        @new="newChat"
        @rename="openRename"
        @delete="openDelete"
      />
    </Modal>
    <Modal
      :open="thinkingOpen"
      :title="t('ai_thinking_level')"
      :width="400"
      @close="thinkingOpen = false"
    >
      <ThinkingLevel
        v-model="thinkingLevel"
        in-dialog
      />
    </Modal>
    <Modal
      :open="rangeOpen"
      :title="t('ai_workspace_date_context')"
      :subtitle="t('ai_workspace_date_detail')"
      :width="900"
      @close="rangeOpen = false"
    >
      <DateRangeFields
        v-if="rangeOpen"
        :model-value="rangeDraft"
        allow-unchanged
        @update:model-value="applyRange"
      />
    </Modal>
    <Modal
      :open="!!renameId"
      :title="t('Rename chat')"
      :width="440"
      :close-on-backdrop="!renaming"
      :close-on-esc="!renaming"
      @close="!renaming && (renameId = null)"
    >
      <form
        class="assistant-dialog-form"
        @submit.prevent="saveRename"
      >
        <label for="assistant-chat-title">{{ t('ai_workspace_chat_title') }}</label><Input
          id="assistant-chat-title"
          v-model="renameValue"
          maxlength="80"
          autofocus
          :disabled="renaming"
        /><p
          v-if="renameError"
          role="alert"
        >
          {{ renameError }}
        </p><Button
          type="submit"
          variant="primary"
          :loading="renaming"
          :disabled="!renameValue.trim()"
        >
          {{ t('Save') }}
        </Button>
      </form>
    </Modal>
    <Modal
      :open="!!deleteId"
      :title="t('Delete this chat?')"
      :subtitle="t('ai_workspace_delete_detail')"
      :width="440"
      :close-on-backdrop="!deleting"
      :close-on-esc="!deleting"
      @close="!deleting && (deleteId = null)"
    >
      <p
        v-if="deleteError"
        class="assistant-dialog-error"
        role="alert"
      >
        {{ deleteError }}
      </p><template #footer>
        <Button
          variant="danger"
          :loading="deleting"
          @click="deleteChat"
        >
          {{ t('Delete chat') }}
        </Button>
      </template>
    </Modal>
  </div>
</template>
