/**
 * Check style:
 * This auth-only example only needs direct actor predicates.
 * Using defineGuard gives each check a readable label that
 * shows up in Forbidden errors — helpful for debugging.
 */
import { defineGuard } from 'better-convex-nuxt/auth'

import type { Actor } from './actor'

export const isAuthenticated = defineGuard<Actor>('Authenticated', (actor) => actor !== null)
