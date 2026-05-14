import { can, deny, loadTenantResource as loadResource, requireRecord } from '@lupinum/trellis/auth'
import { unsafe as unsafePermit } from '@lupinum/trellis/backend'

import {
  createRunbook,
  getRunbook,
  listRunbooks,
  searchRunbooks,
  updateRunbook,
} from '../../../shared/features/runbooks/contract'
import type { Doc, Id } from '../../_generated/dataModel'
import { getAppIdentity } from '../../auth/appIdentity'
import { mutation, query } from '../../functions'
import { canUpdateRunbook } from './checks'
import { bulkRemoveRunbooksOp, removeRunbookOp } from './operations'
import { runbookCreate, runbookPublish, runbookRead } from './permissions'
import { publicRunbookCapabilities, workspaceRunbookCapabilities } from './recordAccess'

function escapeIsolation<TDb extends object>(db: TDb, reason: string): TDb {
  return (db as TDb & { escapeIsolation: (options: { reason: string }) => TDb }).escapeIsolation({
    reason,
  })
}

function toPublicRunbook(runbook: {
  _id: string
  title: string
  summary: string
  content: string
  tags: string[]
  visibility: 'public' | 'workspace' | 'draft'
  publishedAt?: number
}) {
  return {
    _id: runbook._id,
    title: runbook.title,
    summary: runbook.summary,
    content: runbook.content,
    tags: runbook.tags,
    visibility: runbook.visibility,
    publishedAt: runbook.publishedAt ?? null,
  }
}

function normalizeTerm(value: string): string {
  return value.trim().toLowerCase()
}

function matchesTerm(
  runbook: {
    title: string
    summary: string
    content: string
    tags: string[]
  },
  term: string,
): boolean {
  if (!term) return true

  const haystack =
    `${runbook.title}\n${runbook.summary}\n${runbook.content}\n${runbook.tags.join(' ')}`.toLowerCase()
  return haystack.includes(term)
}

export const listPublic = query.unsafe({
  permit: unsafePermit.permit({
    kind: 'publicCatalog',
    reason: 'Expose the public runbook catalog without a workspace appIdentity.',
    scope: ['runbooks'],
  }),
  args: listRunbooks.args,
  handler: async (ctx) => {
    // Public by design, but still bounded to already-public records and a capped catalog read.
    const db = escapeIsolation(ctx.db, 'Public runbook catalog intentionally spans all workspaces.')
    const runbooks = await db
      .query('runbooks')
      .withIndex('by_visibility', (q: any) => q.eq('visibility', 'public'))
      .order('desc')
      .take(50)
    return runbooks.map(toPublicRunbook)
  },
})

export const searchPublic = query.unsafe({
  permit: unsafePermit.permit({
    kind: 'publicCatalogSearch',
    reason: 'Search the public runbook catalog across workspaces.',
    scope: ['runbooks'],
  }),
  args: searchRunbooks.args,
  handler: async (ctx, args) => {
    const term = normalizeTerm(args.term)
    // Search the same public catalog, but keep the candidate set bounded before local filtering.
    const db = escapeIsolation(ctx.db, 'Public runbook search intentionally spans all workspaces.')
    const candidates = await db
      .query('runbooks')
      .withIndex('by_visibility', (q: any) => q.eq('visibility', 'public'))
      .order('desc')
      .take(50)

    return candidates
      .filter((runbook: Doc<'runbooks'>) => matchesTerm(runbook, term))
      .map(toPublicRunbook)
  },
})

export const listWorkspace = query.protected({
  args: listRunbooks.args,
  guard: runbookRead,
  handler: async (ctx) => {
    const appIdentity = await ctx.appIdentity()
    const runbooks = await ctx.db
      .query('runbooks')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', appIdentity.workspaceId))
      .order('desc')
      .collect()

    return workspaceRunbookCapabilities.attach(appIdentity, runbooks)
  },
})

