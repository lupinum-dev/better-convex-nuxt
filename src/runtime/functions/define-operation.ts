/* eslint-disable @typescript-eslint/no-explicit-any -- Type-level function-shape inference needs `any` for parameter contravariance. */
import type { GenericValidator, ObjectType, PropertyValidators } from 'convex/values'

import type {
  AwaitedValue,
  FallbackIfUnknownOrNever,
  SerializableValue,
  ValidateSerializable,
} from '../types/type-utils.js'
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
  defineOperationMetadata,
  executeOperationRef,
  getOperationMetadata,
  previewOperationRef,
  projectOperationRef,
  transportExecuteOperationRef,
  trellisOperationMetadataKey,
  trellisOperationProjectionMetadataKey,
} from './operation-metadata.js'
export type {
  OperationMetadataDefinition,
  OperationKind,
  OperationIdOf,
  OperationProjectionRef,
  TrellisOperationMetadata,
  TrellisOperationProjectionMetadata,
  ValidateOperationId,
  ValidateOperationProjectionRef,
} from './operation-metadata.js'

type MaybePromise<T> = T | Promise<T>
type Callback<TArgs extends unknown[], TResult> = (...args: TArgs) => TResult

type HandlerArgs<TArgsValidator extends PropertyValidators> = ObjectType<TArgsValidator>

type PreviewFn<TCtx, TArgsValidator extends PropertyValidators, TLoaded, TPreview> = Callback<
  [TCtx, HandlerArgs<TArgsValidator>, TLoaded],
  MaybePromise<TPreview>
>

export type DestructiveOperationPreview<
  TDisplay = SerializableValue,
  TConfirm extends Record<string, unknown> = Record<string, SerializableValue>,
  TVersion = SerializableValue,
> = {
  display: ValidateSerializable<TDisplay>
  confirm: ValidateSerializable<TConfirm>
  version?: ValidateSerializable<TVersion>
}

export type OperationDefinition<
  TCtx,
  TPrincipal,
  TDelegation,
  TActor,
  TGuard extends StructuredGuard<TPrincipal, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded,
  TResult,
  TPreview = unknown,
> = StructuredHandlerDefinition<
  TCtx,
  TPrincipal,
  TDelegation,
  TActor,
  TGuard,
  TArgsValidator,
  TLoaded,
  TResult
> & {
  id?: string
  name?: string
  kind?: OperationKind
  preview?: PreviewFn<TCtx, TArgsValidator, TLoaded, TPreview>
  previewReturns?: GenericValidator
  [trellisOperationMetadataKey]?: TrellisOperationMetadata
  [trellisOperationProjectionMetadataKey]?: TrellisOperationProjectionMetadata
}

export type OperationShape = {
  args: PropertyValidators
  guard: StructuredGuard<any, any>
  handler: (...args: any[]) => unknown
  load?: (...args: any[]) => unknown
  preview?: (...args: any[]) => unknown
  returns?: GenericValidator
  previewReturns?: GenericValidator
  id?: string
  name?: string
  kind?: OperationKind
  [trellisOperationMetadataKey]?: TrellisOperationMetadata
  [trellisOperationProjectionMetadataKey]?: TrellisOperationProjectionMetadata
}

export type InferOperationCtx<TDefinition extends OperationShape> = TDefinition['handler'] extends (
  ctx: infer TCtx,
  ...args: any[]
) => unknown
  ? TCtx
  : unknown

type InferOperationPrincipal<TDefinition extends OperationShape> =
  InferOperationCtx<TDefinition> extends {
    principal: () => Promise<infer TPrincipal>
  }
    ? TPrincipal
    : never

type InferOperationDelegation<TDefinition extends OperationShape> =
  InferOperationCtx<TDefinition> extends {
    delegation: () => Promise<(infer TDelegation) | null>
  }
    ? TDelegation
    : unknown

type InferActorFromCtx<TCtx> = TCtx extends {
  actor: () => Promise<infer TActor>
}
  ? TActor
  : never

type InferActorFromGuard<TGuard> =
  TGuard extends StructuredGuard<unknown, infer TActor> ? TActor : never

