import { can, deny, loadTenantResource as loadResource, requireRecord } from '@lupinum/trellis/auth'

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
import { publicRunbookCapabilities, workspaceRunbookCapabilities } from './auth/capabilities'
import {
  canCreateRunbook,
  canDeleteRunbook,
  canPublishRunbook,
  canReadWorkspaceRunbook,
  canUpdateRunbook,
} from './auth/checks'
import { mutation, query, raw } from './functions'

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
    const runbooks = await ctx.db
      .query('runbooks')
      .withIndex('by_visibility', (q) => q.eq('visibility', 'public'))
      .order('desc')
      .collect()
    return runbooks.map(toPublicRunbook)
  },
})

export const searchPublic = raw.query({
  args: searchRunbooks.args,
  handler: async (ctx, args) => {
    const term = normalizeTerm(args.term)
    const candidates = await ctx.db
      .query('runbooks')
      .withIndex('by_visibility', (q) => q.eq('visibility', 'public'))
      .order('desc')
      .take(50)

    return candidates.filter((runbook) => matchesTerm(runbook, term)).map(toPublicRunbook)
  },
})

export const listWorkspace = query({
  args: listRunbooks.args,
  guard: canReadWorkspaceRunbook,
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
    const runbook = await ctx.db.get(args.id)
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

    if (!actor || actor.tenantId !== runbook.workspaceId || !can(actor, canReadWorkspaceRunbook)) {
      deny('Forbidden: Read runbooks')
    }

    return workspaceRunbookCapabilities.attach(actor, loadResource(actor, runbook, 'Runbook'))
  },
})

export const getWorkspace = query({
  args: getRunbook.args,
  guard: canReadWorkspaceRunbook,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const runbook = await ctx.db.get(args.id)
    if (!runbook) return null

    return workspaceRunbookCapabilities.attach(actor, loadResource(actor, runbook, 'Runbook'))
  },
})

export const create = mutation({
  args: createRunbook.args,
  guard: canCreateRunbook,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()

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
  args: updateRunbook.args,
  guard: canReadWorkspaceRunbook,
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
  args: deleteRunbook.args,
  guard: canReadWorkspaceRunbook,
  load: async (ctx, args) => {
    const runbook = await ctx.db.get(args.id)
    requireRecord(runbook, 'Runbook')
    return { runbook }
  },
  authorize: {
    check: (_actor, { runbook }) => canDeleteRunbook(runbook),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id)
  },
})

export const previewRemove = query({
  args: deleteRunbook.args,
  guard: canReadWorkspaceRunbook,
  load: async (ctx, args) => {
    const runbook = await ctx.db.get(args.id)
    requireRecord(runbook, 'Runbook')
    return { runbook }
  },
  authorize: {
    check: (_actor, { runbook }) => canDeleteRunbook(runbook),
  },
  handler: async (_ctx, _args, { runbook }) => ({
    summary: `Will permanently delete "${runbook.title}".`,
    warn: 'This cannot be undone.',
    affects: { runbooks: 1 },
  }),
})

export const bulkRemove = mutation({
  args: bulkDeleteRunbooks.args,
  guard: canPublishRunbook,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()

    let deleted = 0
    const skipped: { id: string; reason: string }[] = []

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

export const previewBulkRemove = query({
  args: bulkDeleteRunbooks.args,
  guard: canPublishRunbook,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const runbooks = await Promise.all(args.ids.map((id) => ctx.db.get(id)))
    const found = runbooks.filter(
      (runbook): runbook is NonNullable<(typeof runbooks)[number]> =>
        !!runbook &&
        runbook.workspaceId === actor.tenantId &&
        can(actor, canDeleteRunbook(runbook)),
    )

    if (found.length === 0) {
      return {
        summary: 'None of the selected runbooks can be deleted.',
        blocked: true,
      }
    }

    return {
      summary: `Will delete ${found.length} runbook${found.length === 1 ? '' : 's'}: ${found.map((runbook) => `"${runbook.title}"`).join(', ')}`,
      warn:
        found.length !== args.ids.length ? 'Some ids were missing and will be skipped.' : undefined,
      affects: { runbooks: found.length },
    }
  },
})

export const workspaceOverview = query({
  args: listRunbooks.args,
  guard: canReadWorkspaceRunbook,
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
