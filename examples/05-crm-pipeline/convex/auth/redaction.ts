import type { Actor } from './actor'
import { hasRole } from './checks'

type RedactionRule = {
  fields: string[]
  visibleTo: (actor: Actor) => boolean
}

const rules: RedactionRule[] = [
  {
    fields: ['estimatedRevenue', 'internalNotes'],
    visibleTo: hasRole('owner', 'admin', 'manager'),
  },
]

export function redactContact<T extends Record<string, unknown>>(actor: Actor, contact: T): T {
  const result = { ...contact }

  for (const rule of rules) {
    if (rule.visibleTo(actor)) continue
    for (const field of rule.fields) {
      delete result[field]
    }
  }

  return result
}
