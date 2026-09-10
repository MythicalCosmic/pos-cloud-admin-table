import { Ability } from '@casl/ability'
import type { UserAbility } from './AppAbility'
import { getStoredAbilities } from '@/utils/storage'

export const initialAbility: UserAbility[] = [
  {
    action: 'read',
    subject: 'Auth',
  },
]

const existingAbility = getStoredAbilities<UserAbility[]>()

export default new Ability(existingAbility || initialAbility)
