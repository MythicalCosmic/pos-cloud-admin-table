import { createRouter, createWebHistory } from 'vue-router'
import { isSignedIn } from './services/session'

declare module 'vue-router' {
  interface RouteMeta {
    tab?: boolean
    public?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/login', component: () => import('./pages/LoginPage.vue'), meta: { public: true } },
    { path: '/', component: () => import('./pages/HomePage.vue'), meta: { tab: true } },
    { path: '/approvals', component: () => import('./pages/ApprovalsPage.vue'), meta: { tab: true } },
    { path: '/approvals/:id', component: () => import('./pages/ExpenseDetailPage.vue'), props: true },
    { path: '/money', component: () => import('./pages/MoneyPage.vue'), meta: { tab: true } },
    { path: '/suppliers', component: () => import('./pages/SuppliersPage.vue'), meta: { tab: true } },
    { path: '/suppliers/:id', component: () => import('./pages/SupplierDetailPage.vue'), props: true },
    { path: '/more', component: () => import('./pages/MorePage.vue'), meta: { tab: true } },
    { path: '/more/salaries', component: () => import('./pages/SalariesPage.vue') },
    { path: '/more/settings', component: () => import('./pages/SettingsPage.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(to => {
  if (!to.meta.public && !isSignedIn())
    return { path: '/login', query: to.fullPath !== '/' ? { to: to.fullPath } : undefined }
  if (to.path === '/login' && isSignedIn())
    return '/'
})

export default router
