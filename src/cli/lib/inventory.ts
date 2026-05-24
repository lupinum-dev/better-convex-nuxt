import { relative } from 'node:path'

import { Node, Project, SyntaxKind } from 'ts-morph'

import { extractPermissionCodegenMetadata } from '../../module-internals/permissions-codegen.js'
import { extractPublicSurfaceCodegenMetadata } from '../../module-internals/public-surface-codegen.js'
import {
  findConvexAuthSource,
  findConvexHttpSource,
  findCrossTenantEscapeInventory,
  findCustomMcpToolsWithAppWrites,
  findDestructiveOperationInventory,
  findDestructiveMcpToolsWithoutOperationBinding,
  findForwardedCallerWithoutTrustedAuth,
  findMcpRateLimitStoreSupport,
  findIdentityForwardingPublicExposure,
  findUnsafeSurfaceEntries,
  hasBetterConvexNuxtRegistration,
  hasDependency,
  isAuthExplicitlyDisabled,
  type ProjectInspection,
  type ProjectSourceLocation,
  type ProjectUnsafeEntrypoint,
  usesMcpRateLimit,
  usesPermissionSurfaces,
  usesIdentityForwardingSurfaces,
} from './project.js'

export interface TrellisCliInventoryFacts {
  identityForwardingExpected: boolean
  usesPermissions: boolean
  unsafeSurfaceInventory: ProjectUnsafeEntrypoint[]
  crossTenantEscapeInventory: ProjectSourceLocation[]
  destructiveOperationInventory: ProjectSourceLocation[]
  destructiveMcpToolMisuse: ProjectSourceLocation[]
  customMcpAppWriteMisuse: ProjectSourceLocation[]
  forwardedCallerMisuse: ProjectSourceLocation[]
  identityForwardingPublicExposure: ProjectSourceLocation[]
  mcpRateLimitExpected: boolean
  mcpRateLimitStoreSupport: 'supported' | 'unverified' | 'none'
}

export interface TrellisCliInventorySourceLocation {
  path: string
  line: number
}

export type TrellisCliInventoryAppInventoryWarningCode =
  | 'missing-define-app-inventory'
  | 'dynamic-features'

export interface TrellisCliInventoryAppInventoryFeatureBinding {
  name: string
  importPath: string | null
  source: TrellisCliInventorySourceLocation
}

export interface TrellisCliInventoryAppInventoryWarning {
  code: TrellisCliInventoryAppInventoryWarningCode
  source: TrellisCliInventorySourceLocation
}

export interface TrellisCliInventoryPublicSurfaceOperation {
  id: string
  exportName: string
  kind: 'safe' | 'destructive'
  source: TrellisCliInventorySourceLocation
}

export interface TrellisCliInventoryPublicSurfaceProjection {
  operationId: string
  exportName: string
  projection: 'preview' | 'execute'
  source: TrellisCliInventorySourceLocation
}

export interface TrellisCliInventoryPublicSurfaceTool {
  name: string
  source: 'tool' | 'operation' | 'defineTool'
  sourceLocation: TrellisCliInventorySourceLocation
  operationId?: string
  operationExportName?: string
}

export interface TrellisCliInventoryFeature {
  exportName: string
  name: string
  file: string
  source: TrellisCliInventorySourceLocation
  tenantTables: string[]
  sharedTables: string[]
  permissionRefs: string[]
  operationRefs: string[]
}

export interface TrellisCliInventoryPermission {
  exportName: string
  key: string
  file: string
  source: TrellisCliInventorySourceLocation
  label?: string
  roles: string[]
  projected: boolean
}

export interface TrellisCliInventoryPermissionInventory {
  exportName: string
  file: string
  source: TrellisCliInventorySourceLocation
  permissions: string[]
  unknown: string[]
}

export type TrellisCliInventoryUnsafeSurfaceKind = 'query' | 'mutation' | 'action'
export type TrellisCliInventoryUnsafePermitStyle =
  | 'string-bypass'
  | 'typed-permit'
  | 'missing'
  | 'unknown'

export interface TrellisCliInventoryUnsafeEntrypoint {
  exportName: string | null
  surface: TrellisCliInventoryUnsafeSurfaceKind
  style: TrellisCliInventoryUnsafePermitStyle
  file: string
  source: TrellisCliInventorySourceLocation
  permit?: {
    kind?: string
    scopeCount?: number
    hasReviewBy: boolean
  }
}

