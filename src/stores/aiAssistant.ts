/* ============================================================
   ALPHA POS — AI Assistant store (Pinia, above-router)
   Generation runs in this store, so requests keep running
   when the user navigates to other pages. Browser notifications
   fire when a reply finishes and the user isn't watching the chat.

   --- BE PERSISTENCE (added 2026-06) ---
   Server is the source of truth when reachable. localStorage cache
   stays as offline fallback. Each local Chat may carry a `serverId`
   linking it to a server-side conversation (POST /ai/chats/). The
   /ai/query/ call attaches `conversation_id` so the BE can persist
   the message under that conversation.

   BE endpoints (per Abrorbek, prefix /api/admins/stock/ via stockApi):
   - GET    /ai/chats/            → list  [{id, title, updated_at, message_count}]
   - GET    /ai/chats/{id}/       → detail { id, title, messages: [{id, role, content, ts}] }
   - POST   /ai/chats/            → create empty, returns { id }
   - POST   /ai/chats/{id}/rename/ → rename { title }
   - POST   /ai/chats/{id}/delete/ → remove
   - POST   /ai/query/            → existing, now accepts { conversation_id?, ... }

   On unknown shapes / network errors we degrade silently to local-only.
   ============================================================ */
import { defineStore } from 'pinia'
import { stockApi } from '@/plugins/axios'
import i18n from '@/plugins/i18n'
import type { AIPageContext } from '@/composables/useAIPageContext'
import { useAIPageContext } from '@/composables/useAIPageContext'

const STORE_KEY = 'alphapos-ai-chats-v1'
const NOTIFY_KEY = 'alphapos-ai-notify-v1'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  ts: number
  streaming?: boolean
  error?: boolean
  stopped?: boolean

  /** Retain the actual request and context when the displayed prompt differs. */
  request?: string
  context?: AIPageContext | null
}

export interface Chat {
  id: string

  /** Server-side conversation id (string|number). undefined when chat is local-only. */
  serverId?: string | number
  title: string
  messages: ChatMessage[]
  updatedAt: number
  draft?: string

  /** Set when we know the server has more messages than we've hydrated. */
  needsHydration?: boolean

  /** Last-message snippet from the BE list summary — sidebar subtitle for chats
   * whose messages aren't hydrated locally yet. */
  preview?: string
  pinned?: boolean
}

export interface QuickAction { id: string; label: string; icon: string; query: string }
export interface Suggestion { query: string; reason: string; priority: 'high' | 'medium' | 'low' }

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}
function nowTs(): number {
  return Date.now()
}

function translateAI(key: string): string {
  return String((i18n.global as any).t(key))
}

function aiErrorText(payload: any): string {
  const error = typeof payload?.error === 'string' ? payload.error : ''
  const source = typeof payload?.error_source === 'string' ? payload.error_source : ''
  let key = 'ai_error_generic'

  if (error === 'rate_limited')
    key = 'ai_error_burst_limit'
  else if (error === 'quota_exceeded')
    key = 'ai_error_provider_rate_limit'
  else if (error === 'no_api_key')
    key = 'ai_error_not_configured'
  else if (error === 'provider_configuration_error')
    key = 'ai_error_credentials'
  else if (error === 'invalid_query')
    key = 'ai_error_invalid_query'
  else if (error === 'query_too_long')
    key = 'ai_error_query_too_long'
  else if (error === 'invalid_request')
    key = 'ai_error_invalid_request'
  else if (error === 'internal_error' && source === 'ai_provider')
    key = 'ai_error_provider_failure'
  else if (error === 'internal_error')
    key = 'ai_error_internal'

  return translateAI(key)
}

function loadChats(): Chat[] {
  try {
    const raw = localStorage.getItem(STORE_KEY)

    if (raw) {
      const p = JSON.parse(raw) as Chat[]

      if (p?.length) {
        // sanitize: no generation survives a reload, so clear stale streaming
        // flags and drop empty assistant placeholders left mid-flight.
        return p.map(c => ({
          ...c,
          messages: (c.messages || [])
            .filter(m => !(m.role === 'assistant' && m.streaming && !m.content))
            .map(m => m.streaming ? { ...m, streaming: false } : m),
        }))
      }
    }
  }
  catch { /* noop */ }

  return []
}

