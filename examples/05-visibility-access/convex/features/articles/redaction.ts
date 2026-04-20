import { defineRedaction } from '@lupinum/trellis/visibility'

import type { Actor } from '../../auth/actor'
import { hasRole } from '../../auth/guards'

export const articleRedaction = defineRedaction<Record<string, unknown>, Actor>({
  rules: [
    {
      fields: ['internalNotes', 'draftFeedback'],
      visibleTo: (actor) => !!actor && hasRole('owner', 'admin', 'editor')(actor),
    },
  ],
})

export function redactArticle<T extends Record<string, unknown>>(
  actor: Actor | null,
  article: T,
): T {
  return articleRedaction.apply(actor as Actor, article) as T
}
