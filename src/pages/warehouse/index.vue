<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import Card from '@/components/design/Card.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import { useUserAccess } from '@/composables/useUserAccess'

const { t } = useI18n({ useScope: 'global' })
const { hasAnyPermission } = useUserAccess()

interface WorkspaceLink {
  id: string
  title: string
  subtitle: string
  icon: string
  to: string
  permissions: string[]
  tone: 'primary' | 'success' | 'warning' | 'info'
}

const links = computed<WorkspaceLink[]>(() => {
  const allLinks: WorkspaceLink[] = [
    {
      id: 'purchase-invoices',
      title: t('warehouse.purchaseInvoices'),
      subtitle: t('warehouse.purchaseInvoicesSubtitle'),
      icon: 'inbox',
      to: '/stock/purchase-invoices',
      permissions: ['stock.purchase_invoice.view', 'stock.purchase_invoice.receive'],
      tone: 'success',
    },
    {
      id: 'purchase-orders',
      title: t('warehouse.purchaseOrders'),
      subtitle: t('warehouse.purchaseOrdersSubtitle'),
      icon: 'receipt',
      to: '/stock/purchase-orders',
      permissions: ['stock.purchase.view'],
      tone: 'primary',
    },
    {
      id: 'receiving',
      title: t('warehouse.poReceiving'),
      subtitle: t('warehouse.poReceivingSubtitle'),
      icon: 'inbox',
      to: '/stock/receiving',
      permissions: ['stock.purchase.view'],
      tone: 'success',
    },
    {
      id: 'suppliers',
      title: t('warehouse.suppliers'),
      subtitle: t('warehouse.suppliersSubtitle'),
      icon: 'building',
      to: '/stock/suppliers',
      permissions: ['stock.supplier.view'],
      tone: 'info',
    },
    {
      id: 'levels',
      title: t('warehouse.stockBalances'),
      subtitle: t('warehouse.stockBalancesSubtitle'),
      icon: 'bars',
      to: '/stock/levels',
      permissions: ['stock.level.view'],
      tone: 'primary',
    },
    {
      id: 'items',
      title: t('warehouse.catalog'),
      subtitle: t('warehouse.catalogSubtitle'),
      icon: 'box',
      to: '/stock/items',
      permissions: ['stock.catalog.view'],
      tone: 'info',
    },
    {
      id: 'batches',
      title: t('warehouse.batches'),
      subtitle: t('warehouse.batchesSubtitle'),
      icon: 'package',
      to: '/stock/batches',
      permissions: ['stock.batch.view'],
      tone: 'warning',
    },
    {
      id: 'counts',
      title: t('warehouse.counts'),
      subtitle: t('warehouse.countsSubtitle'),
      icon: 'list',
      to: '/stock/counts',
      permissions: ['stock.count.view'],
      tone: 'warning',
    },
    {
      id: 'transfers',
      title: t('warehouse.transfers'),
      subtitle: t('warehouse.transfersSubtitle'),
      icon: 'share',
      to: '/stock/transfers',
      permissions: ['stock.transfer.view'],
      tone: 'primary',
    },
    {
      id: 'adjustment-requests',
      title: t('warehouse.adjustments.title'),
      subtitle: t('warehouse.adjustments.subtitle'),
      icon: 'sliders',
      to: '/stock/adjustment-requests',
      permissions: ['stock.adjustment.request'],
      tone: 'warning',
    },
  ]

  return allLinks.filter(link => hasAnyPermission(link.permissions))
})

const canAudit = computed(() => hasAnyPermission([
  'attendance.view', 'discipline.rule.view', 'discipline.case.view', 'prep.audit.view',
]))

const stations = computed(() => [
  { title: 'workspace_purchasing', icon: 'ws-delivery', ids: ['purchase-invoices', 'purchase-orders', 'receiving', 'suppliers'] },
  { title: 'workspace_inventory', icon: 'ws-inventory', ids: ['levels', 'items', 'batches'] },
  { title: 'workspace_stock_movement', icon: 'ws-transfer', ids: ['counts', 'transfers', 'adjustment-requests'] },
].map(station => ({ ...station, links: links.value.filter(link => station.ids.includes(link.id)) })).filter(station => station.links.length))
</script>

