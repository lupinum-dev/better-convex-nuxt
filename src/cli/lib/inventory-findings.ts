import type { DoctorFinding } from './findings.js'
import { findingInventorySource } from './findings.js'
import type {
  TrellisCliInventory,
  TrellisCliInventorySourceLocation,
  TrellisCliInventoryUnsafeEntrypoint,
} from './inventory.js'

function formatInventoryLocations(
  locations: TrellisCliInventorySourceLocation[],
  limit = 3,
): string {
  return `${locations
    .map((entry) => `${entry.path}:${entry.line}`)
    .slice(0, limit)
    .join(', ')}${locations.length > limit ? ', ...' : ''}`
}

function unsafeEntrypointLocations(
  entries: TrellisCliInventoryUnsafeEntrypoint[],
): TrellisCliInventorySourceLocation[] {
  return entries.map((entry) => entry.source)
}

function createAppInventoryFinding(inventory: TrellisCliInventory): DoctorFinding {
  const appInventory = inventory.appInventory
  const warning = appInventory.warnings[0]
  const sourceLocations = [
    ...appInventory.featureBindings.map((binding) => binding.source),
    ...appInventory.warnings.map((entry) => entry.source),
  ]
  const sources = [findingInventorySource('appInventory', sourceLocations)]

  if (!appInventory.detected) {
    return {
      id: 'app-inventory-source',
      category: 'core',
      title: 'App inventory source',
      status: 'pass',
      message:
        'No shared/app-inventory.ts file was found. Generated apps may add app inventory when they need feature-owned inventory.',
      fixHint:
        'Add shared/app-inventory.ts with defineAppInventory({ features: [...] }) when app-owned feature inventory becomes useful.',
      sources,
    }
  }

  if (warning) {
    return {
      id: 'app-inventory-source',
      category: 'core',
      title: 'App inventory source',
      status: 'warn',
      message: `Found ${appInventory.file}, but app inventory could not be statically read: ${warning.code} at ${formatInventoryLocations([warning.source])}.`,
      fixHint:
        'Use a static defineAppInventory({ features: [feature] as const }) feature list so doctor, upgrade, and future explain commands can read app-owned inventory.',
      sources,
    }
  }

  return {
    id: 'app-inventory-source',
    category: 'core',
    title: 'App inventory source',
    status: 'pass',
    message: `Found ${appInventory.file} with ${appInventory.featureBindings.length} static feature binding${appInventory.featureBindings.length === 1 ? '' : 's'}.`,
    fixHint:
      'Keep shared/app-inventory.ts static so doctor, upgrade, and future explain commands can read app-owned inventory.',
    sources,
  }
}

function createIdentityForwardingPublicExposureFinding(
  inventory: TrellisCliInventory,
): DoctorFinding {
  const locations = inventory.forwarding.publicExposures

  return {
    id: 'identity-forwarding-key-public-exposure',
    category: 'advanced',
    title: 'Identity forwarding public exposure',
    status: locations.length > 0 ? 'fail' : 'pass',
    message:
      locations.length > 0
        ? `Found identity-forwarding key exposure in public-facing code or env sources at ${formatInventoryLocations(locations)}.`
        : 'No obvious identity-forwarding key exposure paths were found in public-facing code or env sources.',
    fixHint:
      locations.length > 0
        ? 'Keep CONVEX_IDENTITY_FORWARDING_KEY server-only. Remove any NUXT_PUBLIC exposure or public runtime-config mapping.'
        : 'Keep the identity-forwarding key confined to server-only env and runtime paths.',
    sources: [findingInventorySource('forwarding.publicExposures', locations)],
  }
}

function createForwardedCallerFinding(inventory: TrellisCliInventory): DoctorFinding {
  const locations = inventory.forwarding.forwardedCallerMisuses

  return {
    id: 'forwarded-caller-trusted-path',
    category: 'advanced',
    title: 'Forwarded caller path',
    status: locations.length > 0 ? 'fail' : 'pass',
    message:
      locations.length > 0
        ? `Found forwarded \`caller\` options outside an \`auth: 'trusted'\` call in ${formatInventoryLocations(locations)}.`
        : 'No forwarded principals were found outside verified identity-forwarding calls.',
    fixHint:
      locations.length > 0
        ? "Only pass `caller` on verified server calls that also set `auth: 'trusted'`."
        : 'Keep forwarded principals confined to verified identity-forwarding lanes.',
    sources: [findingInventorySource('forwarding.forwardedCallerMisuses', locations)],
  }
}

