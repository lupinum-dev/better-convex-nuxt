import { withTrustedCaller, can, deny, authorize } from 'better-convex-nuxt/auth'
import { mutation, query } from './_generated/server'

import {
  bulkDeleteRunbooks,
  createRunbook,
  deleteRunbook,
  getRunbook,
  listRunbooks,
  searchRunbooks,
  updateRunbook,
} from '../shared/schemas/runbook'
import { getActor } from './auth/actor'
import {
  canCreateRunbook,
  canDeleteRunbook,
  canPublishRunbook,
  canReadWorkspaceRunbook,
  canUpdateRunbook,
} from './auth/checks'
import { withCan } from './auth/resource'
import { loadResource } from './auth/scope'

function normalizeTerm(value: string): string {
  return value.trim().toLowerCase()
}

function matchesTerm(runbook: {
  title: string
  summary: string
  content: string
  tags: string[]
}, term: string): boolean {
  if (!term) return true

  const haystack = `${runbook.title}\n${runbook.summary}\n${runbook.content}\n${runbook.tags.join(' ')}`
    .toLowerCase()
  return haystack.includes(term)
}

export const listPublic = query({
  args: listRunbooks.args,
  handler: async (ctx) => {
    return await ctx.db
      .query('runbooks')
      .withIndex('by_visibility', q => q.eq('visibility', 'public'))
      .order('desc')
      .collect()
  },
})

export const searchPublic = query({
  args: searchRunbooks.args,
  handler: async (ctx, args) => {
    const term = normalizeTerm(args.term)
    const candidates = await ctx.db
      .query('runbooks')
      .withIndex('by_visibility', q => q.eq('visibility', 'public'))
      .order('desc')
      .take(50)

    return candidates.filter(runbook => matchesTerm(runbook, term))
  },
})

export const listWorkspace = query({
  args: withTrustedCaller(listRunbooks.args),
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    authorize(actor, 'Read runbooks', canReadWorkspaceRunbook)

    const runbooks = await ctx.db
      .query('runbooks')
      .withIndex('by_workspace', q => q.eq('workspaceId', actor.tenantId))
      .order('desc')
      .collect()

    return runbooks.map(runbook => withCan(runbook, {
      update: can(actor, canUpdateRunbook(runbook)),
      delete: can(actor, canDeleteRunbook(runbook)),
      publish: can(actor, canPublishRunbook),
    }))
  },
})

export const get = query({
  args: withTrustedCaller(getRunbook.args),
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    const runbook = await ctx.db.get(args.id)
    if (!runbook) return null

    if (runbook.visibility === 'public') {
      return withCan(runbook, {
        update: !!actor && actor.tenantId === runbook.workspaceId && can(actor, canUpdateRunbook(runbook)),
        delete: !!actor && actor.tenantId === runbook.workspaceId && can(actor, canDeleteRunbook(runbook)),
        publish: !!actor && actor.tenantId === runbook.workspaceId && can(actor, canPublishRunbook),
      })
    }

    authorize(actor, 'Read runbooks', canReadWorkspaceRunbook)
    loadResource(actor, runbook, 'Runbook')

    return withCan(runbook, {
      update: can(actor, canUpdateRunbook(runbook)),
      delete: can(actor, canDeleteRunbook(runbook)),
      publish: can(actor, canPublishRunbook),
    })
  },
})

export const create = mutation({
  args: withTrustedCaller(createRunbook.args),
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    authorize(actor, 'Create runbook', canCreateRunbook)

    const visibility = args.visibility ?? 'draft'
    if (visibility === 'public' && !can(actor, canPublishRunbook)) {
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
  args: withTrustedCaller(updateRunbook.args),
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    const runbook = loadResource(actor, await ctx.db.get(args.id), 'Runbook')
    authorize(actor, 'Update runbook', canUpdateRunbook(runbook))

    const nextVisibility = args.visibility ?? runbook.visibility
    if (nextVisibility === 'public' && !can(actor, canPublishRunbook)) {
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

export const remove = mutation({
  args: withTrustedCaller(deleteRunbook.args),
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    const runbook = loadResource(actor, await ctx.db.get(args.id), 'Runbook')
    authorize(actor, 'Delete runbook', canDeleteRunbook(runbook))
    await ctx.db.delete(args.id)
  },
})

export const bulkRemove = mutation({
  args: withTrustedCaller(bulkDeleteRunbooks.args),
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    authorize(actor, 'Bulk delete runbooks', canPublishRunbook)

    let deleted = 0
    const skipped: { id: string, reason: string }[] = []

    for (const id of args.ids) {
      const runbook = await ctx.db.get(id)
      if (!runbook) {
        skipped.push({ id, reason: 'not_found' })
        continue
      }
      if (runbook.workspaceId !== actor.tenantId) {
        skipped.push({ id, reason: 'different_workspace' })
        continue
      }
      if (!can(actor, canDeleteRunbook(runbook))) {
        skipped.push({ id, reason: 'forbidden' })
        continue
      }

      await ctx.db.delete(id)
      deleted++
    }

    return {
      deleted,
      skipped,
      total: args.ids.length,
    }
  },
})

export const workspaceOverview = query({
  args: withTrustedCaller(listRunbooks.args),
  handler: async (ctx, args) => {
    const actor = await getActor(ctx, args)
    authorize(actor, 'Read runbook overview', canReadWorkspaceRunbook)

    const runbooks = await ctx.db
      .query('runbooks')
      .withIndex('by_workspace', q => q.eq('workspaceId', actor.tenantId))
      .order('desc')
      .collect()

    return {
      total: runbooks.length,
      public: runbooks.filter(runbook => runbook.visibility === 'public').length,
      workspaceOnly: runbooks.filter(runbook => runbook.visibility === 'workspace').length,
      drafts: runbooks.filter(runbook => runbook.visibility === 'draft').length,
      recentTitles: runbooks.slice(0, 5).map(runbook => runbook.title),
    }
  },
})
