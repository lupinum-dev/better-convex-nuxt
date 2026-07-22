import { v } from 'convex/values'

import { internalMutation, internalQuery, type QueryCtx } from './_generated/server'

const actor = v.object({ issuer: v.string(), subject: v.string() })
type ReadCtx = Pick<QueryCtx, 'db'>
type Actor = { issuer: string; subject: string }

function failure(code: string) {
  return { code, ok: false as const }
}

function boundedId(value: string): boolean {
  return value.length > 0 && value.length <= 128 && /^[\w-]+$/u.test(value)
}

function normalizeTitle(value: string): string | null {
  const title = value.trim().replace(/\s+/gu, ' ')
  return title.length > 0 && title.length <= 120 ? title : null
}

async function workspaceAccess(ctx: ReadCtx, principal: Actor, workspaceId: string) {
  const workspace = await ctx.db
    .query('workspaces')
    .withIndex('by_external_id', (query) => query.eq('externalId', workspaceId))
    .unique()
  if (!workspace || workspace.deletedAt !== undefined) return failure('WORKSPACE_NOT_FOUND')
  const member = await ctx.db
    .query('members')
    .withIndex('by_issuer_subject', (query) =>
      query.eq('issuer', principal.issuer).eq('subject', principal.subject),
    )
    .unique()
  if (!member || member.status !== 'active' || member.tenantId !== workspace.tenantId) {
    return failure('ACCESS_DENIED')
  }
  return { member, ok: true as const, workspace }
}

function noteResult(note: {
  body: string
  externalId: string
  revision: number
  title: string
  workspaceExternalId: string
}) {
  return {
    body: note.body,
    id: note.externalId,
    revision: note.revision,
    title: note.title,
    uri: `note://${note.externalId}`,
    workspaceId: note.workspaceExternalId,
  }
}

export const searchNotes = internalQuery({
  args: { actor, limit: v.optional(v.number()), query: v.string(), workspaceId: v.string() },
  handler: async (ctx, args) => {
    const access = await workspaceAccess(ctx, args.actor, args.workspaceId)
    if (!access.ok) return access
    const needle = args.query.trim().toLocaleLowerCase('en-US')
    const limit = args.limit ?? 20
    if (needle.length > 200 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      return failure('INPUT_INVALID')
    }
    const notes = await ctx.db
      .query('notes')
      .withIndex('by_workspace', (query) =>
        query.eq('workspaceExternalId', access.workspace.externalId),
      )
      .collect()
    return {
      ok: true as const,
      value: notes
        .filter(
          (note) =>
            note.deletedAt === undefined &&
            (!needle ||
              note.title.toLocaleLowerCase('en-US').includes(needle) ||
              note.body.toLocaleLowerCase('en-US').includes(needle)),
        )
        .sort((left, right) => left.externalId.localeCompare(right.externalId))
        .slice(0, limit)
        .map(noteResult),
    }
  },
})

export const readNote = internalQuery({
  args: { actor, noteId: v.string() },
  handler: async (ctx, args) => {
    if (!boundedId(args.noteId)) return failure('INPUT_INVALID')
    const note = await ctx.db
      .query('notes')
      .withIndex('by_external_id', (query) => query.eq('externalId', args.noteId))
      .unique()
    if (!note || note.deletedAt !== undefined) return failure('NOTE_NOT_FOUND')
    const access = await workspaceAccess(ctx, args.actor, note.workspaceExternalId)
    if (!access.ok) return access
    return { ok: true as const, value: noteResult(note) }
  },
})

