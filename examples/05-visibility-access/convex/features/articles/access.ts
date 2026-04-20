import { deny, requireRecord } from '@lupinum/trellis/auth'

import type { Doc, Id } from '../../_generated/dataModel'
import type { DatabaseReader } from '../../_generated/server'
import type { Actor } from '../../auth/actor'
import { requireEnrollment } from '../knowledgeBases'
import type { AccessLevel } from './shareTokens'

const hierarchy: Record<AccessLevel, number> = {
  view: 0,
  comment: 1,
  edit: 2,
}

function isStaffActor(actor: Actor): boolean {
  return actor.role === 'owner' || actor.role === 'admin' || actor.role === 'editor'
}

async function ensurePrerequisites(
  db: DatabaseReader,
  userId: string,
  article: Doc<'articles'>,
): Promise<void> {
  for (const prerequisiteId of article.prerequisiteIds ?? []) {
    const progress = await db
      .query('articleProgress')
      .withIndex('by_user_article', (q) => q.eq('userId', userId).eq('articleId', prerequisiteId))
      .first()

    if (!progress?.completedAt) {
      const prerequisite = await db.get(prerequisiteId)
      throw deny(`Complete "${prerequisite?.title ?? 'previous article'}" first.`)
    }
  }
}

async function getAccessLevel(
  db: DatabaseReader,
  actor: Actor,
  articleId: Id<'articles'>,
): Promise<AccessLevel | null> {
  if (actor.kind !== 'user') return null
  if (actor.role === 'owner' || actor.role === 'admin') return 'edit'

  const article = await db.get(articleId)
  if (!article) return null
  if (article.ownerId === actor.userId) return 'edit'

  const share = await db
    .query('articleShares')
    .withIndex('by_user_article', (q) => q.eq('userId', actor.userId).eq('articleId', articleId))
    .first()
  if (share) return share.level as AccessLevel

  if (
    (actor.role === 'editor' || actor.role === 'contributor' || actor.role === 'viewer') &&
    article.visibility === 'workspace'
  ) {
    return 'view'
  }

  return null
}

export async function getInheritedAccessLevel(
  db: DatabaseReader,
  actor: Actor,
  articleId: Id<'articles'>,
  maxDepth = 10,
): Promise<AccessLevel | null> {
  let best = await getAccessLevel(db, actor, articleId)

  let currentId = articleId
  for (let depth = 0; depth < maxDepth; depth++) {
    const article = await db.get(currentId)
    if (!article?.parentArticleId) break

    const parentAccess = await getAccessLevel(db, actor, article.parentArticleId)
    if (parentAccess && (!best || hierarchy[parentAccess] > hierarchy[best])) {
      best = parentAccess
    }

    currentId = article.parentArticleId
  }

  return best
}

export async function requireArticleAccess(
  db: DatabaseReader,
  actor: Exclude<Actor, null>,
  article: Doc<'articles'>,
): Promise<void> {
  const knowledgeBase = await db.get(article.knowledgeBaseId)
  requireRecord(knowledgeBase, 'Knowledge base')

  if (isStaffActor(actor)) {
    return
  }

  if (knowledgeBase.status !== 'published') throw deny('Knowledge base not available.')
  if (article.status !== 'published') throw deny('Article not available.')

  await requireEnrollment(db, actor, knowledgeBase._id)
  await ensurePrerequisites(db, actor.userId, article)

  if (article.availableAfter && article.availableAfter > Date.now()) {
    throw deny('This article is not available yet.')
  }
}
