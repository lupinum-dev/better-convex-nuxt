import { resolve } from 'node:path'

import { defineCommand } from 'citty'

import {
  collectTrellisCliInventory,
  collectTrellisCliInventoryFacts,
  type TrellisCliInventory,
  type TrellisCliInventoryFeature,
  type TrellisCliInventoryPublicSurfaceOperation,
  type TrellisCliInventoryPublicSurfaceProjection,
  type TrellisCliInventoryPublicSurfaceTool,
  type TrellisCliInventorySourceLocation,
} from '../lib/inventory.js'
import { inspectProject } from '../lib/project.js'

interface ExplainOperationReport {
  schemaVersion: 1
  cwd: string
  operation: {
    id: string
    exportName: string
    kind: 'safe' | 'destructive'
    source: TrellisCliInventorySourceLocation
    projections: TrellisCliInventoryPublicSurfaceProjection[]
    mcpTools: {
      status: 'none' | 'matched'
      tools: TrellisCliInventoryPublicSurfaceTool[]
      message?: string
    }
    featureRefs: Array<{
      exportName: string
      name: string
      file: string
      source: TrellisCliInventorySourceLocation
    }>
  }
}

interface ExplainOperationMissingReport {
  schemaVersion: 1
  cwd: string
  error: {
    code: 'operation-not-found' | 'no-operations'
    message: string
    availableOperationIds: string[]
  }
}

function formatLocation(location: TrellisCliInventorySourceLocation): string {
  return `${location.path}:${location.line}`
}

function findOperation(
  inventory: TrellisCliInventory,
  operationId: string,
): TrellisCliInventoryPublicSurfaceOperation | null {
  return (
    inventory.publicSurface.operations.find((operation) => operation.id === operationId) ?? null
  )
}

function findOperationProjections(
  inventory: TrellisCliInventory,
  operationId: string,
): TrellisCliInventoryPublicSurfaceProjection[] {
  return inventory.publicSurface.projections.filter(
    (projection) => projection.operationId === operationId,
  )
}

function findFeatureRefs(
  inventory: TrellisCliInventory,
  operation: TrellisCliInventoryPublicSurfaceOperation,
): ExplainOperationReport['operation']['featureRefs'] {
  return inventory.features
    .filter((feature: TrellisCliInventoryFeature) =>
      feature.operationRefs.includes(operation.exportName),
    )
    .map((feature) => ({
      exportName: feature.exportName,
      name: feature.name,
      file: feature.file,
      source: feature.source,
    }))
}

function createOperationReport(
  cwd: string,
  inventory: TrellisCliInventory,
  operation: TrellisCliInventoryPublicSurfaceOperation,
): ExplainOperationReport {
  const matchedTools = inventory.publicSurface.tools.filter(
    (tool) => tool.source === 'operation' && tool.operationId === operation.id,
  )

  return {
    schemaVersion: 1,
    cwd,
    operation: {
      id: operation.id,
      exportName: operation.exportName,
      kind: operation.kind,
      source: operation.source,
      projections: findOperationProjections(inventory, operation.id),
      mcpTools: {
        status: matchedTools.length > 0 ? 'matched' : 'none',
        tools: matchedTools,
        ...(matchedTools.length === 0
          ? { message: 'No MCP tools were found for this operation id.' }
          : {}),
      },
      featureRefs: findFeatureRefs(inventory, operation),
    },
  }
}

function createMissingReport(
  cwd: string,
  inventory: TrellisCliInventory,
  operationId: string,
): ExplainOperationMissingReport {
  const availableOperationIds = inventory.publicSurface.operations.map((operation) => operation.id)

  return {
    schemaVersion: 1,
    cwd,
    error: {
      code: availableOperationIds.length === 0 ? 'no-operations' : 'operation-not-found',
      message:
        availableOperationIds.length === 0
          ? 'No operations were found in inventory.'
          : `Operation "${operationId}" was not found in inventory.`,
      availableOperationIds,
    },
  }
}

function renderOperationReport(report: ExplainOperationReport): void {
  const { operation } = report

  process.stdout.write(`Operation ${operation.id}\n`)
  process.stdout.write(`Kind: ${operation.kind}\n`)
  process.stdout.write(`Export: ${operation.exportName}\n`)
  process.stdout.write(`Source: ${formatLocation(operation.source)}\n`)
  process.stdout.write('Projections:\n')

  if (operation.projections.length === 0) {
    process.stdout.write('  none\n')
  } else {
    for (const projection of operation.projections) {
      process.stdout.write(
        `  ${projection.projection}: ${projection.exportName} at ${formatLocation(projection.source)}\n`,
      )
    }
  }

  process.stdout.write('MCP tools:\n')
  if (operation.mcpTools.tools.length === 0) {
    process.stdout.write(`  ${operation.mcpTools.message ?? 'none'}\n`)
  } else {
    for (const tool of operation.mcpTools.tools) {
      process.stdout.write(
        `  ${tool.name}: operation-backed at ${formatLocation(tool.sourceLocation)}\n`,
      )
    }
  }

  process.stdout.write('Feature refs:\n')
  if (operation.featureRefs.length === 0) {
    process.stdout.write('  none\n')
  } else {
    for (const feature of operation.featureRefs) {
      process.stdout.write(
        `  ${feature.exportName} (${feature.name}) at ${formatLocation(feature.source)}\n`,
      )
    }
  }
}

function renderMissingReport(report: ExplainOperationMissingReport): void {
  process.stderr.write(`${report.error.message}\n`)
  if (report.error.availableOperationIds.length > 0) {
    process.stderr.write(`Available operations: ${report.error.availableOperationIds.join(', ')}\n`)
  }
}

export const explainCommand = defineCommand({
  meta: {
    name: 'explain',
    description: 'Explain Trellis inventory-backed app concepts',
  },
  args: {
    topic: {
      type: 'positional',
      required: true,
      description: 'Concept to explain. Currently only: operation',
    },
    id: {
      type: 'positional',
      required: true,
      description: 'Identifier to explain',
    },
    cwd: {
      type: 'string',
      description: 'Path to the Nuxt app to inspect',
      valueHint: 'path',
    },
    json: {
      type: 'boolean',
      description: 'Print the explanation as JSON',
      default: false,
    },
    color: {
      type: 'boolean',
      description: 'Enable colored output',
      default: true,
    },
  },
  async run({ args }) {
    const topic = String(args.topic)
    if (topic !== 'operation') {
      throw new Error('Invalid explain topic. Use `trellis explain operation <id>`.')
    }

    const operationId = String(args.id)
    const cwd = resolve(args.cwd || process.cwd())
    const project = inspectProject(cwd)
    const inventoryFacts = collectTrellisCliInventoryFacts(project)
    const inventory = collectTrellisCliInventory(project, inventoryFacts)
    const operation = findOperation(inventory, operationId)

    if (!operation) {
      const report = createMissingReport(cwd, inventory, operationId)
      if (args.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
      } else {
        renderMissingReport(report)
      }
      process.exitCode = 1
      return 1
    }

    const report = createOperationReport(cwd, inventory, operation)
    if (args.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    } else {
      renderOperationReport(report)
    }

    return 0
  },
})
