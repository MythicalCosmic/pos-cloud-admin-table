<script setup lang="ts">
import DesignIcon from '@/components/design/DesignIcon.vue'
import Badge from '@/components/design/Badge.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Select from '@/components/design/Select.vue'
import Skeleton from '@/components/design/Skeleton.vue'
import type { Tone } from '@/components/design/utils'
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import { useActionDialog } from '@/composables/useActionDialog'
import StateFill from '@/components/design/StateFill.vue'
import Kpi from '@/components/design/Kpi.vue'
import Button from '@/components/design/Button.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import FormSelect from '@/components/design/FormSelect.vue'
import FormInput from '@/components/design/FormInput.vue'
import axios from '@/plugins/axios'

const { confirmAction } = useActionDialog()
const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()

const places = ref<any[]>([])
const tables = ref<any[]>([])
const loading = ref(false)
const tablesLoading = ref(false)
const placesError = ref(false)
const tablesError = ref(false)

const placeTypes = ['HALL', 'TERRACE', 'PRIVATE_ROOM', 'BAR', 'OUTDOOR']
const tableStatuses = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'OUT_OF_SERVICE']

const statusColors: Record<string, Tone> = {
  AVAILABLE: 'success',
  OCCUPIED: 'error',
  RESERVED: 'warning',
  OUT_OF_SERVICE: 'info',
}

// Place dialog
const placeDialog = ref(false)
const placeEdit = ref<any>(null)
const placeForm = ref({ name: '', place_type: 'HALL', capacity: 0 })
const savingPlace = ref(false)

// Table dialog
const tableDialog = ref(false)
const tableEdit = ref<any>(null)
const tableForm = ref({ place_id: null as number | null, number: '', capacity: 4 })
const savingTable = ref(false)

// Selected place filter
const selectedPlaceId = ref<number | null>(null)

// Table view filters (client-side over the loaded set so counts stay accurate)
const statusFilter = ref<string | null>(null)
const search = ref('')

async function loadPlaces() {
  placesError.value = false
  loading.value = true
  try {
    const res = await axios.get('/places', { params: { per_page: 100 } })
    const d = res.data?.data ?? res.data

    places.value = d?.places ?? d?.items ?? []
  }
  catch {
    placesError.value = true
    notify(t('Failed to load places'), 'error')
  }
  finally {
    loading.value = false
  }
}

async function loadTables() {
  tablesError.value = false
  tablesLoading.value = true
  try {
    const params: any = { per_page: 200 }
    if (selectedPlaceId.value)
      params.place_id = selectedPlaceId.value
    const res = await axios.get('/tables', { params })
    const d = res.data?.data ?? res.data

    tables.value = d?.tables ?? d?.items ?? []
  }
  catch {
    tablesError.value = true
    notify(t('Failed to load tables'), 'error')
  }
  finally {
    tablesLoading.value = false
  }
}

function refreshAll() {
  loadPlaces()
  loadTables()
}

onMounted(() => { loadPlaces(); loadTables() })
watch(selectedPlaceId, loadTables)

// Live status counts over the current scope (selected place or all)
const statusCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = { AVAILABLE: 0, OCCUPIED: 0, RESERVED: 0, OUT_OF_SERVICE: 0 }
  for (const tbl of tables.value) {
    if (counts[tbl.status] !== undefined)
      counts[tbl.status]++
  }
  return counts
})

const totalSeats = computed(() => tables.value.reduce((sum, tbl) => sum + (Number(tbl.capacity) || 0), 0))

// Share of tables that are occupied or reserved (in use) — a quick floor-load read
const occupancyPct = computed(() => {
  const total = tables.value.length
  if (!total)
    return 0
  const inUse = statusCounts.value.OCCUPIED + statusCounts.value.RESERVED
  return Math.round((inUse / total) * 100)
})

const statusFilters = computed(() => [
  { value: null as string | null, label: t('All'), count: tables.value.length, color: 'primary' },
  ...tableStatuses.map(s => ({ value: s as string | null, label: t(`status_${s}`), count: statusCounts.value[s] ?? 0, color: statusColors[s] })),
])