type InferOperationGuard<TDefinition extends OperationShape> =
  TDefinition['guard'] extends infer TGuard
    ? TGuard extends StructuredGuard<any, any>
      ? TGuard
      : never
    : never

type InferOperationActor<TDefinition extends OperationShape> = FallbackIfUnknownOrNever<
  InferActorFromCtx<InferOperationCtx<TDefinition>>,
  InferActorFromGuard<InferOperationGuard<TDefinition>>
>

type InferOperationArgsValidator<TDefinition extends OperationShape> = TDefinition['args']

export type InferOperationLoaded<TDefinition extends OperationShape> = TDefinition['load'] extends (
  ...args: any[]
) => infer TLoaded
  ? AwaitedValue<TLoaded>
  : TDefinition['handler'] extends (
        ctx: unknown,
        args: unknown,
        loaded: infer TLoaded,
        ...rest: any[]
      ) => unknown
    ? TLoaded
    : undefined

export type InferOperationResult<TDefinition extends OperationShape> =
  TDefinition['handler'] extends (...args: any[]) => infer TResult ? AwaitedValue<TResult> : unknown

export type InferOperationPreview<TDefinition extends OperationShape> =
  TDefinition['preview'] extends (...args: any[]) => infer TPreview
    ? AwaitedValue<TPreview>
    : unknown

type ResolvedOperationDefinition<TDefinition extends OperationShape> = OperationDefinition<
  InferOperationCtx<TDefinition>,
  InferOperationPrincipal<TDefinition>,
  InferOperationDelegation<TDefinition>,
  InferOperationActor<TDefinition>,
  InferOperationGuard<TDefinition>,
  InferOperationArgsValidator<TDefinition>,
  InferOperationLoaded<TDefinition>,
  InferOperationResult<TDefinition>,
  InferOperationPreview<TDefinition>
>

export type ValidateOperationDefinition<TDefinition extends OperationShape> = TDefinition &
  ResolvedOperationDefinition<TDefinition>

type ContextBoundOperationShape<TCtx> = Omit<OperationShape, 'handler' | 'load' | 'preview'> & {
  handler: (ctx: TCtx, ...args: any[]) => unknown
  load?: (ctx: TCtx, ...args: any[]) => unknown
  preview?: (ctx: TCtx, ...args: any[]) => unknown
}

type DefineOperationFn = {
  <const TDefinition extends OperationShape>(
    definition: ValidateOperationDefinition<TDefinition>,
  ): ValidateOperationDefinition<TDefinition>
  withContext: <TCtx>() => <const TDefinition extends ContextBoundOperationShape<TCtx>>(
    definition: ValidateOperationDefinition<TDefinition>,
  ) => ValidateOperationDefinition<TDefinition>
}

/**
 * Define a reusable protected business operation.
 *
 * Use this when one business action should own its guard/load/authorize/handler
 * logic in one place and potentially be reused across multiple registration
 * points or transports.
 */
function defineOperationImpl<const TDefinition extends OperationShape>(
  definition: ValidateOperationDefinition<TDefinition>,
): ValidateOperationDefinition<TDefinition> {
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
  }) as ValidateOperationDefinition<TDefinition>
}

export const defineOperation = Object.assign(defineOperationImpl, {
  withContext:
    <TCtx>() =>
    <const TDefinition extends ContextBoundOperationShape<TCtx>>(
      definition: ValidateOperationDefinition<TDefinition>,
    ) =>
      defineOperationImpl(definition),
}) as DefineOperationFn

/**
 * Expose the preview phase of an operation as a standalone structured handler.
 *
 * Use this for confirmation flows where a destructive mutation should be
 * preceded by a read-only preview step.
 */
export function previewOf<
  TCtx,
  TPrincipal,
  TDelegation,
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
    TDelegation,
    TActor,
    TGuard,
    TArgsValidator,
    TLoaded,
    TResult,
    TPreview
  >,
): StructuredHandlerDefinition<
  TCtx,
  TPrincipal,
  TDelegation,
  TActor,
  TGuard,
  TArgsValidator,
  TLoaded,
  TPreview
> {
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
