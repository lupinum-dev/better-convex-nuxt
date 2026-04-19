import { getAuth } from '@lupinum/trellis/auth'
import { definePrincipal } from '@lupinum/trellis/functions'
import { getForwardedPrincipal } from '@lupinum/trellis/trusted-forwarding'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'
import { v } from 'convex/values'

import type { DataModel } from '../_generated/dataModel'

export type Role = 'owner' | 'admin' | 'member' | 'viewer'

type InternalHarnessPrincipalCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export type InternalHarnessPrincipal =
  | { kind: 'anonymous'; subject: 'system:anonymous' }
  | { kind: 'user'; userId: string; subject: `user:${string}` }
  | {
      kind: 'agent'
      agentId: string
      subject: `agent:${string}`
      role: Role
      tenantId?: string
      provider?: 'mcp'
    }

export const internalHarnessPrincipalValidator = v.union(
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
    role: v.union(v.literal('owner'), v.literal('admin'), v.literal('member'), v.literal('viewer')),
    tenantId: v.optional(v.string()),
    provider: v.optional(v.literal('mcp')),
  }),
)

export const principal = definePrincipal<InternalHarnessPrincipalCtx, InternalHarnessPrincipal>({
  validator: internalHarnessPrincipalValidator,
  resolve: async (ctx, args): Promise<InternalHarnessPrincipal> => {
    const forwarded = getForwardedPrincipal<InternalHarnessPrincipal>(ctx, args)
    if (forwarded) return forwarded

    const auth = await getAuth(ctx)
    if (!auth) return { kind: 'anonymous', subject: 'system:anonymous' }

    return {
      kind: 'user',
      userId: auth.subject,
      subject: `user:${auth.subject}`,
    }
  },
})
