import type { ConvexToolHandlerCtx } from '#trellis/mcp'

export function toHarnessMcpCaller(ctx: Pick<ConvexToolHandlerCtx, 'appIdentity'>) {
  if (!ctx.appIdentity) {
    return { kind: 'anonymous' as const }
  }

  return {
    kind: 'agent' as const,
    agentId: ctx.appIdentity.userId,
    userId: ctx.appIdentity.userId,
    subject: `agent:${ctx.appIdentity.userId}` as const,
    provider: 'mcp' as const,
    role: ctx.appIdentity.role,
    ...(ctx.appIdentity.workspaceId ? { workspaceId: ctx.appIdentity.workspaceId } : {}),
  }
}
