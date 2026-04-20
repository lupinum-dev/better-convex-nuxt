import { getSubjectKind, subject, type Subject } from '../auth/index.js'
import type { Delegation } from '../functions/define-delegation.js'

type MaybePromise<T> = T | Promise<T>

export type DelegateToUserOptions = {
  userId: string
  allow: MaybePromise<boolean> | (() => MaybePromise<boolean>)
  reason?: string
  grantedBy?: Subject
  expectedTenantId?: string | null
  targetTenantId?: string | null
}

function requireNonBlank(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label} must be a non-empty string.`)
  }
  return trimmed
}

function optionalTenant(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

async function resolveAllow(
  value: DelegateToUserOptions['allow'],
): Promise<boolean> {
  if (typeof value === 'function') {
    return await value()
  }

  return await value
}

export async function delegateToUser(options: DelegateToUserOptions): Promise<Delegation> {
  const userId = requireNonBlank(options.userId, 'delegateToUser(userId)')
  const expectedTenantId = optionalTenant(options.expectedTenantId)
  const targetTenantId = optionalTenant(options.targetTenantId)

  if (
    expectedTenantId !== null &&
    targetTenantId !== null &&
    expectedTenantId !== targetTenantId
  ) {
    throw new Error(
      `Cannot delegate to user "${userId}" outside the expected tenant boundary.`,
    )
  }

  const allowed = await resolveAllow(options.allow)
  if (!allowed) {
    throw new Error(`Delegation to user "${userId}" was rejected by the caller validation step.`)
  }

  if (options.grantedBy && getSubjectKind(options.grantedBy) === null) {
    throw new Error('delegateToUser(grantedBy) must be a canonical subject when provided.')
  }

  return {
    subject: subject.user(userId),
    ...(options.reason ? { reason: options.reason } : {}),
    ...(options.grantedBy ? { grantedBy: options.grantedBy } : {}),
  }
}
