import { defineGuard } from '@lupinum/trellis/auth'

import type { MembershipRole } from '../features/memberships'
import type { AppIdentity } from './app-identity'

export const hasRole = (...roles: MembershipRole[]) =>
  defineGuard<AppIdentity>(`role:${roles.join('|')}`, (appIdentity) =>
    roles.includes(appIdentity.role),
  )
