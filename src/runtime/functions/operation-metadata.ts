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
  return value[trellisOperationProjectionMetadataKey] ?? null
}

export function stampOperationProjection<T>(
  value: T,
  metadata: TrellisOperationProjectionMetadata | undefined,
): T {
  if (!metadata) return value
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
    return value
  }

  Object.defineProperty(value, trellisOperationProjectionMetadataKey, {
    value: metadata,
    enumerable: false,
    configurable: true,
    writable: false,
  })

  return value
}
