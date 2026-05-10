import { relative, resolve } from 'node:path'

import { defineCommand } from 'citty'
import { Node, Project, SyntaxKind } from 'ts-morph'

import type { DoctorFinding, FindingReport, FindingSource } from '../lib/findings.js'
import {
  exitCodeForFindings,
  findingInventorySource,
  findingProjectScanSource,
  summarizeFindings,
} from '../lib/findings.js'
import {
  collectTrellisCliInventory,
  collectTrellisCliInventoryFacts,
  type TrellisCliInventory,
  type TrellisCliInventoryUnsafeEntrypoint,
  type TrellisCliInventorySourceLocation,
} from '../lib/inventory.js'
import { renderFindingReport } from '../lib/output.js'
import { inspectProject, type ProjectInspection } from '../lib/project.js'

export interface UpgradeCheckReport extends FindingReport {
  schemaVersion: 1
}

type UpgradeFindingOptions = {
  id: string
  title: string
  locations: TrellisCliInventorySourceLocation[]
  sources?: FindingSource[]
  statusWhenFound: 'warn' | 'fail'
  foundMessage: (locations: TrellisCliInventorySourceLocation[]) => string
  cleanMessage: string
  fixHint: string
}

function formatLocations(locations: TrellisCliInventorySourceLocation[], limit = 3): string {
  return `${locations
    .map((location) => `${location.path}:${location.line}`)
    .slice(0, limit)
    .join(', ')}${locations.length > limit ? ', ...' : ''}`
}

function unsafeEntrypointLocations(
  entries: TrellisCliInventoryUnsafeEntrypoint[],
): TrellisCliInventorySourceLocation[] {
  return entries.map((entry) => entry.source)
}

function unsafeEntrypointsNeedingPermitMigration(
  inventory: TrellisCliInventory,
): TrellisCliInventoryUnsafeEntrypoint[] {
  return inventory.backend.unsafeEntrypoints.filter((entry) => entry.style !== 'typed-permit')
}

function toRelativeLocation(
  project: ProjectInspection,
  path: string,
  line: number,
): TrellisCliInventorySourceLocation {
  if (path.startsWith('process.env.')) {
    return { path, line }
  }

  return {
    path: relative(project.cwd, path).replaceAll('\\', '/'),
    line,
  }
}

function findTokenLocations(
  project: ProjectInspection,
  patterns: readonly RegExp[],
): TrellisCliInventorySourceLocation[] {
  const locations: TrellisCliInventorySourceLocation[] = []
  const sources = [
    ...project.sourceFiles,
    ...(project.nuxtConfigPath
      ? [{ path: project.nuxtConfigPath, text: project.nuxtConfigText }]
      : []),
  ]

  for (const source of sources) {
    const matches = patterns
      .map((pattern) => source.text.match(pattern))
      .filter((match): match is RegExpMatchArray => Boolean(match))
    if (matches.length === 0) continue

    const firstIndex = Math.min(...matches.map((match) => match.index ?? 0))
    locations.push(
      toRelativeLocation(
        project,
        source.path,
        source.text.slice(0, firstIndex).split(/\r?\n/).length,
      ),
    )
  }

  return locations
}

const backendBuilderNames = new Set(['query', 'mutation', 'action'])

function isTsMorphParseablePath(path: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(path)
}

function isTrellisBackendImportSpecifier(specifier: string, sourcePath: string): boolean {
  if (specifier === '@lupinum/trellis/backend' || specifier === '@lupinum/trellis/functions') {
    return true
  }

  const normalizedSourcePath = sourcePath.replaceAll('\\', '/')
  return (
    specifier.startsWith('.') &&
    /(?:^|\/)functions$/.test(specifier) &&
    normalizedSourcePath.includes('/convex/')
  )
}

