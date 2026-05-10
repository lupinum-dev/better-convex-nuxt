import type {
  AnyActionFunction,
  AnyMutationFunction,
  AnyQueryFunction,
} from '../convex/shared/convex-shared.js'
import {
  getOperationMetadata,
  getOperationProjectionMetadata,
  type McpWriteSafety,
} from '../functions/operation-metadata.js'

type AnyQueryRef = AnyQueryFunction
type AnyMutationRef = AnyMutationFunction
type AnyActionRef = AnyActionFunction
export type AnyFunctionRef = AnyQueryRef | AnyMutationRef | AnyActionRef

export type TrellisMcpToolSafety = {
  kind: McpWriteSafety
  reason: string
}

export type McpToolRefDescriptor = {
  readonly _type: 'mcp-tool-ref-descriptor'
  readonly name: string
  readonly safety: TrellisMcpToolSafety
}

export const trellisMcpToolSafetyKey = Symbol.for('trellis.mcp.toolSafety')

const mcpToolSafetyByRef = new WeakMap<object, TrellisMcpToolSafety>()

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
    throw new Error('tool.operation(...) requires an operation with an `id`.')
  }

  const executeTarget = getOperationProjectionMetadata(executeRef as Record<PropertyKey, unknown>)
  if (!executeTarget) {
    throw new Error(
      `tool.operation(${metadata.name ?? metadata.id}) requires an execute ref projected from the same operation.`,
    )
  }
  if (
    executeTarget &&
    (executeTarget.operationId !== metadata.id || executeTarget.projection !== 'execute')
  ) {
    throw new Error(
      `tool.operation(${metadata.name ?? metadata.id}) received an execute ref that does not match operation id "${metadata.id}".`,
    )
  }

  if (!previewRef) {
    if (metadata.kind === 'destructive') {
      throw new Error(
        `tool.operation(${metadata.name ?? metadata.id}) requires a preview ref for destructive operations.`,
      )
    }
    return
  }

  const previewTarget = getOperationProjectionMetadata(previewRef as Record<PropertyKey, unknown>)
  if (!previewTarget) {
    throw new Error(
      `tool.operation(${metadata.name ?? metadata.id}) requires a preview ref projected from the same operation.`,
    )
  }
  if (
    previewTarget &&
    (previewTarget.operationId !== metadata.id || previewTarget.projection !== 'preview')
  ) {
    throw new Error(
      `tool.operation(${metadata.name ?? metadata.id}) received a preview ref that does not match operation id "${metadata.id}".`,
    )
  }
}

export function stampMcpToolSafety<T>(value: T, safety: TrellisMcpToolSafety): T {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
    return value
  }

  mcpToolSafetyByRef.set(value, safety)

  try {
    Object.defineProperty(value, trellisMcpToolSafetyKey, {
      value: safety,
      enumerable: false,
      configurable: true,
      writable: false,
    })
  } catch {
    // Some generated function refs are proxies that reject extension. The WeakMap remains canonical.
  }

  return value
}

export function defineMcpToolRefDescriptor(definition: {
  name: string
  safety: TrellisMcpToolSafety
}): McpToolRefDescriptor {
  if (definition.name.trim().length === 0) {
    throw new Error('defineMcpToolRefDescriptor(...) requires a non-empty tool name.')
  }

  return {
    _type: 'mcp-tool-ref-descriptor',
    name: definition.name,
    safety: definition.safety,
  }
}

export function projectMcpToolRef<T>(descriptor: McpToolRefDescriptor, ref: T): T {
  return stampMcpToolSafety(ref, descriptor.safety)
}

export function getMcpToolSafety(value: unknown): TrellisMcpToolSafety | null {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return null

  const keyedSafety = (value as { [trellisMcpToolSafetyKey]?: TrellisMcpToolSafety })[
    trellisMcpToolSafetyKey
  ]
  if (keyedSafety) return keyedSafety

  const descriptor = Object.getOwnPropertyDescriptor(value, trellisMcpToolSafetyKey)
  if (descriptor?.value) return descriptor.value as TrellisMcpToolSafety

  return mcpToolSafetyByRef.get(value) ?? null
}