export type TrellisCliInventoryBridgePackageSource =
  | 'dependency'
  | 'devDependency'
  | 'optionalDependency'
  | 'peerDependency'
  | 'source-reference'

export interface TrellisCliInventoryBridgePackage {
  packageName: string
  source: TrellisCliInventoryBridgePackageSource
  location: TrellisCliInventorySourceLocation | null
}

export interface TrellisCliInventoryBridge {
  enabled: boolean
  packages: TrellisCliInventoryBridgePackage[]
}

export interface TrellisCliInventory {
  schemaVersion: 1
  cwd: string
  package: {
    hasPackageJson: boolean
    hasTrellisDependency: boolean
    hasNuxtDependency: boolean
    hasConvexDependency: boolean
  }
  layers: {
    core: boolean
    auth: boolean
    workspace: boolean
    mcp: boolean
    bridge: boolean
  }
  bridge: TrellisCliInventoryBridge
  files: {
    nuxtConfig: string | null
    convexHttp: string | null
    convexAuth: string | null
    appInventory: string | null
  }
  surfaces: {
    identityForwarding: boolean
    permissions: boolean
    destructiveOperations: number
    unsafeEntrypoints: number
    crossTenantEscapes: number
    mcpTools: number
    customMcpToolsWithAppWrites: number
    forwardedCallerMisuses: number
    identityForwardingPublicExposures: number
    destructiveMcpToolMisuses: number
    mcpRateLimit: boolean
    mcpRateLimitStore: 'supported' | 'unverified' | 'none'
  }
  forwarding: {
    expected: boolean
    publicExposures: TrellisCliInventorySourceLocation[]
    forwardedCallerMisuses: TrellisCliInventorySourceLocation[]
  }
  mcp: {
    toolCount: number
    destructiveToolMisuses: TrellisCliInventorySourceLocation[]
    customAppWriteMisuses: TrellisCliInventorySourceLocation[]
    rateLimit: {
      expected: boolean
      store: 'supported' | 'unverified' | 'none'
    }
  }
  backend: {
    unsafeEntrypoints: TrellisCliInventoryUnsafeEntrypoint[]
    crossTenantEscapes: TrellisCliInventorySourceLocation[]
    destructiveOperations: TrellisCliInventorySourceLocation[]
  }
  appInventory: {
    file: string | null
    detected: boolean
    featureBindings: TrellisCliInventoryAppInventoryFeatureBinding[]
    warnings: TrellisCliInventoryAppInventoryWarning[]
  }
  features: TrellisCliInventoryFeature[]
  permissions: {
    definitions: TrellisCliInventoryPermission[]
    inventories: TrellisCliInventoryPermissionInventory[]
  }
  publicSurface: {
    operations: TrellisCliInventoryPublicSurfaceOperation[]
    projections: TrellisCliInventoryPublicSurfaceProjection[]
    tools: TrellisCliInventoryPublicSurfaceTool[]
  }
  findings: []
}

function toRelative(project: ProjectInspection, path: string | null | undefined): string | null {
  if (!path) return null
  return relative(project.cwd, path).replaceAll('\\', '/')
}

function toInventoryLocation(
  project: ProjectInspection,
  location: ProjectSourceLocation,
): TrellisCliInventorySourceLocation {
  return {
    path: toRelative(project, location.path) ?? location.path,
    line: location.line,
  }
}

function toInventoryLocations(
  project: ProjectInspection,
  locations: ProjectSourceLocation[],
): TrellisCliInventorySourceLocation[] {
  return locations.map((location) => toInventoryLocation(project, location))
}

function toMetadataLocation(file: string, line: number): TrellisCliInventorySourceLocation {
  return {
    path: file,
    line,
  }
}

function collectPublicSurface(project: ProjectInspection): TrellisCliInventory['publicSurface'] {
  const metadata = extractPublicSurfaceCodegenMetadata(project.cwd)

  return {
    operations: metadata.operations.map((operation) => ({
      id: operation.id,
      exportName: operation.exportName,
      kind: operation.kind,
      source: toMetadataLocation(operation.file, operation.line),
    })),
    projections: metadata.projections.map((projection) => ({
      operationId: projection.operationId,
      exportName: projection.exportName,
      projection: projection.projection,
      source: toMetadataLocation(projection.file, projection.line),
    })),
    tools: metadata.tools.map((tool) => ({
      name: tool.name,
      source: tool.source,
      sourceLocation: toMetadataLocation(tool.file, tool.line),
      ...(tool.operationId ? { operationId: tool.operationId } : {}),
      ...(tool.operationExportName ? { operationExportName: tool.operationExportName } : {}),
    })),
  }
}

