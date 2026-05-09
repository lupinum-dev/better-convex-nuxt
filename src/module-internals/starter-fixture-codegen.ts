import { renderMcpToolRefsModule, type McpToolRefBindingInput } from './mcp-tool-ref-codegen.js'
import {
  renderOperationRefsModule,
  type OperationRefBindingInput,
} from './operation-ref-codegen.js'

export type StarterGeneratedFile =
  | {
      kind: 'operationRefs'
      path: string
      projectOperationRefImport: string
      apiImport: string
      descriptorImport: string
      descriptors: readonly string[]
      refs: readonly OperationRefBindingInput[]
    }
  | {
      kind: 'mcpToolRefs'
      path: string
      projectMcpToolRefImport: string
      apiImport: string
      descriptorImport: string
      descriptors: readonly string[]
      refs: readonly McpToolRefBindingInput[]
    }

export interface StarterFixtureManifest {
  name: string
  description?: string
  include: readonly string[]
  exclude: readonly string[]
  generated?: readonly StarterGeneratedFile[]
}

export interface RenderedStarterFile {
  path: string
  content: string
}

export function renderStarterGeneratedFiles(
  manifest: StarterFixtureManifest,
): RenderedStarterFile[] {
  return (manifest.generated ?? []).map((file) => {
    switch (file.kind) {
      case 'operationRefs':
        return {
          path: file.path,
          content: renderOperationRefsModule(file),
        }
      case 'mcpToolRefs':
        return {
          path: file.path,
          content: renderMcpToolRefsModule(file),
        }
    }
  })
}
