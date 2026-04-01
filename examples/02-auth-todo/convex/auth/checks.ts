/**
 * Check style:
 * This auth-only example only needs direct actor predicates.
 */
import type { Actor } from './actor'

export const isAuthenticated = (actor: Actor) => actor !== null