function findLegacyBackendRootBuilderCalls(
  project: ProjectInspection,
): TrellisCliInventorySourceLocation[] {
  const locations: TrellisCliInventorySourceLocation[] = []
  const tsProject = new Project({
    compilerOptions: {
      allowJs: true,
      jsx: 1,
    },
    useInMemoryFileSystem: true,
  })

  for (const source of project.sourceFiles) {
    if (!isTsMorphParseablePath(source.path)) continue

    let sourceFile
    try {
      sourceFile = tsProject.createSourceFile(source.path, source.text, {
        overwrite: true,
      })
    } catch {
      continue
    }

    const trellisBackendBuilders = new Set<string>()

    for (const declaration of sourceFile.getImportDeclarations()) {
      if (!isTrellisBackendImportSpecifier(declaration.getModuleSpecifierValue(), source.path)) {
        continue
      }

      for (const namedImport of declaration.getNamedImports()) {
        const importedName = namedImport.getName()
        if (!backendBuilderNames.has(importedName)) continue
        trellisBackendBuilders.add(namedImport.getAliasNode()?.getText() ?? importedName)
      }
    }

    if (trellisBackendBuilders.size === 0) continue

    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expression = call.getExpression()
      if (!Node.isIdentifier(expression)) continue
      if (!trellisBackendBuilders.has(expression.getText())) continue

      const start = call.getStartLineNumber()
      locations.push(toRelativeLocation(project, source.path, start))
    }
  }

  return locations
}

function createLocationFinding(options: UpgradeFindingOptions): DoctorFinding {
  if (options.locations.length === 0) {
    return {
      id: options.id,
      category: 'advanced',
      title: options.title,
      status: 'pass',
      message: options.cleanMessage,
      fixHint: 'No migration needed for this surface.',
    }
  }

  return {
    id: options.id,
    category: 'advanced',
    title: options.title,
    status: options.statusWhenFound,
    message: options.foundMessage(options.locations),
    fixHint: options.fixHint,
    sources: options.sources,
  }
}

