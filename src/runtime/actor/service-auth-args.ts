import { v } from 'convex/values'

// ============================================================================
// serviceAuthArgs — spread into Convex function args
// ============================================================================

export const serviceAuthArgs = {
  _serviceKey: v.optional(v.string()),
  _serviceActor: v.optional(
    v.object({
      userId: v.string(),
      role: v.string(),
      orgId: v.optional(v.string()),
    }),
  ),
} as const

// ============================================================================
// cleanArgs — strip service fields before passing to business logic
// ============================================================================

export function cleanArgs<T extends Record<string, unknown>>(
  args: T,
): Omit<T, '_serviceKey' | '_serviceActor'> {
  const { _serviceKey: _, _serviceActor: __, ...clean } = args
  return clean as Omit<T, '_serviceKey' | '_serviceActor'>
}
