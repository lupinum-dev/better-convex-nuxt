import { HOUR, MINUTE, RateLimiter } from '@convex-dev/rate-limiter'

import { components } from './_generated/api'

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  humanProjectCreate: {
    kind: 'token bucket',
    rate: 10,
    period: MINUTE,
    capacity: 10,
  },
  serviceActorProjectCreate: {
    kind: 'token bucket',
    rate: 5,
    period: MINUTE,
    capacity: 5,
  },
  serviceActorProjectDelete: {
    kind: 'token bucket',
    rate: 3,
    period: HOUR,
    capacity: 3,
  },
  humanServiceActorCreate: {
    kind: 'token bucket',
    rate: 5,
    period: HOUR,
    capacity: 5,
  },
  humanCredentialRevoke: {
    kind: 'token bucket',
    rate: 10,
    period: HOUR,
    capacity: 10,
  },
  humanProjectDeleteApproval: {
    kind: 'token bucket',
    rate: 10,
    period: HOUR,
    capacity: 10,
  },
})

export function organizationUserKey(organizationId: string, userId: string) {
  return `${organizationId}:${userId}`
}

export function serviceActorProjectKey(organizationId: string, serviceActorId: string) {
  return `${organizationId}:${serviceActorId}`
}
