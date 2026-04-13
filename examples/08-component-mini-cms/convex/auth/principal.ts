import { getAuth } from '@lupinum/trellis/auth'
import { definePrincipal } from '@lupinum/trellis/functions'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import { miniCmsPrincipalValidator, type MiniCmsPrincipal } from '../../shared/principal'
import type { DataModel } from '../_generated/dataModel'

export type RootActor = { kind: 'user'; userId: string } | { kind: 'agent'; agentId: string }

type RootCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export const principal = definePrincipal({
  validator: miniCmsPrincipalValidator,
  resolve: async (ctx, args): Promise<MiniCmsPrincipal> => {
    const forwarded = (args as { principal?: MiniCmsPrincipal }).principal
    if (forwarded) return forwarded

    const auth = await getAuth(ctx as RootCtx)
    if (!auth) {
      return { kind: 'anonymous' }
    }

    return {
      kind: 'user',
      userId: auth.subject,
    }
  },
})

export async function getActorFromPrincipal(
  _ctx: RootCtx,
  _args: Record<string, unknown>,
  resolved: MiniCmsPrincipal,
): Promise<RootActor | null> {
  switch (resolved.kind) {
    case 'anonymous':
      return null
    case 'user':
      return resolved
    case 'agent':
      return resolved
  }
}
