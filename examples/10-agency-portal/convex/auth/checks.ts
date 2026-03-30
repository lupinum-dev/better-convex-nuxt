import type { Actor } from './actor'

export const hasRole = (...roles: string[]) => (actor: Actor) => !!actor && roles.includes(actor.role)
