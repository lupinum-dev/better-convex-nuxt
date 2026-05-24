import { basename, relative, resolve } from 'node:path'

import {
  Node,
  Project,
  type ExportAssignment,
  type ObjectLiteralExpression,
  type SourceFile,
  type VariableDeclaration,
} from 'ts-morph'

export const DEFAULT_OPERATION_CODEGEN_INCLUDE = ['convex/**/*.ts'] as const
export const DEFAULT_MCP_TOOL_CODEGEN_INCLUDE = ['server/mcp/tools/**/*.ts'] as const

export interface OperationDefinitionMetadata {
  exportName: string
  file: string
  line: number
  id: string
  name?: string
  kind: 'safe' | 'destructive'
}

export interface OperationProjectionBindingMetadata {
  operationId: string
  operationExportName: string
  exportName: string
  file: string
  line: number
  projection: 'execute' | 'preview'
}

export interface ToolDefinitionMetadata {
  name: string
  file: string
  line: number
  source: 'tool' | 'operation' | 'defineTool'
  operationId?: string
  operationExportName?: string
}

export interface PublicSurfaceCodegenMetadata {
  include: {
    operations: string[]
    tools: string[]
  }
  operations: OperationDefinitionMetadata[]
  projections: OperationProjectionBindingMetadata[]
  tools: ToolDefinitionMetadata[]
}

function toPosixPath(value: string): string {
  return value.replaceAll('\\', '/')
}

function isPrivateMcpSurfaceFile(rootDir: string, sourceFile: SourceFile): boolean {
  const file = toPosixPath(relative(rootDir, sourceFile.getFilePath()))
  if (!file.startsWith('server/mcp/')) return false
  return basename(file).startsWith('_')
}

function createProject(rootDir: string, include: readonly string[]): Project {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
  })

  for (const pattern of include) {
    project.addSourceFilesAtPaths(resolve(rootDir, pattern))
  }

  return project
}

function unwrapExpression<T extends Node>(expression: T | undefined): Node | undefined {
  let current: Node | undefined = expression

  while (current) {
    if (
      Node.isAsExpression(current) ||
      Node.isSatisfiesExpression(current) ||
      Node.isParenthesizedExpression(current)
    ) {
      current = current.getExpression()
      continue
    }

    return current
  }

  return undefined
}

function readStringProperty(node: ObjectLiteralExpression, name: string): string | undefined {
  const property = node.getProperty(name)
  if (!property || !Node.isPropertyAssignment(property)) return undefined
  const initializer = unwrapExpression(property.getInitializer())
  if (!initializer) return undefined

  if (Node.isStringLiteral(initializer) || Node.isNoSubstitutionTemplateLiteral(initializer)) {
    return initializer.getLiteralText()
  }

  return undefined
}

function readNestedStringProperty(
  node: ObjectLiteralExpression,
  parentName: string,
  childName: string,
): string | undefined {
  const property = node.getProperty(parentName)
  if (!property || !Node.isPropertyAssignment(property)) return undefined
  const initializer = unwrapExpression(property.getInitializer())
  if (!initializer || !Node.isObjectLiteralExpression(initializer)) return undefined
  return readStringProperty(initializer, childName)
}

function readOperationDefinitionObject(
  declaration: VariableDeclaration,
): ObjectLiteralExpression | null {
  if (!declaration.getVariableStatement()?.isExported()) return null

  const initializer = unwrapExpression(declaration.getInitializer())
  if (!initializer || !Node.isCallExpression(initializer)) return null

  const callee = unwrapExpression(initializer.getExpression())
  if (Node.isIdentifier(callee) && callee.getText() === 'defineOperation') {
    const [arg] = initializer.getArguments()
    const unwrappedArg = unwrapExpression(arg)
    return unwrappedArg && Node.isObjectLiteralExpression(unwrappedArg) ? unwrappedArg : null
  }

  if (!callee || !Node.isCallExpression(callee)) return null
  const inner = unwrapExpression(callee.getExpression())
  if (!inner || !Node.isPropertyAccessExpression(inner)) return null
  if (inner.getName() !== 'withContext') return null
  if (inner.getExpression().getText() !== 'defineOperation') return null

  const [arg] = initializer.getArguments()
  const unwrappedArg = unwrapExpression(arg)
  return unwrappedArg && Node.isObjectLiteralExpression(unwrappedArg) ? unwrappedArg : null
}

