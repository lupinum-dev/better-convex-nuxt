import { defineRedaction } from '@lupinum/trellis/workspace'

import type { AppIdentity } from '../../auth/appIdentity'
import { hasRole } from '../../auth/guards'

export const articleRedaction = defineRedaction<Record<string, unknown>, AppIdentity>({
  rules: [
    {
      fields: ['internalNotes', 'draftFeedback'],
      visibleTo: (appIdentity) => !!appIdentity && hasRole('owner', 'admin', 'editor')(appIdentity),
    },
  ],
})

export function redactArticle<T extends Record<string, unknown>>(
  appIdentity: AppIdentity | null,
  article: T,
): T {
  return articleRedaction.apply(appIdentity as AppIdentity, article) as T
}

export function projectArticle<T extends Record<string, unknown>, TOutput>(
  appIdentity: AppIdentity | null,
  article: T,
  projector: (article: T) => TOutput,
): TOutput {
  return articleRedaction.project(
    appIdentity as AppIdentity,
    article,
    projector as (value: Record<string, unknown>) => TOutput,
  )
}
