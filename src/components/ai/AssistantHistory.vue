<script setup lang="ts">
import { storeToRefs } from 'pinia'
import Input from '@/components/design/Input.vue'
import { useAIAssistantStore } from '@/stores/aiAssistant'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Button from '@/components/design/Button.vue'

defineProps<{ compact?: boolean }>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'new'): void
  (e: 'rename', id: string): void
  (e: 'delete', id: string): void
}>()

const { t, locale } = useI18n({ useScope: 'global' })
const store = useAIAssistantStore()
const { chats, activeId, generating, remoteLoading, remoteError } = storeToRefs(store)
const query = ref('')

const matches = computed(() => {
  const term = query.value.trim().toLocaleLowerCase()

  return [...chats.value].sort((a, b) => b.updatedAt - a.updatedAt).filter(chat => !term || `${chat.title} ${chat.preview ?? ''} ${chat.messages.map(message => message.content).join(' ')}`.toLocaleLowerCase().includes(term))
})

const groups = computed(() => [
  { key: 'pinned', label: t('ai_workspace_pinned'), chats: matches.value.filter(chat => chat.pinned) },
  { key: 'recent', label: t('Recent'), chats: matches.value.filter(chat => !chat.pinned) },
].filter(group => group.chats.length))

const title = (value: string) => value === 'New chat' ? t('New chat') : value
const dateLabel = (ts: number) => new Intl.DateTimeFormat(String(locale.value), { day: '2-digit', month: '2-digit' }).format(new Date(ts))
function preview(content: string) {
  return content.replace(/```[\s\S]*?(?:```|$)/g, ' ').replace(/[#*`]/g, '').replace(/\s+/g, ' ').trim() || t('ai_workspace_chart_reply')
}
</script>

<template>
  <div
    class="assistant-history"
    :class="{ 'is-compact': compact }"
  >
    <div class="assistant-history__top">
      <div
        v-if="!compact"
        class="assistant-history__heading"
      >
        <span>{{ t('ai_workspace_library') }}</span>
        <span class="assistant-history__count">{{ chats.length }}</span>
      </div>
      <Button
        variant="primary"
        icon="plus"
        @click="emit('new')"
      >
        {{ t('New chat') }}
      </Button>
      <Input
        v-model="query"
        type="search"
        icon="search"
        :aria-label="t('Search chats…')"
        :placeholder="t('Search chats…')"
        class="assistant-history__search"
      />
    </div>

    <div
      v-if="remoteError"
      class="assistant-history__error"
      role="alert"
    >
      <DesignIcon
        name="alert"
        :size="16"
      />
      <span>{{ t('ai_workspace_history_error') }}</span>
      <button
        type="button"
        :disabled="remoteLoading"
        :aria-label="t('Retry')"
        @click="store.listRemote()"
      >
        <DesignIcon
          name="refresh"
          :size="16"
        />
      </button>
    </div>

    <div
      class="assistant-history__list"
      :aria-busy="remoteLoading"
    >
      <div
        v-if="remoteLoading && !chats.length"
        class="assistant-history__skeleton"
        role="status"
        :aria-label="t('ai_workspace_loading_history')"
      >
        <span
          v-for="n in 6"
          :key="n"
        />
      </div>
      <div
        v-else-if="!matches.length"
        class="assistant-history__empty"
      >
        <DesignIcon
          :name="query ? 'search' : 'inbox'"
          :size="24"
        />
        <strong>{{ t(query ? 'No chats found' : 'ai_workspace_history_empty') }}</strong>
        <p>{{ t(query ? 'ai_workspace_search_hint' : 'ai_workspace_history_hint') }}</p>
      </div>
      <section
        v-for="group in groups"
        :key="group.key"
        class="assistant-history__group"
        :aria-label="group.label"
      >
        <h2>{{ group.label }}</h2>
        <div
          v-for="chat in group.chats"
          :key="chat.id"
          class="assistant-chat"
          :class="{ 'is-active': chat.id === activeId }"
        >
          <button
            type="button"
            class="assistant-chat__select"
            :aria-current="chat.id === activeId ? 'true' : undefined"
            :title="title(chat.title)"
            :aria-label="title(chat.title)"
            @click="emit('select', chat.id)"
          >
            <span class="assistant-chat__title">{{ title(chat.title) }}</span>
            <span class="assistant-chat__preview">{{ chat.messages.at(-1)?.content || chat.preview ? preview(chat.messages.at(-1)?.content || chat.preview || '') : t('Empty conversation') }}</span>
            <span class="assistant-chat__date"><DesignIcon
              :name="generating === chat.id ? 'sparkle' : 'clock'"
              :size="12"
            />{{ generating === chat.id ? t('AI is thinking…') : dateLabel(chat.updatedAt) }}</span>
          </button>
          <div class="assistant-chat__actions">
            <button
              type="button"
              :aria-label="t(chat.pinned ? 'ai_workspace_unpin' : 'ai_workspace_pin')"
              :title="t(chat.pinned ? 'ai_workspace_unpin' : 'ai_workspace_pin')"
              :aria-pressed="!!chat.pinned"
              @click="store.togglePin(chat.id)"
            >
              <DesignIcon
                name="star"
                :size="15"
              />
            </button>
            <button
              type="button"
              :aria-label="t('Rename chat')"
              :title="t('Rename chat')"
              @click="emit('rename', chat.id)"
            >
              <DesignIcon
                name="edit"
                :size="15"
              />
            </button>
            <button
              type="button"
              :aria-label="t('Delete chat')"
              :title="t('Delete chat')"
              :disabled="generating === chat.id"
              class="assistant-chat__delete"
              @click="emit('delete', chat.id)"
            >
              <DesignIcon
                name="trash"
                :size="15"
              />
            </button>
          </div>
        </div>
      </section>
    </div>
    <div class="assistant-history__foot">
      <DesignIcon
        name="info"
        :size="15"
      /><span>{{ t('ai_workspace_history_scope') }}</span>
    </div>
  </div>
</template>
