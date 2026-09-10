<script setup lang="ts">
/* ============================================================
   ALPHA POS — Notifications bell (topbar)
   Unified feed: the AI morning-briefing items + anomaly alerts.
   Click the bell → dropdown with an unread count, per-item Open +
   mark-read, and a "mark all read". Anomalies mark-read via the
   server ack; briefing items track read state locally (the BE only
   exposes a whole-briefing dismiss, not per-bullet read).
   ============================================================ */
import axiosIns from '@/plugins/axios'
import { useNotify } from '@/composables/useNotify'
import DesignIcon from './DesignIcon.vue'
import { designId } from './ids'
import { localizeNotify, notifyIcon, resolveNotifyLink } from './utils/notify'

const { t, locale } = useI18n({ useScope: 'global' })
const router = useRouter()
const { notify } = useNotify()
const panelId = designId('notifications')

interface Anomaly {
  id: number
  severity: 'low' | 'medium' | 'high' | 'critical'
  fired_at?: string
  message: unknown
  deep_link?: string
  ai_explanation?: unknown
}
interface BriefingBullet {
  icon?: string
  title: unknown
  body: unknown
  title_i18n?: Record<string, string>
  body_i18n?: Record<string, string>
  deep_link?: string
}

interface Notif {
  id: string
  kind: 'anomaly' | 'briefing'
  icon: string
  title: string
  body: string
  link: string | null
  severity?: Anomaly['severity']
  ackId?: number
}

const anomalies = ref<Anomaly[]>([])
const bullets = ref<BriefingBullet[]>([])
const briefingId = ref<number | string>('')
const briefingDismissed = ref(false)
const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)
let pollTimer: number | null = null
const marking = ref<Set<string>>(new Set())
const markingAll = ref(false)

// Briefing items have no server-side per-bullet read flag, so remember which
// ones the operator has read locally.
const READ_KEY = 'ai-briefing-read'
function loadReadSet(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]')) }
  catch { return new Set() }
}
const readSet = ref<Set<string>>(loadReadSet())
function persistRead() {
  try { localStorage.setItem(READ_KEY, JSON.stringify([...readSet.value])) }
  catch { /* noop */ }
}

function loc(v: unknown): string { return localizeNotify(v, String(locale.value)) }

async function load() {
  try {
    const [aRes, bRes] = await Promise.all([
      axiosIns.get('/ai/anomalies', { params: { unacked: 1 } }).catch(() => null),
      axiosIns.get('/ai/briefing').catch(() => null),
    ])
    anomalies.value = (aRes?.data?.data?.anomalies ?? []) as Anomaly[]
    const bp = bRes?.data?.data ?? null
    briefingDismissed.value = !!bp?.dismissed
    briefingId.value = bp?.id ?? ''
    // The `dismissed` flag only collapses the dashboard briefing CARD for the
    // day — the bell is a persistent notification center, so always surface the
    // bullets here and rely on per-item local read state instead.
    bullets.value = (bp?.bullets ?? []) as BriefingBullet[]
  }
  catch { /* keep prior */ }
}

// Anomalies first (severity-ordered), then briefing items.
const notifs = computed<Notif[]>(() => {
  const sevRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  const a = [...anomalies.value]
    .sort((x, y) => (sevRank[x.severity] ?? 9) - (sevRank[y.severity] ?? 9))
    .map<Notif>(an => ({
      id: `a-${an.id}`,
      kind: 'anomaly',
      icon: 'alert',
      title: loc(an.message),
      body: loc(an.ai_explanation),
      link: resolveNotifyLink(an.deep_link),
      severity: an.severity,
      ackId: an.id,
    }))
  const b = bullets.value.map<Notif>((bl, i) => ({
    id: `b-${briefingId.value}-${i}`,
    kind: 'briefing',
    icon: notifyIcon(bl.icon),
    // BE ships localized title_i18n/body_i18n {uz,ru,en} alongside flat English.
    title: loc(bl.title_i18n ?? bl.title),
    body: loc(bl.body_i18n ?? bl.body),
    link: resolveNotifyLink(bl.deep_link),
  }))
  return [...a, ...b]
})

