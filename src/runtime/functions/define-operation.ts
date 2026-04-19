import type { GenericValidator, ObjectType, PropertyValidators } from 'convex/values'

import type {
  StructuredGuard,
  StructuredHandlerDefinition,
  StructuredLoadedValue,
} from './define-handler.js'
import {
  getOperationMetadata,
  trellisOperationMetadataKey,
  trellisOperationProjectionMetadataKey,
  type OperationKind,
  type TrellisOperationMetadata,
  type TrellisOperationProjectionMetadata,
} from './operation-metadata.js'

export {
  getOperationMetadata,
  trellisOperationMetadataKey,
  trellisOperationProjectionMetadataKey,
} from './operation-metadata.js'
export type {
  OperationKind,
  TrellisOperationMetadata,
  TrellisOperationProjectionMetadata,
} from './operation-metadata.js'

type MaybePromise<T> = T | Promise<T>
type BivariantCallback<TArgs extends unknown[], TResult> = {
  bivarianceHack: (...args: TArgs) => TResult
}['bivarianceHack']

type HandlerArgs<TArgsValidator extends PropertyValidators> = ObjectType<TArgsValidator>

type PreviewFn<TCtx, TArgsValidator extends PropertyValidators, TLoaded, TPreview> = BivariantCallback<
  [TCtx, HandlerArgs<TArgsValidator>, TLoaded],
  MaybePromise<TPreview>
>

export type DestructiveOperationPreview<TDisplay = unknown, TConfirm = unknown> = {
  display: TDisplay
  confirm: TConfirm
}

export type OperationDefinition<
  TCtx,
  TPrincipal,
  TActor,
  TGuard extends StructuredGuard<TPrincipal, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded,
  TResult,
  TPreview = unknown,
> = StructuredHandlerDefinition<TCtx, TPrincipal, TActor, TGuard, TArgsValidator, TLoaded, TResult> & {
  id?: string
  name?: string
  kind?: OperationKind
  preview?: PreviewFn<TCtx, TArgsValidator, TLoaded, TPreview>
  previewReturns?: GenericValidator
  [trellisOperationMetadataKey]?: TrellisOperationMetadata
  [trellisOperationProjectionMetadataKey]?: TrellisOperationProjectionMetadata
}

type AwaitedValue<T> = T extends Promise<infer U> ? AwaitedValue<U> : T
type IsUnknown<T> = unknown extends T ? ([keyof T] extends [never] ? true : false) : false
type FallbackIfUnknownOrNever<T, TFallback> = [T] extends [never]
  ? TFallback
  : IsUnknown<T> extends true
    ? TFallback
    : T

type OperationShape = {
  args: PropertyValidators
  guard: StructuredGuard<any, any>
  handler: (...args: any[]) => any
  load?: (...args: any[]) => any
  preview?: (...args: any[]) => any
  returns?: GenericValidator
  previewReturns?: GenericValidator
  id?: string
  name?: string
  kind?: OperationKind
  [trellisOperationMetadataKey]?: TrellisOperationMetadata
  [trellisOperationProjectionMetadataKey]?: TrellisOperationProjectionMetadata
}

type InferOperationCtx<TDefinition extends OperationShape> = TDefinition['handler'] extends (
  ctx: infer TCtx,
  ...args: any[]
) => any
  ? TCtx
  : unknown

type InferOperationPrincipal<TDefinition extends OperationShape> =
  InferOperationCtx<TDefinition> extends {
    principal: () => Promise<infer TPrincipal>
  }
    ? TPrincipal
    : never

type InferOperationGuard<TDefinition extends OperationShape> = TDefinition['guard'] extends infer TGuard
  ? TGuard extends StructuredGuard<any, any>
    ? TGuard
    : never
  : never

type InferActorFromCtx<TCtx> = TCtx extends {
  actor: () => Promise<infer TActor>
}
  ? TActor
  : never

type InferActorFromGuard<TGuard> = TGuard extends StructuredGuard<any, infer TActor>
  ? TActor
  : never

type InferOperationActor<TDefinition extends OperationShape> = FallbackIfUnknownOrNever<
  InferActorFromCtx<InferOperationCtx<TDefinition>>,
  InferActorFromGuard<InferOperationGuard<TDefinition>>
>

type InferOperationArgsValidator<TDefinition extends OperationShape> = TDefinition['args']

type InferOperationLoaded<TDefinition extends OperationShape> = TDefinition['load'] extends (
  ...args: any[]
) => infer TLoaded
  ? AwaitedValue<TLoaded>
  : TDefinition['handler'] extends (ctx: any, args: any, loaded: infer TLoaded) => any
    ? TLoaded
    : undefined

type InferOperationResult<TDefinition extends OperationShape> = TDefinition['handler'] extends (
  ...args: any[]
) => infer TResult
  ? AwaitedValue<TResult>
  : unknown

type InferOperationPreview<TDefinition extends OperationShape> = TDefinition['preview'] extends (
  ...args: any[]
) => infer TPreview
  ? AwaitedValue<TPreview>
  : unknown

/**
 * Define a reusable protected business operation.
 *
 * Use this when one business action should own its guard/load/authorize/handler
 * logic in one place and potentially be reused across multiple registration
 * points or transports.
 */
export function defineOperation<TDefinition extends OperationShape>(
  definition: TDefinition &
    OperationDefinition<
      InferOperationCtx<TDefinition>,
      InferOperationPrincipal<TDefinition>,
      InferOperationActor<TDefinition>,
      InferOperationGuard<TDefinition>,
      InferOperationArgsValidator<TDefinition>,
      InferOperationLoaded<TDefinition>,
      InferOperationResult<TDefinition>,
      InferOperationPreview<TDefinition>
    >,
): OperationDefinition<
  InferOperationCtx<TDefinition>,
  InferOperationPrincipal<TDefinition>,
  InferOperationActor<TDefinition>,
  InferOperationGuard<TDefinition>,
  InferOperationArgsValidator<TDefinition>,
  InferOperationLoaded<TDefinition>,
  InferOperationResult<TDefinition>,
  InferOperationPreview<TDefinition>
> {
  const metadata = {
    id: definition.id,
    name: definition.name,
    kind: definition.kind ?? 'safe',
  } satisfies TrellisOperationMetadata

  if (metadata.kind === 'destructive' && !metadata.id) {
    throw new Error('defineOperation(...) requires `id` for destructive operations.')
  }

  return Object.assign(definition, {
    [trellisOperationMetadataKey]: metadata,
    ...(metadata.id
      ? {
          [trellisOperationProjectionMetadataKey]: {
            operationId: metadata.id,
            projection: 'execute' as const,
          },
        }
      : {}),
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

  const metadata = getOperationMetadata(operation)

  return {
    args: operation.args,
    returns: operation.previewReturns,
    guard: operation.guard,
    load: operation.load,
    authorize: operation.authorize,
    handler: async (ctx, args, loaded) => await operation.preview!(ctx as TCtx, args, loaded),
    ...(metadata.id
      ? {
          [trellisOperationProjectionMetadataKey]: {
            operationId: metadata.id,
            projection: 'preview' as const,
          },
        }
      : {}),
  }
}
