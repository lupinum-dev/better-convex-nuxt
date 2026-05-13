import { relative, resolve } from 'node:path'

import {
  Node,
  Project,
  SyntaxKind,
  type ArrayLiteralExpression,
  type ObjectLiteralExpression,
  type SourceFile,
  type VariableDeclaration,
} from 'ts-morph'

export interface PermissionDefinitionMetadata {
  exportName: string
  file: string
  line: number
  key: string
  label?: string
  roles: string[]
  projected: boolean
}

type PermissionInventoryEntry = {
  kind: 'permission' | 'array'
  name: string
}

export interface PermissionInventoryMetadata {
  exportName: string
  file: string
  line: number
  entries: PermissionInventoryEntry[]
  permissions: string[]
  unknown: string[]
}

export interface PermissionMatrixMetadata {
  exportName: string
  sourceInventory: string
  file: string
  line: number
  permissions: string[]
  unknown: string[]
}

export interface PermissionCodegenMetadata {
  include: string[]
  permissions: PermissionDefinitionMetadata[]
  inventories: PermissionInventoryMetadata[]
  matrices: PermissionMatrixMetadata[]
}

function toPosixPath(value: string): string {
  return value.replaceAll('\\', '/')
}

function readStringArray(node: ObjectLiteralExpression, name: string): string[] {
  const property = node.getProperty(name)
  if (!property || !Node.isPropertyAssignment(property)) return []
  const initializer = property.getInitializer()
  if (!initializer || !Node.isArrayLiteralExpression(initializer)) return []

  return initializer
    .getElements()
    .map((element) => {
      if (Node.isStringLiteral(element) || Node.isNoSubstitutionTemplateLiteral(element)) {
        return element.getLiteralText()
      }
      return null
    })
    .filter((value): value is string => typeof value === 'string')
}

function readStringProperty(node: ObjectLiteralExpression, name: string): string | undefined {
  const property = node.getProperty(name)
  if (!property || !Node.isPropertyAssignment(property)) return undefined
  const initializer = property.getInitializer()
  if (!initializer) return undefined
  if (Node.isStringLiteral(initializer) || Node.isNoSubstitutionTemplateLiteral(initializer)) {
    return initializer.getLiteralText()
  }
  return undefined
}

function readBooleanProperty(node: ObjectLiteralExpression, name: string): boolean | undefined {
  const property = node.getProperty(name)
  if (!property || !Node.isPropertyAssignment(property)) return undefined
  const initializer = property.getInitializer()
  if (!initializer) return undefined
  if (initializer.getKind() === SyntaxKind.TrueKeyword) return true
  if (initializer.getKind() === SyntaxKind.FalseKeyword) return false
  return undefined
}

function extractPermissionDefinition(
  rootDir: string,
  declaration: VariableDeclaration,
): PermissionDefinitionMetadata | null {
  if (!declaration.getVariableStatement()?.isExported()) return null
  const initializer = declaration.getInitializer()
  if (!initializer || !Node.isCallExpression(initializer)) return null
  if (initializer.getExpression().getText() !== 'definePermission') return null

  const [firstArg] = initializer.getArguments()
  if (!firstArg || !Node.isObjectLiteralExpression(firstArg)) return null

  const key = readStringProperty(firstArg, 'key')
  if (!key) return null

  return {
    exportName: declaration.getName(),
    file: toPosixPath(relative(rootDir, declaration.getSourceFile().getFilePath())),
    line: declaration.getNameNode().getStartLineNumber(),
    key,
    ...(readStringProperty(firstArg, 'label')
      ? { label: readStringProperty(firstArg, 'label') }
      : {}),
    roles: readStringArray(firstArg, 'roles'),
    projected: readBooleanProperty(firstArg, 'project') !== false,
  }
}

function extractArrayEntries(initializer: ArrayLiteralExpression): PermissionInventoryEntry[] {
  const entries: PermissionInventoryEntry[] = []

  for (const element of initializer.getElements()) {
    if (Node.isIdentifier(element)) {
      entries.push({ kind: 'permission', name: element.getText() })
      continue
    }
    if (Node.isSpreadElement(element)) {
      const expression = element.getExpression()
      if (Node.isIdentifier(expression)) {
        entries.push({ kind: 'array', name: expression.getText() })
      }
    }
  }

  return entries
}

