import { defineGuard } from '@lupinum/trellis/auth'
import { defineCaller, defineTrellis, getForwardedCaller } from '@lupinum/trellis/backend'

import { miniCmsPrincipalValidator, type MiniCmsPrincipal } from '../../../shared/caller'
import {
  action as generatedAction,
  mutation as generatedMutation,
  query as generatedQuery,
} from './_generated/server'

export type MiniCmsActor =
  | { kind: 'viewer' }
  | { kind: 'editor'; authKey: string }
  | { kind: 'agent'; agentId: string }

export const caller = defineCaller({
  validator: miniCmsPrincipalValidator,
  resolve: async (_ctx, args): Promise<MiniCmsPrincipal> =>
    getForwardedCaller<MiniCmsPrincipal>(_ctx, args) ??
    ({ kind: 'anonymous', subject: 'system:anonymous' } satisfies MiniCmsPrincipal),
})

export async function getAppIdentityFromCaller(
  _ctx: unknown,
  _args: Record<string, unknown>,
  resolved: MiniCmsPrincipal,
): Promise<MiniCmsActor> {
  switch (resolved.kind) {
    case 'anonymous':
      return { kind: 'viewer' }
    case 'user':
      return { kind: 'editor', authKey: resolved.authKey }
    case 'agent':
      return { kind: 'agent', agentId: resolved.agentId }
  }
}

export const canManagePages = defineGuard<MiniCmsActor>(
  'Manage pages',
  (appIdentity) => appIdentity.kind !== 'viewer',
)

export const { action, mutation, query, transportMutation } = defineTrellis(
  {
    action: generatedAction,
    query: generatedQuery,
    mutation: generatedMutation,
  },
  {
    caller,
    appIdentity: getAppIdentityFromCaller,
    identityForwardingKey: process.env.CONVEX_IDENTITY_FORWARDING_KEY,
    destructiveOperations: {
      confirmationTable: 'destructiveConfirmations',
      auditTable: 'destructiveAuditLog',
    },
  },
)
