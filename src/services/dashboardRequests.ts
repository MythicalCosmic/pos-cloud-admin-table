import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import { computed, ref, shallowRef } from 'vue'
import axiosIns from '@/plugins/axios'

// The long dashboard mounts all sections together. Share concurrent reads of
// the same endpoint/window, without caching a previous reporting snapshot.
const pending = new Map<string, Promise<AxiosResponse>>()
const active = ref(0)
const failures = shallowRef<Record<string, unknown>>({})
const queue: Array<() => void> = []
let running = 0

async function acquire() {
  if (running >= 4)
    await new Promise<void>(resolve => queue.push(resolve))
  else running++
}

function release() {
  const next = queue.shift()
  if (next)
    next()
  else running--
}

export function getDashboard(url: string, config: AxiosRequestConfig = {}): Promise<AxiosResponse> {
  const params = Object.entries(config.params ?? {}).sort(([a], [b]) => a.localeCompare(b))
  const key = JSON.stringify([url, params])
  const existing = pending.get(key)
  if (existing)
    return existing

  active.value++

  const request = acquire()
    .then(() => axiosIns.get(url, config))
    .then(response => {
      const next = { ...failures.value }

      delete next[key]
      failures.value = next
      return response
    })
    .catch(error => {
      failures.value = { ...failures.value, [key]: error }
      throw error
    })
    .finally(() => {
      release()
      pending.delete(key)
      active.value--
    })

  pending.set(key, request)
  return request
}

export function resetDashboardFailures() {
  failures.value = {}
}

export async function settleDashboardRequests() {
  // Product comparison requests are scheduled after the current-period reads.
  // Drain those as well before declaring the whole dashboard refreshed.
  while (pending.size)
    await Promise.allSettled([...pending.values()])
}

export function useDashboardRequests() {
  return {
    pending: computed(() => active.value > 0),
    hasFailures: computed(() => Object.keys(failures.value).length > 0),
  }
}
