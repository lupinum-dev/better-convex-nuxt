import { v } from 'convex/values'

import { internalMutation, internalQuery, type QueryCtx } from './_generated/server'

const MAX_ID_LENGTH = 128
const MAX_NOTE_TITLE_LENGTH = 120
const MAX_SEARCH_QUERY_LENGTH = 200
const MAX_SEARCH_RESULTS = 50

const principal = v.object({ subject: v.string() })

type ApplicationErrorCode =
  | 'ACCESS_DENIED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INPUT_INVALID'
  | 'NOTE_NOT_FOUND'
  | 'WORKSPACE_NOT_FOUND'
  | 'WORKSPACE_STALE'

type ReadCtx = Pick<QueryCtx, 'db'>

function failure(code: ApplicationErrorCode) {
  return { code, ok: false as const }
}

function boundedId(value: string): string | null {
  return value && value.length <= MAX_ID_LENGTH && /^[\w-]+$/.test(value) ? value : null
}

function normalizeTitle(value: string): string | null {
  const title = value.trim().replace(/\s+/g, ' ')
  return title && title.length <= MAX_NOTE_TITLE_LENGTH ? title : null
}

async function workspaceAccess(ctx: ReadCtx, subject: string, externalId: string) {
  const id = boundedId(externalId)
  if (!id) return failure('INPUT_INVALID')
  const workspace = await ctx.db
    .query('workspaces')
    .withIndex('by_external_id', (query) => query.eq('externalId', id))
    .unique()
  if (!workspace || workspace.deletedAt !== undefined) return failure('WORKSPACE_NOT_FOUND')
  const member = await ctx.db
    .query('members')
    .withIndex('by_subject_tenant', (query) =>
      query.eq('subject', subject).eq('tenantId', workspace.tenantId),
    )
    .unique()
  if (!member || member.status !== 'active') return failure('ACCESS_DENIED')
  return { member, ok: true as const, workspace }
}

async function noteAccess(ctx: ReadCtx, subject: string, externalId: string) {
  const id = boundedId(externalId)
  if (!id) return failure('INPUT_INVALID')
  const note = await ctx.db
    .query('notes')
    .withIndex('by_external_id', (query) => query.eq('externalId', id))
    .unique()
  if (!note || note.deletedAt !== undefined) return failure('NOTE_NOT_FOUND')
  const access = await workspaceAccess(ctx, subject, note.workspaceExternalId)
  if (!access.ok) return access
  return { ...access, note }
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
  args: {
    limit: v.optional(v.number()),
    principal,
    query: v.string(),
    workspaceId: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await workspaceAccess(ctx, args.principal.subject, args.workspaceId)
    if (!access.ok) return access
    const query = args.query.trim().toLocaleLowerCase('en-US')
    const limit = args.limit ?? 20
    if (
      query.length > MAX_SEARCH_QUERY_LENGTH ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > MAX_SEARCH_RESULTS
    ) {
      return failure('INPUT_INVALID')
    }
    const notes = await ctx.db
      .query('notes')
      .withIndex('by_workspace', (builder) =>
        builder.eq('workspaceExternalId', access.workspace.externalId),
      )
      .collect()
    const matches = notes
      .filter(
        (note) =>
          note.deletedAt === undefined &&
          (!query ||
            note.title.toLocaleLowerCase('en-US').includes(query) ||
            note.body.toLocaleLowerCase('en-US').includes(query)),
      )
      .sort((left, right) => left.externalId.localeCompare(right.externalId))
      .slice(0, limit)
      .map(noteResult)
    return { ok: true as const, value: { matches } }
  },
})

export const readNoteResource = internalQuery({
  args: { principal, uri: v.string() },
  handler: async (ctx, args) => {
    const match = /^note:\/\/([\w-]{1,128})$/.exec(args.uri)
    if (!match?.[1]) return failure('INPUT_INVALID')
    const access = await noteAccess(ctx, args.principal.subject, match[1])
    if (!access.ok) return access
    const value = noteResult(access.note)
    return {
      ok: true as const,
      value: {
        mimeType: 'application/json' as const,
        text: JSON.stringify(value),
        uri: value.uri,
      },
    }
  },
})

export const generateReport = internalQuery({
  args: { principal, workspaceId: v.string() },
  handler: async (ctx, args) => {
    const access = await workspaceAccess(ctx, args.principal.subject, args.workspaceId)
    if (!access.ok) return access
    const notes = await ctx.db
      .query('notes')
      .withIndex('by_workspace', (query) =>
        query.eq('workspaceExternalId', access.workspace.externalId),
      )
      .collect()
    const titles = notes
      .filter((note) => note.deletedAt === undefined)
      .sort((left, right) => left.externalId.localeCompare(right.externalId))
      .map((note) => note.title)
    return {
      ok: true as const,
      value: {
        generatedAt: Date.now(),
        noteCount: titles.length,
        reportId: `${access.workspace.externalId}-r${access.workspace.revision}`,
        titles,
        workspaceId: access.workspace.externalId,
        workspaceRevision: access.workspace.revision,
      },
    }
  },
})

export const renameNote = internalMutation({
  args: {
    noteId: v.string(),
    principal,
    requestKey: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await noteAccess(ctx, args.principal.subject, args.noteId)
    if (!access.ok) return access
    const requestKey = boundedId(args.requestKey)
    const title = normalizeTitle(args.title)
    if (!requestKey || !title) return failure('INPUT_INVALID')
    const existing = await ctx.db
      .query('renameReceipts')
      .withIndex('by_tenant_request', (query) =>
        query.eq('tenantId', access.workspace.tenantId).eq('requestKey', requestKey),
      )
      .unique()
    if (existing) {
      if (
        existing.subject !== args.principal.subject ||
        existing.noteId !== access.note.externalId ||
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

    const previousTitle = access.note.title
    const changed = previousTitle !== title
    const revision = changed ? access.note.revision + 1 : access.note.revision
    if (changed) await ctx.db.patch(access.note._id, { revision, title })
    await ctx.db.insert('renameReceipts', {
      changed,
      noteId: access.note.externalId,
      previousTitle,
      requestKey,
      revision,
      subject: args.principal.subject,
      tenantId: access.workspace.tenantId,
      title,
    })
    return {
      ok: true as const,
      value: {
        changed,
        noteId: access.note.externalId,
        previousTitle,
        requestKey,
        revision,
        title,
      },
    }
  },
})

export const deleteWorkspace = internalMutation({
  args: {
    expectedRevision: v.number(),
    principal,
    workspaceId: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await workspaceAccess(ctx, args.principal.subject, args.workspaceId)
    if (!access.ok) return access
    if (access.member.role !== 'owner') return failure('ACCESS_DENIED')
    if (!Number.isInteger(args.expectedRevision) || args.expectedRevision < 1) {
      return failure('INPUT_INVALID')
    }
    if (access.workspace.revision !== args.expectedRevision) return failure('WORKSPACE_STALE')

    const deletedAt = Date.now()
    const notes = await ctx.db
      .query('notes')
      .withIndex('by_workspace', (query) =>
        query.eq('workspaceExternalId', access.workspace.externalId),
      )
      .collect()
    let deletedNoteCount = 0
    for (const note of notes) {
      if (note.deletedAt !== undefined) continue
      await ctx.db.patch(note._id, { deletedAt })
      deletedNoteCount += 1
    }
    const revision = access.workspace.revision + 1
    await ctx.db.patch(access.workspace._id, { deletedAt, revision })
    return {
      ok: true as const,
      value: {
        deletedAt,
        deletedNoteCount,
        revision,
        workspaceId: access.workspace.externalId,
      },
    }
  },
})