export const renameNote = internalMutation({
  args: { actor, noteId: v.string(), requestKey: v.string(), title: v.string() },
  handler: async (ctx, args) => {
    if (!boundedId(args.noteId) || !boundedId(args.requestKey)) return failure('INPUT_INVALID')
    const title = normalizeTitle(args.title)
    if (!title) return failure('INPUT_INVALID')
    const note = await ctx.db
      .query('notes')
      .withIndex('by_external_id', (query) => query.eq('externalId', args.noteId))
      .unique()
    if (!note || note.deletedAt !== undefined) return failure('NOTE_NOT_FOUND')
    const access = await workspaceAccess(ctx, args.actor, note.workspaceExternalId)
    if (!access.ok) return access
    if (access.member.role !== 'owner' && access.member.role !== 'editor') {
      return failure('ACCESS_DENIED')
    }

    const existing = await ctx.db
      .query('renameReceipts')
      .withIndex('by_tenant_request', (query) =>
        query.eq('tenantId', access.workspace.tenantId).eq('requestKey', args.requestKey),
      )
      .unique()
    if (existing) {
      if (
        existing.issuer !== args.actor.issuer ||
        existing.subject !== args.actor.subject ||
        existing.noteId !== args.noteId ||
        existing.title !== title
      ) {
        return failure('IDEMPOTENCY_CONFLICT')
      }
      return {
        ok: true as const,
        value: {
          changed: existing.changed,
          noteId: existing.noteId,
          previousTitle: existing.previousTitle,
          requestKey: existing.requestKey,
          revision: existing.revision,
          title: existing.title,
        },
      }
    }

    const previousTitle = note.title
    const changed = previousTitle !== title
    const revision = changed ? note.revision + 1 : note.revision
    if (changed) await ctx.db.patch(note._id, { revision, title })
    await ctx.db.insert('renameReceipts', {
      changed,
      issuer: args.actor.issuer,
      noteId: args.noteId,
      previousTitle,
      requestKey: args.requestKey,
      revision,
      subject: args.actor.subject,
      tenantId: access.workspace.tenantId,
      title,
    })
    return {
      ok: true as const,
      value: {
        changed,
        noteId: args.noteId,
        previousTitle,
        requestKey: args.requestKey,
        revision,
        title,
      },
    }
  },
})

export const reportSnapshot = internalQuery({
  args: { actor, workspaceId: v.string() },
  handler: async (ctx, args) => {
    const access = await workspaceAccess(ctx, args.actor, args.workspaceId)
    if (!access.ok) return access
    const notes = await ctx.db
      .query('notes')
      .withIndex('by_workspace', (query) => query.eq('workspaceExternalId', args.workspaceId))
      .collect()
    const titles = notes
      .filter((note) => note.deletedAt === undefined)
      .sort((left, right) => left.externalId.localeCompare(right.externalId))
      .map((note) => note.title)
    return {
      ok: true as const,
      value: {
        noteCount: titles.length,
        reportId: `${access.workspace.externalId}-r${access.workspace.revision}`,
        titles,
        workspaceId: access.workspace.externalId,
        workspaceRevision: access.workspace.revision,
      },
    }
  },
})

export const deleteWorkspace = internalMutation({
  args: { actor, expectedRevision: v.number(), workspaceId: v.string() },
  handler: async (ctx, args) => {
    const access = await workspaceAccess(ctx, args.actor, args.workspaceId)
    if (!access.ok) return access
    if (access.member.role !== 'owner') return failure('ACCESS_DENIED')
    if (access.workspace.revision !== args.expectedRevision) return failure('WORKSPACE_STALE')

    const deletedAt = Date.now()
    const notes = await ctx.db
      .query('notes')
      .withIndex('by_workspace', (query) => query.eq('workspaceExternalId', args.workspaceId))
      .collect()
    let deletedNoteCount = 0
    for (const note of notes) {
      if (note.deletedAt === undefined) {
        await ctx.db.patch(note._id, { deletedAt })
        deletedNoteCount += 1
      }
    }
    const revision = access.workspace.revision + 1
    await ctx.db.patch(access.workspace._id, { deletedAt, revision })
    return {
      ok: true as const,
      value: { deletedAt, deletedNoteCount, revision, workspaceId: access.workspace.externalId },
    }
  },
})
