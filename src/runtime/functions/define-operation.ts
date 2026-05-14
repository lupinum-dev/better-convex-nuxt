/* eslint-disable @typescript-eslint/no-explicit-any -- Type-level function-shape inference needs `any` for parameter contravariance. */
import type { GenericValidator, ObjectType, PropertyValidators } from 'convex/values'

import { resolvePermissionKey, type PermissionKeyHandle } from '../auth/define-permission.js'
import type { AwaitedValue, FallbackIfUnknownOrNever } from '../types/type-utils.js'
import type {
  StructuredGuard,
  StructuredHandlerDefinition,
  StructuredLoadedValue,
} from './define-handler.js'
import {
  getOperationMetadata,
  trellisOperationMetadataKey,
  trellisOperationProjectionMetadataKey,
  type McpWriteSafety,
  type OperationKind,
  type OperationDescriptor,
  type TrellisOperationMetadata,
  type TrellisOperationProjectionMetadata,
} from './operation-metadata.js'
export {
  blockedOperationPreview,
  isOperationPreviewEnvelope,
  operationEffect,
  operationIssue,
  operationPreview,
  operationPreviewEffectValidator,
  operationPreviewIssueValidator,
  operationPreviewValidator,
} from './operation-preview.js'
export type {
  OperationPreviewEffect,
  OperationPreviewEnvelope,
  OperationPreviewIssue,
} from './operation-preview.js'

