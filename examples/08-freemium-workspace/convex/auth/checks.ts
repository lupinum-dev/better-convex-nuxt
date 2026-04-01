/**
 * Check style:
 * Direct exports are static actor predicates. Plan checks stay separate from role checks so the
 * handler body can combine entitlement and role constraints explicitly.
 */
import type { Actor } from './actor'

import type { Doc } from '../_generated/dataModel'

const planFeatures: Record<Doc<'workspaces'>['plan'], string[]> = {
  free: ['projects'],
  pro: ['projects', 'exports'],
  enterprise: ['*'],
}

export const hasRole =
  (...roles: Doc<'users'>['role'][]) =>
  (actor: Actor) =>
    !!actor && roles.includes(actor.role)
export const canCreateProject = hasRole('owner', 'admin', 'member')

export const hasFeature = (feature: string) => (actor: Actor) => {
  if (!actor) return false
  const features = planFeatures[actor.plan ?? 'free'] ?? []
  return features.includes(feature) || features.includes('*')
}
