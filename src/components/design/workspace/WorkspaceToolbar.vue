<script setup lang="ts">
import DesignIcon from '../DesignIcon.vue'
import { designId } from '../ids'

const { t } = useI18n({ useScope: 'global' })
const compact = useMediaQuery('(max-width: 700px)')
const expanded = ref(false)
const controlsId = designId('workspace-filters')
const visible = computed(() => !compact.value || expanded.value)
</script>

<template>
  <div class="workspace-tools">
    <div
      v-if="!compact"
      class="workspace-tools__label"
    >
      <span
        class="workspace-tools__label-icon"
        aria-hidden="true"
      >
        <DesignIcon
          name="sliders"
          :size="17"
        />
      </span>
      <span>{{ t('workspace_search_filters') }}</span>
    </div>
    <button
      v-if="compact"
      class="workspace-tools__toggle"
      type="button"
      :aria-expanded="visible"
      :aria-controls="controlsId"
      @click="expanded = !expanded"
    >
      <span><DesignIcon
        name="sliders"
        :size="18"
      />{{ t('workspace_search_filters') }}</span>
      <DesignIcon
        :name="expanded ? 'chevup' : 'chevdown'"
        :size="16"
      />
    </button>
    <div
      v-show="visible"
      :id="controlsId"
      class="workspace-tools__fields"
    >
      <slot />
    </div>
  </div>
</template>
