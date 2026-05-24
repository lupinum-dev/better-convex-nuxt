import { getAuth } from '@lupinum/trellis/auth'
import { defineCaller, getForwardedCaller } from '@lupinum/trellis/backend'
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
  | { kind: 'user'; authKey: string; subject: `auth:${string}` }
  | { kind: 'agent'; agentId: string; subject: `agent:${string}`; provider: 'mcp' }
  | { kind: 'service'; serviceId: string; subject: `service:${string}` }

export const mcpReferencePrincipalValidator = v.union(
  v.object({
    kind: v.literal('anonymous'),
    subject: v.literal('system:anonymous'),
  }),
  v.object({
    kind: v.literal('user'),
    authKey: v.string(),
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

export const caller = defineCaller<PrincipalCtx, McpReferencePrincipal>({
  validator: mcpReferencePrincipalValidator,
  resolve: async (ctx, args): Promise<McpReferencePrincipal> => {
    // Identity forwarding wins first. Browser auth only runs when no trusted
    // server-side caller was forwarded into the handler.
    const forwarded = getForwardedCaller<McpReferencePrincipal>(ctx, args)
    if (forwarded) return forwarded

    const auth = await getAuth(ctx)
    if (!auth) {
      return { kind: 'anonymous', subject: 'system:anonymous' }
    }

    // Browser requests resolve to a plain user caller with a canonical subject.
    return {
      kind: 'user',
      authKey: auth.authKey,
      subject: `auth:${auth.authKey}`,
    }
  },
})
