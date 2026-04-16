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

export type OperationKind = 'safe' | 'destructive'

export type TrellisOperationMetadata = {
  name?: string
  kind: OperationKind
}

export const trellisOperationMetadataKey = Symbol.for('trellis.operation')

export type OperationDefinition<
  TCtx,
  TPrincipal,
  TActor,
  TGuard extends StructuredGuard<TPrincipal, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded,
  TResult,
  TPreview = unknown,
> = StructuredHandlerDefinition<
  TCtx,
  TPrincipal,
  TActor,
  TGuard,
  TArgsValidator,
  TLoaded,
  TResult
> & {
  name?: string
  kind?: OperationKind
  preview?: PreviewFn<TCtx, TArgsValidator, TLoaded, TPreview>
  previewReturns?: GenericValidator
  [trellisOperationMetadataKey]?: TrellisOperationMetadata
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
  TPrincipal,
  TActor,
  TGuard extends StructuredGuard<TPrincipal, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded extends StructuredLoadedValue = undefined,
  TResult = unknown,
  TPreview = unknown,
>(
  definition: OperationDefinition<
    TCtx,
    TPrincipal,
    TActor,
    TGuard,
    TArgsValidator,
    TLoaded,
    TResult,
    TPreview
  >,
): OperationDefinition<TCtx, TPrincipal, TActor, TGuard, TArgsValidator, TLoaded, TResult, TPreview> {
  return Object.assign(definition, {
    [trellisOperationMetadataKey]: {
      name: definition.name,
      kind: definition.kind ?? 'safe',
    },
  })
}

/**
 * Expose the preview phase of an operation as a standalone structured handler.
 *
 * Use this for confirmation flows where a destructive mutation should be
 * preceded by a read-only preview step.
 */
export function previewOf<
  TCtx,
  TPrincipal,
  TActor,
  TGuard extends StructuredGuard<TPrincipal, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded extends StructuredLoadedValue = undefined,
  TResult = unknown,
  TPreview = unknown,
>(
  operation: OperationDefinition<
    TCtx,
    TPrincipal,
    TActor,
    TGuard,
    TArgsValidator,
    TLoaded,
    TResult,
    TPreview
  >,
): StructuredHandlerDefinition<TCtx, TPrincipal, TActor, TGuard, TArgsValidator, TLoaded, TPreview> {
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

export function getOperationMetadata(operation: {
  [trellisOperationMetadataKey]?: TrellisOperationMetadata
  name?: string
  kind?: OperationKind
}): TrellisOperationMetadata {
  return (
    operation[trellisOperationMetadataKey] ?? {
      name: operation.name,
      kind: operation.kind ?? 'safe',
    }
  )
}
