import type { Actor } from './actor'

const planFeatures: Record<string, string[]> = {
  free: ['projects'],
  pro: ['projects', 'exports'],
  enterprise: ['*'],
}

export const hasRole = (...roles: string[]) => (actor: Actor) => !!actor && roles.includes(actor.role)
export const canCreateProject = hasRole('owner', 'admin', 'member')

export const hasFeature = (feature: string) => (actor: Actor) => {
  if (!actor) return false
  const features = planFeatures[actor.plan ?? 'free'] ?? []
  return features.includes(feature) || features.includes('*')
}
