<script setup lang="ts">
import { cashboxApi as axios } from '@/plugins/axios'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DataTable, { type DataTableColumn } from '@/components/design/DataTable.vue'
import Field from '@/components/design/Field.vue'
import Input from '@/components/design/Input.vue'
import PageHeader from '@/components/design/PageHeader.vue'

const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()

const categories = ref<any[]>([])
const loading = ref(false)
const saving = ref(false)
const newCat = ref({ name: '', sort_order: 0 })
const search = ref('')

const filteredCategories = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q)
    return categories.value
  return categories.value.filter(c => String(c?.name ?? '').toLowerCase().includes(q))
})

async function load() {
  loading.value = true
  try {
    const res = await axios.get('/categories/')
    const d = res.data?.data ?? res.data

    categories.value = Array.isArray(d) ? d : (d?.categories ?? d?.items ?? [])
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Failed to load'), 'error')
  }
  finally {
    loading.value = false
  }
}

async function add() {
  if (!newCat.value.name.trim()) {
    notify(t('Name is required'), 'error')

    return
  }
  saving.value = true
  try {
    await axios.post('/categories/', newCat.value)
    notify(t('Category created'))
    newCat.value = { name: '', sort_order: 0 }
    await load()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    saving.value = false
  }
}

onMounted(load)

// ---- Table columns ----
const columns = computed<DataTableColumn<any>[]>(() => [
  { key: 'id', label: t('cashbox_cat_col_id'), sortable: true, align: 'right', width: 80 },
  { key: 'name', label: t('Name'), sortable: true },
  { key: 'sort_order', label: t('Sort order'), sortable: true, align: 'right' },
])
</script>

<template>
  <div class="page cashbox-categories-page">
    <PageHeader
      :title="t('Cashbox Expense Categories')"
      :subtitle="t('cashbox_cat_page_subtitle')"
    />

    <Card>
      <!-- Toolbar: search -->
      <div class="toolbar toolbar--wrap">
        <div class="tb-search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('Search categories...')"
          />
        </div>
      </div>

      <div class="card__divider" />

      <!-- Add form row -->
      <div class="add-form">
        <Field
          :label="t('Name')"
          class="add-form__name"
        >
          <Input
            v-model="newCat.name"
            :placeholder="t('Name')"
            @keyup.enter="add"
          />
        </Field>
        <Field
          :label="t('Sort')"
          class="add-form__sort"
        >
          <Input
            v-model.number="newCat.sort_order"
            type="number"
            :placeholder="t('Sort')"
          />
        </Field>
        <div class="add-form__btn">
          <Button
            variant="primary"
            icon="plus"
            :loading="saving"
            @click="add"
          >
            {{ t('Add') }}
          </Button>
        </div>
      </div>

      <div class="card__divider" />

      <!-- Data table -->
      <DataTable
        :columns="columns"
        :rows="filteredCategories"
        :loading="loading"
        row-key="id"
        :empty-title="t('No categories yet')"
        :empty-sub="t('cashbox_cat_empty_sub')"
        empty-icon="tag"
      >
        <template #cell.id="{ row }">
          <span class="mono num-tabular">{{ row.id }}</span>
        </template>

        <template #cell.name="{ row }">
          <span style="font-weight:600;">{{ row.name }}</span>
        </template>

        <template #cell.sort_order="{ row }">
          <span class="num-tabular">{{ row.sort_order ?? 0 }}</span>
        </template>
      </DataTable>
    </Card>

    <VSnackbar
      v-model="snackbar"
      :color="snackbarColor"
      :timeout="3000"
    >
      {{ snackbarMsg }}
    </VSnackbar>
  </div>
</template>

<style scoped>
.toolbar--wrap {
  flex-wrap: wrap;
  gap: 12px;
}

.tb-search {
  flex: 1;
  max-width: 320px;
  min-width: 220px;
}

.add-form {
  display: grid;
  grid-template-columns: 1fr 140px auto;
  gap: 12px;
  align-items: end;
  padding: var(--sp-4);
}

.add-form__btn {
  display: flex;
  align-items: center;
}

@media (max-width: 768px) {
  .tb-search {
    width: 100%;
    max-width: 100%;
    flex: 1 1 100%;
    min-width: 0;
  }
  .add-form {
    grid-template-columns: 1fr;
  }
  .add-form__btn {
    justify-content: stretch;
  }
  .add-form__btn :deep(.btn) {
    width: 100%;
  }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
