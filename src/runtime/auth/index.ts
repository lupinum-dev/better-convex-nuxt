import type { GenericDataModel, GenericMutationCtx, GenericQueryCtx } from 'convex/server'
import { ConvexError } from 'convex/values'

import { runCheck, type AnyCheck, type Check } from './define-guard'

export { defineAuth } from './define-auth'
export type { DefineAuthOptions, DefineAuthDeps, ConvexAuthBridge } from './define-auth'
export { defineGuard, isGuard, isOpenGuard, open } from './define-guard'
export type { AnyCheck, Check, Guard, GuardKind, OpenGuard } from './define-guard'
export { defineActor } from './define-actor'
export type { ActorBuilder, DefaultActor } from './define-actor'
export { definePermissionContext } from './define-permission-context'

export type AuthIdentity = {
  subject: string
  email?: string
  name?: string
}

export type AuthErrorData = {
  code: 'FORBIDDEN' | 'NOT_FOUND'
  message: string
  category?: string
  source?: string
}

type AnyCtx<DataModel extends GenericDataModel = GenericDataModel> =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>

function toForbiddenError(
  reason: string,
  source?: string,
  category?: string,
): ConvexError<AuthErrorData> {
  return new ConvexError({
    code: 'FORBIDDEN' as const,
    message: reason,
    ...(category ? { category } : {}),
    ...(source ? { source } : {}),
  })
}

export function and<P = unknown>(...checks: Array<AnyCheck<P>>): Check<P> {
  return (principal: P) => checks.every((check) => runCheck(principal, check))
}

export function or<P = unknown>(...checks: Array<AnyCheck<P>>): Check<P> {
  return (principal: P) => checks.some((check) => runCheck(principal, check))
}

export function deny(reason: string, source?: string): never
export function deny(reason: string, options: { source?: string; category?: string }): never
export function deny(
  reason: string,
  sourceOrOptions?: string | { source?: string; category?: string },
): never {
  if (typeof sourceOrOptions === 'object') {
    throw toForbiddenError(reason, sourceOrOptions.source, sourceOrOptions.category)
  }
  throw toForbiddenError(reason, sourceOrOptions)
}

export function enforce<P>(
  principal: P,
  label: string,
  check: AnyCheck<NonNullable<P>>,
  category?: string,
): asserts principal is NonNullable<P> {
  if (principal == null)
    throw toForbiddenError(`Forbidden: ${label}`, undefined, category ?? 'auth')
  if (!runCheck(principal, check))
    throw toForbiddenError(`Forbidden: ${label}`, undefined, category)
}

export function can<P = unknown>(principal: P, check: AnyCheck<P>): boolean {
  try {
    return !!runCheck(principal, check)
  } catch (error) {
    if (error instanceof ConvexError) return false
    throw error
  }
}

export function requireAuth<P>(
  principal: P,
  reason = 'Not authenticated.',
): asserts principal is NonNullable<P> {
  if (principal == null) {
    throw toForbiddenError(reason)
  }
}

export function requireRecord<T>(doc: T | null | undefined, label?: string): asserts doc is T {
  if (doc == null) {
    throw new ConvexError({
      code: 'NOT_FOUND' as const,
      message: `${label ?? 'Resource'} not found.`,
    })
  }
}

export async function getAuth<DataModel extends GenericDataModel>(
  ctx: AnyCtx<DataModel>,
): Promise<AuthIdentity | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null
  return {
    subject: identity.subject,
    ...(typeof identity.email === 'string' ? { email: identity.email } : {}),
    ...(typeof identity.name === 'string' ? { name: identity.name } : {}),
  }
}

export function ensureTenant<T extends Record<string, unknown>>(
  actor: { tenantId?: string | null },
  resource: T,
  label = 'Resource',
  tenantField = 'workspaceId',
): T {
  if (!actor.tenantId) {
    throw toForbiddenError('Actor has no tenant assignment.')
  }
  if ((resource as Record<string, unknown>)[tenantField] !== actor.tenantId) {
    throw toForbiddenError(`${label} not found.`)
  }
  return resource
}

export function loadTenantResource<T extends Record<string, unknown>>(
  actor: { tenantId?: string | null },
  doc: T | null | undefined,
  label = 'Resource',
  tenantField = 'workspaceId',
): T {
  requireRecord(doc, label)
  return ensureTenant(actor, doc, label, tenantField)
}