export const get = query.unsafe({
  permit: unsafePermit.permit({
    kind: 'publicRunbookRead',
    reason: 'Read public runbooks before the caller resolves to a workspace appIdentity.',
    scope: ['runbooks'],
  }),
  args: getRunbook.args,
  handler: async (ctx, args) => {
    // This query may cross-scopes, but only to read one public runbook before a workspace appIdentity is
    // available. Workspace-only records still fall back to the normal appIdentity checks below.
    const db = escapeIsolation(ctx.db, 'Reading a public runbook may cross-scope boundaries.')
    const runbook = await db.get(args.id as Id<'runbooks'>)
    if (!runbook) return null

    const appIdentity = await getAppIdentity(ctx)

    if (runbook.visibility === 'public') {
      const withCapabilities = publicRunbookCapabilities.attach(appIdentity, {
        ...toPublicRunbook(runbook),
        ownerId: runbook.ownerId,
      })

      const { ownerId: _ownerId, ...publicRunbook } = withCapabilities
      return publicRunbook
    }

    if (
      !appIdentity ||
      appIdentity.workspaceId !== runbook.workspaceId ||
      !can(appIdentity, runbookRead.check)
    ) {
      deny('Forbidden: Read runbooks')
    }

    return workspaceRunbookCapabilities.attach(
      appIdentity,
      loadResource(appIdentity, runbook, 'Runbook'),
    )
  },
})

export const getWorkspace = query.protected({
  args: getRunbook.args,
  guard: runbookRead,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const runbook = await ctx.db.get(args.id)
    if (!runbook) return null

    return workspaceRunbookCapabilities.attach(
      appIdentity,
      loadResource(appIdentity, runbook, 'Runbook'),
    )
  },
})

export const create = mutation.protected({
  args: createRunbook.args,
  identityForwardingFunctionRef: 'features/runbooks/domain:create',
  guard: runbookCreate,
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()

    const visibility = args.visibility ?? 'draft'
    if (visibility === 'public' && !can(appIdentity, runbookPublish.check)) {
      throw deny('Only owners and admins can create public runbooks.')
    }

    const now = Date.now()
    return await ctx.db.insert('runbooks', {
      title: args.title,
      summary: args.summary,
      content: args.content,
      visibility,
      tags: args.tags ?? [],
      ownerId: appIdentity.userId,
      workspaceId: appIdentity.workspaceId,
      createdAt: now,
      updatedAt: now,
      ...(visibility === 'public' ? { publishedAt: now } : {}),
    })
  },
})

export const update = mutation.protected({
  args: updateRunbook.args,
  guard: runbookRead,
  load: async (ctx, args) => {
    const runbook = await ctx.db.get(args.id)
    requireRecord(runbook, 'Runbook')
    return { runbook }
  },
  authorize: {
    check: (_actor, { runbook }) => canUpdateRunbook(runbook),
  },
  handler: async (ctx, args, { runbook }) => {
    const appIdentity = await ctx.appIdentity()
    const nextVisibility = args.visibility ?? runbook.visibility
    if (nextVisibility === 'public' && !can(appIdentity, runbookPublish.check)) {
      throw deny('Only owners and admins can publish runbooks.')
    }

    await ctx.db.patch(args.id, {
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.summary !== undefined ? { summary: args.summary } : {}),
      ...(args.content !== undefined ? { content: args.content } : {}),
      ...(args.tags !== undefined ? { tags: args.tags } : {}),
      ...(args.visibility !== undefined ? { visibility: args.visibility } : {}),
      updatedAt: Date.now(),
      ...(nextVisibility === 'public' && runbook.visibility !== 'public'
        ? { publishedAt: Date.now() }
        : {}),
    })
  },
})

export const remove = mutation.protected({
  ...removeRunbookOp,
  identityForwardingFunctionRef: 'features/runbooks/domain:remove',
})
export const bulkRemove = mutation.protected({
  ...bulkRemoveRunbooksOp,
  identityForwardingFunctionRef: 'features/runbooks/domain:bulkRemove',
})

export const workspaceOverview = query.protected({
  args: listRunbooks.args,
  guard: runbookRead,
  handler: async (ctx) => {
    const appIdentity = await ctx.appIdentity()
    const runbooks = await ctx.db
      .query('runbooks')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', appIdentity.workspaceId))
      .order('desc')
      .collect()

    return {
      total: runbooks.length,
      public: runbooks.filter((runbook) => runbook.visibility === 'public').length,
      workspaceOnly: runbooks.filter((runbook) => runbook.visibility === 'workspace').length,
      drafts: runbooks.filter((runbook) => runbook.visibility === 'draft').length,
      recentTitles: runbooks.slice(0, 5).map((runbook) => runbook.title),
    }
  },
})
