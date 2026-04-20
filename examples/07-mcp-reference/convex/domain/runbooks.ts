import { can, deny, loadTenantResource as loadResource, requireRecord } from '@lupinum/trellis/auth'

import {
  createRunbook,
  getRunbook,
  listRunbooks,
  searchRunbooks,
  updateRunbook,
} from './runbook.contract'
import type { Doc, Id } from '../_generated/dataModel'
import { getActor } from '../auth/actor'
import { publicRunbookCapabilities, workspaceRunbookCapabilities } from '../auth/capabilities'
import { canUpdateRunbook } from '../auth/checks'
import { runbookCreate, runbookPublish, runbookRead } from '../auth/permissions'
import { mutation, query, raw } from '../functions'
import { bulkRemoveRunbooksOp, removeRunbookOp } from '../operations/runbooks'

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

export const listPublic = raw.query({
  args: listRunbooks.args,
  handler: async (ctx) => {
    const db = ctx.db as typeof ctx.db & { crossTenant: typeof ctx.db }
    const runbooks = await db.crossTenant
      .query('runbooks')
      .withIndex('by_visibility', (q: any) => q.eq('visibility', 'public'))
      .order('desc')
      .collect()
    return runbooks.map(toPublicRunbook)
  },
})

export const searchPublic = raw.query({
  args: searchRunbooks.args,
  handler: async (ctx, args) => {
    const term = normalizeTerm(args.term)
    const db = ctx.db as typeof ctx.db & { crossTenant: typeof ctx.db }
    const candidates = await db.crossTenant
      .query('runbooks')
      .withIndex('by_visibility', (q: any) => q.eq('visibility', 'public'))
      .order('desc')
      .take(50)

    return candidates
      .filter((runbook: Doc<'runbooks'>) => matchesTerm(runbook, term))
      .map(toPublicRunbook)
  },
})

export const listWorkspace = query({
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

export const get = raw.query({
  args: getRunbook.args,
  handler: async (ctx, args) => {
    const db = ctx.db as typeof ctx.db & { crossTenant: typeof ctx.db }
    const runbook = await db.crossTenant.get(args.id as Id<'runbooks'>)
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

export const getWorkspace = query({
  args: getRunbook.args,
  guard: runbookRead,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const runbook = await ctx.db.get(args.id)
    if (!runbook) return null

    return workspaceRunbookCapabilities.attach(actor, loadResource(actor, runbook, 'Runbook'))
  },
})

export const create = mutation({
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

export const update = mutation({
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

export const remove = mutation(removeRunbookOp)
export const bulkRemove = mutation(bulkRemoveRunbooksOp)

export const workspaceOverview = query({
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
