<script setup lang="ts">
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
</script>

<template>
  <div class="page warehouse-page">
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

    <div class="warehouse-grid">
      <RouterLink
        v-for="link in links"
        :key="link.id"
        :to="link.to"
        class="warehouse-link"
      >
        <Card class-name="warehouse-card">
          <div
            class="warehouse-card__icon"
            :class="`t-${link.tone}`"
          >
            <DesignIcon
              :name="link.icon"
              :size="22"
            />
          </div>
          <div class="warehouse-card__copy">
            <strong>{{ link.title }}</strong>
            <p>{{ link.subtitle }}</p>
          </div>
          <DesignIcon
            name="chevright"
            :size="18"
            class="warehouse-card__arrow"
          />
        </Card>
      </RouterLink>
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
</template>

<style scoped>
.warehouse-page { max-width: none; }
.warehouse-link { color: inherit; text-decoration: none; }
.warehouse-note { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; padding: 10px 12px; border: 1px solid rgb(var(--v-theme-info-border)); border-radius: var(--r-md); color: rgb(var(--v-theme-info-strong)); background: rgb(var(--v-theme-info-weak)); font-size: 13px; }
.warehouse-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.warehouse-card { display: flex; min-height: 132px; align-items: flex-start; gap: 12px; padding: 16px; transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease; }
.warehouse-link:hover .warehouse-card, .warehouse-link:focus-visible .warehouse-card { transform: translateY(-2px); border-color: rgb(var(--v-theme-primary-border)); box-shadow: var(--shadow-md); }
.warehouse-link:focus-visible { outline: none; }
.warehouse-card__icon { display: grid; width: 42px; height: 42px; flex: 0 0 auto; place-items: center; border-radius: var(--r-md); }
.warehouse-card__icon.t-primary { color: rgb(var(--v-theme-primary)); background: rgb(var(--v-theme-primary-weak)); }
.warehouse-card__icon.t-success { color: rgb(var(--v-theme-success-strong)); background: rgb(var(--v-theme-success-weak)); }
.warehouse-card__icon.t-warning { color: rgb(var(--v-theme-warning-strong)); background: rgb(var(--v-theme-warning-weak)); }
.warehouse-card__icon.t-info { color: rgb(var(--v-theme-info-strong)); background: rgb(var(--v-theme-info-weak)); }
.warehouse-card__copy { min-width: 0; flex: 1; }
.warehouse-card__copy strong { color: rgb(var(--v-theme-on-surface)); }
.warehouse-card__copy p { margin: 5px 0 0; color: rgb(var(--v-theme-text-secondary)); font-size: 13px; line-height: 1.4; }
.warehouse-card__arrow { flex: 0 0 auto; margin-top: 11px; color: rgb(var(--v-theme-text-tertiary)); }
.receiving-guide { padding: 18px; }
.receiving-guide__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid rgb(var(--v-theme-border)); }
.receiving-guide__head h2 { margin: 0; color: rgb(var(--v-theme-on-surface)); font-size: 17px; }
.receiving-guide__head p { margin: 4px 0 0; color: rgb(var(--v-theme-text-secondary)); font-size: 13px; }
.receiving-steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; margin: 18px 0 0; padding: 0; list-style: none; }
.receiving-steps li { display: flex; gap: 10px; }
.receiving-steps li > span { display: grid; width: 28px; height: 28px; flex: 0 0 auto; place-items: center; border-radius: 50%; color: rgb(var(--v-theme-on-primary)); background: rgb(var(--v-theme-primary)); font-weight: 700; font-size: 13px; }
.receiving-steps strong { color: rgb(var(--v-theme-on-surface)); font-size: 14px; }
.receiving-steps p { margin: 4px 0 0; color: rgb(var(--v-theme-text-secondary)); font-size: 12px; line-height: 1.45; }

@media (max-width: 1150px) { .warehouse-grid, .receiving-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 620px) { .warehouse-grid, .receiving-steps { grid-template-columns: 1fr; } .warehouse-card { min-height: 108px; } }
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
