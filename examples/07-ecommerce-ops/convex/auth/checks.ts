import { or } from 'better-convex-nuxt/auth'

import type { Actor } from './actor'

export const hasRole = (...roles: string[]) => (actor: Actor) => !!actor && roles.includes(actor.role)
export const isService = (actor: Actor) => actor?.kind === 'service'

export const canReadOrders = hasRole('owner', 'admin', 'support', 'viewer')
export const canRefundOrders = or(hasRole('owner', 'admin'), isService)
