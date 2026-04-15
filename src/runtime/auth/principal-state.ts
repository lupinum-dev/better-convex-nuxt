/**
 * Narrow a transport principal to the authenticated branch used by the
 * structured handler runtime.
 */
export type AuthenticatedPrincipal<TPrincipal> = TPrincipal extends { kind: 'anonymous' }
  ? never
  : TPrincipal extends { kind: infer TKind }
    ? TKind extends 'anonymous'
      ? never
      : TPrincipal
    : NonNullable<TPrincipal>

/** Return true when a value represents the anonymous principal state. */
export function isAnonymousPrincipal(value: unknown): boolean {
  return (
    value == null ||
    (typeof value === 'object' &&
      value !== null &&
      'kind' in value &&
      (value as { kind?: unknown }).kind === 'anonymous')
  )
}
