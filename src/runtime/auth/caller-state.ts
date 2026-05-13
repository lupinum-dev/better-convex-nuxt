/**
 * Narrow a transport caller to the authenticated branch used by the
 * structured handler runtime.
 */
export type AuthenticatedCaller<TCaller> = TCaller extends { kind: 'anonymous' }
  ? never
  : TCaller extends { kind: infer TKind }
    ? TKind extends 'anonymous'
      ? never
      : TCaller
    : NonNullable<TCaller>

/** Return true when a value represents the anonymous caller state. */
export function isAnonymousCaller(value: unknown): boolean {
  return (
    value == null ||
    (typeof value === 'object' &&
      value !== null &&
      'kind' in value &&
      (value as { kind?: unknown }).kind === 'anonymous')
  )
}
