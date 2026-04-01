/**
 * Why this file exists:
 * Workspace roles are not enough for docs. Page access can be direct, inherited, or both.
 */
import { deny } from 'better-convex-nuxt/auth'

import type { Id } from '../_generated/dataModel'
import type { DatabaseReader } from '../_generated/server'
import type { Actor } from './actor'

export type AccessLevel = 'view' | 'comment' | 'edit'

const hierarchy: Record<AccessLevel, number> = {
  view: 0,
  comment: 1,
  edit: 2,
}

export async function getAccessLevel(
  db: DatabaseReader,
  actor: Actor,
  pageId: Id<'pages'>,
): Promise<AccessLevel | null> {
  if (!actor || actor.kind !== 'user') return null
  if (['owner', 'admin'].includes(actor.role)) return 'edit'

  const page = await db.get(pageId)
  if (!page) return null
  if (page.ownerId === actor.userId) return 'edit'

  const share = await db
    .query('pageShares')
    .withIndex('by_user_page', (q) => q.eq('userId', actor.userId).eq('pageId', pageId))
    .first()
  if (share) return share.level as AccessLevel

  if (['member', 'viewer'].includes(actor.role)) {
    if (page.visibility === 'workspace') return 'view'
  }

  return null
}

export async function getInheritedAccessLevel(
  db: DatabaseReader,
  actor: Actor,
  pageId: Id<'pages'>,
  maxDepth = 10,
): Promise<AccessLevel | null> {
  const direct = await getAccessLevel(db, actor, pageId)
  if (direct) return direct

  let currentId = pageId
  for (let depth = 0; depth < maxDepth; depth++) {
    const page = await db.get(currentId)
    if (!page?.parentPageId) break

    const parentAccess = await getAccessLevel(db, actor, page.parentPageId)
    if (parentAccess) return parentAccess

    currentId = page.parentPageId
  }

  return null
}

export async function requirePageAccess(
  db: DatabaseReader,
  actor: Actor,
  pageId: Id<'pages'>,
  minLevel: AccessLevel,
): Promise<AccessLevel> {
  const level = await getInheritedAccessLevel(db, actor, pageId)
  if (!level) throw deny('No access to this page.')
  if (hierarchy[level] < hierarchy[minLevel]) {
    throw deny(`Requires ${minLevel} access. You have ${level}.`)
  }

  return level
}
