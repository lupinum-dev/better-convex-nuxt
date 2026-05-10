import { getAuth } from '@lupinum/trellis/auth'
import { defineDelegation, definePrincipal } from '@lupinum/trellis/backend'
import { getForwardedDelegation, getForwardedPrincipal } from '@lupinum/trellis/trusted-forwarding'
import { v } from 'convex/values'

import type { Doc } from '../_generated/dataModel'

export type Role = NonNullable<Doc<'users'>['role']>

export type WorkspacePrincipal =
  | { kind: 'anonymous'; subject: 'system:anonymous' }
  | { kind: 'user'; userId: string; subject: `user:${string}` }
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
    userId: v.string(),
    subject: v.string(),
  }),
  v.object({
    kind: v.literal('agent'),
    agentId: v.string(),
    subject: v.string(),
    provider: v.optional(v.literal('mcp')),
  }),
)

export const principal = definePrincipal({
  validator: workspacePrincipalValidator,
  resolve: async (ctx, args): Promise<WorkspacePrincipal> => {
    const forwarded = getForwardedPrincipal<WorkspacePrincipal>(ctx, args)
    if (forwarded) return forwarded

    const auth = await getAuth(ctx as never)
    if (!auth) {
      return { kind: 'anonymous', subject: 'system:anonymous' }
    }

    return {
      kind: 'user',
      userId: auth.subject,
      subject: `user:${auth.subject}`,
    }
  },
})

export const delegation = defineDelegation({
  validator: v.object({
    subject: v.string(),
    reason: v.optional(v.string()),
    grantedBy: v.optional(v.string()),
  }),
  resolve: async (ctx, args) => getForwardedDelegation(ctx, args),
})
