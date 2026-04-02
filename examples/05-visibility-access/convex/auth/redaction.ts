/**
 * Why this file exists:
 * Sensitive article fields are stripped for non-editor roles.
 */
import { defineRedaction } from 'better-convex-nuxt/visibility'

import type { Actor } from './actor'
import { hasRole } from './checks'

export const articleRedaction = defineRedaction<Record<string, unknown>, Actor>({
  rules: [
    {
      fields: ['internalNotes', 'draftFeedback'],
      visibleTo: (actor) => hasRole('owner', 'admin', 'editor')(actor),
    },
  ],
})

export function redactArticle<T extends Record<string, unknown>>(actor: Actor, article: T): T {
  return articleRedaction.apply(actor, article) as T
}
