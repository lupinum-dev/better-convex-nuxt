import type { MutationCtx } from '../_generated/server'
import type { Actor } from '../auth/actor'
import type { KanbanPrincipal } from '../auth/principal'

export async function writeAuditEvent(
  ctx: MutationCtx,
  {
    principal,
    actor,
    action,
    summary,
    workspaceId,
    boardId,
    columnId,
    cardId,
    metadata,
  }: {
    principal: KanbanPrincipal
    actor: Actor | null
    action: string
    summary: string
    workspaceId?: Actor['tenantId']
    boardId?: string
    columnId?: string
    cardId?: string
    metadata?: Record<string, unknown>
  },
) {
  await ctx.db.insert('auditEvents', {
    workspaceId,
    actorId: actor?.userId ?? (principal.kind === 'anonymous' ? undefined : principal.userId),
    origin: principal.kind === 'agent' ? 'agent' : principal.kind === 'user' ? 'user' : 'system',
    action,
    summary,
    ...(boardId ? { boardId: boardId as never } : {}),
    ...(columnId ? { columnId: columnId as never } : {}),
    ...(cardId ? { cardId: cardId as never } : {}),
    ...(metadata ? { metadata: JSON.stringify(metadata) } : {}),
    createdAt: Date.now(),
  })
}
