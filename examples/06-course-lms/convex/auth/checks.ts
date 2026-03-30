import type { Actor } from './actor'

export const isAuthenticated = (actor: Actor) => actor !== null
export const hasRole = (...roles: string[]) => (actor: Actor) => !!actor && roles.includes(actor.role)
export const canReadLesson = hasRole('owner', 'admin', 'instructor', 'student')
