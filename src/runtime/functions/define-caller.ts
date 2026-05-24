import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'
import type { GenericValidator } from 'convex/values'

import { getAuth, subject } from '../auth/index.js'

export type { Subject } from '../auth/index.js'

type MaybePromise<T> = T | Promise<T>

type AnyCtx<DataModel extends GenericDataModel = GenericDataModel> =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export type DefaultCaller =
  | { kind: 'anonymous'; subject: 'system:anonymous' }
  | {
      kind: 'user'
      subject: `auth:${string}`
      authKey: string
      sessionId?: string
    }
  | {
      kind: 'agent'
      subject: `agent:${string}`
      agentId: string
      roleHint?: string
    }
  | {
      kind: 'service'
      subject: `service:${string}`
      serviceId: string
      scopes?: string[]
    }

export interface CallerDefinition<TCtx extends object, TCaller> {
  readonly type: TCaller
  readonly validator?: GenericValidator
  resolve: (ctx: TCtx, args: Record<string, unknown>) => MaybePromise<TCaller>
}

/**
 * Define how a transport resolves its caller identity.
 *
 * Principals answer "who is calling according to this transport?" They are not
 * your business appIdentity model. Resolve the caller here, then derive actors and
 * permissions later inside the protected app runtime.
 */
export function defineCaller<TCtx extends object, TCaller>(options: {
  validator?: GenericValidator
  resolve: (ctx: TCtx, args: Record<string, unknown>) => MaybePromise<TCaller>
}): CallerDefinition<TCtx, TCaller> {
  return {
    type: null as unknown as TCaller,
    validator: options.validator,
    resolve: options.resolve,
  }
}

defineCaller.fromAuth = function fromAuth<
  DataModel extends GenericDataModel = GenericDataModel,
>(): CallerDefinition<AnyCtx<DataModel>, DefaultCaller> {
  return defineCaller<AnyCtx<DataModel>, DefaultCaller>({
    resolve: async (ctx) => {
      const auth = await getAuth(ctx)
      if (!auth) {
        return { kind: 'anonymous', subject: subject.anonymous() }
      }

      return {
        kind: 'user',
        authKey: auth.authKey,
        subject: subject.auth(auth.authKey),
      }
    },
  })
}