function extractOperationDefinitions(
  rootDir: string,
  sourceFile: SourceFile,
): OperationDefinitionMetadata[] {
  const operations: OperationDefinitionMetadata[] = []

  for (const declaration of sourceFile.getVariableDeclarations()) {
    const definition = readOperationDefinitionObject(declaration)
    if (!definition) continue

    const id = readStringProperty(definition, 'id')
    if (!id) continue

    operations.push({
      exportName: declaration.getName(),
      file: toPosixPath(relative(rootDir, sourceFile.getFilePath())),
      line: declaration.getNameNode().getStartLineNumber(),
      id,
      ...(readStringProperty(definition, 'name')
        ? { name: readStringProperty(definition, 'name') }
        : {}),
      kind:
        (readStringProperty(definition, 'kind') as 'safe' | 'destructive' | undefined) ?? 'safe',
    })
  }

  return operations
}

function extractProjectionBinding(
  declaration: VariableDeclaration,
  operationsByExport: Map<string, OperationDefinitionMetadata>,
): OperationProjectionBindingMetadata | null {
  if (!declaration.getVariableStatement()?.isExported()) return null

  const initializer = unwrapExpression(declaration.getInitializer())
  if (!initializer || !Node.isCallExpression(initializer)) return null

  const [firstArg] = initializer.getArguments()
  const unwrappedFirstArg = unwrapExpression(firstArg)
  if (!unwrappedFirstArg) return null

  if (Node.isIdentifier(unwrappedFirstArg)) {
    const operation = operationsByExport.get(unwrappedFirstArg.getText())
    if (!operation) return null

    return {
      operationId: operation.id,
      operationExportName: operation.exportName,
      exportName: declaration.getName(),
      file: operation.file,
      line: declaration.getNameNode().getStartLineNumber(),
      projection: 'execute',
    }
  }

  if (!Node.isCallExpression(unwrappedFirstArg)) return null
  const previewCallee = unwrapExpression(unwrappedFirstArg.getExpression())
  if (!previewCallee || !Node.isIdentifier(previewCallee)) return null
  if (previewCallee.getText() !== 'previewOf') return null

  const [previewArg] = unwrappedFirstArg.getArguments()
  const unwrappedPreviewArg = unwrapExpression(previewArg)
  if (!unwrappedPreviewArg || !Node.isIdentifier(unwrappedPreviewArg)) return null

  const operation = operationsByExport.get(unwrappedPreviewArg.getText())
  if (!operation) return null

  return {
    operationId: operation.id,
    operationExportName: operation.exportName,
    exportName: declaration.getName(),
    file: operation.file,
    line: declaration.getNameNode().getStartLineNumber(),
    projection: 'preview',
  }
}

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/gi, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function deriveToolName(sourceFile: SourceFile): string {
  const base = basename(sourceFile.getBaseNameWithoutExtension())
  return toKebabCase(base)
}

