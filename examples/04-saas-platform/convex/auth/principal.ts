import { getAuth } from '@lupinum/trellis/auth'
import { definePrincipal } from '@lupinum/trellis/functions'
import { v } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel'

export type Role = Doc<'users'>['role']

export type ProjectBoardPrincipal =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string }
  | {
      kind: 'mcp'
      userId: string
      role: Role
      tenantId?: Id<'workspaces'>
    }

export const projectBoardPrincipalValidator = v.union(
  v.object({
    kind: v.literal('anonymous'),
  }),
  v.object({
    kind: v.literal('user'),
    userId: v.string(),
  }),
  v.object({
    kind: v.literal('mcp'),
    userId: v.string(),
    role: v.union(
      v.literal('owner'),
      v.literal('admin'),
      v.literal('member'),
      v.literal('viewer'),
    ),
    tenantId: v.optional(v.id('workspaces')),
  }),
)

export const principal = definePrincipal({
  validator: projectBoardPrincipalValidator,
  resolve: async (ctx, args): Promise<ProjectBoardPrincipal> => {
    const forwarded = (args as { principal?: ProjectBoardPrincipal }).principal
    if (forwarded) return forwarded

    const auth = await getAuth(ctx)
    if (!auth) return { kind: 'anonymous' }

    return {
      kind: 'user',
      userId: auth.subject,
    }
  },
})
