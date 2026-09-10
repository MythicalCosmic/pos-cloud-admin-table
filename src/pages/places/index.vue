<script setup lang="ts">
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

const statusColors: Record<string, string> = {
  AVAILABLE: 'success',
  OCCUPIED: 'error',
  RESERVED: 'warning',
  OUT_OF_SERVICE: 'info',
}

const statusIcons: Record<string, string> = {
  AVAILABLE: 'bx-check-circle',
  OCCUPIED: 'bx-user',
  RESERVED: 'bx-time-five',
  OUT_OF_SERVICE: 'bx-wrench',
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
  if (tbl.status === status)
    return
  try {
    await axios.patch(`/tables/${tbl.id}/status`, { status })
    notify(t('Status updated'))
    await loadTables()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
}
</script>

<template>
  <div class="page places-workspace">
    <PageHeader
      :title="t('Places & Tables')"
      :subtitle="t('Manage hall layout, tables and seat capacity')"
    >
      <template #actions>
        <VBtn
          variant="tonal"
          color="secondary"
          size="small"
          prepend-icon="bx-refresh"
          :loading="loading || tablesLoading"
          @click="refreshAll"
        >
          {{ t('Refresh') }}
        </VBtn>
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
      <Kpi :data="{ label: t('Occupancy'), value: tablesLoading || tablesError ? null : `${occupancyPct}%`, icon: 'users', sub: `${statusCounts.OCCUPIED} ${t('status_OCCUPIED').toLowerCase()} · ${statusCounts.RESERVED} ${t('status_RESERVED').toLowerCase()}` }" />
      <Kpi :data="{ label: t('Total Seats'), value: tablesLoading || tablesError ? null : totalSeats, icon: 'table' }" />
    </div>
    <VRow>
      <VCol
        cols="12"
        md="4"
      >
        <VCard>
          <VCardText class="d-flex align-center justify-space-between">
            <span class="text-h6">{{ t('Places') }}</span>
            <VBtn
              size="small"
              prepend-icon="bx-plus"
              @click="openPlaceDialog(null)"
            >
              {{ t('Add') }}
            </VBtn>
          </VCardText>
          <VDivider />
          <VList>
            <VListItem
              :active="!selectedPlaceId"
              @click="selectedPlaceId = null"
            >
              <VListItemTitle>{{ t('All Tables') }}</VListItemTitle>
              <template #append>
                <VChip size="x-small">
                  {{ tables.length }}
                </VChip>
              </template>
            </VListItem>
            <VDivider />
            <template v-if="loading && places.length === 0">
              <VListItem
                v-for="n in 3"
                :key="n"
              >
                <div
                  class="sk-box"
                  style="width:100%;height:18px;border-radius:4px;"
                />
              </VListItem>
            </template>
            <template v-else-if="places.length === 0">
              <div class="text-center text-disabled py-6 px-4">
                <VIcon
                  icon="bx-building-house"
                  size="40"
                  class="mb-2"
                />
                <div class="text-body-2 mb-1">
                  {{ t('No places yet') }}
                </div>
                <div class="text-caption mb-3">
                  {{ t('Create your first hall or dining area') }}
                </div>
                <VBtn
                  size="small"
                  prepend-icon="bx-plus"
                  @click="openPlaceDialog(null)"
                >
                  {{ t('Add Place') }}
                </VBtn>
              </div>
            </template>
            <VListItem
              v-for="p in places"
              :key="p.id"
              :active="selectedPlaceId === p.id"
              @click="selectedPlaceId = p.id"
            >
              <VListItemTitle
                class="d-flex align-center"
                style="gap:6px;"
              >
                {{ p.name }}
                <VChip
                  v-if="p.is_active === false"
                  size="x-small"
                  color="secondary"
                  variant="tonal"
                >
                  {{ t('active_false') }}
                </VChip>
              </VListItemTitle>
              <VListItemSubtitle>{{ t(`place_type_${p.place_type}`) }} · {{ t('Capacity') }}: {{ p.capacity }}</VListItemSubtitle>
              <template #append>
                <div
                  class="d-flex"
                  style="gap:2px;"
                >
                  <VBtn
                    icon
                    variant="text"
                    size="x-small"
                    :aria-label="`${t('Edit')}: ${p.name}`"
                    @click.stop="openPlaceDialog(p)"
                  >
                    <VIcon
                      icon="bx-edit-alt"
                      size="16"
                    />
                    <VTooltip
                      activator="parent"
                      location="top"
                    >
                      {{ t('Edit') }}
                    </VTooltip>
                  </VBtn>
                  <VBtn
                    icon
                    variant="text"
                    size="x-small"
                    color="error"
                    :aria-label="`${t('Delete')}: ${p.name}`"
                    :disabled="deletingPlaces.has(p.id)"
                    @click.stop="deletePlace(p)"
                  >
                    <VIcon
                      icon="bx-trash"
                      size="16"
                    />
                    <VTooltip
                      activator="parent"
                      location="top"
                    >
                      {{ t('Delete') }}
                    </VTooltip>
                  </VBtn>
                </div>
              </template>
            </VListItem>
          </VList>
        </VCard>
      </VCol>

      <VCol
        cols="12"
        md="8"
      >
        <VCard>
          <VCardText
            class="d-flex align-center justify-space-between flex-wrap"
            style="gap:12px;"
          >
            <span class="text-h6">{{ t('Tables') }}</span>
            <div
              class="d-flex align-center flex-wrap"
              style="gap:8px;"
            >
              <FormInput
                v-model="search"
                :placeholder="t('Search tables...')"
                prepend-inner-icon="bx-search"
                density="compact"
                variant="outlined"
                hide-details
                clearable
                style="min-width:180px;max-width:220px;"
              />
              <VBtn
                size="small"
                prepend-icon="bx-plus"
                :disabled="!places.length"
                @click="openTableDialog(null)"
              >
                {{ t('Add Table') }}
              </VBtn>
            </div>
          </VCardText>
          <VDivider />

          <!-- Status filter / segmented counts -->
          <div
            v-if="tables.length || tablesLoading"
            class="d-flex align-center flex-wrap px-4 pt-4"
            style="gap:8px;"
          >
            <VChip
              v-for="f in statusFilters"
              :key="String(f.value)"
              :color="f.color"
              :variant="statusFilter === f.value ? 'flat' : 'tonal'"
              size="small"
              label
              @click="statusFilter = f.value"
            >
              {{ f.label }}
              <span class="ms-1 font-weight-bold">{{ f.count }}</span>
            </VChip>
          </div>

          <VCardText>
            <VRow v-if="filteredTables.length || (tablesLoading && tables.length === 0)">
              <VCol
                v-for="(tbl, idx) in (tablesLoading && tables.length === 0 ? Array.from({ length: 8 }) : filteredTables)"
                :key="(tbl as any)?.id ?? idx"
                cols="6"
                sm="4"
                md="3"
              >
                <VCard
                  v-if="tbl"
                  border
                  hover
                  class="text-center pa-3 table-card"
                >
                  <VAvatar
                    :color="statusColors[(tbl as any).status] ?? 'default'"
                    variant="tonal"
                    size="48"
                    rounded
                  >
                    <VIcon :icon="statusIcons[(tbl as any).status] ?? 'bx-grid-alt'" />
                  </VAvatar>
                  <div class="text-h6 mt-2">
                    #{{ (tbl as any).number }}
                  </div>
                  <div class="text-caption text-disabled">
                    <VIcon
                      icon="bx-chair"
                      size="13"
                      class="me-1"
                    />{{ (tbl as any).capacity }} {{ t('seats') }}
                  </div>
                  <VChip
                    size="x-small"
                    :color="statusColors[(tbl as any).status] ?? 'default'"
                    variant="tonal"
                    class="mt-1 status-pill"
                  >
                    {{ t(`status_${(tbl as any).status}`) }}
                  </VChip>
                  <VMenu>
                    <template #activator="{ props: menuProps }">
                      <VBtn
                        v-bind="menuProps"
                        variant="text"
                        size="x-small"
                        class="mt-2"
                        append-icon="bx-chevron-down"
                        block
                      >
                        {{ t('Change Status') }}
                      </VBtn>
                    </template>
                    <VList density="compact">
                      <VListItem
                        v-for="s in tableStatuses"
                        :key="s"
                        :active="(tbl as any).status === s"
                        @click="changeTableStatus(tbl, s)"
                      >
                        <template #prepend>
                          <VIcon
                            :icon="statusIcons[s]"
                            :color="statusColors[s]"
                            size="16"
                            class="me-2"
                          />
                        </template>
                        <VListItemTitle>{{ t(`status_${s}`) }}</VListItemTitle>
                      </VListItem>
                    </VList>
                  </VMenu>
                  <div
                    class="d-flex justify-center mt-1"
                    style="gap:2px;"
                  >
                    <VBtn
                      icon
                      variant="text"
                      size="x-small"
                      @click="openTableDialog(tbl)"
                    >
                      <VIcon
                        icon="bx-edit-alt"
                        size="14"
                      />
                      <VTooltip
                        activator="parent"
                        location="top"
                      >
                        {{ t('Edit') }}
                      </VTooltip>
                    </VBtn>
                    <VBtn
                      icon
                      variant="text"
                      size="x-small"
                      color="error"
                      @click="deleteTable(tbl)"
                    >
                      <VIcon
                        icon="bx-trash"
                        size="14"
                      />
                      <VTooltip
                        activator="parent"
                        location="top"
                      >
                        {{ t('Delete') }}
                      </VTooltip>
                    </VBtn>
                  </div>
                </VCard>
                <div
                  v-else
                  class="sk-box"
                  style="width:100%;height:170px;border-radius:8px;"
                />
              </VCol>
            </VRow>

            <!-- No match for current filters -->
            <div
              v-else-if="tables.length"
              class="text-center text-disabled py-8"
            >
              <VIcon
                icon="bx-filter-alt"
                size="48"
                class="mb-2"
              />
              <div class="mb-3">
                {{ t('No tables match your filters') }}
              </div>
              <VBtn
                size="small"
                variant="tonal"
                @click="clearFilters"
              >
                {{ t('Clear filters') }}
              </VBtn>
            </div>

            <!-- Truly empty -->
            <div
              v-else
              class="text-center text-disabled py-8"
            >
              <VIcon
                icon="bx-grid-alt"
                size="48"
                class="mb-2"
              />
              <div class="mb-1">
                {{ t('No tables yet') }}
              </div>
              <div
                v-if="!places.length"
                class="text-caption"
              >
                {{ t('Add a place first to create tables') }}
              </div>
            </div>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>

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
  </div>
</template>

<style scoped>
.places-kpis { margin-bottom: 24px; }
.places-workspace :deep(.v-card) { border: 1px solid var(--border); border-radius: 16px; box-shadow: none; }
.places-workspace :deep(.text-h6) { font-size: 18px !important; font-weight: 600; }

.table-card {
  transition: border-color .16s ease, box-shadow .16s ease;
}

.table-card:hover {
  border-color: rgb(var(--v-theme-primary)) !important;
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
