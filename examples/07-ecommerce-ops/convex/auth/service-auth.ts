import { deny, verifyKey } from 'better-convex-nuxt/auth'

import type { Actor } from './actor'

export function resolveServiceActor(
  key: string,
  serviceId: string,
  tenantId: string,
): Actor {
  const expected = process.env.CONVEX_SERVICE_KEY?.trim() || 'example-service-key'
  if (!verifyKey(key, expected)) throw deny('Invalid service key.')

  return {
    kind: 'service',
    serviceId,
    role: 'admin',
    tenantId,
  }
}
