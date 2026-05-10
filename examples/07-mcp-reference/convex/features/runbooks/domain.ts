import { can, deny, loadTenantResource as loadResource, requireRecord } from '@lupinum/trellis/auth'

import {
  createRunbook,
  getRunbook,
  listRunbooks,
  searchRunbooks,
  updateRunbook,
} from '../../../shared/features/runbooks/contract'
import type { Doc, Id } from '../../_generated/dataModel'
import { getActor } from '../../auth/actor'
import { mutation, query } from '../../functions'
import { publicRunbookCapabilities, workspaceRunbookCapabilities } from './capabilities'
import { canUpdateRunbook } from './checks'
import { bulkRemoveRunbooksOp, removeRunbookOp } from './operations'
import { runbookCreate, runbookPublish, runbookRead } from './permissions'

function escapeTenantIsolation<TDb extends object>(db: TDb, reason: string): TDb {
  return (
    db as TDb & { escapeTenantIsolation: (options: { reason: string }) => TDb }
  ).escapeTenantIsolation({
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
  bypass: 'Expose the public runbook catalog without a workspace actor.',
  args: listRunbooks.args,
  handler: async (ctx) => {
    // Public by design, but still bounded to already-public records and a capped catalog read.
    const db = escapeTenantIsolation(
      ctx.db,
      'Public runbook catalog intentionally spans all workspaces.',
    )
    const runbooks = await db
      .query('runbooks')
      .withIndex('by_visibility', (q: any) => q.eq('visibility', 'public'))
      .order('desc')
      .take(50)
    return runbooks.map(toPublicRunbook)
  },
})

export const searchPublic = query.unsafe({
  bypass: 'Search the public runbook catalog across workspaces.',
  args: searchRunbooks.args,
  handler: async (ctx, args) => {
    const term = normalizeTerm(args.term)
    // Search the same public catalog, but keep the candidate set bounded before local filtering.
    const db = escapeTenantIsolation(
      ctx.db,
      'Public runbook search intentionally spans all workspaces.',
    )
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
    const actor = await ctx.actor()
    const runbooks = await ctx.db
      .query('runbooks')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
      .order('desc')
      .collect()

    return workspaceRunbookCapabilities.attach(actor, runbooks)
  },
})

export const get = query.unsafe({
  bypass: 'Read public runbooks before the caller resolves to a workspace actor.',
  args: getRunbook.args,
  handler: async (ctx, args) => {
    // This query may cross tenants, but only to read one public runbook before a workspace actor is
    // available. Workspace-only records still fall back to the normal actor checks below.
    const db = escapeTenantIsolation(
      ctx.db,
      'Reading a public runbook may cross tenant boundaries.',
    )
    const runbook = await db.get(args.id as Id<'runbooks'>)
    if (!runbook) return null

    const actor = await getActor(ctx)

    if (runbook.visibility === 'public') {
      const withCapabilities = publicRunbookCapabilities.attach(actor, {
        ...toPublicRunbook(runbook),
        ownerId: runbook.ownerId,
      })

      const { ownerId: _ownerId, ...publicRunbook } = withCapabilities
      return publicRunbook
    }

    if (!actor || actor.tenantId !== runbook.workspaceId || !can(actor, runbookRead.check)) {
      deny('Forbidden: Read runbooks')
    }

    return workspaceRunbookCapabilities.attach(actor, loadResource(actor, runbook, 'Runbook'))
  },
})

export const getWorkspace = query.protected({
  args: getRunbook.args,
  guard: runbookRead,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const runbook = await ctx.db.get(args.id)
    if (!runbook) return null

    return workspaceRunbookCapabilities.attach(actor, loadResource(actor, runbook, 'Runbook'))
  },
})

export const create = mutation.protected({
  args: createRunbook.args,
  guard: runbookCreate,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()

    const visibility = args.visibility ?? 'draft'
    if (visibility === 'public' && !can(actor, runbookPublish.check)) {
      throw deny('Only owners and admins can create public runbooks.')
    }

    const now = Date.now()
    return await ctx.db.insert('runbooks', {
      title: args.title,
      summary: args.summary,
      content: args.content,
      visibility,
      tags: args.tags ?? [],
      ownerId: actor.userId,
      workspaceId: actor.tenantId,
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
    const actor = await ctx.actor()
    const nextVisibility = args.visibility ?? runbook.visibility
    if (nextVisibility === 'public' && !can(actor, runbookPublish.check)) {
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

export const remove = mutation.protected(removeRunbookOp)
export const bulkRemove = mutation.protected(bulkRemoveRunbooksOp)

export const workspaceOverview = query.protected({
  args: listRunbooks.args,
  guard: runbookRead,
  handler: async (ctx) => {
    const actor = await ctx.actor()
    const runbooks = await ctx.db
      .query('runbooks')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
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
