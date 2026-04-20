import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'
import { ConvexError } from 'convex/values'

import { runCheck, type AnyCheck, type Check } from './define-guard.js'
import { isAnonymousPrincipal, type AuthenticatedPrincipal } from './principal-state.js'

export { defineAuth } from './define-auth.js'
export type { DefineAuthOptions, DefineAuthDeps, ConvexAuthBridge } from './define-auth.js'
export {
  authRequired,
  defineGuard,
  isAuthRequiredGuard,
  isGuard,
  isOpenGuard,
  open,
} from './define-guard.js'
export type {
  AnyCheck,
  AuthRequiredGuard,
  Check,
  Guard,
  GuardKind,
  OpenGuard,
} from './define-guard.js'
export { defineActor } from './define-actor.js'
export type { ActorBuilder, DefaultActor } from './define-actor.js'
export { createSubject, getSubjectKind, getSubjectValue, isSubjectKind, subject } from './subject.js'
export type { CanonicalSubject, Subject, SubjectKind } from './subject.js'
export { derivePermissionMatrix } from './derive-permission-matrix.js'
export type { PermissionMatrixRow } from './derive-permission-matrix.js'
export {
  definePermission,
  isGuardPermissionDefinition,
  isPermissionDefinition,
  resolvePermissionCheck,
  resolvePermissionKey,
  resolvePermissionLabel,
} from './define-permission.js'
export type {
  GuardPermissionDefinition,
  PermissionDefinition,
  PermissionHandle,
  RegisteredPermissionKey,
  RegisteredPermissions,
  RegisteredProjectedPermissionKey,
} from './define-permission.js'
export { definePermissionContext } from './define-permission-context.js'
export { defineServices } from './define-services.js'
export type {
  RestrictedServiceAccess,
  ServiceDefinition,
  ServiceDefinitions,
  ServiceTenantMode,
} from './define-services.js'

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
  | GenericActionCtx<DataModel>

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

/** Combine multiple checks and allow access when any check passes. */
export function or<P = unknown>(...checks: Array<AnyCheck<P>>): Check<P> {
  return (principal: P) => checks.some((check) => runCheck(principal, check))
}

/**
 * Throw a structured forbidden error from inside a guard, authorize phase, or
 * protected handler.
 */
export function deny(reason: string, options?: { source?: string; category?: string }): never {
  throw toForbiddenError(reason, options?.source, options?.category)
}

/** Assert that a principal exists and passes the given check. */
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

/** Assert that the caller is authenticated before continuing. */
export function requireAuth<P>(
  principal: P,
  reason = 'Not authenticated.',
): asserts principal is AuthenticatedPrincipal<P> & NonNullable<P> {
  if (principal == null || isAnonymousPrincipal(principal)) {
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

/** Read the authenticated identity from a Convex query or mutation context. */
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

/** Assert that a loaded resource belongs to the actor's tenant and return it. */
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

/** Load a tenant-owned resource and fail with the correct error semantics when missing or foreign. */
export function loadTenantResource<T extends Record<string, unknown>>(
  actor: { tenantId?: string | null },
  doc: T | null | undefined,
  label = 'Resource',
  tenantField = 'workspaceId',
): T {
  requireRecord(doc, label)
  return ensureTenant(actor, doc, label, tenantField)
}
