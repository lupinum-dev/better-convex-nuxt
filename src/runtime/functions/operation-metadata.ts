import type { PropertyValidators } from 'convex/values'

import { resolvePermissionKey, type PermissionKeyHandle } from '../auth/define-permission.js'
import {
  getFunctionName,
  type AnyActionFunction,
  type AnyMutationFunction,
  type AnyQueryFunction,
} from '../convex/shared/convex-shared.js'

export type OperationKind = 'safe' | 'destructive'

export type McpWriteSafety =
  | 'read'
  | 'bounded-write'
  | 'sensitive-write'
  | 'destructive-write'
  | 'external-side-effect'

export type TrellisOperationMetadata = {
  id?: string
  name?: string
  kind: OperationKind
  permissionKey?: string
  safety?: McpWriteSafety
}

export type TrellisOperationProjectionMetadata = {
  operationId: string
  projection: 'execute' | 'preview'
  functionRef?: string
  executeFunctionRef?: string
}

export const trellisOperationMetadataKey = Symbol.for('trellis.operation')
export const trellisOperationProjectionMetadataKey = Symbol.for('trellis.operation.projection')

export type OperationProjectionKind = TrellisOperationProjectionMetadata['projection']

const operationProjectionMetadataByRef = new WeakMap<object, TrellisOperationProjectionMetadata>()

type OperationMetadataCarrier = {
  [trellisOperationMetadataKey]?: TrellisOperationMetadata
  id?: string
  name?: string
  kind?: OperationKind
}

export type OperationDescriptor<
  TId extends string = string,
  TArgs extends PropertyValidators = PropertyValidators,
  TPermission extends PermissionKeyHandle<string> | undefined =
    | PermissionKeyHandle<string>
    | undefined,
  TReturns = unknown,
  TPreviewReturns = unknown,
> = {
  readonly _type: 'operation-descriptor'
  readonly id: TId
  readonly name?: string
  readonly kind: OperationKind
  readonly args: TArgs
  readonly permission?: TPermission
  readonly permissionKey?: string
  readonly returns?: TReturns
  readonly previewReturns?: TPreviewReturns
  readonly safety?: McpWriteSafety
  readonly [trellisOperationMetadataKey]: TrellisOperationMetadata
}

export function isOperationDescriptor(value: unknown): value is OperationDescriptor {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { _type?: unknown })._type === 'operation-descriptor' &&
    typeof (value as { id?: unknown }).id === 'string' &&
    typeof (value as { kind?: unknown }).kind === 'string' &&
    (value as { [trellisOperationMetadataKey]?: unknown })[trellisOperationMetadataKey] !==
      undefined
  )
}

export type OperationMetadataDefinition<
  TId extends string = string,
  TArgs extends Record<string, unknown> = Record<string, unknown>,
> = {
  id: TId
  name?: string
  kind?: OperationKind
  args?: TArgs
  [trellisOperationMetadataKey]: TrellisOperationMetadata
}

export function defineOperationMetadata<
  const TId extends string,
  const TArgs extends Record<string, unknown> = Record<string, unknown>,
>(definition: {
  id: TId
  name?: string
  kind?: OperationKind
  args?: TArgs
}): OperationMetadataDefinition<TId, TArgs> {
  const metadata = {
    id: definition.id,
    name: definition.name,
    kind: definition.kind ?? 'safe',
  } satisfies TrellisOperationMetadata

  if (metadata.kind === 'destructive' && !metadata.id) {
    throw new Error('defineOperationMetadata(...) requires `id` for destructive operations.')
  }

  return Object.assign(
    {
      id: definition.id,
      name: definition.name,
      kind: metadata.kind,
      args: definition.args,
    },
    {
      [trellisOperationMetadataKey]: metadata,
    },
  ) as OperationMetadataDefinition<TId, TArgs>
}

export function defineOperationDescriptor<
  const TId extends string,
  const TArgs extends PropertyValidators,
  const TPermission extends PermissionKeyHandle<string> | undefined = undefined,
  const TReturns = unknown,
  const TPreviewReturns = unknown,
>(definition: {
  id: TId
  name?: string
  kind?: OperationKind
  args: TArgs
  permission?: TPermission
  returns?: TReturns
  previewReturns?: TPreviewReturns
  safety?: McpWriteSafety
}): OperationDescriptor<TId, TArgs, TPermission, TReturns, TPreviewReturns> {
  if (definition.id.trim().length === 0) {
    throw new Error('defineOperationDescriptor(...) requires a non-empty operation id.')
  }

  const kind = definition.kind ?? 'safe'
  const permissionKey =
    definition.permission === undefined ? undefined : resolvePermissionKey(definition.permission)
  const metadata = {
    id: definition.id,
    name: definition.name,
    kind,
    ...(permissionKey ? { permissionKey } : {}),
    ...(definition.safety ? { safety: definition.safety } : {}),
  } satisfies TrellisOperationMetadata

  if (metadata.kind === 'destructive' && !metadata.id) {
    throw new Error('defineOperationDescriptor(...) requires `id` for destructive operations.')
  }

  return {
    _type: 'operation-descriptor',
    id: definition.id,
    ...(definition.name ? { name: definition.name } : {}),
    kind,
    args: definition.args,
    ...(definition.permission !== undefined ? { permission: definition.permission } : {}),
    ...(permissionKey ? { permissionKey } : {}),
    ...(definition.returns ? { returns: definition.returns } : {}),
    ...(definition.previewReturns ? { previewReturns: definition.previewReturns } : {}),
    ...(definition.safety ? { safety: definition.safety } : {}),
    [trellisOperationMetadataKey]: metadata,
  }
}

