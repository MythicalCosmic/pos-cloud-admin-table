<script setup lang="ts">
/* ============================================================
   ALPHA POS - Pagination
   Vue 3 port of .tmp-handoff-v3/.../app/ui.jsx Pagination component.
   Decision #3 (v3): standalone partial used by DataTable.vue.
   Decision #4 (v3): total formatted via Intl.NumberFormat (comma sep).
   ============================================================ */
import DesignIcon from './DesignIcon.vue'
import Select from './Select.vue'
import { cx } from './utils'

interface Props {
  page: number
  perPage: number
  pages: number
  total: number
  perPageOptions?: number[]
}

const props = withDefaults(defineProps<Props>(), {
  perPageOptions: () => [10, 20, 50],
})

const emit = defineEmits<{
  (e: 'page', p: number): void
  (e: 'per-page', n: number): void
}>()

const { t } = useI18n({ useScope: 'global' })

const rangeStart = computed(() =>
  props.total === 0 ? 0 : (props.page - 1) * props.perPage + 1,
)
const rangeEnd = computed(() =>
  Math.min(props.page * props.perPage, props.total),
)

const pageNums = computed<(number | '…')[]>(() => {
  const pages = props.pages
  const page = props.page
  if (pages <= 7)
    return Array.from({ length: pages }, (_, i) => i + 1)
  if (page <= 4)
    return [1, 2, 3, 4, 5, '…', pages]
  if (page >= pages - 3)
    return [1, '…', pages - 4, pages - 3, pages - 2, pages - 1, pages]
  return [1, '…', page - 1, page, page + 1, '…', pages]
})

import { fmtNum } from './utils/format'

function fmtTotal(n: number) {
  // Locale-aware via the project formatter (uses non-breaking space — matches
  // the rest of the UI). Previously hardcoded en-US comma separator.
  return fmtNum(n)
}

function goPage(n: number) {
  if (n < 1 || n > props.pages || n === props.page)
    return
  emit('page', n)
}

function onPpChange(v: string) {
  const n = Number(v)
  if (!Number.isNaN(n))
    emit('per-page', n)
}
</script>

<template>
  <nav
    class="pagination"
    :aria-label="t('Pages')"
  >
    <div
      class="row"
      style="gap: 8px;"
    >
      <span>{{ t('Rows per page') }}:</span>
      <Select
        :model-value="String(perPage)"
        :options="perPageOptions.map(n => ({ value: String(n), label: String(n) }))"
        :aria-label="t('Rows per page')"
        size="sm"
        style="width: 82px;"
        @update:model-value="onPpChange"
      />
    </div>
    <div class="pagination__spacer" />
    <span class="num">{{ rangeStart }}–{{ rangeEnd }} {{ t('of') }} {{ fmtTotal(total) }}</span>
    <div class="pglist">
      <button
        class="pgbtn"
        :disabled="page <= 1"
        :aria-label="t('$vuetify.pagination.ariaLabel.previous')"
        @click="goPage(page - 1)"
      >
        <DesignIcon
          name="chevleft"
          :size="16"
        />
      </button>
      <template
        v-for="(n, i) in pageNums"
        :key="n === '…' ? `e-${i}` : n"
      >
        <span
          v-if="n === '…'"
          class="pgbtn"
          style="pointer-events: none;"
        >…</span>
        <button
          v-else
          :class="cx('pgbtn', n === page && 'is-active')"
          :aria-label="`${t('$vuetify.pagination.ariaLabel.page')} ${n}`"
          :aria-current="n === page ? 'page' : undefined"
          @click="goPage(n as number)"
        >
          {{ n }}
        </button>
      </template>
      <button
        class="pgbtn"
        :disabled="page >= pages"
        :aria-label="t('$vuetify.pagination.ariaLabel.next')"
        @click="goPage(page + 1)"
      >
        <DesignIcon
          name="chevright"
          :size="16"
        />
      </button>
    </div>
  </nav>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
}

</style>
