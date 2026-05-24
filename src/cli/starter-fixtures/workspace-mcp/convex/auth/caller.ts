import { getAuth } from '@lupinum/trellis/auth'
import {
  defineActingFor,
  defineCaller,
  getForwardedActingFor,
  getForwardedCaller,
} from '@lupinum/trellis/backend'
import { v } from 'convex/values'

import type { Doc } from '../_generated/dataModel'

export type Role = NonNullable<Doc<'users'>['role']>

export type WorkspaceCaller =
  | { kind: 'anonymous'; subject: 'system:anonymous' }
  | { kind: 'user'; authKey: string; subject: `auth:${string}` }
  | {
      kind: 'agent'
      agentId: string
      subject: `agent:${string}`
      provider?: 'mcp'
    }

export const workspacePrincipalValidator = v.union(
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
    provider: v.optional(v.literal('mcp')),
  }),
)

export const caller = defineCaller({
  validator: workspacePrincipalValidator,
  resolve: async (ctx, args): Promise<WorkspaceCaller> => {
    const forwarded = getForwardedCaller<WorkspaceCaller>(ctx, args)
    if (forwarded) return forwarded

    const auth = await getAuth(ctx as never)
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

export const actingFor = defineActingFor({
  validator: v.object({
    subject: v.string(),
    reason: v.optional(v.string()),
    grantedBy: v.optional(v.string()),
  }),
  resolve: async (ctx, args) => getForwardedActingFor(ctx, args),
})
