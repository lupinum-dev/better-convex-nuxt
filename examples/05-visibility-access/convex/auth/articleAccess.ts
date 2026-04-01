/**
 * Why this file exists:
 * The unified access chain for articles: enrollment → prerequisites → publish state → access level.
 * Combines patterns from the LMS lesson access and doc sharing page access.
 */
import { deny } from 'better-convex-nuxt/auth'

import type { Doc, Id } from '../_generated/dataModel'
import type { DatabaseReader } from '../_generated/server'
import type { Actor } from './actor'
import { isStaffActor, requireEnrollment } from './enrollment'
import { ensurePrerequisites } from './prerequisites'
import { requireRecord } from './scope'

export type AccessLevel = 'view' | 'comment' | 'edit'

const hierarchy: Record<AccessLevel, number> = {
  view: 0,
  comment: 1,
  edit: 2,
}

export async function getAccessLevel(
  db: DatabaseReader,
  actor: Actor,
  articleId: Id<'articles'>,
): Promise<AccessLevel | null> {
  if (!actor || actor.kind !== 'user') return null
  if (['owner', 'admin'].includes(actor.role)) return 'edit'

  const article = await db.get(articleId)
  if (!article) return null
  if (article.ownerId === actor.userId) return 'edit'

  const share = await db
    .query('articleShares')
    .withIndex('by_user_article', (q) => q.eq('userId', actor.userId).eq('articleId', articleId))
    .first()
  if (share) return share.level as AccessLevel

  if (['editor', 'contributor', 'viewer'].includes(actor.role)) {
    if (article.visibility === 'workspace') return 'view'
  }

  return null
}

export async function getInheritedAccessLevel(
  db: DatabaseReader,
  actor: Actor,
  articleId: Id<'articles'>,
  maxDepth = 10,
): Promise<AccessLevel | null> {
  const direct = await getAccessLevel(db, actor, articleId)
  if (direct) return direct

  let currentId = articleId
  for (let depth = 0; depth < maxDepth; depth++) {
    const article = await db.get(currentId)
    if (!article?.parentArticleId) break

    const parentAccess = await getAccessLevel(db, actor, article.parentArticleId)
    if (parentAccess) return parentAccess

    currentId = article.parentArticleId
  }

  return null
}

export async function requireArticleAccess(
  db: DatabaseReader,
  actor: Exclude<Actor, null>,
  article: Doc<'articles'>,
): Promise<{ kb: Doc<'knowledgeBases'>; enrollment: Doc<'enrollments'> | null }> {
  const kb = await db.get(article.knowledgeBaseId)
  requireRecord(kb, 'Knowledge base')

  if (isStaffActor(actor)) {
    return { kb, enrollment: null }
  }

  if (kb.status !== 'published') throw deny('Knowledge base not available.')
  if (article.status !== 'published') throw deny('Article not available.')

  const enrollment = await requireEnrollment(db, actor, kb._id)
  await ensurePrerequisites(db, actor.userId, article)

  if (article.availableAfter && article.availableAfter > Date.now()) {
    throw deny('This article is not available yet.')
  }

  return { kb, enrollment }
}

export async function requireMinAccessLevel(
  db: DatabaseReader,
  actor: Actor,
  articleId: Id<'articles'>,
  minLevel: AccessLevel,
): Promise<AccessLevel> {
  const level = await getInheritedAccessLevel(db, actor, articleId)
  if (!level) throw deny('No access to this article.')
  if (hierarchy[level] < hierarchy[minLevel]) {
    throw deny(`Requires ${minLevel} access. You have ${level}.`)
  }

  return level
}