// Anomalies are always unread (fetched unacked); briefing items are unread
// until marked.
function isUnread(n: Notif): boolean {
  return n.kind === 'anomaly' || !readSet.value.has(n.id)
}
const unreadCount = computed(() => notifs.value.filter(isUnread).length)
const hasCritical = computed(() =>
  anomalies.value.some(a => a.severity === 'critical' || a.severity === 'high'))

function sevTone(s?: Anomaly['severity']) {
  if (s === 'critical') return 'error'
  if (s === 'high') return 'warning'
  if (s === 'medium') return 'info'
  return 'neutral'
}

async function markRead(n: Notif) {
  if (n.kind === 'anomaly' && n.ackId != null) {
    if (marking.value.has(n.id)) return
    marking.value = new Set(marking.value).add(n.id)
    try {
      await axiosIns.post(`/ai/anomalies/${n.ackId}/ack`)
      anomalies.value = anomalies.value.filter(a => a.id !== n.ackId)
    }
    catch {
      notify(t('Request failed. Please try again.'), 'error')
    }
    finally {
      const next = new Set(marking.value)
      next.delete(n.id)
      marking.value = next
    }
  }
  else {
    readSet.value = new Set(readSet.value).add(n.id)
    persistRead()
  }
}

async function markAllRead() {
  if (markingAll.value) return
  markingAll.value = true
  // Remove only acknowledgements confirmed by the server. Failed items stay
  // visible and unread so the UI never reports a false success.
  const snapshot = [...anomalies.value]
  const results = await Promise.allSettled(snapshot.map(a =>
    axiosIns.post(`/ai/anomalies/${a.id}/ack`)))
  const succeeded = new Set<number>()
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') succeeded.add(snapshot[index].id)
  })
  anomalies.value = anomalies.value.filter(a => !succeeded.has(a.id))
  const next = new Set(readSet.value)
  for (const n of notifs.value) {
    if (n.kind === 'briefing') next.add(n.id)
  }
  readSet.value = next
  persistRead()
  if (succeeded.size !== snapshot.length)
    notify(t('Request failed. Please try again.'), 'error')
  markingAll.value = false
}

function goOpen(n: Notif) {
  if (n.link) router.push(n.link)
  if (!isUnread(n)) { /* already read */ }
  else void markRead(n)
  open.value = false
}

onClickOutside(rootRef, () => { open.value = false })

onMounted(() => {
  void load()
  pollTimer = window.setInterval(load, 90_000)
})
onBeforeUnmount(() => {
  if (pollTimer != null) { window.clearInterval(pollTimer); pollTimer = null }
})
</script>

