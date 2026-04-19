import type { ConvexToolHandlerCtx } from '#trellis/mcp'

export function toHarnessMcpPrincipal(ctx: Pick<ConvexToolHandlerCtx, 'actor'>) {
  if (!ctx.actor) {
    return { kind: 'anonymous' as const }
  }

  return {
    kind: 'agent' as const,
    agentId: ctx.actor.userId,
    subject: `agent:${ctx.actor.userId}` as const,
    provider: 'mcp' as const,
    role: ctx.actor.role,
    ...(ctx.actor.tenantId ? { tenantId: ctx.actor.tenantId } : {}),
  }
}
