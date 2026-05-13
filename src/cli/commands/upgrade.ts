import { writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import { defineCommand } from 'citty'
import { Node, Project, SyntaxKind, type SourceFile } from 'ts-morph'

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

export interface UpgradeWriteReport extends UpgradeCheckReport {
  changedFiles: string[]
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
  const seenLocations = new Set<string>()
  const sources = [
    ...project.sourceFiles,
    ...(project.nuxtConfigPath
      ? [{ path: project.nuxtConfigPath, text: project.nuxtConfigText }]
      : []),
  ]

  for (const source of sources) {
    for (const pattern of patterns) {
      const globalPattern = new RegExp(
        pattern.source,
        pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
      )
      for (const match of source.text.matchAll(globalPattern)) {
        const index = match.index ?? 0
        const line = source.text.slice(0, index).split(/\r?\n/).length
        const relativeLocation = toRelativeLocation(project, source.path, line)
        const key = `${relativeLocation.path}:${relativeLocation.line}`
        if (seenLocations.has(key)) continue
        seenLocations.add(key)
        locations.push(relativeLocation)
      }
    }
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

function findAuthorizeArityInference(
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
    if (!isTsMorphParseablePath(source.path) || !source.text.includes('authorize')) continue

    let sourceFile
    try {
      sourceFile = tsProject.createSourceFile(source.path, source.text, {
        overwrite: true,
      })
    } catch {
      continue
    }

    for (const property of sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
      const name = property.getNameNode()
      const isAuthorizeProperty =
        (Node.isIdentifier(name) && name.getText() === 'authorize') ||
        (Node.isStringLiteral(name) && name.getLiteralText() === 'authorize')
      if (!isAuthorizeProperty) continue

      const initializer = property.getInitializer()
      const hasOneParameter =
        (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer)) &&
        initializer.getParameters().length === 1
      if (!hasOneParameter) continue

      locations.push(toRelativeLocation(project, source.path, property.getStartLineNumber()))
    }
  }

  return locations
}

function sourceHasMcpBinding(sourceFile: SourceFile): boolean {
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.getDefaultImport()?.getText() === 'mcp') return true
    if (declaration.getNamespaceImport()?.getText() === 'mcp') return true
    if (
      declaration
        .getNamedImports()
        .some((namedImport) => namedImport.getNameNode().getText() === 'mcp')
    ) {
      return true
    }
  }

  return sourceFile
    .getVariableDeclarations()
    .some((declaration) => declaration.getNameNode().getText() === 'mcp')
}

function replaceRanges(
  text: string,
  replacements: Array<{ start: number; end: number; text: string }>,
): string {
  return replacements
    .sort((left, right) => right.start - left.start)
    .reduce(
      (current, replacement) =>
        `${current.slice(0, replacement.start)}${replacement.text}${current.slice(replacement.end)}`,
      text,
    )
}

