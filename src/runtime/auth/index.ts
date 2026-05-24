import { ConvexError } from 'convex/values'

import { isAnonymousCaller, type AuthenticatedCaller } from './caller-state.js'
import { runCheck, type AnyCheck, type Check } from './define-guard.js'

export { defineBetterAuth } from './define-better-auth.js'
export type {
  DefineBetterAuthOptions,
  DefineBetterAuthDeps,
  BetterAuthBridge,
} from './define-better-auth.js'
export { getAuth } from './auth-identity.js'
export type { AuthIdentity } from './auth-identity.js'
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
export { defineAppIdentity } from './define-app-identity.js'
export type { AppIdentityBuilder, DefaultAppIdentity } from './define-app-identity.js'
export {
  createSubject,
  getSubjectKind,
  getSubjectValue,
  isSubjectKind,
  subject,
} from './subject.js'
export type { CanonicalSubject, Subject, SubjectKind } from './subject.js'
export { buildPermissionMatrix } from './build-permission-matrix.js'
export type { PermissionMatrixRow } from './build-permission-matrix.js'
export {
  definePermissionKey,
  definePermission,
  isGuardPermissionDefinition,
  isPermissionDefinition,
  resolvePermissionCheck,
  resolvePermissionKey,
  resolvePermissionLabel,
} from './define-permission.js'
export type {
  GuardPermissionDefinition,
  PermissionKeysByKey,
  PermissionDefinition,
  PermissionHandle,
  PermissionKeyDefinition,
  PermissionKeyHandle,
  ProjectedPermissionKeysByKey,
  RegisteredPermissionKey,
  RegisteredPermissions,
  RegisteredProjectedPermissionKey,
} from './define-permission.js'
export { defineAccessContext } from './define-access-context.js'
export type {
  InferAccessContext,
  AccessContextBase,
  AccessContextDefinition,
  PermissionFlags,
  PermissionKey,
  ValidatePermissionKey,
} from './define-access-context.js'
export { defineServices } from './define-services.js'
export type {
  RestrictedServiceAccess,
  ServiceDefinition,
  ServiceDefinitions,
  ServiceTenantMode,
} from './define-services.js'

export type AuthErrorData = {
  code: 'FORBIDDEN' | 'NOT_FOUND'
  message: string
  category?: string
  source?: string
}

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
  return (caller: P) => checks.every((check) => runCheck(caller, check))
}

/** Combine multiple checks and allow access when any check passes. */
export function or<P = unknown>(...checks: Array<AnyCheck<P>>): Check<P> {
  return (caller: P) => checks.some((check) => runCheck(caller, check))
}

/**
 * Throw a structured forbidden error from inside a guard, authorize phase, or
 * protected handler.
 */
export function deny(reason: string, options?: { source?: string; category?: string }): never {
  throw toForbiddenError(reason, options?.source, options?.category)
}

/** Assert that a caller exists and passes the given check. */
export function enforce<P>(
  caller: P,
  label: string,
  check: AnyCheck<NonNullable<P>>,
  category?: string,
): asserts caller is NonNullable<P> {
  if (caller == null) throw toForbiddenError(`Forbidden: ${label}`, undefined, category ?? 'auth')
  if (!runCheck(caller, check)) throw toForbiddenError(`Forbidden: ${label}`, undefined, category)
}

export function can<P = unknown>(caller: P, check: AnyCheck<P>): boolean {
  try {
    return !!runCheck(caller, check)
  } catch (error) {
    if (error instanceof ConvexError) return false
    throw error
  }
}

/** Assert that the caller is authenticated before continuing. */
export function requireAuth<P>(
  caller: P,
  reason = 'Not authenticated.',
): asserts caller is AuthenticatedCaller<P> & NonNullable<P> {
  if (caller == null || isAnonymousCaller(caller)) {
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

/** Assert that a loaded resource belongs to the appIdentity's tenant and return it. */
export function ensureTenant<T extends Record<string, unknown>>(
  appIdentity: { workspaceId?: string | null },
  resource: T,
  label = 'Resource',
  tenantField = 'workspaceId',
): T {
  if (!appIdentity.workspaceId) {
    throw toForbiddenError('AppIdentity has no tenant assignment.')
  }
  if ((resource as Record<string, unknown>)[tenantField] !== appIdentity.workspaceId) {
    throw toForbiddenError(`${label} not found.`)
  }
  return resource
}

/** Load a tenant-owned resource and fail with the correct error semantics when missing or foreign. */
export function loadTenantResource<T extends Record<string, unknown>>(
  appIdentity: { workspaceId?: string | null },
  doc: T | null | undefined,
  label = 'Resource',
  tenantField = 'workspaceId',
): T {
  requireRecord(doc, label)
  return ensureTenant(appIdentity, doc, label, tenantField)
}