export {
  defineOperationDescriptor,
  defineOperationMetadata,
  executeOperationRef,
  getOperationMetadata,
  getOperationProjectionMetadata,
  isOperationDescriptor,
  previewOperationRef,
  projectOperationRef,
  transportExecuteOperationRef,
  trellisOperationMetadataKey,
  trellisOperationProjectionMetadataKey,
} from './operation-metadata.js'
export type {
  McpWriteSafety,
  OperationDescriptor,
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

export type OperationDefinition<
  TCtx,
  TCaller,
  TActingFor,
  TActor,
  TGuard extends StructuredGuard<TCaller, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded,
  TResult,
  TPreview = unknown,
> = StructuredHandlerDefinition<
  TCtx,
  TCaller,
  TActingFor,
  TActor,
  TGuard,
  TArgsValidator,
  TLoaded,
  TResult
> & {
  id?: string
  name?: string
  kind?: OperationKind
  permission?: PermissionKeyHandle<string>
  safety?: McpWriteSafety
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
  permission?: PermissionKeyHandle<string>
  safety?: McpWriteSafety
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
    caller: () => Promise<infer TCaller>
  }
    ? TCaller
    : never

type InferOperationDelegation<TDefinition extends OperationShape> =
  InferOperationCtx<TDefinition> extends {
    actingFor: () => Promise<(infer TActingFor) | null>
  }
    ? TActingFor
    : unknown

type InferActorFromCtx<TCtx> = TCtx extends {
  appIdentity: () => Promise<infer TActor>
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

type DescriptorBoundOperationShape = Omit<
  OperationShape,
  'id' | 'kind' | 'args' | 'permission' | 'safety' | 'returns' | 'previewReturns'
> & {
  id?: string
  kind?: OperationKind
  args?: PropertyValidators
  permission?: PermissionKeyHandle<string>
  safety?: McpWriteSafety
  returns?: GenericValidator
  previewReturns?: GenericValidator
}

type DescriptorBoundOperationDefinition<
  TDescriptor extends OperationDescriptor,
  TDefinition extends DescriptorBoundOperationShape,
> = TDefinition & {
  id: TDescriptor['id']
  kind: TDescriptor['kind']
  args: TDescriptor['args']
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
  const permissionKey =
    definition.permission === undefined ? undefined : resolvePermissionKey(definition.permission)
  const metadata = {
    id: definition.id,
    name: definition.name,
    kind: definition.kind ?? 'safe',
    ...(permissionKey ? { permissionKey } : {}),
    ...(definition.safety ? { safety: definition.safety } : {}),
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

function assertDescriptorValue(
  descriptor: OperationDescriptor,
  label: string,
  descriptorValue: unknown,
  implementationValue: unknown,
): void {
  if (implementationValue === undefined || implementationValue === descriptorValue) return
  throw new Error(
    `implementOperation(${descriptor.id}) received ${label} that does not match the operation descriptor.`,
  )
}

function assertDescriptorPermission(
  descriptor: OperationDescriptor,
  definition: { permission?: PermissionKeyHandle<string> },
): void {
  if (!definition.permission || !descriptor.permissionKey) return
  const definitionKey = resolvePermissionKey(definition.permission)
  if (definitionKey === descriptor.permissionKey) return
  throw new Error(
    `implementOperation(...) received permission "${definitionKey}" but descriptor "${descriptor.id}" uses "${descriptor.permissionKey}".`,
  )
}

/**
 * Bind a shared operation descriptor to its Convex implementation.
 *
 * The descriptor owns cross-surface metadata. The implementation owns backend
 * behavior. This helper keeps the two from silently drifting while Phase 0
 * proves operation-first MCP.
 */
export function implementOperation<
  const TDescriptor extends OperationDescriptor,
  const TDefinition extends DescriptorBoundOperationShape,
>(
  descriptor: TDescriptor,
  definition: TDefinition,
): ValidateOperationDefinition<DescriptorBoundOperationDefinition<TDescriptor, TDefinition>> {
  assertDescriptorValue(descriptor, 'id', descriptor.id, definition.id)
  assertDescriptorValue(descriptor, 'name', descriptor.name, definition.name)
  assertDescriptorValue(descriptor, 'kind', descriptor.kind, definition.kind)
  assertDescriptorValue(descriptor, 'args', descriptor.args, definition.args)
  assertDescriptorValue(descriptor, 'returns', descriptor.returns, definition.returns)
  assertDescriptorValue(
    descriptor,
    'previewReturns',
    descriptor.previewReturns,
    definition.previewReturns,
  )
  assertDescriptorValue(descriptor, 'safety', descriptor.safety, definition.safety)
  assertDescriptorPermission(descriptor, definition)

  if (descriptor.kind === 'destructive' && !definition.preview) {
    throw new Error(
      `implementOperation(${descriptor.id}) requires a preview handler for destructive operations.`,
    )
  }

  return defineOperationImpl({
    ...definition,
    id: descriptor.id,
    name: definition.name ?? descriptor.name,
    kind: descriptor.kind,
    args: descriptor.args,
    ...(descriptor.permission !== undefined
      ? { permission: definition.permission ?? descriptor.permission }
      : {}),
    ...(descriptor.safety !== undefined ? { safety: definition.safety ?? descriptor.safety } : {}),
    ...(descriptor.returns !== undefined ? { returns: descriptor.returns } : {}),
    ...(descriptor.previewReturns !== undefined
      ? { previewReturns: descriptor.previewReturns }
      : {}),
  } as ValidateOperationDefinition<DescriptorBoundOperationDefinition<TDescriptor, TDefinition>>)
}

/**
 * Expose the preview phase of an operation as a standalone structured handler.
 *
 * Use this for confirmation flows where a destructive mutation should be
 * preceded by a read-only preview step.
 */
export function previewOf<
  TCtx,
  TCaller,
  TActingFor,
  TActor,
  TGuard extends StructuredGuard<TCaller, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded extends StructuredLoadedValue = undefined,
  TResult = unknown,
  TPreview = unknown,
>(
  operation: OperationDefinition<
    TCtx,
    TCaller,
    TActingFor,
    TActor,
    TGuard,
    TArgsValidator,
    TLoaded,
    TResult,
    TPreview
  >,
): StructuredHandlerDefinition<
  TCtx,
  TCaller,
  TActingFor,
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
    [trellisOperationMetadataKey]: metadata,
    ...(metadata.id
      ? {
          [trellisOperationProjectionMetadataKey]: {
            operationId: metadata.id,
            projection: 'preview' as const,
            ...(operation.identityForwardingFunctionRef
              ? { executeFunctionRef: operation.identityForwardingFunctionRef }
              : {}),
          },
        }
      : {}),
  } as StructuredHandlerDefinition<
    TCtx,
    TCaller,
    TActingFor,
    TActor,
    TGuard,
    TArgsValidator,
    TLoaded,
    TPreview
  >
}
