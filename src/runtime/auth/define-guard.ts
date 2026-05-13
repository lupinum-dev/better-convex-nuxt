export type Check<P = unknown> = (caller: P) => boolean
export type AnyCheck<P = unknown> = Check<P> | boolean

export type GuardKind = 'base' | 'and' | 'or' | 'not' | 'auth_required'

export type Guard<P = unknown> = Check<P> & {
  _type: 'guard'
  kind: GuardKind
  label: string
  checks: ReadonlyArray<AnyCheck<P>>
  and: (...checks: Array<AnyCheck<P>>) => Guard<P>
  or: (...checks: Array<AnyCheck<P>>) => Guard<P>
  not: () => Guard<P>
}

export type OpenGuard = Guard<unknown> & {
  _open: true
}

export type AuthRequiredGuard = Guard<unknown> & {
  _authRequired: true
  and: (...checks: Array<AnyCheck<unknown>>) => never
  or: (...checks: Array<AnyCheck<unknown>>) => never
  not: () => never
}

export function runCheck<P>(caller: P, check: AnyCheck<P>): boolean {
  return typeof check === 'function' ? (check as Check<P>)(caller) : check
}

export function isGuard<P = unknown>(value: unknown): value is Guard<P> {
  return (
    typeof value === 'function' &&
    value !== null &&
    (value as { _type?: unknown })._type === 'guard'
  )
}

export function isOpenGuard(value: unknown): value is OpenGuard {
  return isGuard(value) && (value as { _open?: unknown })._open === true
}

export function isAuthRequiredGuard(value: unknown): value is AuthRequiredGuard {
  return isGuard(value) && (value as { _authRequired?: unknown })._authRequired === true
}

function describeCheck<P>(check: AnyCheck<P>): string {
  if (isGuard(check)) return check.label
  if (typeof check === 'boolean') return String(check)
  return '(unnamed check)'
}

function createGuard<P>(
  label: string,
  evaluate: Check<P>,
  kind: GuardKind,
  checks: ReadonlyArray<AnyCheck<P>>,
): Guard<P> {
  const guard = ((caller: P) => evaluate(caller)) as Guard<P>

  guard._type = 'guard'
  guard.kind = kind
  guard.label = label
  guard.checks = checks
  guard.and = (...nextChecks) =>
    createGuard(
      [label, ...nextChecks.map(describeCheck)].join(' && '),
      (caller) => runCheck(caller, guard) && nextChecks.every((check) => runCheck(caller, check)),
      'and',
      [guard, ...nextChecks],
    )
  guard.or = (...nextChecks) =>
    createGuard(
      [label, ...nextChecks.map(describeCheck)].join(' || '),
      (caller) => runCheck(caller, guard) || nextChecks.some((check) => runCheck(caller, check)),
      'or',
      [guard, ...nextChecks],
    )
  guard.not = () =>
    createGuard(`not ${label}`, (caller) => !runCheck(caller, guard), 'not', [guard])

  return guard
}

export function defineGuard<P>(label: string, check: AnyCheck<P>): Guard<P> {
  return createGuard(label, (caller) => runCheck(caller, check), 'base', [check])
}

export const open = Object.assign(defineGuard<unknown>('open', true), {
  _open: true as const,
}) as OpenGuard

/**
 * Sentinel guard for pre-appIdentity authenticated flows.
 *
 * The boolean check here is intentionally inert. Enforcement happens in the
 * structured handler runtime via `requireAuth(...)`, not through `runCheck(...)`.
 */
export const authRequired = Object.assign(defineGuard<unknown>('authRequired', true), {
  _authRequired: true as const,
  kind: 'auth_required' as const,
  and: () => {
    throw new Error('authRequired is a caller gate and cannot be composed with and().')
  },
  or: () => {
    throw new Error('authRequired is a caller gate and cannot be composed with or().')
  },
  not: () => {
    throw new Error('authRequired is a caller gate and cannot be negated.')
  },
}) as AuthRequiredGuard
