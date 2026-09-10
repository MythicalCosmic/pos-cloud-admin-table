<script setup lang="ts">
import Skeleton from '@/components/design/Skeleton.vue'

withDefaults(defineProps<{ metrics?: number; overview?: boolean }>(), { metrics: 4, overview: false })

const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <div
    class="report-skeleton"
    role="status"
    :aria-label="t('Loading')"
  >
    <div
      v-if="metrics"
      class="report-skeleton__metrics"
      :style="{ '--metrics': metrics }"
      aria-hidden="true"
    >
      <div
        v-for="index in metrics"
        :key="index"
      >
        <Skeleton
          w="65%"
          :h="11"
        /><Skeleton
          w="80%"
          :h="25"
        /><Skeleton
          w="45%"
          :h="10"
        />
      </div>
    </div>
    <div
      class="report-skeleton__workspace"
      :class="{ 'report-skeleton__workspace--overview': overview }"
      aria-hidden="true"
    >
      <div class="report-skeleton__plot">
        <div class="report-skeleton__heading">
          <Skeleton
            w="32%"
            :h="15"
          /><Skeleton
            :w="84"
            :h="32"
          />
        </div>
        <div class="report-skeleton__axis">
          <span
            v-for="index in 4"
            :key="index"
          ><Skeleton
            :w="24"
            :h="8"
          /><i /></span>
        </div>
        <div class="report-skeleton__heading">
          <Skeleton
            w="44%"
            :h="11"
          /><Skeleton
            :w="60"
            :h="11"
          />
        </div>
      </div>
      <div class="report-skeleton__detail">
        <Skeleton
          w="45%"
          :h="15"
        />
        <div
          v-for="index in 5"
          :key="index"
          class="report-skeleton__row"
        >
          <Skeleton
            :w="26"
            :h="26"
            :r="8"
          /><Skeleton
            :w="`${54 - index * 4}%`"
            :h="11"
          /><Skeleton
            :w="60"
            :h="12"
          />
        </div>
      </div>
    </div>
    <span class="report-skeleton__status"><i />{{ t('dash_loading_reports') }}</span>
  </div>
</template>

<style scoped>
.report-skeleton { display: grid; gap: 16px; min-width: 0; }
.report-skeleton__metrics { display: grid; grid-template-columns: repeat(var(--metrics), minmax(0, 1fr)); gap: 10px; }
.report-skeleton__metrics > div { display: grid; gap: 14px; padding: 20px; border: 1px solid var(--dash-edge, var(--border)); border-radius: 16px; background: var(--surface); }
.report-skeleton__workspace { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.report-skeleton__plot, .report-skeleton__detail { padding: 20px; border: 1px solid var(--dash-edge, var(--border)); border-radius: 16px; background: var(--surface); box-shadow: var(--dash-shadow, var(--shadow-xs)); }
.report-skeleton__heading, .report-skeleton__row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.report-skeleton__axis { display: grid; gap: 44px; padding: 35px 0 28px; }
.report-skeleton__axis > span { display: flex; align-items: center; gap: 12px; }
.report-skeleton__axis i { flex: 1; border-top: 1px dashed var(--border); }
.report-skeleton__detail > .skel { margin-bottom: 12px; }
.report-skeleton__row { min-height: 48px; border-bottom: 1px solid var(--border); }
.report-skeleton__row .skel:last-child { margin-left: auto; }
.report-skeleton__status { display: flex; align-items: center; gap: 7px; color: var(--text-secondary); font-size: 11px; }
.report-skeleton__status i { width: 5px; height: 5px; border-radius: 50%; background: var(--primary); }
@media (max-width: 700px) { .report-skeleton__metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } .report-skeleton__metrics > div { padding: 16px; } .report-skeleton__workspace { grid-template-columns: minmax(0, 1fr); } .report-skeleton__axis { gap: 34px; } }
</style>
