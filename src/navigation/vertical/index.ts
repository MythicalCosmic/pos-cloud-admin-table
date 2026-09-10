import dashboard from './dashboard'
import management from './management'
import stock from './stock'
import analytics from './analytics'
import system from './system'
import type { VerticalNavItems } from '@/@layouts/types'

export default [
  ...dashboard,
  ...management,
  ...stock,
  ...analytics,
  ...system,
] as VerticalNavItems
