<script setup lang="ts">
/* ============================================================
   Alpha POS — ChartCard
   Ports ChartCard({eyebrow, insight, title, sub, actions, children})
   from .tmp-alpha-design/alpha-design-source/App.shell.jsx verbatim.

   Styling is provided by design-shell.css (.card, .card__head,
   .card__head-text, .kpi__label, .card__insight, .card__title,
   .card__sub, .card__actions, .card__body).
   ============================================================ */

interface Props {
  eyebrow?: string
  insight?: string
  title?: string
  sub?: string
  className?: string
}

defineProps<Props>()
</script>

<template>
  <div class="card" :class="className">
    <div class="card__head">
      <div class="card__head-text">
        <div
          v-if="eyebrow"
          class="kpi__label"
          style="margin-bottom: 3px;"
        >
          {{ eyebrow }}
        </div>
        <h3
          v-if="insight"
          class="card__insight"
        >
          {{ insight }}
        </h3>
        <h3
          v-else-if="title"
          class="card__title"
        >
          {{ title }}
        </h3>
        <div
          v-if="sub"
          class="card__sub"
        >
          {{ sub }}
        </div>
      </div>
      <div
        v-if="$slots.actions"
        class="card__actions"
      >
        <slot name="actions" />
      </div>
    </div>
    <div class="card__body">
      <slot />
    </div>
  </div>
</template>