function unwrapArrayLiteralExpression(
  expression: Node | undefined,
): ArrayLiteralExpression | undefined {
  let current = expression

  while (current) {
    if (Node.isArrayLiteralExpression(current)) return current
    if (Node.isAsExpression(current) || Node.isSatisfiesExpression(current)) {
      current = current.getExpression()
      continue
    }
    return undefined
  }

  return undefined
}

function collectInventoryArrays(sourceFile: SourceFile): Map<string, PermissionInventoryEntry[]> {
  const arrays = new Map<string, PermissionInventoryEntry[]>()

  for (const declaration of sourceFile.getVariableDeclarations()) {
    const initializer = unwrapArrayLiteralExpression(declaration.getInitializer())
    if (!initializer) continue
    arrays.set(declaration.getName(), extractArrayEntries(initializer))
  }

  return arrays
}

function extractPermissionMatrixDeclaration(
  declaration: VariableDeclaration,
): { exportName: string; sourceInventory: string } | null {
  if (!declaration.getVariableStatement()?.isExported()) return null
  const initializer = declaration.getInitializer()
  if (!initializer || !Node.isCallExpression(initializer)) return null
  if (initializer.getExpression().getText() !== 'buildPermissionMatrix') return null
  const [firstArg] = initializer.getArguments()
  if (!firstArg || !Node.isIdentifier(firstArg)) return null
  return {
    exportName: declaration.getName(),
    sourceInventory: firstArg.getText(),
  }
}

function resolveInventoryEntries(
  name: string,
  arrays: Map<string, PermissionInventoryEntry[]>,
  definitions: Set<string>,
  seen = new Set<string>(),
): { permissions: string[]; unknown: string[] } {
  if (seen.has(name)) return { permissions: [], unknown: [] }
  seen.add(name)

  const entries = arrays.get(name) ?? []
  const permissions: string[] = []
  const unknown: string[] = []

  for (const entry of entries) {
    if (entry.kind === 'permission') {
      if (definitions.has(entry.name)) {
        permissions.push(entry.name)
      } else {
        unknown.push(entry.name)
      }
      continue
    }

    if (arrays.has(entry.name)) {
      const resolved = resolveInventoryEntries(entry.name, arrays, definitions, seen)
      permissions.push(...resolved.permissions)
      unknown.push(...resolved.unknown)
      continue
    }

    unknown.push(entry.name)
  }

  return {
    permissions: Array.from(new Set(permissions)),
    unknown: Array.from(new Set(unknown)),
  }
}

function createProject(rootDir: string, include: string[]): Project {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
  })
  for (const pattern of include) {
    project.addSourceFilesAtPaths(resolve(rootDir, pattern))
  }
  return project
}

export function extractPermissionCodegenMetadata(
  rootDir: string,
  include: string[],
): PermissionCodegenMetadata {
  const project = createProject(rootDir, include)
  const permissions: PermissionDefinitionMetadata[] = []
  const inventories: PermissionInventoryMetadata[] = []
  const matrices: PermissionMatrixMetadata[] = []

  for (const sourceFile of project.getSourceFiles()) {
    const filePermissions = sourceFile
      .getVariableDeclarations()
      .map((declaration) => extractPermissionDefinition(rootDir, declaration))
      .filter((entry): entry is PermissionDefinitionMetadata => entry !== null)

    permissions.push(...filePermissions)

    const definitions = new Set(filePermissions.map((entry) => entry.exportName))
    const arrays = collectInventoryArrays(sourceFile)
    const fileInventories: PermissionInventoryMetadata[] = []

    for (const declaration of sourceFile.getVariableDeclarations()) {
      if (!declaration.getVariableStatement()?.isExported()) continue
      if (!declaration.getName().endsWith('Permissions')) continue
      const initializer = unwrapArrayLiteralExpression(declaration.getInitializer())
      if (!initializer) continue

      const entries = extractArrayEntries(initializer)
      const resolved = resolveInventoryEntries(declaration.getName(), arrays, definitions)

      const inventory = {
        exportName: declaration.getName(),
        file: toPosixPath(relative(rootDir, sourceFile.getFilePath())),
        line: declaration.getNameNode().getStartLineNumber(),
        entries,
        permissions: resolved.permissions,
        unknown: resolved.unknown,
      }
      inventories.push(inventory)
      fileInventories.push(inventory)
    }

    const inventoriesByName = new Map(fileInventories.map((entry) => [entry.exportName, entry]))
    for (const declaration of sourceFile.getVariableDeclarations()) {
      const matrix = extractPermissionMatrixDeclaration(declaration)
      if (!matrix) continue
      const sourceInventory = inventoriesByName.get(matrix.sourceInventory)
      matrices.push({
        exportName: matrix.exportName,
        sourceInventory: matrix.sourceInventory,
        file: toPosixPath(relative(rootDir, sourceFile.getFilePath())),
        line: declaration.getNameNode().getStartLineNumber(),
        permissions: sourceInventory?.permissions ?? [],
        unknown: sourceInventory?.unknown ?? [matrix.sourceInventory],
      })
    }
  }

  permissions.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  inventories.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  matrices.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)

  return {
    include,
    permissions,
    inventories,
    matrices,
  }
}