function loadNotify(): boolean {
  try { return localStorage.getItem(NOTIFY_KEY) === '1' }
  catch { return false }
}

// --- BE shape coercion helpers (forgiving of unexpected payloads) ---

function toTs(v: any): number {
  if (typeof v === 'number')
    return v > 1e12 ? v : v * 1000 // accept seconds or ms
  if (typeof v === 'string') {
    const n = Date.parse(v)

    if (!Number.isNaN(n))
      return n
  }
  return nowTs()
}

interface RemoteChatSummary { id: string | number; title?: string; updated_at?: any; message_count?: number; preview?: string }
interface RemoteChatDetail { id: string | number; title?: string; messages?: any[] }

function coerceSummary(raw: any): RemoteChatSummary | null {
  if (!raw || (raw.id === undefined || raw.id === null))
    return null
  return {
    id: raw.id,
    title: typeof raw.title === 'string' ? raw.title : '',
    updated_at: raw.updated_at ?? raw.updatedAt ?? null,
    message_count: typeof raw.message_count === 'number'
      ? raw.message_count
      : (typeof raw.messages_count === 'number' ? raw.messages_count : 0),

    // Last-message snippet from the BE list — used as the sidebar row subtitle
    // so un-opened server chats don't all show "Empty conversation".
    preview: typeof raw.preview === 'string' ? raw.preview : '',
  }
}

function coerceMessage(raw: any): ChatMessage | null {
  if (!raw)
    return null
  const role: 'user' | 'assistant' = raw.role === 'user' ? 'user' : 'assistant'

  const content = typeof raw.content === 'string'
    ? raw.content
    : (typeof raw.text === 'string' ? raw.text : '')

  const id = (raw.id !== undefined && raw.id !== null) ? String(raw.id) : uid()

  return { id, role, content, ts: toTs(raw.ts ?? raw.created_at ?? raw.createdAt) }
}

function coerceDetail(raw: any): RemoteChatDetail | null {
  // The API wraps the selected conversation as `{ success, chat }`, while
  // some earlier deployments returned the chat object directly. Accept both;
  // otherwise a perfectly valid click response is discarded and the history
  // row looks as though it cannot be opened.
  raw = raw?.chat ?? raw?.data?.chat ?? raw?.data ?? raw
  if (!raw || (raw.id === undefined || raw.id === null))
    return null
  const msgsRaw = Array.isArray(raw.messages) ? raw.messages : []

  return {
    id: raw.id,
    title: typeof raw.title === 'string' ? raw.title : '',
    messages: msgsRaw.map(coerceMessage).filter(Boolean),
  }
}

function pickArray(payload: any): any[] {
  if (Array.isArray(payload))
    return payload
  if (Array.isArray(payload?.results))
    return payload.results
  if (Array.isArray(payload?.chats))
    return payload.chats
  if (Array.isArray(payload?.data))
    return payload.data
  return []
}

function mergeChatSummary(summary: RemoteChatSummary, existing?: Chat): Chat {
  if (existing) {
    return {
      ...existing,
      title: summary.title || existing.title,
      updatedAt: summary.updated_at ? toTs(summary.updated_at) : existing.updatedAt,
      needsHydration: (summary.message_count ?? 0) > existing.messages.length,
      preview: summary.preview || existing.preview,
    }
  }
  return {
    id: uid(),
    serverId: summary.id,
    title: summary.title || translateAI('New chat'),
    messages: [],
    updatedAt: toTs(summary.updated_at),
    needsHydration: (summary.message_count ?? 0) > 0,
    preview: summary.preview || '',
  }
}

function browserNotificationPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
}