function readStringProperty(
  node: import('ts-morph').ObjectLiteralExpression,
  name: string,
): string | null {
  const property = node.getProperty(name)
  if (!property || !Node.isPropertyAssignment(property)) return null
  const initializer = unwrapExpression(property.getInitializer())
  if (!initializer) return null

  if (Node.isStringLiteral(initializer) || Node.isNoSubstitutionTemplateLiteral(initializer)) {
    return initializer.getLiteralText()
  }

  return null
}

function readStringArrayProperty(
  node: import('ts-morph').ObjectLiteralExpression,
  name: string,
): string[] {
  const property = node.getProperty(name)
  if (!property || !Node.isPropertyAssignment(property)) return []
  const initializer = unwrapExpression(property.getInitializer())
  if (!initializer || !Node.isArrayLiteralExpression(initializer)) return []

  return initializer
    .getElements()
    .map((element) => {
      const unwrapped = unwrapExpression(element)
      if (Node.isStringLiteral(unwrapped) || Node.isNoSubstitutionTemplateLiteral(unwrapped)) {
        return unwrapped.getLiteralText()
      }
      return null
    })
    .filter((value): value is string => typeof value === 'string')
}

function readIdentifierRefsProperty(
  node: import('ts-morph').ObjectLiteralExpression,
  name: string,
): string[] {
  const property = node.getProperty(name)
  if (!property || !Node.isPropertyAssignment(property)) return []
  const initializer = unwrapExpression(property.getInitializer())
  if (!initializer) return []

  if (Node.isIdentifier(initializer)) return [initializer.getText()]

  if (!Node.isArrayLiteralExpression(initializer)) return []

  return initializer
    .getElements()
    .map((element) => {
      const unwrapped = unwrapExpression(element)
      if (Node.isIdentifier(unwrapped)) return unwrapped.getText()
      if (Node.isSpreadElement(unwrapped)) {
        const expression = unwrapExpression(unwrapped.getExpression())
        return Node.isIdentifier(expression) ? expression.getText() : null
      }
      return null
    })
    .filter((value): value is string => typeof value === 'string')
}

function readDefineFeatureObject(
  declaration: import('ts-morph').VariableDeclaration,
): import('ts-morph').ObjectLiteralExpression | null {
  if (!declaration.getVariableStatement()?.isExported()) return null
  const initializer = unwrapExpression(declaration.getInitializer())
  if (!initializer || !Node.isCallExpression(initializer)) return null
  const callee = unwrapExpression(initializer.getExpression())
  if (!Node.isIdentifier(callee) || callee.getText() !== 'defineFeature') return null
  const [firstArg] = initializer.getArguments()
  const definition = unwrapExpression(firstArg)
  return definition && Node.isObjectLiteralExpression(definition) ? definition : null
}

function collectFeatures(project: ProjectInspection): TrellisCliInventoryFeature[] {
  const parser = new Project({ skipAddingFilesFromTsConfig: true })
  const features: TrellisCliInventoryFeature[] = []

  for (const source of project.sourceFiles) {
    if (!/\.(?:ts|js|mts|mjs)$/.test(source.path)) continue
    const sourceFile = parser.createSourceFile(source.path, source.text, { overwrite: true })

    for (const declaration of sourceFile.getVariableDeclarations()) {
      const definition = readDefineFeatureObject(declaration)
      if (!definition) continue
      const name = readStringProperty(definition, 'name')
      if (!name) continue
      const file = toRelative(project, source.path) ?? source.path

      features.push({
        exportName: declaration.getName(),
        name,
        file,
        source: {
          path: file,
          line: declaration.getNameNode().getStartLineNumber(),
        },
        tenantTables: readStringArrayProperty(definition, 'tenantTables'),
        sharedTables: readStringArrayProperty(definition, 'sharedTables'),
        permissionRefs: readIdentifierRefsProperty(definition, 'permissions'),
        operationRefs: readIdentifierRefsProperty(definition, 'operations'),
      })
    }
  }

  return features.sort((a, b) => a.file.localeCompare(b.file) || a.source.line - b.source.line)
}

