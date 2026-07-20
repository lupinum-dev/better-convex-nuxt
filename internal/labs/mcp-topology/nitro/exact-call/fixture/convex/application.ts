import { v } from 'convex/values'

import { internalMutation, internalQuery, type QueryCtx } from './_generated/server'

const actor = v.object({ issuer: v.string(), subject: v.string() })
type ReadCtx = Pick<QueryCtx, 'db'>
type Actor = { issuer: string; subject: string }

function failure(code: string) {
  return { code, ok: false as const }
}

function renameResult(receipt: {
  noteId: string
  requestKey: string
  revision: number
  title: string
}) {
  return {
    noteId: receipt.noteId,
    requestKey: receipt.requestKey,
    revision: receipt.revision,
    title: receipt.title,
  }
}

function reportResult(receipt: {
  noteCount: number
  reportId: string
  requestKey: string
  workspaceId: string
}) {
  return {
    noteCount: receipt.noteCount,
    reportId: receipt.reportId,
    requestKey: receipt.requestKey,
    workspaceId: receipt.workspaceId,
  }
}

async function workspaceAccess(ctx: ReadCtx, principal: Actor, workspaceId: string) {
  const workspace = await ctx.db
    .query('workspaces')
    .withIndex('by_external_id', (query) => query.eq('externalId', workspaceId))
    .unique()
  if (!workspace) return failure('WORKSPACE_NOT_FOUND')
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

export const searchNotes = internalQuery({
  args: { actor, query: v.string(), workspaceId: v.string() },
  handler: async (ctx, args) => {
    const access = await workspaceAccess(ctx, args.actor, args.workspaceId)
    if (!access.ok) return access
    const needle = args.query.trim().toLocaleLowerCase('en-US')
    const notes = await ctx.db
      .query('notes')
      .withIndex('by_workspace', (query) =>
        query.eq('workspaceExternalId', access.workspace.externalId),
      )
      .collect()
    return {
      ok: true as const,
      value: notes
        .filter((note) => note.title.toLocaleLowerCase('en-US').includes(needle))
        .sort((left, right) => left.externalId.localeCompare(right.externalId))
        .map((note) => ({ id: note.externalId, revision: note.revision, title: note.title })),
    }
  },
})

export const renameNote = internalMutation({
  args: { actor, noteId: v.string(), requestKey: v.string(), title: v.string() },
  handler: async (ctx, args) => {
    const note = await ctx.db
      .query('notes')
      .withIndex('by_external_id', (query) => query.eq('externalId', args.noteId))
      .unique()
    if (!note) return failure('NOTE_NOT_FOUND')
    const access = await workspaceAccess(ctx, args.actor, note.workspaceExternalId)
    if (!access.ok) return access
    if (access.member.role !== 'owner' && access.member.role !== 'editor') {
      return failure('ACCESS_DENIED')
    }

    // Application-owned idempotency: the request key and effect commit in the
    // same Convex mutation. Replaying a service proof cannot repeat the write.
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
        existing.title !== args.title
      ) {
        return failure('IDEMPOTENCY_CONFLICT')
      }
      return { ok: true as const, value: renameResult(existing) }
    }

    const revision = note.title === args.title ? note.revision : note.revision + 1
    if (revision !== note.revision) await ctx.db.patch(note._id, { revision, title: args.title })
    const receiptId = await ctx.db.insert('renameReceipts', {
      issuer: args.actor.issuer,
      noteId: args.noteId,
      requestKey: args.requestKey,
      revision,
      subject: args.actor.subject,
      tenantId: access.workspace.tenantId,
      title: args.title,
    })
    const receipt = await ctx.db.get(receiptId)
    if (!receipt) throw new Error('RENAME_RECEIPT_MISSING')
    return { ok: true as const, value: renameResult(receipt) }
  },
})

export const createReportReceipt = internalMutation({
  args: { actor, requestKey: v.string(), workspaceId: v.string() },
  handler: async (ctx, args) => {
    const access = await workspaceAccess(ctx, args.actor, args.workspaceId)
    if (!access.ok) return access

    // This neutral action has no external side effect. Its canonical report
    // receipt is claimed and created transactionally, so retries return the
    // same application result. A real external API would need its own key.
    const existing = await ctx.db
      .query('reportReceipts')
      .withIndex('by_tenant_request', (query) =>
        query.eq('tenantId', access.workspace.tenantId).eq('requestKey', args.requestKey),
      )
      .unique()
    if (existing) {
      if (
        existing.issuer !== args.actor.issuer ||
        existing.subject !== args.actor.subject ||
        existing.workspaceId !== args.workspaceId
      ) {
        return failure('IDEMPOTENCY_CONFLICT')
      }
      return { ok: true as const, value: reportResult(existing) }
    }

    const notes = await ctx.db
      .query('notes')
      .withIndex('by_workspace', (query) => query.eq('workspaceExternalId', args.workspaceId))
      .collect()
    const reportId = `${args.workspaceId}:${args.requestKey}`
    const receiptId = await ctx.db.insert('reportReceipts', {
      issuer: args.actor.issuer,
      noteCount: notes.length,
      reportId,
      requestKey: args.requestKey,
      subject: args.actor.subject,
      tenantId: access.workspace.tenantId,
      workspaceId: args.workspaceId,
    })
    const receipt = await ctx.db.get(receiptId)
    if (!receipt) throw new Error('REPORT_RECEIPT_MISSING')
    return { ok: true as const, value: reportResult(receipt) }
  },
})
