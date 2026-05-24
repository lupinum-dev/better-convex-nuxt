import { analyzeProject, collectProjectSourceFiles, findSchemaTable } from './project.js'

export interface ModuleValidationFinding {
  id: string
  message: string
}

function matchesAuthUsage(text: string): boolean {
  return (
    /\buseConvexAuth\b/u.test(text) ||
    /\buseBetterAuthActions\b/u.test(text) ||
    /\bConvexAuthenticated\b/u.test(text) ||
    /\bConvexAuthLoading\b/u.test(text)
  )
}

function tenantClassificationLabel(source: 'manifest' | 'functions'): string {
  return source === 'manifest' ? 'the composed feature manifest' : '`isolation`'
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

  if (analysis.isolation) {
    const classificationLabel = tenantClassificationLabel(analysis.isolation.source)
    const seen = new Set<string>()
    const seenGlobal = new Set<string>()
    if (analysis.isolation.tables.length === 0) {
      findings.push({
        id: 'isolation-valid',
        message: `${classificationLabel} should classify at least one tenant-scoped table when isolation is configured.`,
      })
    }

    for (const tableName of analysis.isolation.tables) {
      if (seen.has(tableName)) {
        findings.push({
          id: 'isolation-valid',
          message: `${classificationLabel} contains a duplicate tenant-scoped table: "${tableName}".`,
        })
        continue
      }
      seen.add(tableName)

      const table = findSchemaTable(analysis, tableName)
      if (!table) {
        findings.push({
          id: 'isolation-valid',
          message: `Tenant-isolated table "${tableName}" does not exist in \`convex/schema.ts\`.`,
        })
        continue
      }
      if (!table.fields.includes(analysis.isolation.field)) {
        findings.push({
          id: 'isolation-valid',
          message: `Tenant-isolated table "${tableName}" is missing the "${analysis.isolation.field}" field.`,
        })
      }
      if (!table.indexes.includes(analysis.isolation.indexName)) {
        findings.push({
          id: 'tenant-table-requires-tenant-index',
          message: `Tenant-isolated table "${tableName}" is missing the "${analysis.isolation.indexName}" index.`,
        })
      }
    }

    for (const tableName of analysis.isolation.sharedTables) {
      if (seenGlobal.has(tableName)) {
        findings.push({
          id: 'isolation-valid',
          message: `${classificationLabel} contains a duplicate global table: "${tableName}".`,
        })
        continue
      }
      seenGlobal.add(tableName)

      if (seen.has(tableName)) {
        findings.push({
          id: 'isolation-valid',
          message: `${classificationLabel} cannot classify table "${tableName}" as both tenant-scoped and global.`,
        })
        continue
      }

      const table = findSchemaTable(analysis, tableName)
      if (!table) {
        findings.push({
          id: 'isolation-valid',
          message: `Shared isolation table "${tableName}" does not exist in \`convex/schema.ts\`.`,
        })
      }
    }

    for (const table of analysis.schemaTables) {
      const hasTenantShape =
        table.fields.includes(analysis.isolation.field) &&
        table.indexes.includes(analysis.isolation.indexName)
      if (!hasTenantShape) continue
      if (analysis.isolation.tables.includes(table.name)) continue
      if (analysis.isolation.sharedTables.includes(table.name)) continue
      findings.push({
        id: 'isolation-table-coverage',
        message:
          `Table "${table.name}" has the tenant field "${analysis.isolation.field}" and index ` +
          `"${analysis.isolation.indexName}" but is not classified as tenant-scoped by ${classificationLabel}.`,
      })
    }
  }

  if (analysis.destructiveOperations) {
    const confirmationTable = findSchemaTable(
      analysis,
      analysis.destructiveOperations.confirmationTable,
    )
    const auditTable = findSchemaTable(analysis, analysis.destructiveOperations.auditTable)
    const requiredConfirmationFields = [
      'tokenHash',
      'jti',
      'operationId',
      'executePath',
      'previewPath',
      'callerKey',
      'scopeKey',
      'argsHash',
      'previewHash',
      'createdAt',
      'expiresAt',
    ]
    const requiredAuditFields = [
      'operationId',
      'jti',
      'callerKey',
      'scopeKey',
      'argsHash',
      'previewHash',
      'executedAt',
      'executePath',
    ]

    if (!confirmationTable) {
      findings.push({
        id: 'destructive-safety-schema',
        message:
          `Destructive-safety confirmation table "${analysis.destructiveOperations.confirmationTable}" does not exist in ` +
          '`convex/schema.ts`.',
      })
    } else {
      for (const field of requiredConfirmationFields) {
        if (!confirmationTable.fields.includes(field)) {
          findings.push({
            id: 'destructive-safety-schema',
            message: `Destructive-safety confirmation table "${analysis.destructiveOperations.confirmationTable}" is missing the "${field}" field.`,
          })
        }
      }

      for (const index of ['by_token_hash', 'by_jti', 'by_expires_at']) {
        if (!confirmationTable.indexes.includes(index)) {
          findings.push({
            id: 'destructive-safety-schema',
            message: `Destructive-safety confirmation table "${analysis.destructiveOperations.confirmationTable}" is missing the "${index}" index.`,
          })
        }
      }
    }

    if (!auditTable) {
      findings.push({
        id: 'destructive-safety-schema',
        message:
          `Destructive-safety audit table "${analysis.destructiveOperations.auditTable}" does not exist in ` +
          '`convex/schema.ts`.',
      })
    } else {
      for (const field of requiredAuditFields) {
        if (!auditTable.fields.includes(field)) {
          findings.push({
            id: 'destructive-safety-schema',
            message: `Destructive-safety audit table "${analysis.destructiveOperations.auditTable}" is missing the "${field}" field.`,
          })
        }
      }
    }
  }

  return findings
}
