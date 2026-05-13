import { getSubjectKind, subject, type Subject } from '../auth/index.js'
import type { ActingFor } from '../functions/define-acting-for.js'

type MaybePromise<T> = T | Promise<T>

export type DelegateToUserOptions = {
  userId: string
  allow: MaybePromise<boolean> | (() => MaybePromise<boolean>)
  reason?: string
  grantedBy?: Subject
  expectedWorkspaceId?: string | null
  targetWorkspaceId?: string | null
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

async function resolveAllow(value: DelegateToUserOptions['allow']): Promise<boolean> {
  if (typeof value === 'function') {
    return await value()
  }

  return await value
}

export async function delegateToUser(options: DelegateToUserOptions): Promise<ActingFor> {
  const userId = requireNonBlank(options.userId, 'delegateToUser(userId)')
  const expectedWorkspaceId = optionalTenant(options.expectedWorkspaceId)
  const targetWorkspaceId = optionalTenant(options.targetWorkspaceId)

  if (
    expectedWorkspaceId !== null &&
    targetWorkspaceId !== null &&
    expectedWorkspaceId !== targetWorkspaceId
  ) {
    throw new Error(`Cannot delegate to user "${userId}" outside the expected tenant boundary.`)
  }

  const allowed = await resolveAllow(options.allow)
  if (!allowed) {
    throw new Error(`ActingFor to user "${userId}" was rejected by the caller validation step.`)
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
