import { getAuth } from '@lupinum/trellis/auth'
import { defineCaller, getForwardedCaller } from '@lupinum/trellis/backend'
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import { miniCmsPrincipalValidator, type MiniCmsPrincipal } from '../../shared/caller'
import type { DataModel } from '../_generated/dataModel'

export type RootActor = { kind: 'user'; authKey: string } | { kind: 'agent'; agentId: string }

type RootCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export const caller = defineCaller({
  validator: miniCmsPrincipalValidator,
  resolve: async (ctx, args): Promise<MiniCmsPrincipal> => {
    const forwarded = getForwardedCaller<MiniCmsPrincipal>(ctx, args)
    if (forwarded) return forwarded

    const auth = await getAuth(ctx as RootCtx)
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

export async function getAppIdentityFromCaller(
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
      return { kind: 'agent', agentId: resolved.agentId }
  }
}