<template>
  <div ref="rootRef" class="anom-root">
    <button
      class="iconbtn anom-trigger"
      :class="{ 'has-critical': hasCritical }"
      :title="unreadCount ? t('{n} unread notifications', { n: unreadCount }) : t('Notifications')"
      :aria-label="unreadCount ? t('{n} unread notifications', { n: unreadCount }) : t('Notifications')"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="open = !open"
    >
      <DesignIcon name="bell" :size="18" />
      <span v-if="unreadCount" class="anom-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
    </button>
    <Transition name="fade">
      <div
        v-if="open"
        :id="panelId"
        class="anom-panel"
        role="dialog"
        :aria-label="t('Notifications')"
      >
        <div class="anom-head">
          <span class="anom-title">{{ t('Notifications') }}</span>
          <button
            v-if="unreadCount"
            class="anom-allread"
            :disabled="markingAll"
            @click="markAllRead"
          >
            {{ t('Mark all read') }}
          </button>
        </div>
        <div v-if="!notifs.length" class="anom-empty">
          {{ t('No notifications') }}
        </div>
        <ul v-else class="anom-list">
          <li
            v-for="n in notifs"
            :key="n.id"
            class="anom-row"
            :class="{ 'is-read': !isUnread(n) }"
          >
            <span
              class="anom-icon"
              :class="n.kind === 'anomaly' ? `sev-${sevTone(n.severity)}` : 'kind-briefing'"
            >
              <DesignIcon :name="n.icon" :size="15" />
            </span>
            <div class="anom-body">
              <div class="anom-msg">
                {{ n.title }}
              </div>
              <div v-if="n.body" class="anom-explain">
                {{ n.body }}
              </div>
              <div class="anom-actions">
                <button
                  v-if="n.link"
                  class="anom-chip"
                  @click="goOpen(n)"
                >
                  {{ t('Open') }}
                  <DesignIcon name="chevright" :size="11" />
                </button>
                <button
                  v-if="isUnread(n)"
                  class="anom-chip anom-chip--ghost"
                  :disabled="marking.has(n.id)"
                  @click="markRead(n)"
                >
                  <DesignIcon name="check" :size="11" />
                  {{ t('Mark read') }}
                </button>
              </div>
            </div>
            <span v-if="isUnread(n)" class="anom-unread-dot" />
          </li>
        </ul>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.anom-root { position: relative; }
.anom-trigger { position: relative; }
.anom-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 99px;
  background: rgb(var(--v-theme-error));
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  font-family: var(--font-mono);
  /* The topbar's inherited 22px line-height was taller than the 16px badge and
     pushed the digit out of view — pin it to 1 so the count centers. */
  line-height: 1;
  display: grid;
  place-items: center;
  border: 2px solid var(--surface);
}
.anom-trigger.has-critical { color: rgb(var(--v-theme-error)); }
.anom-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: min(380px, 92vw);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  z-index: 120;
  max-height: 72vh;
  overflow-y: auto;
}
.anom-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--surface);
}
.anom-title { font-size: 13px; font-weight: 600; color: var(--text); }
.anom-allread {
  font-size: 11px;
  font-weight: 500;
  color: var(--primary);
  background: transparent;
  border: 0;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 6px;
}
.anom-allread:hover { background: var(--surface-2); }
.anom-empty {
  padding: 26px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-tertiary);
}
.anom-list { margin: 0; padding: 6px; list-style: none; display: flex; flex-direction: column; gap: 2px; }
.anom-row {
  position: relative;
  display: flex;
  gap: 10px;
  padding: 10px;
  border-radius: 8px;
}
.anom-row:hover { background: var(--surface-2); }
.anom-row.is-read { opacity: 0.55; }
.anom-icon {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: rgba(var(--v-theme-primary), 0.1);
  color: var(--primary);
}
.anom-icon.kind-briefing { background: rgba(var(--v-theme-primary), 0.1); color: var(--primary); }
.anom-icon.sev-error { background: rgba(var(--v-theme-error), 0.12); color: rgb(var(--v-theme-error)); }
.anom-icon.sev-warning { background: rgba(var(--v-theme-warning), 0.14); color: rgb(var(--v-theme-warning)); }
.anom-icon.sev-info { background: rgba(var(--v-theme-info), 0.12); color: rgb(var(--v-theme-info)); }
.anom-icon.sev-neutral { background: var(--surface-2); color: var(--text-secondary); }
.anom-body { flex: 1; min-width: 0; }
.anom-msg { font-size: 13px; font-weight: 600; color: var(--text); }
.anom-explain {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
  line-height: 1.4;
}
.anom-actions { display: inline-flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
.anom-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 99px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  cursor: pointer;
}
.anom-chip:hover { background: var(--surface-2); color: var(--text); }
.anom-chip--ghost { border-color: transparent; }
.anom-unread-dot {
  position: absolute;
  top: 12px;
  right: 10px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
}
.fade-enter-active, .fade-leave-active { transition: opacity .14s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
