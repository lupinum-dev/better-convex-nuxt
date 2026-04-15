import type { GenericDataModel, GenericMutationCtx, GenericQueryCtx } from 'convex/server'
import type { GenericValidator } from 'convex/values'

import { getAuth } from '../auth/index.js'

type MaybePromise<T> = T | Promise<T>

type AnyCtx<DataModel extends GenericDataModel = GenericDataModel> =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>

export type DefaultPrincipal =
  | { kind: 'anonymous' }
  | {
      kind: 'user'
      userId: string
      sessionId?: string
    }
  | {
      kind: 'mcp'
      mcpKeyId: string
      roleHint?: string
    }
  | {
      kind: 'service'
      serviceId: string
      scopes?: string[]
    }

export interface PrincipalDefinition<TCtx extends object, TPrincipal> {
  readonly type: TPrincipal
  readonly validator?: GenericValidator
  resolve: (ctx: TCtx, args: Record<string, unknown>) => MaybePromise<TPrincipal>
}

/**
 * Define how a transport resolves its caller identity.
 *
 * Principals answer "who is calling according to this transport?" They are not
 * your business actor model. Resolve the principal here, then derive actors and
 * permissions later inside the protected app runtime.
 */
export function definePrincipal<TCtx extends object, TPrincipal>(options: {
  validator?: GenericValidator
  resolve: (ctx: TCtx, args: Record<string, unknown>) => MaybePromise<TPrincipal>
}): PrincipalDefinition<TCtx, TPrincipal> {
  return {
    type: null as unknown as TPrincipal,
    validator: options.validator,
    resolve: options.resolve,
  }
}

definePrincipal.fromAuth = function fromAuth<
  DataModel extends GenericDataModel = GenericDataModel,
>(): PrincipalDefinition<AnyCtx<DataModel>, DefaultPrincipal> {
  return definePrincipal<AnyCtx<DataModel>, DefaultPrincipal>({
    resolve: async (ctx) => {
      const auth = await getAuth(ctx)
      if (!auth) {
        return { kind: 'anonymous' }
      }

      return {
        kind: 'user',
        userId: auth.subject,
      }
    },
  })
}
