import { deny } from 'better-convex-nuxt/auth'

import type { Actor } from './actor'

const usageLimits = {
  projects: {
    limits: { free: 3, pro: 50, enterprise: Infinity },
  },
} as const

export async function ensureWithinLimit(db: any, actor: Actor, resource: keyof typeof usageLimits): Promise<void> {
  if (!actor) throw deny('Not authenticated.')

  const limit = usageLimits[resource].limits[actor.plan as keyof typeof usageLimits.projects.limits] ?? Infinity
  if (limit === Infinity) return

  const rows = await db
    .query(resource)
    .withIndex('by_workspace', (q: any) => q.eq('workspaceId', actor.tenantId))
    .collect()

  if (rows.length >= limit) {
    throw deny(`Plan limit reached: ${rows.length}/${limit} ${resource}. Upgrade to add more.`)
  }
}

export async function getUsage(db: any, actor: Actor, resource: keyof typeof usageLimits) {
  if (!actor) return null

  const max = usageLimits[resource].limits[actor.plan as keyof typeof usageLimits.projects.limits] ?? Infinity
  const rows = await db
    .query(resource)
    .withIndex('by_workspace', (q: any) => q.eq('workspaceId', actor.tenantId))
    .collect()

  return {
    current: rows.length,
    max,
    remaining: max === Infinity ? Infinity : Math.max(0, max - rows.length),
  }
}
