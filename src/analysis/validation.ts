import { analyzeProject, collectProjectSourceFiles, findSchemaTable } from './project.js'

export interface ModuleValidationFinding {
  id: string
  message: string
}

function matchesAuthUsage(text: string): boolean {
  return (
    /\buseConvexAuth\b/u.test(text) ||
    /\buseConvexAuthActions\b/u.test(text) ||
    /\bConvexAuthenticated\b/u.test(text) ||
    /\bConvexAuthLoading\b/u.test(text)
  )
}

function tenantClassificationLabel(source: 'manifest' | 'functions'): string {
  return source === 'manifest' ? 'the composed feature manifest' : '`tenantIsolation`'
}

export function collectModuleValidationFindings(options: {
  rootDir: string
  authEnabled: boolean
}): ModuleValidationFinding[] {
  const analysis = analyzeProject(options.rootDir)
  const findings: ModuleValidationFinding[] = []

  if (!options.authEnabled) {
    const authUsages = collectProjectSourceFiles(options.rootDir).filter((file) =>
      matchesAuthUsage(file.text),
    )
    if (authUsages.length > 0) {
      findings.push({
        id: 'auth-enabled-consistency',
        message:
          'Auth-specific composables/components were detected in app code, but `trellis.auth.enabled` is false.',
      })
    }
  }

  if (analysis.tenantIsolation) {
    const classificationLabel = tenantClassificationLabel(analysis.tenantIsolation.source)
    const seen = new Set<string>()
    const seenGlobal = new Set<string>()
    if (analysis.tenantIsolation.tables.length === 0) {
      findings.push({
        id: 'tenant-isolation-valid',
        message: `${classificationLabel} should classify at least one tenant-scoped table when tenant isolation is configured.`,
      })
    }

    for (const tableName of analysis.tenantIsolation.tables) {
      if (seen.has(tableName)) {
        findings.push({
          id: 'tenant-isolation-valid',
          message: `${classificationLabel} contains a duplicate tenant-scoped table: "${tableName}".`,
        })
        continue
      }
      seen.add(tableName)

      const table = findSchemaTable(analysis, tableName)
      if (!table) {
        findings.push({
          id: 'tenant-isolation-valid',
          message: `Tenant-isolated table "${tableName}" does not exist in \`convex/schema.ts\`.`,
        })
        continue
      }
      if (!table.fields.includes(analysis.tenantIsolation.field)) {
        findings.push({
          id: 'tenant-isolation-valid',
          message: `Tenant-isolated table "${tableName}" is missing the "${analysis.tenantIsolation.field}" field.`,
        })
      }
      if (!table.indexes.includes(analysis.tenantIsolation.indexName)) {
        findings.push({
          id: 'tenant-table-requires-tenant-index',
          message: `Tenant-isolated table "${tableName}" is missing the "${analysis.tenantIsolation.indexName}" index.`,
        })
      }
    }

    for (const tableName of analysis.tenantIsolation.globalTables) {
      if (seenGlobal.has(tableName)) {
        findings.push({
          id: 'tenant-isolation-valid',
          message: `${classificationLabel} contains a duplicate global table: "${tableName}".`,
        })
        continue
      }
      seenGlobal.add(tableName)

      if (seen.has(tableName)) {
        findings.push({
          id: 'tenant-isolation-valid',
          message: `${classificationLabel} cannot classify table "${tableName}" as both tenant-scoped and global.`,
        })
        continue
      }

      const table = findSchemaTable(analysis, tableName)
      if (!table) {
        findings.push({
          id: 'tenant-isolation-valid',
          message: `Global tenant-isolation table "${tableName}" does not exist in \`convex/schema.ts\`.`,
        })
      }
    }

    for (const table of analysis.schemaTables) {
      const hasTenantShape =
        table.fields.includes(analysis.tenantIsolation.field) &&
        table.indexes.includes(analysis.tenantIsolation.indexName)
      if (!hasTenantShape) continue
      if (analysis.tenantIsolation.tables.includes(table.name)) continue
      if (analysis.tenantIsolation.globalTables.includes(table.name)) continue
      findings.push({
        id: 'tenant-isolation-table-coverage',
        message:
          `Table "${table.name}" has the tenant field "${analysis.tenantIsolation.field}" and index ` +
          `"${analysis.tenantIsolation.indexName}" but is not classified as tenant-scoped by ${classificationLabel}.`,
      })
    }
  }

  if (analysis.destructiveSafety) {
    const redemptionTable = findSchemaTable(analysis, analysis.destructiveSafety.redemptionTable)
    const auditTable = findSchemaTable(analysis, analysis.destructiveSafety.auditTable)

    if (!redemptionTable) {
      findings.push({
        id: 'destructive-safety-schema',
        message:
          `Destructive-safety redemption table "${analysis.destructiveSafety.redemptionTable}" does not exist in ` +
          '`convex/schema.ts`.',
      })
    } else {
      if (!redemptionTable.fields.includes('jti')) {
        findings.push({
          id: 'destructive-safety-schema',
          message: `Destructive-safety redemption table "${analysis.destructiveSafety.redemptionTable}" is missing the "jti" field.`,
        })
      }

      if (!redemptionTable.indexes.includes('by_jti')) {
        findings.push({
          id: 'destructive-safety-schema',
          message: `Destructive-safety redemption table "${analysis.destructiveSafety.redemptionTable}" is missing the "by_jti" index.`,
        })
      }
    }

    if (!auditTable) {
      findings.push({
        id: 'destructive-safety-schema',
        message:
          `Destructive-safety audit table "${analysis.destructiveSafety.auditTable}" does not exist in ` +
          '`convex/schema.ts`.',
      })
    }
  }

  return findings
}