function createUnsafeSurfaceFinding(inventory: TrellisCliInventory): DoctorFinding {
  const entries = inventory.backend.unsafeEntrypoints
  const locations = unsafeEntrypointLocations(entries)

  return {
    id: 'unsafe-surface-inventory',
    category: 'advanced',
    title: 'Unsafe surface inventory',
    status: 'pass',
    message:
      entries.length === 0
        ? 'No `query.unsafe(...)` or `mutation.unsafe(...)` entrypoints were detected.'
        : `Found ${entries.length} unsafe entrypoint${entries.length === 1 ? '' : 's'} in ${formatInventoryLocations(locations)}.`,
    fixHint:
      entries.length === 0
        ? 'No action needed unless you add intentional escape hatches later.'
        : 'Review each unsafe entrypoint and keep the typed permit narrow, explicit, and tested.',
    sources: [findingInventorySource('backend.unsafeEntrypoints', locations)],
  }
}

function createCrossTenantEscapeFinding(inventory: TrellisCliInventory): DoctorFinding {
  const locations = inventory.backend.crossTenantEscapes

  return {
    id: 'cross-scope-escape-inventory',
    category: 'advanced',
    title: 'Cross-scope escape inventory',
    status: 'pass',
    message:
      locations.length === 0
        ? 'No `ctx.db.escapeIsolation(...)` sites were detected.'
        : `Found ${locations.length} isolation escape${locations.length === 1 ? '' : 's'} in ${formatInventoryLocations(locations)}.`,
    fixHint:
      locations.length === 0
        ? 'No action needed unless the app adds cross-scope workflows later.'
        : 'Review each isolation escape and keep the reason, caller boundary, and data scope explicit.',
    sources: [findingInventorySource('backend.crossTenantEscapes', locations)],
  }
}

function createDestructiveOperationFinding(inventory: TrellisCliInventory): DoctorFinding {
  const locations = inventory.backend.destructiveOperations

  return {
    id: 'destructive-operation-inventory',
    category: 'advanced',
    title: 'Destructive operation inventory',
    status: 'pass',
    message:
      locations.length === 0
        ? 'No `kind: "destructive"` operations were detected.'
        : `Found ${locations.length} destructive operation${locations.length === 1 ? '' : 's'} in ${formatInventoryLocations(locations)}.`,
    fixHint:
      locations.length === 0
        ? 'No action needed unless the app adds destructive preview/confirm flows later.'
        : 'Review each destructive operation and keep preview, confirmation, and audit expectations explicit.',
    sources: [findingInventorySource('backend.destructiveOperations', locations)],
  }
}

function createMcpRateLimitStoreFinding(inventory: TrellisCliInventory): DoctorFinding {
  const expected = inventory.mcp.rateLimit.expected
  const store = inventory.mcp.rateLimit.store

  return {
    id: 'mcp-rate-limit-store',
    category: 'advanced',
    title: 'MCP rate-limit store',
    status: !expected ? 'pass' : store === 'supported' ? 'pass' : 'fail',
    message: !expected
      ? 'No MCP rate-limited tools were detected in the app source.'
      : store === 'supported'
        ? 'Found the first-party Redis MCP rate-limit store in app source.'
        : store === 'unverified'
          ? 'Found an explicit MCP rate-limit store, but doctor cannot verify that it is a supported atomic distributed store.'
          : 'MCP rate-limited tools were detected, but no supported distributed rate-limit store was found.',
    fixHint: !expected
      ? 'No action needed unless you add MCP rate-limited tools later.'
      : 'Use `rateLimitStore: createRedisMcpRateLimitStore(...)` for distributed MCP enforcement. The built-in fallback is process-local memory only, and custom stores remain unverified by doctor.',
  }
}