function collectPermissions(project: ProjectInspection): TrellisCliInventory['permissions'] {
  const metadata = extractPermissionCodegenMetadata(project.cwd, [
    'convex/**/*.ts',
    'shared/**/*.ts',
  ])

  return {
    definitions: metadata.permissions.map((permission) => ({
      exportName: permission.exportName,
      key: permission.key,
      file: permission.file,
      source: toMetadataLocation(permission.file, permission.line),
      ...(permission.label ? { label: permission.label } : {}),
      roles: permission.roles,
      projected: permission.projected,
    })),
    inventories: metadata.inventories.map((inventory) => ({
      exportName: inventory.exportName,
      file: inventory.file,
      source: toMetadataLocation(inventory.file, inventory.line),
      permissions: inventory.permissions,
      unknown: inventory.unknown,
    })),
  }
}

function collectUnsafeEntrypoints(
  project: ProjectInspection,
  entries: ProjectUnsafeEntrypoint[],
): TrellisCliInventoryUnsafeEntrypoint[] {
  return entries.map((entry) => {
    const file = toRelative(project, entry.path) ?? entry.path
    return {
      exportName: entry.exportName,
      surface: entry.surface,
      style: entry.style,
      file,
      source: {
        path: file,
        line: entry.line,
      },
      ...(entry.permit ? { permit: entry.permit } : {}),
    }
  })
}

const bridgePackageNames = ['@lupinum/trellis-bridge', '@lupinum/ginko-cms'] as const

type BridgeDependencyBucket =
  | 'dependencies'
  | 'devDependencies'
  | 'optionalDependencies'
  | 'peerDependencies'

const bridgeDependencyBuckets = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const satisfies BridgeDependencyBucket[]

const bridgePackageSourceByBucket: Record<
  BridgeDependencyBucket,
  TrellisCliInventoryBridgePackageSource
> = {
  dependencies: 'dependency',
  devDependencies: 'devDependency',
  optionalDependencies: 'optionalDependency',
  peerDependencies: 'peerDependency',
}

function readPackageDependencyNames(
  project: ProjectInspection,
  bucket: BridgeDependencyBucket,
): string[] {
  const dependencies = project.packageJson?.[bucket]
  if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) return []
  return Object.keys(dependencies)
}

function lineForTextOffset(text: string, offset: number): number {
  let line = 1
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) line += 1
  }
  return line
}

function collectBridgeInventory(project: ProjectInspection): TrellisCliInventoryBridge {
  const packages: TrellisCliInventoryBridgePackage[] = []
  const seen = new Set<string>()

  function addPackage(entry: TrellisCliInventoryBridgePackage) {
    const key = [
      entry.packageName,
      entry.source,
      entry.location?.path ?? '',
      entry.location?.line ?? '',
    ].join('\0')

    if (seen.has(key)) return
    seen.add(key)
    packages.push(entry)
  }

  for (const bucket of bridgeDependencyBuckets) {
    const dependencyNames = new Set(readPackageDependencyNames(project, bucket))

    for (const packageName of bridgePackageNames) {
      if (!dependencyNames.has(packageName)) continue

      addPackage({
        packageName,
        source: bridgePackageSourceByBucket[bucket],
        location: null,
      })
    }
  }

  for (const sourceFile of project.sourceFiles) {
    for (const packageName of bridgePackageNames) {
      const offset = sourceFile.text.indexOf(packageName)
      if (offset === -1) continue

      addPackage({
        packageName,
        source: 'source-reference',
        location: toInventoryLocation(project, {
          path: sourceFile.path,
          line: lineForTextOffset(sourceFile.text, offset),
        }),
      })
    }
  }

  packages.sort(
    (a, b) =>
      a.packageName.localeCompare(b.packageName) ||
      a.source.localeCompare(b.source) ||
      (a.location?.path ?? '').localeCompare(b.location?.path ?? '') ||
      (a.location?.line ?? 0) - (b.location?.line ?? 0),
  )

  return {
    enabled: packages.length > 0,
    packages,
  }
}

function unwrapExpression(node: Node | undefined): Node | undefined {
  if (!node) return undefined

  if (
    Node.isParenthesizedExpression(node) ||
    Node.isAsExpression(node) ||
    Node.isTypeAssertion(node) ||
    Node.isSatisfiesExpression(node)
  ) {
    return unwrapExpression(node.getExpression())
  }

  return node
}

function collectNamedImports(sourceFile: import('ts-morph').SourceFile): Map<string, string> {
  const namedImports = new Map<string, string>()

  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const importPath = importDeclaration.getModuleSpecifierValue()

    for (const namedImport of importDeclaration.getNamedImports()) {
      namedImports.set(namedImport.getNameNode().getText(), importPath)
    }
  }

  return namedImports
}

