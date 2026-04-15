import type { GenericValidator, ObjectType, PropertyValidators } from 'convex/values'

import type {
  StructuredGuard,
  StructuredHandlerDefinition,
  StructuredLoadedValue,
} from './define-handler.js'

type MaybePromise<T> = T | Promise<T>

type HandlerArgs<TArgsValidator extends PropertyValidators> = ObjectType<TArgsValidator>

type PreviewFn<TCtx, TArgsValidator extends PropertyValidators, TLoaded, TPreview> = (
  ctx: TCtx,
  args: HandlerArgs<TArgsValidator>,
  loaded: TLoaded,
) => MaybePromise<TPreview>

export type OperationDefinition<
  TCtx,
  TActor,
  TGuard extends StructuredGuard<TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded,
  TResult,
  TPreview = unknown,
> = StructuredHandlerDefinition<TCtx, TActor, TGuard, TArgsValidator, TLoaded, TResult> & {
  preview?: PreviewFn<TCtx, TArgsValidator, TLoaded, TPreview>
  previewReturns?: GenericValidator
}

/**
 * Define a reusable protected business operation.
 *
 * Use this when one business action should own its guard/load/authorize/handler
 * logic in one place and potentially be reused across multiple registration
 * points or transports.
 */
export function defineOperation<
  TCtx,
  TActor,
  TGuard extends StructuredGuard<TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded extends StructuredLoadedValue = undefined,
  TResult = unknown,
  TPreview = unknown,
>(
  definition: OperationDefinition<TCtx, TActor, TGuard, TArgsValidator, TLoaded, TResult, TPreview>,
): OperationDefinition<TCtx, TActor, TGuard, TArgsValidator, TLoaded, TResult, TPreview> {
  return definition
}

/**
 * Expose the preview phase of an operation as a standalone structured handler.
 *
 * Use this for confirmation flows where a destructive mutation should be
 * preceded by a read-only preview step.
 */
export function previewOf<
  TCtx,
  TActor,
  TGuard extends StructuredGuard<TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded extends StructuredLoadedValue = undefined,
  TResult = unknown,
  TPreview = unknown,
>(
  operation: OperationDefinition<TCtx, TActor, TGuard, TArgsValidator, TLoaded, TResult, TPreview>,
): StructuredHandlerDefinition<TCtx, TActor, TGuard, TArgsValidator, TLoaded, TPreview> {
  if (!operation.preview) {
    throw new Error('previewOf() requires an operation with a preview handler.')
  }

  return {
    args: operation.args,
    returns: operation.previewReturns,
    guard: operation.guard,
    load: operation.load,
    authorize: operation.authorize,
    handler: async (ctx, args, loaded) => await operation.preview!(ctx as TCtx, args, loaded),
  }
}
