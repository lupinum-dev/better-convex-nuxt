import {
  getOperationMetadata,
  getOperationProjectionMetadata,
} from '../functions/operation-metadata.js'
import { getFunctionName } from '../utils/convex-shared.js'
import type {
  AnyActionFunction,
  AnyMutationFunction,
  AnyQueryFunction,
} from '../utils/convex-shared.js'

type AnyQueryRef = AnyQueryFunction
type AnyMutationRef = AnyMutationFunction
type AnyActionRef = AnyActionFunction
export type AnyFunctionRef = AnyQueryRef | AnyMutationRef | AnyActionRef

export function toKebabCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
}

export function assertOperationBinding(
  operation: { id?: string; name?: string; kind?: 'safe' | 'destructive' },
  executeRef: AnyFunctionRef,
  previewRef?: AnyFunctionRef,
): void {
  const metadata = getOperationMetadata(operation)
  if (!metadata.id) {
    throw new Error('tool.fromOperation(...) requires an operation with an `id`.')
  }

  const executeTarget = getOperationProjectionMetadata(executeRef as Record<PropertyKey, unknown>)
  if (!executeTarget && getFunctionName(executeRef) === 'unknown') {
    throw new Error(
      `tool.fromOperation(${metadata.name ?? metadata.id}) requires an execute ref projected from the same operation or a generated API reference.`,
    )
  }
  if (
    executeTarget &&
    (executeTarget.operationId !== metadata.id || executeTarget.projection !== 'execute')
  ) {
    throw new Error(
      `tool.fromOperation(${metadata.name ?? metadata.id}) received an execute ref that does not match operation id "${metadata.id}".`,
    )
  }

  if (!previewRef) return

  const previewTarget = getOperationProjectionMetadata(previewRef as Record<PropertyKey, unknown>)
  if (!previewTarget && getFunctionName(previewRef) === 'unknown') {
    throw new Error(
      `tool.fromOperation(${metadata.name ?? metadata.id}) requires a preview ref projected from the same operation or a generated API reference.`,
    )
  }
  if (
    previewTarget &&
    (previewTarget.operationId !== metadata.id || previewTarget.projection !== 'preview')
  ) {
    throw new Error(
      `tool.fromOperation(${metadata.name ?? metadata.id}) received a preview ref that does not match operation id "${metadata.id}".`,
    )
  }
}