export type OperationIdOf<TOperation extends OperationMetadataCarrier> = TOperation extends {
  id: infer TId extends string
}
  ? TId
  : TOperation extends {
        [trellisOperationMetadataKey]?: infer TMetadata
      }
    ? TMetadata extends { id: infer TId extends string }
      ? TId
      : never
    : never

export type ValidateOperationId<
  TOperation extends OperationMetadataCarrier,
  TId extends string = string,
> = TId extends NoInfer<Extract<OperationIdOf<TOperation>, string>> ? TId : never

export type OperationProjectionRef<
  TRef,
  TOperationId extends string = string,
  TProjection extends OperationProjectionKind = OperationProjectionKind,
> = TRef & {
  readonly [trellisOperationProjectionMetadataKey]: {
    operationId: TOperationId
    projection: TProjection
    functionRef?: string
  }
}

export type ValidateOperationProjectionRef<
  TOperation extends OperationMetadataCarrier,
  TProjection extends OperationProjectionKind,
  TRef,
> = OperationProjectionRef<TRef, Extract<OperationIdOf<TOperation>, string>, TProjection>

export function getOperationMetadata(operation: {
  [trellisOperationMetadataKey]?: TrellisOperationMetadata
  id?: string
  name?: string
  kind?: OperationKind
}): TrellisOperationMetadata {
  return (
    operation[trellisOperationMetadataKey] ?? {
      id: operation.id,
      name: operation.name,
      kind: operation.kind ?? 'safe',
    }
  )
}

export function getOperationProjectionMetadata(value: {
  [trellisOperationProjectionMetadataKey]?: TrellisOperationProjectionMetadata
}): TrellisOperationProjectionMetadata | null {
  const metadata = value[trellisOperationProjectionMetadataKey]
  if (metadata) return metadata
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return null
  const descriptor = Object.getOwnPropertyDescriptor(value, trellisOperationProjectionMetadataKey)
  const descriptorMetadata = descriptor?.value
  if (descriptorMetadata) return descriptorMetadata as TrellisOperationProjectionMetadata
  return operationProjectionMetadataByRef.get(value) ?? null
}

export function stampOperationProjection<T>(
  value: T,
  metadata: TrellisOperationProjectionMetadata | undefined,
): T {
  if (!metadata) return value
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
    return value
  }

  operationProjectionMetadataByRef.set(value, metadata)

  try {
    Object.defineProperty(value, trellisOperationProjectionMetadataKey, {
      value: metadata,
      enumerable: false,
      configurable: true,
      writable: false,
    })
  } catch {
    // Some function refs are proxies that reject extension. The WeakMap above is the source of truth.
  }

  return value
}

type ConvexFunctionRefLike = AnyQueryFunction | AnyMutationFunction | AnyActionFunction

function inferFunctionRef(value: unknown): string | undefined {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
    return undefined
  }

  const functionRef = getFunctionName(value as ConvexFunctionRefLike)
  return functionRef && functionRef !== 'unknown' ? functionRef : undefined
}

export function projectOperationRef<
  TOperation extends OperationMetadataCarrier,
  TProjection extends OperationProjectionKind,
  TRef,
>(
  operation: TOperation,
  projection: TProjection,
  ref: TRef,
  options: { functionRef?: string } = {},
): ValidateOperationProjectionRef<TOperation, TProjection, TRef> {
  const metadata = getOperationMetadata(operation)
  if (!metadata.id) {
    throw new Error('Operation projection refs require an operation with an `id`.')
  }

  const functionRef = options.functionRef ?? inferFunctionRef(ref)

  return stampOperationProjection(ref, {
    operationId: metadata.id,
    projection,
    ...(functionRef ? { functionRef } : {}),
    ...(projection === 'preview' && 'identityForwardingFunctionRef' in operation
      ? {
          executeFunctionRef:
            typeof operation.identityForwardingFunctionRef === 'string'
              ? operation.identityForwardingFunctionRef
              : undefined,
        }
      : {}),
  }) as ValidateOperationProjectionRef<TOperation, TProjection, TRef>
}

export function executeOperationRef<TOperation extends OperationMetadataCarrier, TRef>(
  operation: TOperation,
  ref: TRef,
  options: { functionRef?: string } = {},
): ValidateOperationProjectionRef<TOperation, 'execute', TRef> {
  return projectOperationRef(operation, 'execute', ref, options)
}

export function transportExecuteOperationRef<TOperation extends OperationMetadataCarrier, TRef>(
  operation: TOperation,
  ref: TRef,
  options: { functionRef?: string } = {},
): ValidateOperationProjectionRef<TOperation, 'execute', TRef> {
  return projectOperationRef(operation, 'execute', ref, options)
}

export function previewOperationRef<TOperation extends OperationMetadataCarrier, TRef>(
  operation: TOperation,
  ref: TRef,
  options: { functionRef?: string } = {},
): ValidateOperationProjectionRef<TOperation, 'preview', TRef> {
  return projectOperationRef(operation, 'preview', ref, options)
}
