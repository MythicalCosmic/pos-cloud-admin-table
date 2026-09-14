<script setup lang="ts">
import WorkspaceHeader from './workspace/WorkspaceHeader.vue'
import { workspaceContext } from './workspace/context'

defineProps<Props>()

const workspace = inject(workspaceContext, false)

interface Props {
  title: string
  subtitle?: string
  eyebrow?: string
}
</script>

<template>
  <WorkspaceHeader
    v-if="workspace"
    :title="title"
    :subtitle="subtitle"
    :eyebrow="eyebrow"
  >
    <template
      v-if="$slots.actions"
      #actions
    >
      <slot name="actions" />
    </template>
  </WorkspaceHeader>
  <div
    v-else
    class="page__head"
  >
    <div style="min-width: 0;">
      <h1 class="page__title">
        {{ title }}
      </h1>
      <div
        v-if="eyebrow"
        class="page__subtitle"
      >
        {{ eyebrow }}
      </div>
      <div
        v-if="subtitle"
        class="page__subtitle"
      >
        {{ subtitle }}
      </div>
    </div>
    <div
      v-if="$slots.actions"
      class="page__head-actions"
    >
      <slot name="actions" />
    </div>
  </div>
</template>
