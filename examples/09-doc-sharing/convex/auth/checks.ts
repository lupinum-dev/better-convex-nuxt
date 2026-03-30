import type { Actor } from './actor'

export const isAuthenticated = (actor: Actor) => actor !== null
export const hasRole = (...roles: string[]) => (actor: Actor) => !!actor && roles.includes(actor.role)
export const canCreatePage = hasRole('owner', 'admin', 'member')
