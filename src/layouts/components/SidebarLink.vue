<script setup lang="ts">
import DesignIcon from '@/components/design/DesignIcon.vue'

defineProps<{ to: string; label: string; icon: string; active: boolean; compact: boolean; badge?: string }>()

const emit = defineEmits<{ (e: 'navigate', event: MouseEvent): void }>()
</script>

<template>
  <a
    :href="to"
    class="nav-item workspace-nav-link"
    :class="{ 'is-active': active }"
    :title="compact ? label : undefined"
    :aria-label="compact ? (badge ? `${label}, ${badge}` : label) : undefined"
    :aria-current="active ? 'page' : undefined"
    @click="emit('navigate', $event)"
  >
    <span class="nav-item__icon"><DesignIcon
      :name="icon"
      :size="19"
    /></span><span
      v-if="!compact"
      class="nav-item__label"
    >{{ label }}</span><span
      v-if="badge && !compact"
      class="nav-item__badge"
    >{{ badge }}</span><span
      v-else-if="badge"
      class="nav-item__dot"
      aria-hidden="true"
    />
  </a>
</template>
