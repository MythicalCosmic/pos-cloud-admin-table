import axios from '@/plugins/axios'
import { initialAbility } from '@/plugins/casl/ability'
import { useAppAbility } from '@/plugins/casl/useAppAbility'
import { getStoredToken } from '@/utils/storage'

export function useSessionLogout() {
  const router = useRouter()
  const ability = useAppAbility()

  function logout() {
    const token = getStoredToken()

    const revokeRequest = axios.post('/auth-logout', undefined, token
      ? { headers: { Authorization: `Bearer ${token}` } }
      : undefined)

    // End the local session immediately, even if the backend is unavailable.
    localStorage.removeItem('userData')
    localStorage.removeItem('accessToken')
    localStorage.removeItem('userAbilities')
    ability.update(initialAbility)

    void router.replace('/login').catch(() => undefined)
    void revokeRequest.catch(() => undefined)
  }

  return { logout }
}