function createMcpDestructiveOperationBindingFinding(
  inventory: TrellisCliInventory,
): DoctorFinding {
  const locations = inventory.mcp.destructiveToolMisuses

  return {
    id: 'mcp-destructive-operation-binding',
    category: 'advanced',
    title: 'Destructive MCP operation binding',
    status: locations.length > 0 ? 'fail' : 'pass',
    message:
      locations.length > 0
        ? `Found destructive-looking MCP tools that do not use \`tool.operation(...)\` in ${formatInventoryLocations(locations)}.`
        : 'No destructive MCP tools were found outside operation-backed bindings.',
    fixHint:
      locations.length > 0
        ? 'Destructive MCP tools must bind through `tool.operation(...)` so preview, confirmation, and execute stay coupled.'
        : 'Keep destructive MCP tools operation-backed.',
    sources: [findingInventorySource('mcp.destructiveToolMisuses', locations)],
  }
}

function createOperationToolAgreementFinding(inventory: TrellisCliInventory): DoctorFinding {
  const destructiveOperations = inventory.publicSurface.operations.filter(
    (operation) => operation.kind === 'destructive',
  )
  const operationBackedTools = inventory.publicSurface.tools.filter(
    (tool) => tool.source === 'operation',
  )
  const destructiveOperationIdsWithTools = new Set(
    operationBackedTools
      .map((tool) => tool.operationId)
      .filter((operationId): operationId is string => typeof operationId === 'string'),
  )
  const destructiveOperationsWithoutTools = destructiveOperations.filter(
    (operation) => !destructiveOperationIdsWithTools.has(operation.id),
  )

  if (destructiveOperations.length === 0) {
    return {
      id: 'operation-tool-agreement',
      category: 'advanced',
      title: 'Operation/tool agreement',
      status: 'pass',
      message: 'No destructive operations were found in public-surface metadata.',
      fixHint: 'No action needed unless you add destructive operation-backed MCP tools later.',
      sources: [
        findingInventorySource(
          'publicSurface.operations',
          inventory.publicSurface.operations.map((operation) => operation.source),
        ),
        findingInventorySource(
          'publicSurface.tools',
          inventory.publicSurface.tools.map((tool) => tool.sourceLocation),
        ),
      ],
    }
  }

  if (!inventory.layers.mcp) {
    return {
      id: 'operation-tool-agreement',
      category: 'advanced',
      title: 'Operation/tool agreement',
      status: 'pass',
      message: `Found ${destructiveOperations.length} destructive operation${destructiveOperations.length === 1 ? '' : 's'} and no MCP layer. Backend-only destructive operations are valid.`,
      fixHint:
        'Expose destructive operations to MCP only when the app intentionally needs agent access.',
      sources: [
        findingInventorySource(
          'publicSurface.operations',
          destructiveOperations.map((operation) => operation.source),
        ),
        findingInventorySource(
          'publicSurface.tools',
          inventory.publicSurface.tools.map((tool) => tool.sourceLocation),
        ),
      ],
    }
  }

  if (destructiveOperationsWithoutTools.length > 0) {
    return {
      id: 'operation-tool-agreement',
      category: 'advanced',
      title: 'Operation/tool agreement',
      status: 'warn',
      message:
        operationBackedTools.length === 0
          ? `Found ${destructiveOperations.length} destructive operation${destructiveOperations.length === 1 ? '' : 's'} but no operation-backed MCP tools in public-surface metadata. First operation: ${formatInventoryLocations([destructiveOperationsWithoutTools[0]!.source])}.`
          : `Found destructive operation${destructiveOperationsWithoutTools.length === 1 ? '' : 's'} without exact MCP tool bindings at ${formatInventoryLocations(destructiveOperationsWithoutTools.map((operation) => operation.source))}.`,
      fixHint:
        'Bind destructive MCP tools with `tool.operation(theOperation, ...)` so doctor can verify the exact operation id, or keep the operation backend-only if MCP exposure is not intended.',
      sources: [
        findingInventorySource(
          'publicSurface.operations',
          destructiveOperationsWithoutTools.map((operation) => operation.source),
        ),
        findingInventorySource(
          'publicSurface.tools',
          inventory.publicSurface.tools.map((tool) => tool.sourceLocation),
        ),
      ],
    }
  }

  return {
    id: 'operation-tool-agreement',
    category: 'advanced',
    title: 'Operation/tool agreement',
    status: 'pass',
    message: `Found ${destructiveOperations.length} destructive operation${destructiveOperations.length === 1 ? '' : 's'} and exact operation-backed MCP tool binding${operationBackedTools.length === 1 ? '' : 's'} in public-surface metadata.`,
    fixHint:
      'Keep destructive MCP tools operation-backed so preview, confirmation, and execute stay coupled.',
    sources: [
      findingInventorySource(
        'publicSurface.operations',
        destructiveOperations.map((operation) => operation.source),
      ),
      findingInventorySource(
        'publicSurface.tools',
        operationBackedTools.map((tool) => tool.sourceLocation),
      ),
    ],
  }
}