export const useAIAssistantStore = defineStore('aiAssistant', () => {
  const chats = ref<Chat[]>(loadChats())
  const activeId = ref<string | null>(chats.value[0]?.id ?? null)
  const generating = ref<string | null>(null)
  const notify = ref<boolean>(loadNotify())

  const permission = ref(browserNotificationPermission())

  // Keep the old quick-actions + suggestions metadata for the empty-state.
  const quickActions = ref<QuickAction[]>([])
  const suggestions = ref<Suggestion[]>([])
  const loadingMeta = ref(false)

  // Server sync state
  const remoteChats = ref<RemoteChatSummary[]>([])
  const remoteLoading = ref(false)
  const remoteError = ref<string | null>(null)
  const loadingChatIds = ref<Array<string | number>>([])
  const chatErrors = ref<Record<string, boolean>>({})
  const detailRequests = new Map<string, Promise<RemoteChatDetail | null>>()
  let remoteListed = false // guard so we don't re-list on every visibility toggle

  const chatVisible = ref(false)
  let requestController: AbortController | null = null

  watch(chats, val => {
    try {
      const saved = val.filter(chat => chat.pinned || chat.draft || chat.id === activeId.value)
      const recent = val.filter(chat => !saved.includes(chat)).slice(0, Math.max(0, 40 - saved.length))

      localStorage.setItem(STORE_KEY, JSON.stringify([...saved, ...recent]))
    }
    catch { /* noop */ }
  }, { deep: true })
  watch(notify, on => {
    try { localStorage.setItem(NOTIFY_KEY, on ? '1' : '0') }
    catch { /* noop */ }
  })

  function setChatVisible(v: boolean) {
    chatVisible.value = v
    if (v && !remoteListed) {
      remoteListed = true

      // fire and forget — local cache is shown immediately; server merges in.
      listRemote().catch(() => { /* graceful */ })
    }
  }

  function fireNotification(_chatId: string, title: string, body: string) {
    const onPage = chatVisible.value && (typeof document === 'undefined' || !document.hidden)

    if (onPage)
      return
    if (notify.value && permission.value === 'granted' && typeof Notification !== 'undefined') {
      try {
        const n = new Notification(`Alpha POS · ${title}`, { body, tag: `ai-${_chatId}` })

        n.onclick = () => {
          try { window.focus() }
          catch { /* noop */ }
          window.dispatchEvent(new CustomEvent('ai-open-chat', { detail: _chatId }))
          n.close()
        }
      }
      catch { /* noop */ }
    }
  }

  async function requestPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (typeof Notification === 'undefined') {
      permission.value = 'unsupported'

      return 'unsupported'
    }
    if (Notification.permission === 'granted') {
      permission.value = 'granted'

      return 'granted'
    }
    const p = await Notification.requestPermission()

    permission.value = p

    return p
  }

  function toggleNotify() {
    notify.value = !notify.value
    if (notify.value)
      requestPermission()
  }

  function newChat(): string {
    const empty = chats.value.find(chat => !chat.messages.length && chat.serverId === undefined)
    if (empty) {
      activeId.value = empty.id
      return empty.id
    }

    const c: Chat = { id: uid(), title: 'New chat', messages: [], updatedAt: nowTs() }

    chats.value = [c, ...chats.value]
    activeId.value = c.id

    return c.id
  }

  async function deleteChat(id: string): Promise<boolean> {
    const c = chats.value.find(x => x.id === id)
    if (!c || generating.value === id)
      return false

    // Server chats must be deleted remotely before their local cache is
    // changed. Otherwise a failed request looks successful, then the chat
    // reappears when the history is fetched again.
    if (c.serverId !== undefined && c.serverId !== null) {
      const removed = await deleteRemote(c.serverId)
      if (!removed)
        return false
    }

    const next = chats.value.filter(x => x.id !== id)

    chats.value = next
    if (activeId.value === id)
      activeId.value = next[0]?.id ?? null

    return true
  }

  async function renameChat(id: string, title: string): Promise<boolean> {
    const c = chats.value.find(x => x.id === id)
    if (!c || !title.trim())
      return false
    if (c.serverId !== undefined && c.serverId !== null && !await renameRemote(c.serverId, title.trim()))
      return false
    chats.value = chats.value.map(x => x.id === id ? { ...x, title: title.trim() } : x)
    return true
  }

  function togglePin(id: string) {
    chats.value = chats.value.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c)
  }

  function stop() {
    requestController?.abort()
  }

  async function loadMeta() {
    loadingMeta.value = true
    try {
      const [sRes, qRes] = await Promise.all([
        stockApi.get('/ai/suggestions/'),
        stockApi.get('/ai/quick-actions/'),
      ])

      suggestions.value = sRes.data?.suggestions ?? []
      quickActions.value = qRes.data?.actions ?? []
    }
    catch {
      suggestions.value = []
      quickActions.value = []
    }
    finally { loadingMeta.value = false }
  }

  // ----------------------------------------------------------------
  // Remote (server) sync
  // ----------------------------------------------------------------

  /** GET /ai/chats/ — list server conversations and merge into local chats[]. */
  async function listRemote(): Promise<RemoteChatSummary[]> {
    if (remoteLoading.value)
      return remoteChats.value
    remoteLoading.value = true
    remoteError.value = null
    try {
      const res = await stockApi.get('/ai/chats/')
      const arr = pickArray(res.data).map(coerceSummary).filter(Boolean) as RemoteChatSummary[]

      remoteChats.value = arr
      mergeRemoteIntoLocal(arr)
      if (activeId.value)
        selectChat(activeId.value)

      return arr
    }
    catch (e: any) {
      remoteError.value = e?.response?.data?.message || e?.message || 'failed'

      return []
    }
    finally {
      remoteLoading.value = false
    }
  }

  /** Merge server summaries into local chats[]. Server is source of truth for order/title. */
  function mergeRemoteIntoLocal(remote: RemoteChatSummary[]) {
    if (!remote.length)
      return

    const byServerId = new Map<string, Chat>()
    const localOnly: Chat[] = []

    for (const c of chats.value) {
      if (c.serverId !== undefined && c.serverId !== null)
        byServerId.set(String(c.serverId), c)
      else
        localOnly.push(c)
    }

    const merged = remote.map(summary => mergeChatSummary(summary, byServerId.get(String(summary.id))))

    // Keep purely-local chats (no serverId) at the bottom — usually transient.
    const inFlight = chats.value.filter(c => c.id === generating.value && !merged.some(item => item.id === c.id) && !localOnly.some(item => item.id === c.id))

    chats.value = [...merged, ...inFlight, ...localOnly]

    if (activeId.value && !chats.value.some(c => c.id === activeId.value))
      activeId.value = chats.value[0]?.id ?? null
  }

  /** GET /ai/chats/{id}/ — hydrate one chat's messages from server. */
  async function getRemote(serverId: string | number): Promise<RemoteChatDetail | null> {
    const key = String(serverId)
    const existingRequest = detailRequests.get(key)
    if (existingRequest)
      return existingRequest
    const request = hydrateRemote(serverId)

    detailRequests.set(key, request)
    try { return await request }
    finally { detailRequests.delete(key) }
  }

  async function hydrateRemote(serverId: string | number): Promise<RemoteChatDetail | null> {
    const key = String(serverId)

    loadingChatIds.value = [...loadingChatIds.value, serverId]
    chatErrors.value = { ...chatErrors.value, [key]: false }
    try {
      const res = await stockApi.get(`/ai/chats/${serverId}/`)
      const detail = coerceDetail(res.data)

      if (!detail)
        throw new Error('Invalid conversation')

      // Splice messages into the matching local chat (if any).
      chats.value = chats.value.map(c => {
        if (String(c.serverId) !== String(detail.id) || c.id === generating.value)
          return c
        return {
          ...c,
          title: detail.title || c.title,
          messages: detail.messages as ChatMessage[],
          needsHydration: false,
        }
      })

      return detail
    }
    catch {
      chatErrors.value = { ...chatErrors.value, [key]: true }
      return null
    }
    finally {
      loadingChatIds.value = loadingChatIds.value.filter(id => String(id) !== key)
    }
  }

  /** POST /ai/chats/ — create empty server conversation, return its id. */
  async function createRemote(title?: string, signal?: AbortSignal): Promise<string | number | null> {
    try {
      const res = await stockApi.post('/ai/chats/', title ? { title } : {}, { signal })

      // BE returns { success, id, chat: { id, ... } }. Read the top-level id but
      // fall back to the nested chat.id — an earlier BE shipped only chat.id,
      // which made this return null, so every /ai/query went out WITHOUT a
      // conversation_id and the BE spawned a fresh chat per message. Read both.
      const id = res.data?.id ?? res.data?.chat?.id ?? res.data?.data?.id ?? null

      return (id !== undefined && id !== null) ? id : null
    }
    catch {
      return null
    }
  }

  /** POST /ai/chats/{id}/rename/ — BE exposes rename as a POST action, not a
   * PATCH on the detail URL (that URL is GET-only). Using PATCH silently 405'd,
   * so renames never persisted server-side. */
  async function renameRemote(serverId: string | number, title: string): Promise<boolean> {
    try {
      const res = await stockApi.post(`/ai/chats/${serverId}/rename/`, { title })

      return res.data?.success !== false
    }
    catch {
      return false
    }
  }

  /** POST /ai/chats/{id}/delete/ — BE exposes delete as a POST action, not a
   * DELETE on the detail URL. Using DELETE silently 405'd, so chats were only
   * removed locally and reappeared from the server on the next list fetch. */
  async function deleteRemote(serverId: string | number): Promise<boolean> {
    try {
      const res = await stockApi.post(`/ai/chats/${serverId}/delete/`)

      return res.data?.success !== false
    }
    catch {
      return false
    }
  }

  function selectChat(id: string) {
    activeId.value = id

    // Lazy-hydrate from server if this chat has a serverId but no messages yet
    // (or the server-side message_count exceeds what we have cached).
    const c = chats.value.find(x => x.id === id)

    if (c && c.serverId !== undefined && c.serverId !== null && (c.messages.length === 0 || c.needsHydration))
      getRemote(c.serverId).catch(() => { /* graceful */ })
  }

  // ----------------------------------------------------------------
  // Streaming reply
  // ----------------------------------------------------------------

  function finalize(convoId: string, msgId: string, complete: boolean) {
    chats.value = chats.value.map(c => c.id !== convoId
      ? c
      : ({
        ...c,
        updatedAt: nowTs(),
        messages: c.messages.map(m => m.id === msgId ? { ...m, streaming: false } : m),
      }))
    generating.value = null

    if (complete) {
      let title = 'AI reply ready'
      let body = ''
      const c = chats.value.find(x => x.id === convoId)

      if (c) {
        title = c.title

        const a = c.messages.find(m => m.id === msgId)

        body = a ? a.content.replace(/[*#]/g, '').slice(0, 90) : ''
      }
      setTimeout(() => fireNotification(convoId, title, body), 0)
    }
  }

  function getUserPayload() {
    try {
      const raw = localStorage.getItem('userData')

      if (!raw)
        return null
      const u = JSON.parse(raw)

      return { id: u.id, first_name: u.first_name, role: u.role }
    }
    catch { return null }
  }

  function appendRequest(text: string, displayedText: string, context: AIPageContext | null) {
    let chat = chats.value.find(c => c.id === activeId.value)
    if (!chat) {
      const id = newChat()

      chat = chats.value.find(c => c.id === id)
    }
    if (!chat)
      throw new Error('Conversation could not be created')

    const userMessage: ChatMessage = { id: uid(), role: 'user', content: displayedText, ts: nowTs(), request: text, context }
    const answer: ChatMessage = { id: uid(), role: 'assistant', content: '', ts: nowTs(), streaming: true }

    const title = (chat.title === 'New chat' || !chat.messages.some(m => m.role === 'user'))
      ? displayedText.slice(0, 80)
      : chat.title

    const updated = { ...chat, title, messages: [...chat.messages, userMessage, answer], updatedAt: nowTs() }

    chats.value = chats.value.map(c => c.id === updated.id ? updated : c)
    activeId.value = updated.id
    generating.value = updated.id
    return { chat: updated, answer }
  }

  async function ensureConversation(chat: Chat, signal: AbortSignal) {
    if (chat.serverId !== undefined && chat.serverId !== null)
      return chat.serverId

    // Earlier deployments may not support conversations. Preserve local history
    // and the existing query fallback when creating a conversation is unavailable.
    const serverId = await createRemote(chat.title, signal)
    if (serverId === null)
      return undefined
    chats.value = chats.value.map(c => c.id === chat.id ? { ...c, serverId } : c)
    return serverId
  }

  async function requestAnswer(query: string, context: AIPageContext | null, conversationId: string | number | undefined, signal: AbortSignal): Promise<string> {
    const payload = {
      query,
      context,
      locale: localStorage.getItem('appLocale') || 'uz',
      user: getUserPayload(),
      ...(conversationId !== undefined ? { conversation_id: conversationId } : {}),
    }

    const res = await stockApi.post('/ai/query/', payload, { signal })
    const body = res.data ?? {}
    if (body.success === false) {
      const failure = new Error('AI request failed')

      ;(failure as any).aiPayload = body
      throw failure
    }
    if (typeof body.response !== 'string' || !body.response.trim())
      throw new Error('Empty AI response')
    return body.response
  }

  function updateAnswer(chatId: string, messageId: string, patch: Partial<ChatMessage>) {
    chats.value = chats.value.map(chat => chat.id !== chatId
      ? chat
      : {
        ...chat,
        messages: chat.messages.map(message => message.id === messageId ? { ...message, ...patch } : message),
      })
  }

  async function send(rawText: string, displayedText?: string, contextOverride?: AIPageContext | null) {
    const text = (rawText || '').trim()
    if (!text || generating.value)
      return false

    // Capture context before awaiting anything so navigation cannot change
    // the date range or filters of an already submitted question.
    const context = contextOverride === undefined ? useAIPageContext().snapshot() : contextOverride
    const controller = new AbortController()
    const { chat, answer } = appendRequest(text, displayedText ?? text, context)

    requestController = controller
    try {
      const conversationId = await ensureConversation(chat, controller.signal)
      if (controller.signal.aborted)
        throw new Error('Request stopped')
      const content = await requestAnswer(text, context, conversationId, controller.signal)

      // This endpoint returns a complete answer; reveal it without a simulated stream.
      updateAnswer(chat.id, answer.id, { content, streaming: false })
      finalize(chat.id, answer.id, true)
      return true
    }
    catch (error: any) {
      const stopped = controller.signal.aborted
      const content = stopped ? translateAI('ai_workspace_stopped') : aiErrorText(error?.aiPayload ?? error?.response?.data)

      updateAnswer(chat.id, answer.id, { content, streaming: false, error: !stopped, stopped })
      generating.value = null
      return false
    }
    finally {
      if (requestController === controller)
        requestController = null
    }
  }

  function clearChat() {
    if (!activeId.value)
      return
    deleteChat(activeId.value)
  }

  function setDraft(id: string, text: string) {
    chats.value = chats.value.map(c => c.id === id ? { ...c, draft: text } : c)
  }

  function bindNotificationNavigation() {
    if (typeof window === 'undefined')
      return
    window.addEventListener('ai-open-chat', ((ev: CustomEvent) => {
      if (ev.detail) {
        activeId.value = ev.detail as string
        window.dispatchEvent(new CustomEvent('ai-goto-page'))
      }
    }) as EventListener)
  }

  bindNotificationNavigation()

  return {
    chats,
    activeId,
    generating,
    notify,
    permission,
    quickActions,
    suggestions,
    loadingMeta,
    remoteChats,
    remoteLoading,
    remoteError,
    loadingChatIds,
    chatErrors,
    togglePin,
    setChatVisible,
    requestPermission,
    toggleNotify,
    newChat,
    selectChat,
    deleteChat,
    renameChat,
    stop,
    send,
    clearChat,
    setDraft,
    loadMeta,
    listRemote,
    getRemote,
    createRemote,
    renameRemote,
    deleteRemote,
  }
})
