<script setup lang="ts">
import DesignIcon from '../DesignIcon.vue'
import { workspaceForPath } from './navigation'
import { useUserAccess } from '@/composables/useUserAccess'
import { warehousePathAllowed } from '@/navigation/access'
import { routeLabelForPath } from '@/navigation/routeLabels'
import { canNavigate } from '@layouts/plugins/casl'

defineProps<{ title: string; subtitle?: string; eyebrow?: string }>()

const { t } = useI18n({ useScope: 'global' })
const route = useRoute()
const router = useRouter()
const { access } = useUserAccess()
const station = computed(() => workspaceForPath(route.path))
const navEl = ref<HTMLElement | null>(null)

const links = computed(() => station.value.paths.filter(path => {
  const target = router.resolve(path)
  if (!target.matched.length)
    return false
  const user = access.value
  const meta = target.meta
  const roles = Array.isArray(meta.allowedRoles) ? meta.allowedRoles.map(String) : []
  const any = Array.isArray(meta.anyPermission) ? meta.anyPermission.map(String) : []
  const all = Array.isArray(meta.allPermissions) ? meta.allPermissions.map(String) : []
  if ((roles.length && !roles.includes(user.role)) || (any.length && !user.hasAny(any)) || (all.length && !user.hasAll(all)))
    return false
  return user.isWarehouse ? warehousePathAllowed(path, { ...user, permissions: new Set(user.permissions) }) : canNavigate(target)
}))

const currentPath = computed(() => links.value.filter(path => route.path === path || route.path.startsWith(`${path}/`)).sort((a, b) => b.length - a.length)[0])

function isCurrent(path: string) {
  return currentPath.value === path
}

async function revealCurrentLink() {
  await nextTick()
  requestAnimationFrame(() => {
    const nav = navEl.value
    const active = nav?.querySelector<HTMLElement>('.is-current')
    if (!nav || !active)
      return

    const navBox = nav.getBoundingClientRect()
    const activeBox = active.getBoundingClientRect()
    const left = nav.scrollLeft + activeBox.left - navBox.left - (nav.clientWidth - activeBox.width) / 2

    nav.scrollTo({ left: Math.max(0, left), behavior: 'auto' })
  })
}

watch(
  () => [route.path, links.value.join('|')],
  () => revealCurrentLink(),
  { flush: 'post' },
)
onMounted(revealCurrentLink)
useResizeObserver(navEl, revealCurrentLink)
</script>

<template>
  <header class="workspace-heading">
    <div class="workspace-heading__main">
      <div class="workspace-heading__identity">
        <div
          class="workspace-heading__symbol"
          aria-hidden="true"
        >
          <DesignIcon
            :name="station.icon"
            :size="27"
            :weight="1.5"
          />
        </div>
        <div class="workspace-heading__copy">
          <h1 class="page__title">
            {{ title }}
          </h1>
          <p
            v-if="subtitle || eyebrow"
            class="page__subtitle"
          >
            <span v-if="eyebrow">{{ eyebrow }}</span>
            <span v-if="subtitle">{{ subtitle }}</span>
          </p>
        </div>
      </div>
      <div
        v-if="$slots.actions"
        class="page__head-actions"
      >
        <slot name="actions" />
      </div>
    </div>
    <nav
      v-if="links.length > 1"
      ref="navEl"
      class="workspace-heading__nav"
      :aria-label="t('workspace_related_pages')"
    >
      <RouterLink
        v-for="path in links"
        :key="path"
        :to="path"
        :class="{ 'is-current': isCurrent(path) }"
        :aria-current="isCurrent(path) ? 'page' : undefined"
      >
        {{ t(routeLabelForPath(path)) }}
      </RouterLink>
    </nav>
  </header>
</template>
