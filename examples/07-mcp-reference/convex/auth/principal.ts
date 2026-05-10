import { getAuth } from '@lupinum/trellis/auth'
import { definePrincipal } from '@lupinum/trellis/backend'
import { getForwardedPrincipal } from '@lupinum/trellis/trusted-forwarding'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'
import { v } from 'convex/values'

import type { DataModel } from '../_generated/dataModel'

type PrincipalCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export type Role = 'owner' | 'admin' | 'member' | 'viewer'

export type McpReferencePrincipal =
  | { kind: 'anonymous'; subject: 'system:anonymous' }
  | { kind: 'user'; userId: string; subject: `user:${string}` }
  | { kind: 'agent'; agentId: string; subject: `agent:${string}`; provider: 'mcp' }
  | { kind: 'service'; serviceId: string; subject: `service:${string}` }

export const mcpReferencePrincipalValidator = v.union(
  v.object({
    kind: v.literal('anonymous'),
    subject: v.literal('system:anonymous'),
  }),
  v.object({
    kind: v.literal('user'),
    userId: v.string(),
    subject: v.string(),
  }),
  v.object({
    kind: v.literal('agent'),
    agentId: v.string(),
    subject: v.string(),
    provider: v.literal('mcp'),
  }),
  v.object({
    kind: v.literal('service'),
    serviceId: v.string(),
    subject: v.string(),
  }),
)

export const principal = definePrincipal<PrincipalCtx, McpReferencePrincipal>({
  validator: mcpReferencePrincipalValidator,
  resolve: async (ctx, args): Promise<McpReferencePrincipal> => {
    // Trusted forwarding wins first. Browser auth only runs when no trusted
    // server-side principal was forwarded into the handler.
    const forwarded = getForwardedPrincipal<McpReferencePrincipal>(ctx, args)
    if (forwarded) return forwarded

    const auth = await getAuth(ctx)
    if (!auth) {
      return { kind: 'anonymous', subject: 'system:anonymous' }
    }

    // Browser requests resolve to a plain user principal with a canonical subject.
    return {
      kind: 'user',
      userId: auth.subject,
      subject: `user:${auth.subject}`,
    }
  },
})