function replaceLegacyModuleSpecifiers(text: string): string {
  return text.replace(
    /\b(from\s*|import\s*)(["'])(@lupinum\/trellis\/(?:functions|bridge))\2/g,
    (match: string, prefix: string, quote: string, specifier: string) => {
      if (specifier === '@lupinum/trellis/functions') {
        return `${prefix}${quote}@lupinum/trellis/backend${quote}`
      }
      if (specifier === '@lupinum/trellis/bridge') {
        return `${prefix}${quote}@lupinum/trellis-bridge${quote}`
      }
      return match
    },
  )
}

function applyToolFromOperationCodemod(path: string, text: string): string {
  if (!isTsMorphParseablePath(path) || !text.includes('tool.fromOperation')) return text

  const tsProject = new Project({
    compilerOptions: {
      allowJs: true,
      jsx: 1,
    },
    useInMemoryFileSystem: true,
  })

  let sourceFile
  try {
    sourceFile = tsProject.createSourceFile(path, text, { overwrite: true })
  } catch {
    return text
  }

  if (!sourceHasMcpBinding(sourceFile)) return text

  const replacements: Array<{ start: number; end: number; text: string }> = []
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expression = call.getExpression()
    if (!Node.isPropertyAccessExpression(expression)) continue
    if (expression.getName() !== 'fromOperation') continue

    const receiver = expression.getExpression()
    if (!Node.isIdentifier(receiver) || receiver.getText() !== 'tool') continue
    replacements.push({
      start: expression.getStart(),
      end: expression.getEnd(),
      text: 'mcp.tool.operation',
    })
  }

  return replacements.length === 0 ? text : replaceRanges(text, replacements)
}

function applyMechanicalUpgradeCodemods(cwd: string): string[] {
  const project = inspectProject(cwd)
  const changedFiles: string[] = []

  for (const source of project.sourceFiles) {
    let next = replaceLegacyModuleSpecifiers(source.text)
    next = applyToolFromOperationCodemod(source.path, next)
    if (next === source.text) continue

    writeFileSync(source.path, next)
    changedFiles.push(relative(project.cwd, source.path).replaceAll('\\', '/'))
  }

  return changedFiles
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
    /\b_identityForwardingKey\b/,
    /\b_identityForwarding\b/,
    /\bidentityForwardingKey\b/,
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
  const legacyOperationPreviewShape = findTokenLocations(project, [
    /previewReturns\s*:\s*v\.object\s*\(\s*\{[\s\S]{1,500}\bdisplay\s*:/,
    /preview\s*:\s*async[\s\S]{1,500}\bdisplay\s*:[\s\S]{1,500}\bconfirm\s*:/,
  ])
  const authorizeArityInference = findAuthorizeArityInference(project)
  const unsafePermitMigrationEntrypoints = unsafeEntrypointsNeedingPermitMigration(inventory)
  const unsafePermitMigrationLocations = unsafeEntrypointLocations(unsafePermitMigrationEntrypoints)

  return [
    createLocationFinding({
      id: 'upgrade-raw-forwarding',
      title: 'Raw identity-forwarding migration',
      locations: [
        ...legacyRawForwarding,
        ...inventory.forwarding.publicExposures,
        ...inventory.forwarding.forwardedCallerMisuses,
      ],
      sources: [
        findingProjectScanSource('legacy raw forwarding tokens', legacyRawForwarding),
        findingInventorySource('forwarding.publicExposures', inventory.forwarding.publicExposures),
        findingInventorySource(
          'forwarding.forwardedCallerMisuses',
          inventory.forwarding.forwardedCallerMisuses,
        ),
      ],
      statusWhenFound: 'fail',
      foundMessage: (locations) =>
        `Found raw or public identity-forwarding usage at ${formatLocations(locations)}.`,
      cleanMessage: 'No raw identity-forwarding usage was found.',
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
      id: 'upgrade-operation-preview-envelope',
      title: 'Operation preview envelope migration',
      locations: legacyOperationPreviewShape,
      sources: [
        findingProjectScanSource(
          'old destructive preview display shape',
          legacyOperationPreviewShape,
        ),
      ],
      statusWhenFound: 'fail',
      foundMessage: (locations) =>
        `Found old destructive preview display shapes at ${formatLocations(locations)}.`,
      cleanMessage: 'No old destructive preview display shapes were found.',
      fixHint:
        'Return `operationPreview(...)` or `blockedOperationPreview(...)` and validate with `operationPreviewValidator(...)` instead of `{ display, confirm }`.',
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

export async function buildUpgradeWriteReport(cwd: string): Promise<UpgradeWriteReport> {
  const changedFiles = applyMechanicalUpgradeCodemods(cwd)
  const report = await buildUpgradeCheckReport(cwd)

  return {
    ...report,
    changedFiles,
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
    write: {
      type: 'boolean',
      description: 'Apply safe mechanical migration edits',
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
    if (args.write && args.json) {
      process.stderr.write('`trellis upgrade --write --json` is not supported yet.\n')
      process.exitCode = 1
      return 1
    }

    if (!args.check && !args.write) {
      process.stderr.write(
        'Choose an upgrade mode: `trellis upgrade --check` or `trellis upgrade --write`.\n',
      )
      process.exitCode = 1
      return 1
    }

    const cwd = resolve(args.cwd || process.cwd())
    const report = args.write
      ? await buildUpgradeWriteReport(cwd)
      : await buildUpgradeCheckReport(cwd)
    renderFindingReport(report, {
      json: Boolean(args.json),
      title: args.write ? 'Trellis 1.0 upgrade write' : 'Trellis 1.0 upgrade check',
    })

    if (args.write) {
      const changedFiles =
        'changedFiles' in report && Array.isArray(report.changedFiles)
          ? (report.changedFiles as string[])
          : []
      process.stdout.write(
        changedFiles.length === 0
          ? '\nChanged files: none\n'
          : `\nChanged files:\n${changedFiles.map((file) => `- ${file}`).join('\n')}\n`,
      )
    }

    const exitCode = exitCodeForFindings(report.summary)
    process.exitCode = exitCode
    return exitCode
  },
})