function createDestructiveOperationPreviewProjectionFinding(
  inventory: TrellisCliInventory,
): DoctorFinding {
  const destructiveOperations = inventory.publicSurface.operations.filter(
    (operation) => operation.kind === 'destructive',
  )
  const previewOperationIds = new Set(
    inventory.publicSurface.projections
      .filter((projection) => projection.projection === 'preview')
      .map((projection) => projection.operationId),
  )
  const missingPreview = destructiveOperations.filter(
    (operation) => !previewOperationIds.has(operation.id),
  )

  return {
    id: 'destructive-operation-preview-projection',
    category: 'advanced',
    title: 'Destructive operation preview projection',
    status: missingPreview.length > 0 ? 'fail' : 'pass',
    message:
      missingPreview.length > 0
        ? `Found destructive operations without exported preview projections at ${formatInventoryLocations(missingPreview.map((operation) => operation.source))}.`
        : 'Every destructive operation in public-surface metadata has an exported preview projection.',
    fixHint:
      missingPreview.length > 0
        ? 'Export a protected preview with `mutation.protected(previewOf(operation))` when it issues confirmation state, or `query.protected(previewOf(operation))` for read-only previews.'
        : 'Keep destructive operation previews exported so UI, MCP, and doctor can share one preview contract.',
    sources: [
      findingInventorySource(
        'publicSurface.operations',
        missingPreview.length > 0
          ? missingPreview.map((operation) => operation.source)
          : destructiveOperations.map((operation) => operation.source),
      ),
      findingInventorySource(
        'publicSurface.projections',
        inventory.publicSurface.projections.map((projection) => projection.source),
      ),
    ],
  }
}

function createMcpCustomAppWriteBypassFinding(inventory: TrellisCliInventory): DoctorFinding {
  const locations = inventory.mcp.customAppWriteMisuses

  return {
    id: 'mcp-custom-app-write-bypass',
    category: 'advanced',
    title: 'Custom MCP app-write bypass',
    status: locations.length > 0 ? 'fail' : 'pass',
    message:
      locations.length > 0
        ? `Found standalone defineTool(...) handlers calling protected Convex writes in ${formatInventoryLocations(locations)}.`
        : 'No standalone custom MCP tools call Convex mutation/action helpers.',
    fixHint:
      locations.length > 0
        ? 'Move app writes to `defineMcpApp(...).tool.mutation(...)` for bounded writes or `tool.operation(...)` for sensitive/destructive/external work.'
        : 'Keep standalone defineTool(...) read/diagnostic/external-service only.',
    sources: [findingInventorySource('mcp.customAppWriteMisuses', locations)],
  }
}

export function collectInventoryDoctorFindings(inventory: TrellisCliInventory): DoctorFinding[] {
  return [
    createAppInventoryFinding(inventory),
    createIdentityForwardingPublicExposureFinding(inventory),
    createForwardedCallerFinding(inventory),
    createUnsafeSurfaceFinding(inventory),
    createCrossTenantEscapeFinding(inventory),
    createDestructiveOperationFinding(inventory),
    createDestructiveOperationPreviewProjectionFinding(inventory),
    createMcpRateLimitStoreFinding(inventory),
    createMcpDestructiveOperationBindingFinding(inventory),
    createOperationToolAgreementFinding(inventory),
    createMcpCustomAppWriteBypassFinding(inventory),
  ]
}