function findStaticFeatureArray(call: import('ts-morph').CallExpression): Node | undefined {
  const firstArg = unwrapExpression(call.getArguments()[0])
  if (!firstArg || !Node.isObjectLiteralExpression(firstArg)) return undefined

  const featuresProperty = firstArg.getProperty('features')
  if (!featuresProperty || !Node.isPropertyAssignment(featuresProperty)) return undefined

  return unwrapExpression(featuresProperty.getInitializer())
}

function collectAppInventory(
  project: ProjectInspection,
  appInventorySource: { path: string; text: string } | null,
): TrellisCliInventory['appInventory'] {
  if (!appInventorySource) {
    return {
      file: null,
      detected: false,
      featureBindings: [],
      warnings: [],
    }
  }

  const parser = new Project({ skipAddingFilesFromTsConfig: true })
  const sourceFile = parser.createSourceFile(appInventorySource.path, appInventorySource.text, {
    overwrite: true,
  })
  const importPaths = collectNamedImports(sourceFile)
  const inventoryFile = toRelative(project, appInventorySource.path)
  const baseLocation = toInventoryLocation(project, {
    path: appInventorySource.path,
    line: 1,
  })

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression()
    if (!Node.isIdentifier(callee) || callee.getText() !== 'defineAppInventory') continue

    const featuresInitializer = findStaticFeatureArray(call)
    if (!featuresInitializer || !Node.isArrayLiteralExpression(featuresInitializer)) {
      return {
        file: inventoryFile,
        detected: true,
        featureBindings: [],
        warnings: [
          {
            code: 'dynamic-features',
            source: toInventoryLocation(project, {
              path: appInventorySource.path,
              line: featuresInitializer?.getStartLineNumber() ?? call.getStartLineNumber(),
            }),
          },
        ],
      }
    }

    const featureBindings: TrellisCliInventoryAppInventoryFeatureBinding[] = []

    for (const element of featuresInitializer.getElements()) {
      const feature = unwrapExpression(element)
      if (!feature || !Node.isIdentifier(feature)) {
        return {
          file: inventoryFile,
          detected: true,
          featureBindings,
          warnings: [
            {
              code: 'dynamic-features',
              source: toInventoryLocation(project, {
                path: appInventorySource.path,
                line: element.getStartLineNumber(),
              }),
            },
          ],
        }
      }

      featureBindings.push({
        name: feature.getText(),
        importPath: importPaths.get(feature.getText()) ?? null,
        source: toInventoryLocation(project, {
          path: appInventorySource.path,
          line: feature.getStartLineNumber(),
        }),
      })
    }

    return {
      file: inventoryFile,
      detected: true,
      featureBindings,
      warnings: [],
    }
  }

  return {
    file: inventoryFile,
    detected: true,
    featureBindings: [],
    warnings: [
      {
        code: 'missing-define-app-inventory',
        source: baseLocation,
      },
    ],
  }
}

function hasSourcePath(project: ProjectInspection, pattern: RegExp): boolean {
  return project.sourceFiles.some((file) => pattern.test(file.path))
}

function hasSourceText(project: ProjectInspection, pattern: RegExp): boolean {
  return project.sourceFiles.some((file) => pattern.test(file.text))
}

function countMcpToolFiles(project: ProjectInspection): number {
  return project.sourceFiles.filter((file) =>
    /[/\\]server[/\\]mcp[/\\]tools[/\\].+\.(?:[cm]?[jt]s|tsx?)$/.test(file.path),
  ).length
}

export function collectTrellisCliInventoryFacts(
  project: ProjectInspection,
): TrellisCliInventoryFacts {
  return {
    identityForwardingExpected: usesIdentityForwardingSurfaces(project),
    usesPermissions: usesPermissionSurfaces(project),
    unsafeSurfaceInventory: findUnsafeSurfaceEntries(project),
    crossTenantEscapeInventory: findCrossTenantEscapeInventory(project),
    destructiveOperationInventory: findDestructiveOperationInventory(project),
    destructiveMcpToolMisuse: findDestructiveMcpToolsWithoutOperationBinding(project),
    customMcpAppWriteMisuse: findCustomMcpToolsWithAppWrites(project),
    forwardedCallerMisuse: findForwardedCallerWithoutTrustedAuth(project),
    identityForwardingPublicExposure: findIdentityForwardingPublicExposure(project),
    mcpRateLimitExpected: usesMcpRateLimit(project),
    mcpRateLimitStoreSupport: findMcpRateLimitStoreSupport(project),
  }
}

