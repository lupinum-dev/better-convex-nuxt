import { HOUR, MINUTE, RateLimiter } from '@convex-dev/rate-limiter'

import { components } from '../_generated/api'

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  organizationCreate: {
    kind: 'token bucket',
    rate: 5,
    period: HOUR,
    capacity: 5,
  },
  inviteMember: {
    kind: 'token bucket',
    rate: 12,
    period: HOUR,
    capacity: 12,
  },
  projectCreate: {
    kind: 'token bucket',
    rate: 10,
    period: MINUTE,
    capacity: 10,
  },
})

export function organizationActorRateLimitKey(organizationId: string, authUserId: string) {
  return `${organizationId}:${authUserId}`
}
