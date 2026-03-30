import { timingSafeEqual } from 'node:crypto'

import type {
  GenericDataModel,
  GenericDatabaseReader,
  GenericMutationCtx,
  GenericQueryCtx,
  Query,
} from 'convex/server'
import { ConvexError } from 'convex/values'

export type Identity = {
  subject: string
  email?: string
  name?: string
}

export type Denial = {
  denied: true
  reason: string
  source?: string
}

export type CheckResult = boolean | Denial
export type Check<P = unknown> = (principal: P) => CheckResult

type AnyCheck<P> = Check<P> | CheckResult

type QueryLike<T = unknown> = Pick<Query<any>, 'collect'> & T
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

function runCheck<P>(principal: P, check: AnyCheck<P>): CheckResult {
  return typeof check === 'function' ? (check as Check<P>)(principal) : check
}

function isDenied(result: CheckResult): result is Denial {
  return typeof result === 'object' && result !== null && result.denied === true
}

function toBoolean(result: CheckResult): boolean {
  return result === true
}

function toForbiddenError(reason: string, source?: string): ConvexError<{ code: 'FORBIDDEN', message: string, source?: string }> {
  return new ConvexError({
    code: 'FORBIDDEN',
    message: reason,
    ...(source ? { source } : {}),
  })
}

export function and<P = unknown>(...checks: Array<AnyCheck<P>>): Check<P> {
  return (principal: P) => {
    for (const check of checks) {
      const result = runCheck(principal, check)
      if (result === true) continue
      if (isDenied(result)) return result
      return false
    }
    return true
  }
}

export function or<P = unknown>(...checks: Array<AnyCheck<P>>): Check<P> {
  return (principal: P) => {
    let firstDenial: Denial | null = null
    for (const check of checks) {
      const result = runCheck(principal, check)
      if (result === true) return true
      if (!firstDenial && isDenied(result)) firstDenial = result
    }
    return firstDenial ?? false
  }
}

export function not<P = unknown>(check: AnyCheck<P>): Check<P> {
  return (principal: P) => !toBoolean(runCheck(principal, check))
}

export const all = and
export const any = or

export function deny(reason: string, source?: string): Denial {
  return { denied: true, reason, ...(source ? { source } : {}) }
}

export function guard<P = unknown>(principal: P, label: string, check: AnyCheck<P>): void {
  const result = runCheck(principal, check)
  if (result === true) return
  if (isDenied(result)) {
    throw toForbiddenError(result.reason || `Forbidden: ${label}`, result.source)
  }
  throw toForbiddenError(`Forbidden: ${label}`)
}

export function can<P = unknown>(principal: P, check: AnyCheck<P>): boolean {
  try {
    return toBoolean(runCheck(principal, check))
  } catch {
    return false
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
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
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
