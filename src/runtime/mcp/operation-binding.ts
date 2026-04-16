import type { FunctionReference } from 'convex/server'

import { getFunctionName } from '../utils/convex-shared.js'

type AnyQueryRef = FunctionReference<'query', 'public' | 'internal'>
type AnyMutationRef = FunctionReference<'mutation', 'public' | 'internal'>
type AnyActionRef = FunctionReference<'action', 'public' | 'internal'>
export type AnyFunctionRef = AnyQueryRef | AnyMutationRef | AnyActionRef

export function toKebabCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
}

function splitFunctionPath(path: string): { moduleName: string; exportName: string } {
  const separator = path.indexOf(':')
  if (separator === -1) {
    throw new Error(`Invalid Convex function path "${path}". Expected "module:export".`)
  }

  return {
    moduleName: path.slice(0, separator),
    exportName: path.slice(separator + 1),
  }
}

function capitalize(input: string): string {
  return input.length === 0 ? input : input[0]!.toUpperCase() + input.slice(1)
}

export function assertOperationBinding(
  operationName: string,
  executeRef: AnyFunctionRef,
  previewRef?: AnyFunctionRef,
): void {
  const executePath = getFunctionName(executeRef)
  const executeTarget = splitFunctionPath(executePath)
  if (executeTarget.exportName !== operationName) {
    throw new Error(
      `tool.fromOperation(${operationName}) expected execute ref "${operationName}" but received "${executePath}".`,
    )
  }

  if (!previewRef) return

  const previewPath = getFunctionName(previewRef)
  const previewTarget = splitFunctionPath(previewPath)
  const expectedPreviewExport = `preview${capitalize(operationName)}`

  if (previewTarget.exportName !== expectedPreviewExport) {
    throw new Error(
      `tool.fromOperation(${operationName}) expected preview ref "${expectedPreviewExport}" but received "${previewPath}".`,
    )
  }

  if (previewTarget.moduleName !== executeTarget.moduleName) {
    throw new Error(
      `tool.fromOperation(${operationName}) requires execute and preview refs from the same module. Received "${executePath}" and "${previewPath}".`,
    )
  }
}