const filteredTables = computed(() => {
  const q = search.value.trim().toLowerCase()
  return tables.value.filter(tbl => {
    if (statusFilter.value && tbl.status !== statusFilter.value)
      return false
    return !q || String(tbl.number ?? '').toLowerCase().includes(q)
  })
})

function clearFilters() {
  statusFilter.value = null
  search.value = ''
}

function openPlaceDialog(p: any = null) {
  placeEdit.value = p
  placeForm.value = p ? { name: p.name, place_type: p.place_type, capacity: p.capacity ?? 0 } : { name: '', place_type: 'HALL', capacity: 0 }
  placeDialog.value = true
}

async function savePlace() {
  if (savingPlace.value)
    return
  if (!placeForm.value.name?.trim()) {
    notify(t('Name is required'), 'error')
    return
  }
  savingPlace.value = true
  try {
    if (placeEdit.value)
      await axios.put(`/places/${placeEdit.value.id}`, placeForm.value)
    else
      await axios.post('/places', placeForm.value)
    notify(placeEdit.value ? t('Place updated') : t('Place created'))
    placeDialog.value = false
    await Promise.all([loadPlaces(), loadTables()])
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    savingPlace.value = false
  }
}

const deletingPlaces = ref(new Set<number>())
const deletingTables = ref(new Set<number>())
const updatingTables = ref(new Set<number>())

