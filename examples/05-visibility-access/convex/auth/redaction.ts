/**
 * Why this file exists:
 * Sensitive article fields are stripped for non-editor roles.
 */
import type { Actor } from './actor'
import { hasRole } from './checks'

type RedactionRule = {
  fields: string[]
  visibleTo: (actor: Actor) => boolean
}

const rules: RedactionRule[] = [
  {
    fields: ['internalNotes', 'draftFeedback'],
    visibleTo: hasRole('owner', 'admin', 'editor'),
  },
]

export function redactArticle<T extends Record<string, unknown>>(actor: Actor, article: T): T {
  const result = { ...article }

  for (const rule of rules) {
    if (rule.visibleTo(actor)) continue
    for (const field of rule.fields) {
      Reflect.deleteProperty(result, field)
    }
  }

  return result
}
