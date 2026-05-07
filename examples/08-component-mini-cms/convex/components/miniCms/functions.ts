import { defineGuard } from '@lupinum/trellis/auth'
import { definePrincipal, defineTrellis } from '@lupinum/trellis/functions'
import { getForwardedPrincipal } from '@lupinum/trellis/trusted-forwarding'

import { miniCmsPrincipalValidator, type MiniCmsPrincipal } from '../../../shared/principal'
import {
  action as generatedAction,
  mutation as generatedMutation,
  query as generatedQuery,
} from './_generated/server'

export type MiniCmsActor =
  | { kind: 'viewer' }
  | { kind: 'editor'; userId: string }
  | { kind: 'agent'; agentId: string }

export const principal = definePrincipal({
  validator: miniCmsPrincipalValidator,
  resolve: async (_ctx, args): Promise<MiniCmsPrincipal> =>
    getForwardedPrincipal<MiniCmsPrincipal>(_ctx, args) ??
    ({ kind: 'anonymous', subject: 'system:anonymous' } satisfies MiniCmsPrincipal),
})

export async function getActorFromPrincipal(
  _ctx: unknown,
  _args: Record<string, unknown>,
  resolved: MiniCmsPrincipal,
): Promise<MiniCmsActor> {
  switch (resolved.kind) {
    case 'anonymous':
      return { kind: 'viewer' }
    case 'user':
      return { kind: 'editor', userId: resolved.userId }
    case 'agent':
      return { kind: 'agent', agentId: resolved.agentId }
  }
}

export const canManagePages = defineGuard<MiniCmsActor>(
  'Manage pages',
  (actor) => actor.kind !== 'viewer',
)

export const { action, mutation, query, transportMutation } = defineTrellis(
  {
    action: generatedAction,
    query: generatedQuery,
    mutation: generatedMutation,
  },
  {
    principal,
    actor: getActorFromPrincipal,
    trustedForwardingKey: process.env.CONVEX_TRUSTED_FORWARDING_KEY,
    destructiveSafety: {
      redemptionTable: 'destructiveRedemptions',
      auditTable: 'destructiveAuditLog',
    },
  },
)
