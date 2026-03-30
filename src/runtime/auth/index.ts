import type {
  GenericDataModel,
  GenericDatabaseReader,
  GenericMutationCtx,
  GenericQueryCtx,
  GenericTableInfo,
  Query,
} from 'convex/server'
import { ConvexError } from 'convex/values'

export type Identity = {
  subject: string
  email?: string
  name?: string
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

function toForbiddenError(reason: string, source?: string): ConvexError<{ code: 'FORBIDDEN', message: string, source?: string }> {
  return new ConvexError({
    code: 'FORBIDDEN',
    message: reason,
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

export function deny(reason: string, source?: string): never {
  throw toForbiddenError(reason, source)
}

export function guard<P = unknown>(principal: P, label: string, check: AnyCheck<P>): void {
  if (runCheck(principal, check)) return
  throw toForbiddenError(`Forbidden: ${label}`)
}

export function can<P = unknown>(principal: P, check: AnyCheck<P>): boolean {
  try {
    return !!runCheck(principal, check)
  } catch (error) {
    if (error instanceof ConvexError) return false
    throw error
  }
}

export function requirePrincipal<P>(
  principal: P,
  reason = 'Not authenticated.',
): asserts principal is NonNullable<P> {
  if (principal == null) {
    throw toForbiddenError(reason)
  }
}

export async function getIdentity(ctx: AnyCtx): Promise<Identity | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null
  return {
    subject: identity.subject,
    ...(typeof identity.email === 'string' ? { email: identity.email } : {}),
    ...(typeof identity.name === 'string' ? { name: identity.name } : {}),
  }
}

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