export function collectTrellisCliInventory(
  project: ProjectInspection,
  facts: TrellisCliInventoryFacts = collectTrellisCliInventoryFacts(project),
): TrellisCliInventory {
  const convexHttpSource = findConvexHttpSource(project)
  const convexAuthSource = findConvexAuthSource(project)
  const appInventorySource =
    project.sourceFiles.find((file) =>
      /[/\\]shared[/\\]app-inventory\.(?:ts|js|mts|mjs)$/.test(file.path),
    ) ?? null
  const authDisabled = isAuthExplicitlyDisabled(project)
  const hasWorkspaceLayer =
    hasSourceText(project, /\bworkspaceId\b/) ||
    hasSourcePath(project, /[/\\](?:features[/\\]workspace|workspaces|workspace)[/\\]/)
  const hasMcpLayer =
    hasDependency(project, '@nuxtjs/mcp-toolkit') ||
    facts.identityForwardingExpected ||
    hasSourcePath(project, /[/\\]server[/\\]mcp[/\\]/)
  const bridge = collectBridgeInventory(project)

  return {
    schemaVersion: 1,
    cwd: project.cwd,
    package: {
      hasPackageJson: Boolean(project.packageJsonPath),
      hasTrellisDependency: hasDependency(project, '@lupinum/trellis'),
      hasNuxtDependency: hasDependency(project, 'nuxt'),
      hasConvexDependency: hasDependency(project, 'convex'),
    },
    layers: {
      core: hasBetterConvexNuxtRegistration(project) || hasDependency(project, '@lupinum/trellis'),
      auth:
        !authDisabled &&
        (hasDependency(project, '@convex-dev/better-auth') ||
          hasDependency(project, 'better-auth') ||
          Boolean(convexAuthSource) ||
          Boolean(convexHttpSource)),
      workspace: hasWorkspaceLayer,
      mcp: hasMcpLayer,
      bridge: bridge.enabled,
    },
    bridge,
    files: {
      nuxtConfig: toRelative(project, project.nuxtConfigPath),
      convexHttp: toRelative(project, convexHttpSource?.path),
      convexAuth: toRelative(project, convexAuthSource?.path),
      appInventory: toRelative(project, appInventorySource?.path),
    },
    surfaces: {
      identityForwarding: facts.identityForwardingExpected,
      permissions: facts.usesPermissions,
      destructiveOperations: facts.destructiveOperationInventory.length,
      unsafeEntrypoints: facts.unsafeSurfaceInventory.length,
      crossTenantEscapes: facts.crossTenantEscapeInventory.length,
      mcpTools: countMcpToolFiles(project),
      customMcpToolsWithAppWrites: facts.customMcpAppWriteMisuse.length,
      forwardedCallerMisuses: facts.forwardedCallerMisuse.length,
      identityForwardingPublicExposures: facts.identityForwardingPublicExposure.length,
      destructiveMcpToolMisuses: facts.destructiveMcpToolMisuse.length,
      mcpRateLimit: facts.mcpRateLimitExpected,
      mcpRateLimitStore: facts.mcpRateLimitStoreSupport,
    },
    forwarding: {
      expected: facts.identityForwardingExpected,
      publicExposures: toInventoryLocations(project, facts.identityForwardingPublicExposure),
      forwardedCallerMisuses: toInventoryLocations(project, facts.forwardedCallerMisuse),
    },
    mcp: {
      toolCount: countMcpToolFiles(project),
      destructiveToolMisuses: toInventoryLocations(project, facts.destructiveMcpToolMisuse),
      customAppWriteMisuses: toInventoryLocations(project, facts.customMcpAppWriteMisuse),
      rateLimit: {
        expected: facts.mcpRateLimitExpected,
        store: facts.mcpRateLimitStoreSupport,
      },
    },
    backend: {
      unsafeEntrypoints: collectUnsafeEntrypoints(project, facts.unsafeSurfaceInventory),
      crossTenantEscapes: toInventoryLocations(project, facts.crossTenantEscapeInventory),
      destructiveOperations: toInventoryLocations(project, facts.destructiveOperationInventory),
    },
    appInventory: collectAppInventory(project, appInventorySource),
    features: collectFeatures(project),
    permissions: collectPermissions(project),
    publicSurface: collectPublicSurface(project),
    findings: [],
  }
}
