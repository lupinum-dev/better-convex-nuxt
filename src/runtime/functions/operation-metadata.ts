export type OperationKind = 'safe' | 'destructive'

export type TrellisOperationMetadata = {
  id?: string
  name?: string
  kind: OperationKind
}

export type TrellisOperationProjectionMetadata = {
  operationId: string
  projection: 'execute' | 'preview'
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

export function projectOperationRef<
  TOperation extends OperationMetadataCarrier,
  TProjection extends OperationProjectionKind,
  TRef,
>(
  operation: TOperation,
  projection: TProjection,
  ref: TRef,
): ValidateOperationProjectionRef<TOperation, TProjection, TRef> {
  const metadata = getOperationMetadata(operation)
  if (!metadata.id) {
    throw new Error('Operation projection refs require an operation with an `id`.')
  }

  return stampOperationProjection(ref, {
    operationId: metadata.id,
    projection,
  }) as ValidateOperationProjectionRef<TOperation, TProjection, TRef>
}

export function executeOperationRef<TOperation extends OperationMetadataCarrier, TRef>(
  operation: TOperation,
  ref: TRef,
): ValidateOperationProjectionRef<TOperation, 'execute', TRef> {
  return projectOperationRef(operation, 'execute', ref)
}

export function previewOperationRef<TOperation extends OperationMetadataCarrier, TRef>(
  operation: TOperation,
  ref: TRef,
): ValidateOperationProjectionRef<TOperation, 'preview', TRef> {
  return projectOperationRef(operation, 'preview', ref)
}