<template>
  <WorkspacePage class="page warehouse-page">
    <PageHeader
      :title="t('warehouse.title')"
      :subtitle="t('warehouse.subtitle')"
    >
      <template #actions>
        <RouterLink
          v-if="canAudit"
          to="/audit"
          class="btn btn--secondary"
        >
          <DesignIcon
            name="flag"
            :size="18"
          />{{ t('warehouse.openAudit') }}
        </RouterLink>
        <RouterLink
          v-if="hasAnyPermission(['stock.purchase_invoice.receive'])"
          to="/stock/purchase-invoices"
          class="btn btn--primary"
        >
          <DesignIcon
            name="inbox"
            :size="18"
          />{{ t('warehouse.receiveInvoice') }}
        </RouterLink>
      </template>
    </PageHeader>

    <div class="warehouse-note">
      <DesignIcon
        name="lock"
        :size="18"
      />
      <span>{{ t('warehouse.permissionNotice') }}</span>
    </div>

    <div class="warehouse-workbench">
      <div class="warehouse-stations">
        <section
          v-for="station in stations"
          :key="station.title"
          class="warehouse-station"
        >
          <h2>
            <DesignIcon
              :name="station.icon"
              :size="21"
            />{{ t(station.title) }}
          </h2>
          <div class="warehouse-station__links">
            <RouterLink
              v-for="link in station.links"
              :key="link.id"
              :to="link.to"
              class="warehouse-task"
            >
              <DesignIcon
                :name="link.icon"
                :size="20"
              />
              <span><strong>{{ link.title }}</strong><span>{{ link.subtitle }}</span></span>
              <DesignIcon
                name="arrowright"
                :size="17"
              />
            </RouterLink>
          </div>
        </section>
      </div>
      <Card class-name="receiving-guide">
        <div class="receiving-guide__head">
          <div>
            <h2>{{ t('warehouse.receivingGuideTitle') }}</h2>
            <p>{{ t('warehouse.receivingGuideSubtitle') }}</p>
          </div>
          <DesignIcon
            name="inbox"
            :size="26"
          />
        </div>
        <ol class="receiving-steps">
          <li>
            <span>1</span>
            <div><strong>{{ t('warehouse.stepSupplier') }}</strong><p>{{ t('warehouse.stepSupplierText') }}</p></div>
          </li>
          <li>
            <span>2</span>
            <div><strong>{{ t('warehouse.stepProducts') }}</strong><p>{{ t('warehouse.stepProductsText') }}</p></div>
          </li>
          <li>
            <span>3</span>
            <div><strong>{{ t('warehouse.stepInvoiceTotal') }}</strong><p>{{ t('warehouse.stepInvoiceTotalText') }}</p></div>
          </li>
          <li>
            <span>4</span>
            <div><strong>{{ t('warehouse.stepPostInvoice') }}</strong><p>{{ t('warehouse.stepPostInvoiceText') }}</p></div>
          </li>
        </ol>
      </Card>
    </div>
  </WorkspacePage>
</template>

<style scoped>
.warehouse-note { display: flex; gap: 9px; align-items: center; margin-block-end: 22px; color: var(--text-secondary); font-size: 12px; line-height: 1.6; }
.warehouse-note .ic { color: var(--primary); flex: 0 0 auto; }
.warehouse-workbench { display: grid; grid-template-columns: minmax(0, 2.3fr) minmax(250px, 1fr); gap: 24px; align-items: start; }
.warehouse-stations { display: grid; gap: 28px; }
.warehouse-station { min-inline-size: 0; }
.warehouse-station h2 { display: flex; gap: 10px; align-items: center; font-size: 16px; font-weight: 600; margin-block-end: 14px; letter-spacing: -.015em; }
.warehouse-station h2 .ic { color: var(--primary); }
.warehouse-station__links { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border: 1px solid var(--work-line); border-radius: 14px; background: var(--surface); overflow: hidden; }
.warehouse-task { display: flex; align-items: center; gap: 14px; min-inline-size: 0; padding: 22px 18px; color: var(--text); border-block-end: 1px solid var(--work-line); text-decoration: none; transition: background 160ms ease; }
.warehouse-task:nth-child(odd) { border-inline-end: 1px solid var(--work-line); }
.warehouse-task:nth-last-child(-n+2) { border-block-end: 0; }
.warehouse-task > .ic { color: var(--primary); flex: 0 0 auto; }
.warehouse-task > .ic:last-child { inline-size: 14px; color: var(--text-secondary); }
.warehouse-task > span { flex: 1; min-inline-size: 0; }
.warehouse-task strong { display: block; font-size: 14px; font-weight: 600; line-height: 1.5; }
.warehouse-task span > span { display: block; margin-block-start: 5px; color: var(--text-secondary); font-size: 12px; line-height: 1.6; }
.warehouse-task:hover { background: var(--work-soft); }
.warehouse-task:focus-visible { outline: 2px solid var(--primary); outline-offset: -3px; }
.receiving-guide { padding: 24px; background: var(--work-soft); }
.receiving-guide__head { display: flex; align-items: flex-start; gap: 12px; }
.receiving-guide__head > .ic { color: var(--primary); }
.receiving-guide h2 { font-size: 17px; line-height: 1.4; font-weight: 600; letter-spacing: -.02em; }
.receiving-guide p { margin: 8px 0 0; color: var(--text-secondary); font-size: 12px; line-height: 1.6; }
.receiving-steps { padding: 0; margin: 26px 0 0; list-style: none; display: grid; gap: 24px; }
.receiving-steps li { display: flex; align-items: flex-start; gap: 14px; }
.receiving-steps li > span { display: grid; flex: 0 0 28px; place-items: center; block-size: 28px; border: 1px solid var(--primary-border); border-radius: 8px; color: var(--primary); font-size: 12px; font-variant-numeric: tabular-nums; }
.receiving-steps strong { font-size: 13px; font-weight: 600; }
@media (width <= 1100px) { .warehouse-workbench { grid-template-columns: minmax(0, 1fr); } .receiving-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (width <= 700px) { .warehouse-station__links { grid-template-columns: minmax(0, 1fr); } .warehouse-task:nth-child(n) { border-inline: 0; border-block-end: 1px solid var(--work-line); } .warehouse-task:last-child { border-block-end: 0; } .receiving-steps { grid-template-columns: minmax(0, 1fr); } .receiving-guide { padding: 20px; } }
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
  anyPermission:
    - stock.catalog.view
    - stock.level.view
    - stock.batch.view
    - stock.supplier.view
    - stock.purchase.view
    - stock.receiving.create
    - stock.receiving.update_draft
    - stock.receiving.complete
    - stock.purchase_invoice.view
    - stock.purchase_invoice.receive
    - stock.transfer.view
    - stock.transfer.create
    - stock.count.view
    - stock.count.create
    - stock.count.record
    - stock.adjustment.request
</route>
