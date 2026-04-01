/**
 * Why this file exists:
 * Service actors must fail closed. Example code should never accept a known default key.
 */
import { deny, verifyKey } from 'better-convex-nuxt/auth'

import type { Id } from '../_generated/dataModel'
import type { Actor } from './actor'

export function resolveServiceActor(
  key: string,
  serviceId: string,
  tenantId: Id<'workspaces'>,
): Actor {
  const expected = process.env.CONVEX_SERVICE_KEY?.trim()
  if (!expected) throw new Error('CONVEX_SERVICE_KEY must be set for service-auth example flows.')
  if (!verifyKey(key, expected)) throw deny('Invalid service key.')

  return {
    kind: 'service',
    serviceId,
    role: 'admin',
    tenantId,
  }
}
