import { relative } from 'node:path'

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
  findings: []
}

function toRelative(project: ProjectInspection, path: string | null | undefined): string | null {
  if (!path) return null
  return relative(project.cwd, path).replaceAll('\\', '/')
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
    findings: [],
  }
}
