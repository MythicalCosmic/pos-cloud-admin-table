<script setup lang="ts">
interface Props {
  title: string
  subtitle?: string
  eyebrow?: string
}

defineProps<Props>()
</script>

<template>
  <div class="page__head">
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
