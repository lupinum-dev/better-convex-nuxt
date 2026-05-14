/**
 * Check style:
 * This auth-only example only needs direct appIdentity predicates.
 * Using defineGuard gives each check a readable label that
 * shows up in Forbidden errors — helpful for debugging.
 */
import { defineGuard } from '@lupinum/trellis/auth'

import type { AppIdentity } from './appIdentity'

export const isAuthenticated = defineGuard<AppIdentity>(
  'Authenticated',
  (appIdentity) => appIdentity !== null,
)
