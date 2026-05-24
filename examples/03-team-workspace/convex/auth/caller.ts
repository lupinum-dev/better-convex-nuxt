import { getAuth } from '@lupinum/trellis/auth'
import { defineCaller, getForwardedCaller } from '@lupinum/trellis/backend'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'
import { v } from 'convex/values'

import type { DataModel, Doc } from '../_generated/dataModel'

type PrincipalCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export type Role = Doc<'users'>['role']

export type TeamTodoPrincipal =
  | { kind: 'anonymous'; subject: 'system:anonymous' }
  | { kind: 'user'; authKey: string; subject: `auth:${string}` }
  | {
      kind: 'agent'
      userId: string
      agentId?: string
      subject: `agent:${string}`
      provider?: 'mcp'
    }
  | {
      kind: 'service'
      serviceId: string
      subject: `service:${string}`
    }

export const teamTodoPrincipalValidator = v.union(
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
    userId: v.string(),
    agentId: v.optional(v.string()),
    subject: v.string(),
    provider: v.optional(v.literal('mcp')),
  }),
  v.object({
    kind: v.literal('service'),
    serviceId: v.string(),
    subject: v.string(),
  }),
)

export const caller = defineCaller<PrincipalCtx, TeamTodoPrincipal>({
  validator: teamTodoPrincipalValidator,
  resolve: async (ctx, args): Promise<TeamTodoPrincipal> => {
    const forwarded = getForwardedCaller<TeamTodoPrincipal>(ctx, args)
    if (forwarded) return forwarded

    const auth = await getAuth(ctx)
    if (!auth) {
      return { kind: 'anonymous', subject: 'system:anonymous' }
    }

    return {
      kind: 'user',
      authKey: auth.authKey,
      subject: `auth:${auth.authKey}`,
    }
  },
})
