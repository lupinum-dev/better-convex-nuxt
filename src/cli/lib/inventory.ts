import { relative } from 'node:path'

import { Node, Project, SyntaxKind } from 'ts-morph'

import {
  findConvexAuthSource,
  findConvexHttpSource,
  findCrossTenantEscapeInventory,
  findCustomMcpToolsWithAppWrites,
  findDestructiveOperationInventory,
  findDestructiveMcpToolsWithoutOperationBinding,
  findForwardedPrincipalWithoutTrustedAuth,
  findMcpRateLimitStoreSupport,
  findTrustedForwardingPublicExposure,
  findUnsafeSurfaceInventory,
  hasBetterConvexNuxtRegistration,
  hasDependency,
  isAuthExplicitlyDisabled,
  type ProjectInspection,
  type ProjectSourceLocation,
  usesMcpRateLimit,
  usesPermissionSurfaces,
  usesTrustedForwardingSurfaces,
} from './project.js'

export interface TrellisCliInventoryFacts {
  trustedForwardingExpected: boolean
  usesPermissions: boolean
  unsafeSurfaceInventory: ProjectSourceLocation[]
  crossTenantEscapeInventory: ProjectSourceLocation[]
  destructiveOperationInventory: ProjectSourceLocation[]
  destructiveMcpToolMisuse: ProjectSourceLocation[]
  customMcpAppWriteMisuse: ProjectSourceLocation[]
  forwardedPrincipalMisuse: ProjectSourceLocation[]
  trustedForwardingPublicExposure: ProjectSourceLocation[]
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
  files: {
    nuxtConfig: string | null
    convexHttp: string | null
    convexAuth: string | null
    appInventory: string | null
  }
  surfaces: {
    trustedForwarding: boolean
    permissions: boolean
    destructiveOperations: number
    unsafeEntrypoints: number
    crossTenantEscapes: number
    mcpTools: number
    customMcpToolsWithAppWrites: number
    forwardedPrincipalMisuses: number
    trustedForwardingPublicExposures: number
    destructiveMcpToolMisuses: number
    mcpRateLimit: boolean
    mcpRateLimitStore: 'supported' | 'unverified' | 'none'
  }
  forwarding: {
    expected: boolean
    publicExposures: TrellisCliInventorySourceLocation[]
    forwardedPrincipalMisuses: TrellisCliInventorySourceLocation[]
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
    unsafeEntrypoints: TrellisCliInventorySourceLocation[]
    crossTenantEscapes: TrellisCliInventorySourceLocation[]
    destructiveOperations: TrellisCliInventorySourceLocation[]
  }
  appInventory: {
    file: string | null
    detected: boolean
    featureBindings: TrellisCliInventoryAppInventoryFeatureBinding[]
    warnings: TrellisCliInventoryAppInventoryWarning[]
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
    trustedForwardingExpected: usesTrustedForwardingSurfaces(project),
    usesPermissions: usesPermissionSurfaces(project),
    unsafeSurfaceInventory: findUnsafeSurfaceInventory(project),
    crossTenantEscapeInventory: findCrossTenantEscapeInventory(project),
    destructiveOperationInventory: findDestructiveOperationInventory(project),
    destructiveMcpToolMisuse: findDestructiveMcpToolsWithoutOperationBinding(project),
    customMcpAppWriteMisuse: findCustomMcpToolsWithAppWrites(project),
    forwardedPrincipalMisuse: findForwardedPrincipalWithoutTrustedAuth(project),
    trustedForwardingPublicExposure: findTrustedForwardingPublicExposure(project),
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
    facts.trustedForwardingExpected ||
    hasSourcePath(project, /[/\\]server[/\\]mcp[/\\]/)

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
      bridge:
        hasDependency(project, '@lupinum/trellis-bridge') ||
        hasDependency(project, '@lupinum/ginko-cms') ||
        hasSourceText(project, /@lupinum\/trellis-bridge|@lupinum\/ginko-cms/),
    },
    files: {
      nuxtConfig: toRelative(project, project.nuxtConfigPath),
      convexHttp: toRelative(project, convexHttpSource?.path),
      convexAuth: toRelative(project, convexAuthSource?.path),
      appInventory: toRelative(project, appInventorySource?.path),
    },
    surfaces: {
      trustedForwarding: facts.trustedForwardingExpected,
      permissions: facts.usesPermissions,
      destructiveOperations: facts.destructiveOperationInventory.length,
      unsafeEntrypoints: facts.unsafeSurfaceInventory.length,
      crossTenantEscapes: facts.crossTenantEscapeInventory.length,
      mcpTools: countMcpToolFiles(project),
      customMcpToolsWithAppWrites: facts.customMcpAppWriteMisuse.length,
      forwardedPrincipalMisuses: facts.forwardedPrincipalMisuse.length,
      trustedForwardingPublicExposures: facts.trustedForwardingPublicExposure.length,
      destructiveMcpToolMisuses: facts.destructiveMcpToolMisuse.length,
      mcpRateLimit: facts.mcpRateLimitExpected,
      mcpRateLimitStore: facts.mcpRateLimitStoreSupport,
    },
    forwarding: {
      expected: facts.trustedForwardingExpected,
      publicExposures: toInventoryLocations(project, facts.trustedForwardingPublicExposure),
      forwardedPrincipalMisuses: toInventoryLocations(project, facts.forwardedPrincipalMisuse),
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
      unsafeEntrypoints: toInventoryLocations(project, facts.unsafeSurfaceInventory),
      crossTenantEscapes: toInventoryLocations(project, facts.crossTenantEscapeInventory),
      destructiveOperations: toInventoryLocations(project, facts.destructiveOperationInventory),
    },
    appInventory: collectAppInventory(project, appInventorySource),
    findings: [],
  }
}
