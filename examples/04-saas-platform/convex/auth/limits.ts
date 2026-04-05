/**
 * Why this file exists:
 * Plan entitlements answer "may they use the feature?" Limits answer "is there room right now?"
 */
import { deny } from '@lupinum/trellis/auth'
import type { GenericQueryCtx } from 'convex/server'

import type { DataModel } from '../_generated/dataModel'
import type { Actor } from './actor'

const usageLimits = {
  projects: {
    limits: { free: 3, pro: 50, enterprise: Infinity },
  },
} as const

type Db = GenericQueryCtx<DataModel>['db']

export async function ensureWithinLimit(
  db: Db,
  actor: Actor,
  resource: keyof typeof usageLimits,
): Promise<void> {
  if (!actor) throw deny('Not authenticated.')
  if (!actor.tenantId) throw deny('Not assigned to a workspace.')

  const limit =
    usageLimits[resource].limits[actor.plan as keyof typeof usageLimits.projects.limits] ?? Infinity
  if (limit === Infinity) return

  const tenantId = actor.tenantId!
  const rows = await db
    .query(resource)
    .withIndex('by_workspace', (q) => q.eq('workspaceId', tenantId))
    .collect()

  if (rows.length >= limit) {
    throw deny(`Plan limit reached: ${rows.length}/${limit} ${resource}. Upgrade to add more.`)
  }
}

export async function getUsage(db: Db, actor: Actor, resource: keyof typeof usageLimits) {
  if (!actor || !actor.tenantId) return null

  const tenantId = actor.tenantId
  const max =
    usageLimits[resource].limits[actor.plan as keyof typeof usageLimits.projects.limits] ?? Infinity
  const rows = await db
    .query(resource)
    .withIndex('by_workspace', (q) => q.eq('workspaceId', tenantId))
    .collect()

  return {
    current: rows.length,
    max,
    remaining: max === Infinity ? Infinity : Math.max(0, max - rows.length),
  }
}
