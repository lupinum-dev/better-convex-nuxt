import { defineGuard } from '@lupinum/trellis/auth'
import { createApp, definePrincipal } from '@lupinum/trellis/functions'

import { miniCmsPrincipalValidator, type MiniCmsPrincipal } from '../../../shared/principal'
import { mutation, query } from './_generated/server'

export type MiniCmsActor =
  | { kind: 'viewer' }
  | { kind: 'editor'; userId: string }
  | { kind: 'mcp'; mcpKeyId: string }

export const principal = definePrincipal({
  validator: miniCmsPrincipalValidator,
  resolve: async (_ctx, args): Promise<MiniCmsPrincipal> =>
    (args as { principal?: MiniCmsPrincipal }).principal ?? { kind: 'anonymous' },
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
    case 'mcp':
      return { kind: 'mcp', mcpKeyId: resolved.mcpKeyId }
  }
}

export const canManagePages = defineGuard<MiniCmsActor>(
  'Manage pages',
  (actor) => actor.kind !== 'viewer',
)

export const { app } = createApp(
  {
    query,
    mutation,
  },
  {
    principal,
    actor: getActorFromPrincipal,
  },
)

export { mutation, query }