function toTypeUnion(values: string[]): string {
  if (values.length === 0) return 'never'
  return values.map((value) => JSON.stringify(value)).join(' | ')
}

function toInterfaceBody(values: string[]): string {
  return values.length > 0
    ? values.map((value) => `    ${JSON.stringify(value)}: true`).join('\n')
    : ''
}

export function renderPermissionCodegenTypes(metadata: PermissionCodegenMetadata): string {
  const keys = metadata.permissions.map((permission) => permission.key)
  const projectedKeys = metadata.permissions
    .filter((permission) => permission.projected)
    .map((permission) => permission.key)

  return `// AUTO-GENERATED. Do not edit.
// Source: ${metadata.include.join(', ')}

import '@lupinum/trellis/auth'
import '@lupinum/trellis/mcp'

export type TrellisPermissionKey = ${toTypeUnion(keys)}
export type TrellisProjectedPermissionKey = ${toTypeUnion(projectedKeys)}

declare module '@lupinum/trellis/auth' {
  interface PermissionKeysByKey {
${toInterfaceBody(keys)}
  }

  interface ProjectedPermissionKeysByKey {
${toInterfaceBody(projectedKeys)}
  }
}

declare module '@lupinum/trellis/mcp' {
  interface AccessKeysByKey {
${toInterfaceBody(projectedKeys)}
  }
}
`
}

function findPermissionByExport(
  metadata: PermissionCodegenMetadata,
  exportName: string,
): PermissionDefinitionMetadata | undefined {
  return metadata.permissions.find((permission) => permission.exportName === exportName)
}

export function renderPermissionRuntimeExports(metadata: PermissionCodegenMetadata): string {
  const projectedPermissions = metadata.permissions.filter((permission) => permission.projected)
  const permissionExports = projectedPermissions.map(
    (permission) =>
      `export const ${permission.exportName} = ${JSON.stringify(permission.key)} as const`,
  )
  const permissionsObject = `export const permissions = {
${projectedPermissions
  .map((permission) => `  ${JSON.stringify(permission.exportName)}: ${permission.exportName},`)
  .join('\n')}
} as const`

  const matrixExports = metadata.matrices.map((matrix) => {
    const rows = matrix.permissions
      .map((permissionExportName) => findPermissionByExport(metadata, permissionExportName))
      .filter((permission): permission is PermissionDefinitionMetadata => Boolean(permission))
      .filter((permission) => permission.projected)
      .map((permission) => ({
        key: permission.key,
        label: permission.label ?? permission.key,
        roles: permission.roles,
      }))
    return `export const ${matrix.exportName} = ${JSON.stringify(rows, null, 2)} as const`
  })

  return `// AUTO-GENERATED. Do not edit.
// Source: ${metadata.include.join(', ')}

${permissionExports.join('\n')}

${permissionsObject}

${matrixExports.join('\n\n')}
`
}

export function renderPermissionCodegenMetadata(metadata: PermissionCodegenMetadata): string {
  return `${JSON.stringify(metadata, null, 2)}\n`
}

export function shouldRefreshPermissionCodegen(changedPath: string, include: string[]): boolean {
  const normalizedPath = toPosixPath(changedPath)
  if (!normalizedPath.endsWith('.ts')) return false

  return include.some((pattern) => {
    const normalizedPattern = toPosixPath(pattern)
    const tail = normalizedPattern.split('/').filter(Boolean).slice(-3).join('/')
    return normalizedPath.endsWith(tail) || normalizedPath.endsWith('convex/auth/permissions.ts')
  })
}