async function deletePlace(p: any) {
  if (deletingPlaces.value.has(p.id))
    return
  if (!await confirmAction({ title: t('Delete this place?'), confirmLabel: t('Delete'), danger: true }))
    return
  deletingPlaces.value.add(p.id)
  try {
    await axios.delete(`/places/${p.id}`)
    notify(t('Place deleted'))
    if (selectedPlaceId.value === p.id)
      selectedPlaceId.value = null
    await Promise.all([loadPlaces(), loadTables()])
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally { deletingPlaces.value.delete(p.id) }
}

function openTableDialog(tbl: any = null) {
  tableEdit.value = tbl
  tableForm.value = tbl
    ? { place_id: tbl.place?.id ?? tbl.place_id, number: tbl.number, capacity: tbl.capacity ?? 4 }
    : { place_id: selectedPlaceId.value ?? places.value[0]?.id ?? null, number: '', capacity: 4 }
  tableDialog.value = true
}

async function saveTable() {
  if (savingTable.value)
    return
  if (!String(tableForm.value.number ?? '').trim()) {
    notify(t('Table number is required'), 'error')
    return
  }
  savingTable.value = true
  try {
    if (tableEdit.value)
      await axios.put(`/tables/${tableEdit.value.id}`, tableForm.value)
    else
      await axios.post('/tables', tableForm.value)
    notify(tableEdit.value ? t('Table updated') : t('Table created'))
    tableDialog.value = false
    await loadTables()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    savingTable.value = false
  }
}

async function deleteTable(tbl: any) {
  if (deletingTables.value.has(tbl.id))
    return
  if (!await confirmAction({ title: t('Delete this table?'), confirmLabel: t('Delete'), danger: true }))
    return
  deletingTables.value.add(tbl.id)
  try {
    await axios.delete(`/tables/${tbl.id}`)
    notify(t('Table deleted'))
    await loadTables()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally { deletingTables.value.delete(tbl.id) }
}

async function changeTableStatus(tbl: any, status: string) {
  if (tbl.status === status || updatingTables.value.has(tbl.id))
    return
  updatingTables.value.add(tbl.id)
  try {
    await axios.patch(`/tables/${tbl.id}/status`, { status })
    notify(t('Status updated'))
    await loadTables()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally { updatingTables.value.delete(tbl.id) }
}
</script>

<template>
  <WorkspacePage class="page places-workspace">
    <PageHeader
      :title="t('Places & Tables')"
      :subtitle="t('Manage hall layout, tables and seat capacity')"
    >
      <template #actions>
        <Button
          icon="refresh"
          :loading="loading || tablesLoading"
          @click="refreshAll"
        >
          {{ t('Refresh') }}
        </Button>
      </template>
    </PageHeader>

    <StateFill
      v-if="placesError || tablesError"
      error
      :title="t(placesError ? 'Failed to load places' : 'Failed to load tables')"
    >
      <template #action>
        <Button
          variant="secondary"
          icon="refresh"
          @click="refreshAll"
        >
          {{ t('Retry') }}
        </Button>
      </template>
    </StateFill>
    <div class="grid cols-4 places-kpis">
      <Kpi :data="{ label: t('Total Tables'), value: tablesLoading || tablesError ? null : tables.length, icon: 'grid' }" />
      <Kpi :data="{ label: t('status_AVAILABLE'), value: tablesLoading || tablesError ? null : statusCounts.AVAILABLE, icon: 'checkcircle' }" />
      <Kpi :data="{ label: t('Occupancy'), value: tablesLoading || tablesError ? null : `${occupancyPct}%`, icon: 'users', sub: tablesLoading || tablesError ? undefined : `${statusCounts.OCCUPIED} ${t('status_OCCUPIED').toLowerCase()} · ${statusCounts.RESERVED} ${t('status_RESERVED').toLowerCase()}` }" />
      <Kpi :data="{ label: t('Total Seats'), value: tablesLoading || tablesError ? null : totalSeats, icon: 'table' }" />
    </div>
    <div class="dining-workspace">
      <aside
        class="dining-areas card"
        :aria-label="t('Places')"
      >
        <div class="dining-areas__head">
          <h2>{{ t('Places') }}</h2>
          <Button
            icon="plus"
            size="sm"
            @click="openPlaceDialog(null)"
          >
            {{ t('Add') }}
          </Button>
        </div>
        <button
          class="dining-area dining-area--all"
          type="button"
          :class="{ 'is-current': !selectedPlaceId }"
          :aria-pressed="!selectedPlaceId"
          @click="selectedPlaceId = null"
        >
          <DesignIcon
            name="ws-dining"
            :size="20"
          /><span>{{ t('All Tables') }}</span><strong>{{ tablesLoading || tablesError ? '—' : tables.length }}</strong>
        </button>
        <div
          v-if="loading && !places.length"
          class="dining-areas__loading"
        >
          <Skeleton
            v-for="n in 3"
            :key="n"
            :h="52"
            w="100%"
          />
        </div>
        <StateFill
          v-else-if="!places.length"
          icon="ws-location"
          :title="t('No places yet')"
          :sub="t('Create your first hall or dining area')"
        >
          <template #action>
            <Button
              icon="plus"
              @click="openPlaceDialog(null)"
            >
              {{ t('Add Place') }}
            </Button>
          </template>
        </StateFill>
        <div
          v-for="p in places"
          :key="p.id"
          class="dining-area-row"
          :class="{ 'is-current': selectedPlaceId === p.id }"
        >
          <button
            class="dining-area"
            type="button"
            :aria-pressed="selectedPlaceId === p.id"
            @click="selectedPlaceId = p.id"
          >
            <DesignIcon
              name="ws-location"
              :size="19"
            />
            <span><strong>{{ p.name }}</strong><small>{{ t(`place_type_${p.place_type}`) }} · {{ t('Capacity') }}: {{ p.capacity }}</small><Badge
              v-if="p.is_active === false"
              tone="neutral"
            >{{ t('active_false') }}</Badge></span>
          </button>
          <div class="dining-area-row__actions">
            <IconAction
              icon="edit"
              :title="`${t('Edit')}: ${p.name}`"
              @click="openPlaceDialog(p)"
            />
            <IconAction
              icon="trash"
              tone="danger"
              :title="`${t('Delete')}: ${p.name}`"
              :disabled="deletingPlaces.has(p.id)"
              @click="deletePlace(p)"
            />
          </div>
        </div>
      </aside>

      <section
        class="dining-floor card"
        :aria-label="t('Tables')"
        :aria-busy="tablesLoading"
      >
        <div class="dining-floor__head">
          <div><h2>{{ t('Tables') }}</h2><p>{{ places.find(p => p.id === selectedPlaceId)?.name || t('All Tables') }}</p></div>
          <Button
            variant="primary"
            icon="plus"
            :disabled="!places.length"
            @click="openTableDialog(null)"
          >
            {{ t('Add Table') }}
          </Button>
        </div>
        <div class="dining-floor__tools">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('Search tables...')"
            :aria-label="t('Search tables...')"
          />
          <div
            v-if="tables.length || tablesLoading"
            class="dining-statuses"
            :aria-label="t('Status')"
          >
            <button
              v-for="f in statusFilters"
              :key="String(f.value)"
              type="button"
              :class="{ 'is-current': statusFilter === f.value }"
              :aria-pressed="statusFilter === f.value"
              @click="statusFilter = f.value"
            >
              {{ f.label }}<span>{{ tablesLoading || tablesError ? '—' : f.count }}</span>
            </button>
          </div>
        </div>
        <div
          v-if="tablesLoading && !tables.length"
          class="dining-table-grid"
        >
          <Skeleton
            v-for="n in 6"
            :key="n"
            :h="200"
            w="100%"
          />
        </div>
        <div
          v-else-if="filteredTables.length"
          class="dining-table-grid"
        >
          <article
            v-for="tbl in filteredTables"
            :key="tbl.id"
            class="dining-table"
            :data-status="tbl.status"
          >
            <div class="dining-table__head">
              <DesignIcon
                name="ws-dining"
                :size="28"
                :weight="1.5"
              /><Badge
                :tone="statusColors[tbl.status] ?? 'neutral'"
                dot
              >
                {{ t(`status_${tbl.status}`) }}
              </Badge>
            </div>
            <div class="dining-table__identity">
              <h3>#{{ tbl.number }}</h3><span>{{ tbl.capacity }} {{ t('seats') }}</span>
            </div>
            <div class="dining-table__actions">
              <Select
                :model-value="tbl.status"
                :options="tableStatuses.map(s => ({ value: s, label: t(`status_${s}`) }))"
                :aria-label="`${t('Change Status')}: ${tbl.number}`"
                :disabled="updatingTables.has(tbl.id)"
                @update:model-value="changeTableStatus(tbl, String($event))"
              />
              <IconAction
                icon="edit"
                :title="`${t('Edit')}: ${tbl.number}`"
                @click="openTableDialog(tbl)"
              />
              <IconAction
                icon="trash"
                tone="danger"
                :title="`${t('Delete')}: ${tbl.number}`"
                :disabled="deletingTables.has(tbl.id)"
                @click="deleteTable(tbl)"
              />
            </div>
          </article>
        </div>
        <StateFill
          v-else-if="tables.length"
          icon="filter"
          :title="t('No tables match your filters')"
        >
          <template #action>
            <Button @click="clearFilters">
              {{ t('Clear filters') }}
            </Button>
          </template>
        </StateFill>
        <StateFill
          v-else
          icon="ws-dining"
          :title="t('No tables yet')"
          :sub="!places.length ? t('Add a place first to create tables') : undefined"
        />
      </section>
    </div>

    <!-- Place dialog -->
    <Modal
      :open="placeDialog"
      :title="placeEdit ? t('Edit Place') : t('New Place')"
      :width="480"
      :busy="savingPlace"
      @close="placeDialog = false"
    >
      <FormInput
        v-model="placeForm.name"
        :label="t('Name')"
        class="mb-3"
      /><FormSelect
        v-model="placeForm.place_type"
        :items="placeTypes.map(p => ({ title: t(`place_type_${p}`), value: p }))"
        :label="t('Type')"
        class="mb-3"
      /><FormInput
        v-model.number="placeForm.capacity"
        :label="t('Capacity')"
        type="number"
        min="0"
      /><template #footer>
        <Button
          variant="primary"
          :loading="savingPlace"
          @click="savePlace"
        >
          {{ t('Save') }}
        </Button>
      </template>
    </Modal>

    <!-- Table dialog -->
    <Modal
      :open="tableDialog"
      :title="tableEdit ? t('Edit Table') : t('New Table')"
      :width="480"
      :busy="savingTable"
      @close="tableDialog = false"
    >
      <FormSelect
        v-model="tableForm.place_id"
        :items="places.map((p: any) => ({ title: p.name, value: p.id }))"
        :label="t('Place')"
        class="mb-3"
      /><FormInput
        v-model="tableForm.number"
        :label="t('Number')"
        class="mb-3"
      /><FormInput
        v-model.number="tableForm.capacity"
        :label="t('Capacity')"
        type="number"
        min="1"
      /><template #footer>
        <Button
          variant="primary"
          :loading="savingTable"
          @click="saveTable"
        >
          {{ t('Save') }}
        </Button>
      </template>
    </Modal>

    <VSnackbar
      v-model="snackbar"
      :color="snackbarColor"
      :timeout="3000"
    >
      {{ snackbarMsg }}
    </VSnackbar>
  </WorkspacePage>
</template>

<style scoped>
.dining-workspace { display: grid; grid-template-columns: 280px minmax(0, 1fr); align-items: start; gap: 20px; }
.dining-areas__head, .dining-floor__head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 20px; }
h2 { font-size: 16px; font-weight: 650; letter-spacing: -.015em; }
.dining-area { display: flex; align-items: center; gap: 12px; inline-size: 100%; min-inline-size: 0; padding: 16px; color: var(--text); background: transparent; text-align: start; }
.dining-area .ic { flex: 0 0 auto; color: var(--text-secondary); }
.dining-area > span { flex: 1; min-inline-size: 0; font-size: 13px; overflow-wrap: anywhere; }
.dining-area strong { display: block; font-weight: 600; }
.dining-area small { display: block; margin-block-start: 4px; font-size: 11px; line-height: 1.5; color: var(--text-secondary); }
.dining-area--all { border-block: 1px solid var(--work-line); }
.dining-area--all > strong { color: var(--primary); font-variant-numeric: tabular-nums; }
.dining-area-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; border-block-end: 1px solid var(--work-line); }
.dining-area-row:last-child { border: 0; }
.dining-area-row__actions { display: flex; flex-direction: column; padding-inline-end: 10px; }
.dining-area-row.is-current, .dining-area--all.is-current { background: var(--work-soft); }
.dining-area:is(:hover, :focus-visible) { background: var(--surface-2); }
.dining-area:focus-visible { outline: 2px solid var(--primary); outline-offset: -3px; }
.dining-areas__loading { display: grid; gap: 12px; padding: 16px; }
.operations-workspace .dining-floor { border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.dining-floor__head { padding-inline: 0; border-block-end: 1px solid var(--work-line); }
.dining-floor__head p { margin: 4px 0 0; font-size: 12px; color: var(--text-secondary); }
.dining-floor__tools { display: grid; gap: 16px; padding: 20px 0 0; }
.dining-floor__tools > :first-child { max-inline-size: 380px; }
.dining-statuses { display: flex; flex-wrap: wrap; gap: 8px; }
.dining-statuses button { display: flex; align-items: center; gap: 8px; min-block-size: 38px; padding: 8px 10px; border: 1px solid var(--work-line); border-radius: 8px; color: var(--text-secondary); font-size: 11px; }
.dining-statuses button.is-current { color: var(--primary); background: var(--primary-weak); border-color: var(--primary-border); }
.dining-statuses span { font-variant-numeric: tabular-nums; font-weight: 650; }
.dining-table-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; padding: 20px 0; }
.dining-table { min-inline-size: 0; padding: 18px; border: 1px solid var(--work-line); border-radius: 13px; background: var(--surface); }
.dining-table__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.dining-table__head > .ic { color: var(--primary); }
.dining-table__identity { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-block: 22px; }
.dining-table__identity h3 { font-size: 28px; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.dining-table__identity span { color: var(--text-secondary); font-size: 12px; }
.dining-table__actions { display: flex; align-items: center; gap: 6px; }
.dining-table__actions > :first-child { flex: 1; min-inline-size: 0; }
@media (width <= 1100px) { .dining-workspace { grid-template-columns: 230px minmax(0, 1fr); gap: 16px; } }
@media (width <= 800px) { .dining-workspace { grid-template-columns: minmax(0, 1fr); } .dining-area-row__actions { flex-direction: row; } }
@media (width <= 700px) { .dining-areas__head { padding: 16px; } .dining-floor__head { padding: 16px 0; } .dining-floor__tools { padding: 16px 0 0; } .dining-table-grid { padding: 16px 0; grid-template-columns: minmax(0, 1fr); } .dining-statuses button { min-block-size: 44px; } }
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
