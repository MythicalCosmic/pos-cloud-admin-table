<script setup lang="ts">
const props = withDefaults(defineProps<{
  page: number
  itemsPerPage: number
  totalItems: number
  perPageOptions?: number[]
}>(), {
  perPageOptions: () => [5, 10, 25, 50],
})

const emit = defineEmits<{
  (e: 'update:page', value: number): void
  (e: 'update:itemsPerPage', value: number): void
}>()

const { t } = useI18n({ useScope: 'global' })

const localPage = computed({
  get: () => props.page,
  set: (v: number) => emit('update:page', v),
})

const localPerPage = computed({
  get: () => props.itemsPerPage,
  set: (v: number) => emit('update:itemsPerPage', v),
})

const rangeStart = computed(() => Math.min((props.page - 1) * props.itemsPerPage + 1, props.totalItems))
const rangeEnd = computed(() => Math.min(props.page * props.itemsPerPage, props.totalItems))
const pageCount = computed(() => Math.ceil(props.totalItems / props.itemsPerPage) || 1)
</script>

<template>
  <div class="v-data-table-footer pb-2">
    <div class="v-data-table-footer__items-per-page">
      <span>{{ t('Items per page:') }}</span>
      <VSelect
        v-model="localPerPage"
        :items="perPageOptions"
        density="compact"
        variant="solo"
        hide-details
        style="width: 96px;"
        @update:model-value="emit('update:page', 1)"
      />
    </div>
    <div class="v-data-table-footer__info">
      {{ rangeStart }}-{{ rangeEnd }} {{ t('of') }} {{ totalItems }}
    </div>
    <div class="v-data-table-footer__pagination">
      <VPagination
        v-model="localPage"
        :length="pageCount"
        :total-visible="5"
        density="compact"
        variant="text"
        rounded="lg"
      />
    </div>
  </div>
</template>

<style>

</style>
