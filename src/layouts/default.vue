<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import DesignSidebar from '@/layouts/components/DesignSidebar.vue'
import DesignTopbar from '@/layouts/components/DesignTopbar.vue'
import MobileTabBar from '@/layouts/components/MobileTabBar.vue'

const collapsed = ref(false)
const drawerOpen = ref(false)
const dateRange = ref('14d')
const isMobile = useMediaQuery('(max-width: 768px)')
const mobileDrawerActive = computed(() => drawerOpen.value && isMobile.value)
const sidebarRef = ref<{ focusClose: () => void } | null>(null)
let drawerReturnFocus: HTMLElement | null = null
let bodyOverflow: string | null = null

function onToggleSidebar() {
  if (window.innerWidth <= 768)
    drawerOpen.value = !drawerOpen.value
  else
    collapsed.value = !collapsed.value
}

function closeDrawer() {
  drawerOpen.value = false
}

function onDrawerKey(e: KeyboardEvent) {
  if (!mobileDrawerActive.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    closeDrawer()
    return
  }
  if (e.key !== 'Tab') return
  const sidebar = document.getElementById('primary-navigation')
  if (!sidebar) return
  const items = Array.from(sidebar.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter(node => node.offsetParent !== null)
  if (!items.length) return
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (!active || !sidebar.contains(active)) {
    e.preventDefault()
    ;(e.shiftKey ? last : first).focus()
  }
  else if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  }
  else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

watch(mobileDrawerActive, async (active) => {
  if (active) {
    drawerReturnFocus = document.activeElement as HTMLElement | null
    bodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    await nextTick()
    sidebarRef.value?.focusClose()
  }
  else {
    if (bodyOverflow !== null) {
      document.body.style.overflow = bodyOverflow
      bodyOverflow = null
    }
    const target = drawerReturnFocus
    drawerReturnFocus = null
    await nextTick()
    if (target?.isConnected) target.focus()
  }
})

watch(isMobile, (mobile) => {
  if (!mobile) drawerOpen.value = false
})

onMounted(() => {
  const saved = localStorage.getItem('alphapos-theme')
  if (saved === 'light' || saved === 'dark')
    document.documentElement.setAttribute('data-theme', saved)
  window.addEventListener('keydown', onDrawerKey)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onDrawerKey)
  if (bodyOverflow !== null)
    document.body.style.overflow = bodyOverflow
})
</script>

<template>
  <div class="app" :class="{ 'drawer-open': drawerOpen }">
    <DesignSidebar
      ref="sidebarRef"
      :collapsed="collapsed"
      :open="drawerOpen"
      @close="closeDrawer"
      @toggle="onToggleSidebar"
      @nav-go="closeDrawer"
    />
    <div
      class="nav-scrim"
      aria-hidden="true"
      @click="closeDrawer"
    />
    <div
      class="main"
      :aria-hidden="mobileDrawerActive ? 'true' : undefined"
      :inert="mobileDrawerActive ? true : undefined"
    >
      <DesignTopbar
        v-model:date-range="dateRange"
        @toggle-sidebar="onToggleSidebar"
      />
      <main
        id="main-content"
        class="page-shell"
      >
        <RouterView v-slot="{ Component }">
          <Transition name="fade" mode="out-in">
            <Component :is="Component" :date-range="dateRange" />
          </Transition>
        </RouterView>
      </main>
    </div>
    <MobileTabBar
      :drawer-open="drawerOpen"
      :aria-hidden="mobileDrawerActive ? 'true' : undefined"
      :inert="mobileDrawerActive ? true : undefined"
      @more="drawerOpen = !drawerOpen"
    />
  </div>
</template>

<style>
main.page-shell {
  flex: 1;
  padding: var(--sp-4, 16px) 0 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
main.page-shell > .page {
  padding: 0 var(--sp-4, 16px) var(--sp-8, 32px);
  width: 100%;
}

.fade-enter-active, .fade-leave-active { transition: opacity .15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
