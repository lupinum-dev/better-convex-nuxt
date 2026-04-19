import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'
import type { GenericValidator } from 'convex/values'

import type { Subject } from './define-principal.js'

type MaybePromise<T> = T | Promise<T>

type AnyCtx<DataModel extends GenericDataModel = GenericDataModel> =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export type Delegation = {
  subject: Subject
  reason?: string
  grantedBy?: Subject
}

export interface DelegationDefinition<
  TCtx extends object,
  TDelegation extends Delegation = Delegation,
> {
  readonly type: TDelegation
  readonly validator?: GenericValidator
  resolve: (ctx: TCtx, args: Record<string, unknown>) => MaybePromise<TDelegation | null>
}

/**
 * Define how a transport resolves explicit represented identity.
 *
 * Delegation answers "who may this caller act for on this request?" It is
 * separate from the transport principal and should never be inferred from it.
 */
export function defineDelegation<
  TCtx extends object,
  TDelegation extends Delegation = Delegation,
>(options: {
  validator?: GenericValidator
  resolve: (ctx: TCtx, args: Record<string, unknown>) => MaybePromise<TDelegation | null>
}): DelegationDefinition<TCtx, TDelegation> {
  return {
    type: null as unknown as TDelegation,
    validator: options.validator,
    resolve: options.resolve,
  }
}

defineDelegation.none = function none<
  DataModel extends GenericDataModel = GenericDataModel,
>(): DelegationDefinition<AnyCtx<DataModel>, Delegation> {
  return defineDelegation<AnyCtx<DataModel>, Delegation>({
    resolve: async () => null,
  })
}