function createUpgradeFindings(
  project: ProjectInspection,
  inventory: TrellisCliInventory,
): DoctorFinding[] {
  const legacyRawForwarding = findTokenLocations(project, [
    /\b_trustedForwardingKey\b/,
    /\b_trustedForwarding\b/,
    /\btrustedForwardingKey\b/,
  ])
  const toolFromOperation = findTokenLocations(project, [/\btool\.fromOperation\s*\(/])
  const legacyFunctionsImport = findTokenLocations(project, [
    /['"]@lupinum\/trellis\/functions['"]/,
  ])
  const legacyBridgeImport = findTokenLocations(project, [/['"]@lupinum\/trellis\/bridge['"]/])
  const legacyStarterReferences = findTokenLocations(project, [
    /\bworkspace\s+--mcp\b/,
    /\b--template\s+workspace\s+--mcp\b/,
    /\b--template\s+cms\b/,
    /\btemplate\s*:\s*['"]cms['"]/,
  ])
  const legacyBackendRootBuilders = findLegacyBackendRootBuilderCalls(project)
  const authorizeArityInference = findTokenLocations(project, [
    /authorize\s*:\s*(?:async\s*)?\(\s*(?:\{[^)]*\}|[A-Za-z_$][\w$]*\s*:\s*\{[^)]*\})\s*\)\s*=>/,
  ])
  const unsafePermitMigrationEntrypoints = unsafeEntrypointsNeedingPermitMigration(inventory)
  const unsafePermitMigrationLocations = unsafeEntrypointLocations(unsafePermitMigrationEntrypoints)

  return [
    createLocationFinding({
      id: 'upgrade-raw-forwarding',
      title: 'Raw trusted-forwarding migration',
      locations: [
        ...legacyRawForwarding,
        ...inventory.forwarding.publicExposures,
        ...inventory.forwarding.forwardedPrincipalMisuses,
      ],
      sources: [
        findingProjectScanSource('legacy raw forwarding tokens', legacyRawForwarding),
        findingInventorySource('forwarding.publicExposures', inventory.forwarding.publicExposures),
        findingInventorySource(
          'forwarding.forwardedPrincipalMisuses',
          inventory.forwarding.forwardedPrincipalMisuses,
        ),
      ],
      statusWhenFound: 'fail',
      foundMessage: (locations) =>
        `Found raw or public trusted-forwarding usage at ${formatLocations(locations)}.`,
      cleanMessage: 'No raw trusted-forwarding usage was found.',
      fixHint:
        'Use signed `_trellisForwarding` envelopes and keep forwarded identity out of public args.',
    }),
    createLocationFinding({
      id: 'upgrade-tool-from-operation',
      title: 'tool.fromOperation migration',
      locations: toolFromOperation,
      sources: [findingProjectScanSource('tool.fromOperation tokens', toolFromOperation)],
      statusWhenFound: 'warn',
      foundMessage: (locations) =>
        `Found deleted \`tool.fromOperation(...)\` usage at ${formatLocations(locations)}.`,
      cleanMessage: 'No tool.fromOperation usages were found.',
      fixHint: 'Replace `tool.fromOperation(...)` with `mcp.tool.operation(...)`.',
    }),
    createLocationFinding({
      id: 'upgrade-functions-import',
      title: 'Functions import migration',
      locations: legacyFunctionsImport,
      sources: [findingProjectScanSource('legacy functions imports', legacyFunctionsImport)],
      statusWhenFound: 'warn',
      foundMessage: (locations) =>
        `Found old \`@lupinum/trellis/functions\` imports at ${formatLocations(locations)}.`,
      cleanMessage: 'No @lupinum/trellis/functions imports were found.',
      fixHint: 'Use `@lupinum/trellis/backend` as the canonical 1.0 backend import.',
    }),
    createLocationFinding({
      id: 'upgrade-bridge-import',
      title: 'Bridge import migration',
      locations: legacyBridgeImport,
      sources: [findingProjectScanSource('legacy bridge imports', legacyBridgeImport)],
      statusWhenFound: 'warn',
      foundMessage: (locations) =>
        `Found old core bridge imports at ${formatLocations(locations)}.`,
      cleanMessage: 'No @lupinum/trellis/bridge imports were found.',
      fixHint: 'Move packaged integration code to `@lupinum/trellis-bridge`.',
    }),
    createLocationFinding({
      id: 'upgrade-backend-root-builder',
      title: 'Backend root builder migration',
      locations: legacyBackendRootBuilders,
      sources: [
        findingProjectScanSource(
          'legacy Trellis backend root builder calls',
          legacyBackendRootBuilders,
        ),
      ],
      statusWhenFound: 'warn',
      foundMessage: (locations) =>
        `Found deleted Trellis backend root builder calls at ${formatLocations(locations)}.`,
      cleanMessage: 'No Trellis backend root builder calls were found.',
      fixHint:
        'Replace `query(...)`, `mutation(...)`, and `action(...)` Trellis backend calls with explicit lanes such as `.public(...)`, `.protected(...)`, or `.unsafe(...)`.',
    }),
    createLocationFinding({
      id: 'upgrade-mcp-destructive-binding',
      title: 'MCP destructive binding migration',
      locations: inventory.mcp.destructiveToolMisuses,
      sources: [
        findingInventorySource('mcp.destructiveToolMisuses', inventory.mcp.destructiveToolMisuses),
      ],
      statusWhenFound: 'fail',
      foundMessage: (locations) =>
        `Found destructive-looking MCP tools outside operation bindings at ${formatLocations(locations)}.`,
      cleanMessage: 'No destructive MCP tools were found outside operation bindings.',
      fixHint: 'Expose destructive MCP work through `tool.operation(...)` only.',
    }),
    createLocationFinding({
      id: 'upgrade-mcp-custom-app-write',
      title: 'Custom MCP app-write migration',
      locations: inventory.mcp.customAppWriteMisuses,
      sources: [
        findingInventorySource('mcp.customAppWriteMisuses', inventory.mcp.customAppWriteMisuses),
      ],
      statusWhenFound: 'fail',
      foundMessage: (locations) =>
        `Found custom MCP tools calling app writes at ${formatLocations(locations)}.`,
      cleanMessage: 'No custom MCP tools call app write helpers.',
      fixHint:
        'Use `tool.mutation(...)` for bounded writes or `tool.operation(...)` for sensitive/destructive/external work.',
    }),
    createLocationFinding({
      id: 'upgrade-unsafe-permits',
      title: 'Unsafe permit migration',
      locations: unsafePermitMigrationLocations,
      sources: [
        findingInventorySource('backend.unsafeEntrypoints', unsafePermitMigrationLocations),
      ],
      statusWhenFound: 'warn',
      foundMessage: (locations) =>
        `Found unsafe backend entrypoints without typed permits at ${formatLocations(locations)}.`,
      cleanMessage: 'All unsafe backend entrypoints use typed permits.',
      fixHint: 'Use typed `unsafe.permit(...)` metadata for every unsafe backend entrypoint.',
    }),
    createLocationFinding({
      id: 'upgrade-authorize-arity',
      title: 'Authorize arity migration',
      locations: authorizeArityInference,
      sources: [
        findingProjectScanSource('one-argument authorize callbacks', authorizeArityInference),
      ],
      statusWhenFound: 'warn',
      foundMessage: (locations) =>
        `Found likely one-argument \`authorize\` callbacks at ${formatLocations(locations)}.`,
      cleanMessage: 'No one-argument authorize callbacks were found.',
      fixHint:
        'Rewrite loaded-resource authorize factories to explicit `{ label, check }` object form. Do not rely on function arity.',
    }),
    createLocationFinding({
      id: 'upgrade-starter-surface',
      title: 'Starter surface migration',
      locations: legacyStarterReferences,
      sources: [findingProjectScanSource('legacy starter references', legacyStarterReferences)],
      statusWhenFound: 'warn',
      foundMessage: (locations) =>
        `Found deleted starter spelling references at ${formatLocations(locations)}.`,
      cleanMessage: 'No deleted starter spellings were found.',
      fixHint:
        'Use `workspace-mcp` directly and keep CMS setup in Ginko-owned commands or bridge-author docs.',
    }),
  ]
}

export async function buildUpgradeCheckReport(cwd: string): Promise<UpgradeCheckReport> {
  const project = inspectProject(cwd)
  const inventoryFacts = collectTrellisCliInventoryFacts(project)
  const inventory = collectTrellisCliInventory(project, inventoryFacts)
  const findings = createUpgradeFindings(project, inventory)

  return {
    schemaVersion: 1,
    cwd,
    inventory,
    findings,
    summary: summarizeFindings(findings),
  }
}

export const upgradeCommand = defineCommand({
  meta: {
    name: 'upgrade',
    description: 'Audit a project for the Trellis 1.0 migration',
  },
  args: {
    check: {
      type: 'boolean',
      description: 'Run the read-only migration audit',
      default: false,
    },
    cwd: {
      type: 'string',
      description: 'Path to the Nuxt app to inspect',
      valueHint: 'path',
    },
    json: {
      type: 'boolean',
      description: 'Print the report as JSON',
      default: false,
    },
  },
  async run({ args }) {
    if (!args.check) {
      process.stderr.write(
        'Only read-only check mode exists right now. Use `trellis upgrade --check`.\n',
      )
      process.exitCode = 1
      return 1
    }

    const report = await buildUpgradeCheckReport(resolve(args.cwd || process.cwd()))
    renderFindingReport(report, {
      json: Boolean(args.json),
      title: 'Trellis 1.0 upgrade check',
    })

    const exitCode = exitCodeForFindings(report.summary)
    process.exitCode = exitCode
    return exitCode
  },
})
