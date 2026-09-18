<script setup lang="ts">
import OwnerPage from '../components/OwnerPage.vue'
import { REFRESH_EVENT } from '../state'
import Input from '@/components/design/Input.vue'
import Skeleton from '@/components/design/Skeleton.vue'
import StateFill from '@/components/design/StateFill.vue'
import { fmtNum } from '@/components/design/utils/format'
import type { SupplierSummary } from '@/services/supplierApi'
import { listAllSuppliers } from '@/services/supplierApi'

const { t } = useI18n({ useScope: 'global' })
const { translate } = useApiError()

const suppliers = ref<SupplierSummary[]>([])
const loaded = ref(false)
const refreshing = ref(false)
const error = ref('')
const search = ref('')

const debt = (s: SupplierSummary) => Number(s.current_balance_uzs || 0)

const visible = computed(() => {
  const q = search.value.trim().toLowerCase()

  return suppliers.value
    .filter(s => !q || s.name.toLowerCase().includes(q) || String(s.phone || '').includes(q))
    .filter(s => s.is_active || debt(s) !== 0)
    .sort((a, b) => debt(b) - debt(a) || a.name.localeCompare(b.name))
})

const totalDebt = computed(() => suppliers.value.reduce((sum, s) => sum + Math.max(debt(s), 0), 0))

async function load() {
  error.value = ''
  try {
    suppliers.value = await listAllSuppliers()
  }
  catch (e) {
    error.value = translate(e)
  }
  finally {
    loaded.value = true
  }
}

async function refresh() {
  refreshing.value = true
  await load()
  refreshing.value = false
}

onMounted(load)
useEventListener(window, REFRESH_EVENT, refresh)
</script>

<template>
  <OwnerPage
    :title="t('owner_app_tab_suppliers')"
    :refreshing="refreshing"
    @refresh="refresh"
  >
    <div class="owner-suppliers__head">
      <span class="owner-eyebrow">{{ t('owner_supplier_debt') }}</span>
      <strong class="owner-suppliers__total">{{ fmtNum(totalDebt) }} <small>UZS</small></strong>
    </div>
    <Input
      v-model="search"
      type="search"
      icon="search"
      :placeholder="t('owner_app_search_suppliers')"
      class="owner-suppliers__search"
    />

    <p
      v-if="error"
      class="owner-error"
      role="alert"
    >
      {{ error }}
    </p>
    <div
      v-if="!loaded"
      class="owner-list"
    >
      <Skeleton
        v-for="i in 6"
        :key="i"
        :h="64"
        :r="14"
      />
    </div>
    <StateFill
      v-else-if="!visible.length && !error"
      icon="building"
      :title="t('owner_app_no_suppliers')"
    />
    <ul
      v-else
      class="owner-list"
    >
      <li
        v-for="s in visible"
        :key="s.id"
      >
        <RouterLink
          :to="`/suppliers/${s.id}`"
          class="owner-row"
        >
          <div class="owner-row__main">
            <span class="owner-row__title">{{ s.name }}</span>
            <span class="owner-row__sub">{{ s.contact_person || s.phone || (debt(s) > 0 ? t('owner_app_we_owe') : t('owner_app_settled')) }}</span>
          </div>
          <span
            class="owner-row__amount"
            :class="{ 'is-owed': debt(s) > 0 }"
          >{{ fmtNum(debt(s)) }}</span>
        </RouterLink>
      </li>
    </ul>
  </OwnerPage>
</template>

<style scoped>
.owner-suppliers__head { display: grid; gap: 4px; margin-bottom: 12px; }
.owner-suppliers__total { color: var(--text); font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; }
.owner-suppliers__total small { font-size: 13px; color: var(--text-secondary); }
.owner-suppliers__search { margin-bottom: 12px; }
.is-owed { color: var(--warning-strong, var(--warning)); }
</style>
