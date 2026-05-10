export type TrellisUnsafePermit = {
  kind: string
  reason: string
  scope: readonly string[]
  reviewBy?: string
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`unsafe.permit(...): "${field}" must be a non-empty string.`)
  }
}

export const unsafe = {
  permit(input: {
    kind: string
    reason: string
    scope: readonly string[]
    reviewBy?: string
  }): TrellisUnsafePermit {
    assertNonEmptyString(input.kind, 'kind')
    assertNonEmptyString(input.reason, 'reason')
    if (!Array.isArray(input.scope) || input.scope.length === 0) {
      throw new Error('unsafe.permit(...): "scope" must contain at least one scope entry.')
    }
    for (const [index, scope] of input.scope.entries()) {
      assertNonEmptyString(scope, `scope[${index}]`)
    }
    if (input.reviewBy !== undefined) {
      assertNonEmptyString(input.reviewBy, 'reviewBy')
    }

    return {
      kind: input.kind.trim(),
      reason: input.reason.trim(),
      scope: input.scope.map((entry) => entry.trim()),
      ...(input.reviewBy ? { reviewBy: input.reviewBy.trim() } : {}),
    }
  },
} as const

export function assertUnsafePermit(
  value: unknown,
  context: string,
): asserts value is TrellisUnsafePermit {
  if (!value || typeof value !== 'object') {
    throw new Error(`${context}: unsafe handlers require unsafe.permit(...).`)
  }
  const permit = value as TrellisUnsafePermit
  assertNonEmptyString(permit.kind, 'kind')
  assertNonEmptyString(permit.reason, 'reason')
  if (!Array.isArray(permit.scope) || permit.scope.length === 0) {
    throw new Error(`${context}: unsafe permit scope must contain at least one scope entry.`)
  }
  for (const [index, scope] of permit.scope.entries()) {
    assertNonEmptyString(scope, `scope[${index}]`)
  }
  if (permit.reviewBy !== undefined) {
    assertNonEmptyString(permit.reviewBy, 'reviewBy')
  }
}
