import { defineGuard } from '@lupinum/trellis/auth'

import type { MembershipRole } from '../features/memberships'
import type { Actor } from './actor'

export const hasRole = (...roles: MembershipRole[]) =>
  defineGuard<Actor>(`role:${roles.join('|')}`, (actor) => roles.includes(actor.role))
