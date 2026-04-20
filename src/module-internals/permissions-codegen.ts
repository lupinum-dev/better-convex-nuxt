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

export interface PermissionCodegenMetadata {
  generatedAt: string
  include: string[]
  permissions: PermissionDefinitionMetadata[]
  inventories: PermissionInventoryMetadata[]
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

  for (const sourceFile of project.getSourceFiles()) {
    const filePermissions = sourceFile
      .getVariableDeclarations()
      .map((declaration) => extractPermissionDefinition(rootDir, declaration))
      .filter((entry): entry is PermissionDefinitionMetadata => entry !== null)

    permissions.push(...filePermissions)

    const definitions = new Set(filePermissions.map((entry) => entry.exportName))
    const arrays = collectInventoryArrays(sourceFile)

    for (const declaration of sourceFile.getVariableDeclarations()) {
      if (!declaration.getVariableStatement()?.isExported()) continue
      if (!declaration.getName().endsWith('Permissions')) continue
      const initializer = unwrapArrayLiteralExpression(declaration.getInitializer())
      if (!initializer) continue

      const entries = extractArrayEntries(initializer)
      const resolved = resolveInventoryEntries(declaration.getName(), arrays, definitions)

      inventories.push({
        exportName: declaration.getName(),
        file: toPosixPath(relative(rootDir, sourceFile.getFilePath())),
        line: declaration.getNameNode().getStartLineNumber(),
        entries,
        permissions: resolved.permissions,
        unknown: resolved.unknown,
      })
    }
  }

  permissions.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  inventories.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)

  return {
    generatedAt: new Date().toISOString(),
    include,
    permissions,
    inventories,
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
  interface CapabilityKeysByKey {
${toInterfaceBody(projectedKeys)}
  }
}
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
