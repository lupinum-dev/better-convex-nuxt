import { v } from 'convex/values'
import type { PropertyValidators } from 'convex/values'

import { deny } from '../auth'

export type ServiceCallerIdentity = {
  userId: string
  role: string
  tenantId?: string
}

const serviceCallerValidators = {
  _serviceKey: v.optional(v.string()),
  _serviceActor: v.optional(
    v.object({
      userId: v.string(),
      role: v.string(),
      tenantId: v.optional(v.string()),
    }),
  ),
} satisfies PropertyValidators

type ServiceCallerInput = {
  _serviceKey?: unknown
  _serviceActor?: {
    userId?: unknown
    role?: unknown
    tenantId?: unknown
  } | null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function withServiceAuth<V extends PropertyValidators>(args: V): V {
  return {
    ...args,
    ...serviceCallerValidators,
  } as V
}

export function getServiceCaller(args: unknown): ServiceCallerIdentity | null {
  if (!isObject(args)) return null

  const input = args as ServiceCallerInput
  const hasTransport = input._serviceKey !== undefined || input._serviceActor !== undefined
  if (!hasTransport) return null

  if (
    typeof input._serviceKey !== 'string'
    || !isObject(input._serviceActor)
    || typeof input._serviceActor.userId !== 'string'
    || typeof input._serviceActor.role !== 'string'
    || (
      input._serviceActor.tenantId !== undefined
      && typeof input._serviceActor.tenantId !== 'string'
    )
  ) {
    throw deny('Malformed service auth payload.', { source: 'service-auth', category: 'auth' })
  }

  const expectedKey = process.env.CONVEX_SERVICE_KEY?.trim()
  if (!expectedKey) {
    throw deny('Service auth is not configured. Set CONVEX_SERVICE_KEY.', {
      source: 'service-auth',
      category: 'auth',
    })
  }

  if (!verifyServiceKey(input._serviceKey, expectedKey)) {
    throw deny('Invalid service auth credentials.', {
      source: 'service-auth',
      category: 'auth',
    })
  }

  return {
    userId: input._serviceActor.userId,
    role: input._serviceActor.role,
    ...(typeof input._serviceActor.tenantId === 'string'
      ? { tenantId: input._serviceActor.tenantId }
      : {}),
  }
}

export function verifyServiceKey(provided: string, expected: string): boolean {
  if (!provided || !expected) return false
  let mismatch = provided.length === expected.length ? 0 : 1
  const maxLength = Math.max(provided.length, expected.length)

  for (let index = 0; index < maxLength; index++) {
    const left = provided.charCodeAt(index) || 0
    const right = expected.charCodeAt(index) || 0
    mismatch |= left ^ right
  }

  return mismatch === 0
}