function readToolMetadata(
  rootDir: string,
  sourceFile: SourceFile,
  exportAssignment: ExportAssignment,
  operationsByExport: Map<string, OperationDefinitionMetadata>,
): ToolDefinitionMetadata | null {
  const expression = unwrapExpression(exportAssignment.getExpression())
  if (!expression || !Node.isCallExpression(expression)) return null

  const callee = unwrapExpression(expression.getExpression())
  let source: ToolDefinitionMetadata['source'] | null = null
  let options: ObjectLiteralExpression | null = null
  let operation: OperationDefinitionMetadata | undefined

  if (Node.isIdentifier(callee)) {
    if (callee.getText() !== 'tool' && callee.getText() !== 'defineTool') return null
    source = callee.getText() === 'defineTool' ? 'defineTool' : 'tool'
    const [firstArg] = expression.getArguments()
    const unwrappedArg = unwrapExpression(firstArg)
    options = unwrappedArg && Node.isObjectLiteralExpression(unwrappedArg) ? unwrappedArg : null
  } else if (Node.isPropertyAccessExpression(callee)) {
    if (callee.getName() === 'operation') {
      source = 'operation'
      const firstArg = unwrapExpression(expression.getArguments()[0])
      if (firstArg && Node.isIdentifier(firstArg)) {
        operation = operationsByExport.get(firstArg.getText())
      }
    } else if (['query', 'mutation', 'action'].includes(callee.getName())) {
      source = 'tool'
    } else {
      return null
    }
    const optionsArgIndex = callee.getName() === 'operation' ? 1 : 0
    const unwrappedArg = unwrapExpression(expression.getArguments()[optionsArgIndex])
    options = unwrappedArg && Node.isObjectLiteralExpression(unwrappedArg) ? unwrappedArg : null
  } else {
    return null
  }

  if (!source) return null

  return {
    name:
      options &&
      (readStringProperty(options, 'name') ?? readNestedStringProperty(options, 'meta', 'name'))
        ? (readStringProperty(options, 'name') ??
            readNestedStringProperty(options, 'meta', 'name'))!
        : deriveToolName(sourceFile),
    file: toPosixPath(relative(rootDir, sourceFile.getFilePath())),
    line: exportAssignment.getStartLineNumber(),
    source,
    ...(operation
      ? {
          operationId: operation.id,
          operationExportName: operation.exportName,
        }
      : {}),
  }
}

function toTypeImportPath(file: string): string {
  const withoutExtension = file.replace(/\.(cts|mts|ts|tsx|js|jsx)$/, '')
  return `../../${withoutExtension}`
}

function renderTypeImports(metadata: PublicSurfaceCodegenMetadata): string {
  const lines: string[] = []

  metadata.operations.forEach((operation, index) => {
    lines.push(
      `import type { ${operation.exportName} as __trellisOperation${index} } from ${JSON.stringify(toTypeImportPath(operation.file))}`,
    )
  })

  metadata.projections.forEach((projection, index) => {
    lines.push(
      `import type { ${projection.exportName} as __trellisProjection${index} } from ${JSON.stringify(toTypeImportPath(projection.file))}`,
    )
  })

  metadata.tools.forEach((tool, index) => {
    lines.push(
      `import type __trellisTool${index} from ${JSON.stringify(toTypeImportPath(tool.file))}`,
    )
  })

  return lines.join('\n')
}

function renderInterfaceBody(lines: string[]): string {
  return lines.length > 0 ? lines.map((line) => `  ${line}`).join('\n') : ''
}

