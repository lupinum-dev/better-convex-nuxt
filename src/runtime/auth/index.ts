import type {
  GenericDataModel,
  GenericDatabaseReader,
  GenericMutationCtx,
  GenericQueryCtx,
  GenericTableInfo,
  Query,
} from 'convex/server'
import { ConvexError } from 'convex/values'

export type AuthIdentity = {
  subject: string
  email?: string
  name?: string
}

/** @deprecated Use `AuthIdentity` instead. */
export type Identity = AuthIdentity

export type AuthErrorData = {
  code: 'FORBIDDEN' | 'NOT_FOUND'
  message: string
  category?: string
  source?: string
}

type Check<P = unknown> = (principal: P) => boolean
type AnyCheck<P> = Check<P> | boolean

type QueryLike<T = unknown> = Pick<Query<GenericTableInfo>, 'collect'> & T
type VisibilityResolver<T, P> = (
  principal: P,
  db: GenericDatabaseReader<GenericDataModel>,
) => Promise<T[] | QueryLike>

export type Visibility<T, P = unknown> = {
  _type: 'visibility'
  resolve: VisibilityResolver<T, P>
}

type AnyCtx =
  | GenericQueryCtx<GenericDataModel>
  | GenericMutationCtx<GenericDataModel>

function runCheck<P>(principal: P, check: AnyCheck<P>): boolean {
  return typeof check === 'function' ? (check as Check<P>)(principal) : check
}

function toForbiddenError(reason: string, source?: string, category?: string): ConvexError<AuthErrorData> {
  return new ConvexError({
    code: 'FORBIDDEN' as const,
    message: reason,
    ...(category ? { category } : {}),
    ...(source ? { source } : {}),
  })
}

export function and<P = unknown>(...checks: Array<AnyCheck<P>>): Check<P> {
  return (principal: P) => checks.every(check => runCheck(principal, check))
}

export function or<P = unknown>(...checks: Array<AnyCheck<P>>): Check<P> {
  return (principal: P) => checks.some(check => runCheck(principal, check))
}

export function not<P = unknown>(check: AnyCheck<P>): Check<P> {
  return (principal: P) => !runCheck(principal, check)
}

export const all = and
export const any = or

export function deny(reason: string, source?: string): never
export function deny(reason: string, options: { source?: string, category?: string }): never
export function deny(reason: string, sourceOrOptions?: string | { source?: string, category?: string }): never {
  if (typeof sourceOrOptions === 'object') {
    throw toForbiddenError(reason, sourceOrOptions.source, sourceOrOptions.category)
  }
  throw toForbiddenError(reason, sourceOrOptions)
}

export function authorize<P>(principal: P, label: string, check: AnyCheck<NonNullable<P>>, category?: string): asserts principal is NonNullable<P> {
  if (principal == null) throw toForbiddenError(`Forbidden: ${label}`, undefined, category ?? 'auth')
  if (!runCheck(principal, check)) throw toForbiddenError(`Forbidden: ${label}`, undefined, category)
}

/** @deprecated Use `authorize` instead. */
export const guard = authorize

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

/** @deprecated Use `requireAuth` instead. */
export const requirePrincipal = requireAuth

export function requireRecord<T>(
  doc: T | null | undefined,
  label?: string,
): asserts doc is T {
  if (doc == null) {
    throw new ConvexError({ code: 'NOT_FOUND' as const, message: `${label ?? 'Resource'} not found.` })
  }
}

/** @deprecated Use `requireRecord` instead. */
export const ensureFound = requireRecord

export async function getAuth(ctx: AnyCtx): Promise<AuthIdentity | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null
  return {
    subject: identity.subject,
    ...(typeof identity.email === 'string' ? { email: identity.email } : {}),
    ...(typeof identity.name === 'string' ? { name: identity.name } : {}),
  }
}

/** @deprecated Use `getAuth` instead. */
export const getIdentity = getAuth

export function verifyKey(provided: string, expected: string): boolean {
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

export function defineVisibility<T, P = unknown>(
  resolve: VisibilityResolver<T, P>,
): Visibility<T, P> {
  return {
    _type: 'visibility',
    resolve,
  }
}

export async function applyVisibility<T, P = unknown>(
  visibility: Visibility<T, P>,
  principal: P,
  db: GenericDatabaseReader<GenericDataModel>,
): Promise<T[]> {
  if (!principal) return []
  const result = await visibility.resolve(principal, db)
  if (Array.isArray(result)) return result
  if (result && typeof result.collect === 'function') {
    return await result.collect() as T[]
  }
  return []
}

export async function getVisibilityQuery<T, P = unknown>(
  visibility: Visibility<T, P>,
  principal: P,
  db: GenericDatabaseReader<GenericDataModel>,
): Promise<QueryLike | T[] | null> {
  if (!principal) return null
  return await visibility.resolve(principal, db)
}
