import type {
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'
import { ConvexError } from 'convex/values'

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

type Check<P = unknown> = (principal: P) => boolean
type AnyCheck<P> = Check<P> | boolean

type AnyCtx<DataModel extends GenericDataModel = GenericDataModel> =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>

function runCheck<P>(principal: P, check: AnyCheck<P>): boolean {
  return typeof check === 'function' ? (check as Check<P>)(principal) : check
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
  return (principal: P) => checks.every(check => runCheck(principal, check))
}

export function or<P = unknown>(...checks: Array<AnyCheck<P>>): Check<P> {
  return (principal: P) => checks.some(check => runCheck(principal, check))
}

export function deny(reason: string, source?: string): never
export function deny(reason: string, options: { source?: string, category?: string }): never
export function deny(
  reason: string,
  sourceOrOptions?: string | { source?: string, category?: string },
): never {
  if (typeof sourceOrOptions === 'object') {
    throw toForbiddenError(reason, sourceOrOptions.source, sourceOrOptions.category)
  }
  throw toForbiddenError(reason, sourceOrOptions)
}

export function authorize<P>(
  principal: P,
  label: string,
  check: AnyCheck<NonNullable<P>>,
  category?: string,
): asserts principal is NonNullable<P> {
  if (principal == null) throw toForbiddenError(`Forbidden: ${label}`, undefined, category ?? 'auth')
  if (!runCheck(principal, check)) throw toForbiddenError(`Forbidden: ${label}`, undefined, category)
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

export function requireRecord<T>(
  doc: T | null | undefined,
  label?: string,
): asserts doc is T {
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