export function extractPublicSurfaceCodegenMetadata(rootDir: string): PublicSurfaceCodegenMetadata {
  const operationInclude = [...DEFAULT_OPERATION_CODEGEN_INCLUDE]
  const toolInclude = [...DEFAULT_MCP_TOOL_CODEGEN_INCLUDE]
  const project = createProject(rootDir, [...operationInclude, ...toolInclude])

  const operations: OperationDefinitionMetadata[] = []
  const projections: OperationProjectionBindingMetadata[] = []
  const tools: ToolDefinitionMetadata[] = []

  for (const sourceFile of project.getSourceFiles()) {
    if (isPrivateMcpSurfaceFile(rootDir, sourceFile)) continue

    const fileOperations = extractOperationDefinitions(rootDir, sourceFile)

    operations.push(...fileOperations)
  }

  const operationExportCounts = new Map<string, number>()
  for (const operation of operations) {
    operationExportCounts.set(
      operation.exportName,
      (operationExportCounts.get(operation.exportName) ?? 0) + 1,
    )
  }
  const operationsByExport = new Map(
    operations
      .filter((operation) => operationExportCounts.get(operation.exportName) === 1)
      .map((operation) => [operation.exportName, operation]),
  )

  for (const sourceFile of project.getSourceFiles()) {
    if (isPrivateMcpSurfaceFile(rootDir, sourceFile)) continue

    const fileOperationsByExport = new Map(
      operations
        .filter(
          (operation) =>
            operation.file === toPosixPath(relative(rootDir, sourceFile.getFilePath())),
        )
        .map((operation) => [operation.exportName, operation]),
    )

    for (const declaration of sourceFile.getVariableDeclarations()) {
      const binding = extractProjectionBinding(declaration, fileOperationsByExport)
      if (binding) projections.push(binding)
    }

    for (const exportAssignment of sourceFile.getExportAssignments()) {
      const tool = readToolMetadata(rootDir, sourceFile, exportAssignment, operationsByExport)
      if (tool) tools.push(tool)
    }
  }

  operations.sort((a, b) => a.id.localeCompare(b.id) || a.file.localeCompare(b.file))
  projections.sort(
    (a, b) =>
      a.operationId.localeCompare(b.operationId) ||
      a.projection.localeCompare(b.projection) ||
      a.file.localeCompare(b.file),
  )
  tools.sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file))

  return {
    include: {
      operations: operationInclude,
      tools: toolInclude,
    },
    operations,
    projections,
    tools,
  }
}

export function renderPublicSurfaceCodegenTypes(metadata: PublicSurfaceCodegenMetadata): string {
  const imports = renderTypeImports(metadata)

  const operationsById = metadata.operations.map(
    (operation, index) => `${JSON.stringify(operation.id)}: typeof __trellisOperation${index}`,
  )

  const operationExecutionsById = metadata.projections
    .filter((projection) => projection.projection === 'execute')
    .map((projection) => {
      const projectionIndex = metadata.projections.indexOf(projection)
      return `${JSON.stringify(projection.operationId)}: typeof __trellisProjection${projectionIndex}`
    })

  const operationPreviewsById = metadata.projections
    .filter((projection) => projection.projection === 'preview')
    .map((projection) => {
      const projectionIndex = metadata.projections.indexOf(projection)
      return `${JSON.stringify(projection.operationId)}: typeof __trellisProjection${projectionIndex}`
    })

  const toolsByName = metadata.tools.map(
    (tool, index) => `${JSON.stringify(tool.name)}: typeof __trellisTool${index}`,
  )

  return `// AUTO-GENERATED. Do not edit.
// Source operations: ${metadata.include.operations.join(', ')}
// Source tools: ${metadata.include.tools.join(', ')}

import '@lupinum/trellis/backend'
import '@lupinum/trellis/mcp'
${imports}${imports ? '\n' : ''}

declare module '@lupinum/trellis/backend' {
  interface OperationsById {
${renderInterfaceBody(operationsById)}
  }

  interface OperationExecutionsById {
${renderInterfaceBody(operationExecutionsById)}
  }

  interface OperationPreviewsById {
${renderInterfaceBody(operationPreviewsById)}
  }
}

declare module '@lupinum/trellis/mcp' {
  interface ToolsByName {
${renderInterfaceBody(toolsByName)}
  }
}
`
}

export function renderPublicSurfaceCodegenMetadata(metadata: PublicSurfaceCodegenMetadata): string {
  return `${JSON.stringify(metadata, null, 2)}\n`
}

export function shouldRefreshPublicSurfaceCodegen(changedPath: string): boolean {
  const normalizedPath = toPosixPath(changedPath)
  if (!normalizedPath.endsWith('.ts')) return false
  if (normalizedPath.startsWith('server/mcp/') && basename(normalizedPath).startsWith('_')) {
    return false
  }

  return normalizedPath.startsWith('convex/') || normalizedPath.startsWith('server/mcp/tools/')
}
