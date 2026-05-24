import { getAuth } from '@lupinum/trellis/auth'
import { defineCaller, getForwardedCaller } from '@lupinum/trellis/backend'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'
import { v } from 'convex/values'

import type { DataModel } from '../_generated/dataModel'

export type Role = 'owner' | 'admin' | 'member' | 'viewer'

type InternalHarnessCallerCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export type InternalHarnessCaller =
  | { kind: 'anonymous'; subject: 'system:anonymous' }
  | { kind: 'user'; authKey: string; subject: `auth:${string}` }
  | {
      kind: 'agent'
      agentId: string
      userId?: string
      subject: `agent:${string}`
      role: Role
      workspaceId?: string
      provider?: 'mcp'
    }

export const internalHarnessCallerValidator = v.union(
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
    userId: v.optional(v.string()),
    subject: v.string(),
    role: v.union(v.literal('owner'), v.literal('admin'), v.literal('member'), v.literal('viewer')),
    workspaceId: v.optional(v.string()),
    provider: v.optional(v.literal('mcp')),
  }),
)

export const caller = defineCaller<InternalHarnessCallerCtx, InternalHarnessCaller>({
  validator: internalHarnessCallerValidator,
  resolve: async (ctx, args): Promise<InternalHarnessCaller> => {
    const forwarded = getForwardedCaller<InternalHarnessCaller>(ctx, args)
    if (forwarded) return forwarded

    const auth = await getAuth(ctx)
    if (!auth) return { kind: 'anonymous', subject: 'system:anonymous' }

    return {
      kind: 'user',
      authKey: auth.authKey,
      subject: `auth:${auth.authKey}`,
    }
  },
})
