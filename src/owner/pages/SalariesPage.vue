<script setup lang="ts">
import OwnerPage from '../components/OwnerPage.vue'
import Badge from '@/components/design/Badge.vue'
import Card from '@/components/design/Card.vue'
import Segmented from '@/components/design/Segmented.vue'
import Skeleton from '@/components/design/Skeleton.vue'
import StateFill from '@/components/design/StateFill.vue'
import { fmtNum } from '@/components/design/utils/format'
import EmployeeHistoryModal from '@/components/hr/EmployeeHistoryModal.vue'
import type { SalaryRecord, SalarySummary } from '@/services/salaryApi'
import { getSalarySummary, listSalaries } from '@/services/salaryApi'
import { staffName } from '@/utils/staff'

const { t } = useI18n({ useScope: 'global' })
const { translate } = useApiError()

const now = new Date()
const current = { year: now.getFullYear(), month: now.getMonth() + 1 }
const previous = current.month === 1 ? { year: current.year - 1, month: 12 } : { year: current.year, month: current.month - 1 }

const which = ref<'current' | 'previous'>('previous')
const salaries = ref<SalaryRecord[]>([])
const summary = ref<SalarySummary | null>(null)
const loaded = ref(false)
const refreshing = ref(false)
const error = ref('')
const selected = ref<any | null>(null)

const TONE: Record<string, 'success' | 'warning' | 'info'> = { PENDING: 'warning', APPROVED: 'info', PAID: 'success' }

const period = computed(() => (which.value === 'current' ? current : previous))
const label = (p: { year: number; month: number }) => `${String(p.month).padStart(2, '0')}.${p.year}`

const options = computed(() => [
  { value: 'previous', label: label(previous) },
  { value: 'current', label: label(current) },
])

const sorted = computed(() => [...salaries.value].sort((a, b) => Number(b.net_amount) - Number(a.net_amount)))
const paid = computed(() => salaries.value.filter(s => s.status === 'PAID').reduce((sum, s) => sum + Number(s.net_amount || 0), 0))

function nameOf(s: SalaryRecord) {
  return staffName(s.employee?.user, s.employee?.position) || '—'
}

async function load() {
  error.value = ''
  loaded.value = false

  const { year, month } = period.value
  try {
    const [rows, totals] = await Promise.all([listSalaries({ year, month }), getSalarySummary(year, month)])

    salaries.value = rows
    summary.value = totals
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

watch(which, load)
onMounted(load)
</script>

<template>
  <OwnerPage
    :title="t('owner_app_salaries')"
    back
    :refreshing="refreshing"
    @refresh="refresh"
  >
    <Segmented
      v-model="which"
      :options="options"
      class="owner-salaries__period"
    />

    <p
      v-if="error"
      class="owner-error"
      role="alert"
    >
      {{ error }}
    </p>

    <Card class-name="owner-salaries__total">
      <span class="owner-eyebrow">{{ t('owner_app_payroll_total') }}</span>
      <Skeleton
        v-if="!loaded"
        :w="180"
        :h="32"
      />
      <strong
        v-else
        class="owner-salaries__value"
      >{{ fmtNum(Number(summary?.total_net ?? 0)) }} <small>UZS</small></strong>
      <span class="owner-row__sub">
        {{ t('owner_app_people_count', { n: salaries.length }) }} · {{ t('salary_status_PAID') }} {{ fmtNum(paid) }}
      </span>
    </Card>

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
      v-else-if="!sorted.length && !error"
      icon="users"
      :title="t('owner_app_no_salaries')"
    />
    <ul
      v-else
      class="owner-list"
    >
      <li
        v-for="s in sorted"
        :key="s.id"
      >
        <button
          type="button"
          class="owner-row owner-salaries__row"
          @click="selected = s.employee ? { ...s.employee, id: s.employee_id } : null"
        >
          <div class="owner-row__main">
            <span class="owner-row__title">{{ nameOf(s) }}</span>
            <span class="owner-row__sub">{{ s.employee?.position || '—' }}</span>
          </div>
          <div class="owner-salaries__right">
            <span class="owner-row__amount">{{ fmtNum(Number(s.net_amount)) }}</span>
            <Badge :tone="TONE[s.status] ?? 'neutral'">
              {{ t(`salary_status_${s.status}`) }}
            </Badge>
          </div>
        </button>
      </li>
    </ul>

    <EmployeeHistoryModal
      :open="!!selected"
      :employee="selected"
      @close="selected = null"
    />
  </OwnerPage>
</template>

<style scoped>
.owner-salaries__period { margin-bottom: 12px; width: 100%; }
.owner-salaries__total { padding: 16px; display: grid; gap: 6px; margin-bottom: 14px; }
.owner-salaries__value { color: var(--text); font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
.owner-salaries__value small { font-size: 13px; color: var(--text-secondary); }
.owner-salaries__row { width: 100%; text-align: left; font: inherit; cursor: pointer; }
.owner-salaries__right { display: grid; justify-items: end; gap: 4px; }
</style>
