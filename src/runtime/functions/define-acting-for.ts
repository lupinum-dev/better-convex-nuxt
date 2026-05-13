import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'
import type { GenericValidator } from 'convex/values'

import type { Subject } from './define-caller.js'

type MaybePromise<T> = T | Promise<T>

type AnyCtx<DataModel extends GenericDataModel = GenericDataModel> =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>

export type ActingFor = {
  subject: Subject
  reason?: string
  grantedBy?: Subject
}

export interface ActingForDefinition<
  TCtx extends object,
  TActingFor extends ActingFor = ActingFor,
> {
  readonly type: TActingFor
  readonly validator?: GenericValidator
  resolve: (ctx: TCtx, args: Record<string, unknown>) => MaybePromise<TActingFor | null>
}

/**
 * Define how a transport resolves explicit represented identity.
 *
 * ActingFor answers "who may this caller act for on this request?" It is
 * separate from the transport caller and should never be inferred from it.
 */
export function defineActingFor<
  TCtx extends object,
  TActingFor extends ActingFor = ActingFor,
>(options: {
  validator?: GenericValidator
  resolve: (ctx: TCtx, args: Record<string, unknown>) => MaybePromise<TActingFor | null>
}): ActingForDefinition<TCtx, TActingFor> {
  return {
    type: null as unknown as TActingFor,
    validator: options.validator,
    resolve: options.resolve,
  }
}

defineActingFor.none = function none<
  DataModel extends GenericDataModel = GenericDataModel,
>(): ActingForDefinition<AnyCtx<DataModel>, ActingFor> {
  return defineActingFor<AnyCtx<DataModel>, ActingFor>({
    resolve: async () => null,
  })
}
