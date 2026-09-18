import axiosIns from '@/plugins/axios'

export type PushKind = 'expense_pending' | 'shift_closed' | 'daily_summary'
export type PushPrefs = Record<PushKind, boolean>

export interface OwnerDevice {
  id: number
  platform: 'ios' | 'android'
  app_version: string
  locale: string
  prefs: PushPrefs
  is_active: boolean
}

function payloadOf(response: any): Record<string, any> {
  return response?.data?.data ?? response?.data ?? {}
}

export async function registerDevice(payload: { token: string; platform: 'ios' | 'android'; app_version: string; locale: string }) {
  return payloadOf(await axiosIns.post('/devices', payload)).device as OwnerDevice
}

export async function unregisterDevice(token: string) {
  await axiosIns.delete('/devices', { data: { token } })
}

export async function updateDevice(id: number, patch: { prefs?: Partial<PushPrefs>; locale?: string }) {
  return payloadOf(await axiosIns.patch(`/devices/${id}`, patch)).device as OwnerDevice
}
