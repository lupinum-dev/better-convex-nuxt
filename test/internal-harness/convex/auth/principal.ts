import { getAuth } from '@lupinum/trellis/auth'
import { definePrincipal } from '@lupinum/trellis/functions'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'
import { v } from 'convex/values'

import type { DataModel } from '../_generated/dataModel'

export type Role = 'owner' | 'admin' | 'member' | 'viewer'

type InternalHarnessPrincipalCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export type InternalHarnessPrincipal =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string }
  | {
      kind: 'agent'
      userId: string
      role: Role
      tenantId?: string
      provider?: 'mcp'
    }

export const internalHarnessPrincipalValidator = v.union(
  v.object({
    kind: v.literal('anonymous'),
  }),
  v.object({
    kind: v.literal('user'),
    userId: v.string(),
  }),
  v.object({
    kind: v.literal('agent'),
    userId: v.string(),
    role: v.union(v.literal('owner'), v.literal('admin'), v.literal('member'), v.literal('viewer')),
    tenantId: v.optional(v.string()),
    provider: v.optional(v.literal('mcp')),
  }),
)

export const principal = definePrincipal<InternalHarnessPrincipalCtx, InternalHarnessPrincipal>({
  validator: internalHarnessPrincipalValidator,
  resolve: async (ctx, args): Promise<InternalHarnessPrincipal> => {
    const forwarded = (args as { principal?: InternalHarnessPrincipal }).principal
    if (forwarded) return forwarded

    const auth = await getAuth(ctx)
    if (!auth) return { kind: 'anonymous' }

    return {
      kind: 'user',
      userId: auth.subject,
    }
  },
})
