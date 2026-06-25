import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from 'convex/server'
import {
  actionGeneric,
  httpActionGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric
} from 'convex/server'

export declare const query: typeof queryGeneric
export declare const internalQuery: typeof internalQueryGeneric
export declare const mutation: typeof mutationGeneric
export declare const internalMutation: typeof internalMutationGeneric
export declare const action: typeof actionGeneric
export declare const internalAction: typeof internalActionGeneric
export declare const httpAction: typeof httpActionGeneric
export type QueryCtx = GenericQueryCtx<any>
export type MutationCtx = GenericMutationCtx<any>
export type ActionCtx = GenericActionCtx<any>

