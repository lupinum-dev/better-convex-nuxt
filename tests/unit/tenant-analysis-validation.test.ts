import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { analyzeProject } from '../../src/analysis/project'
import { collectModuleValidationFindings } from '../../src/analysis/validation'

function createFixture(files: Record<string, string>) {
  const rootDir = mkdtempSync(resolve(tmpdir(), 'trellis-tenant-analysis-'))
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = resolve(rootDir, relativePath)
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, contents, 'utf8')
  }
  return rootDir
}

describe('tenant analysis validation', () => {
  it('does not flag schema-shaped global tables as missing tenant coverage', () => {
    const rootDir = createFixture({
      'convex/functions.ts': `
        export const { query } = defineTrellis({ query, mutation }, {
          isolation: {
            tables: ['tasks'],
            sharedTables: ['auditEvents'],
          },
        })
      `,
      'convex/schema.ts': `
        export default defineSchema({
          tasks: defineTable({
            workspaceId: v.id('workspaces'),
            title: v.string(),
          }).index('by_workspace', ['workspaceId']),
          auditEvents: defineTable({
            workspaceId: v.id('workspaces'),
            type: v.string(),
          }).index('by_workspace', ['workspaceId']),
        })
      `,
    })

    const findings = collectModuleValidationFindings({
      rootDir,
      authEnabled: true,
    })

    expect(findings.map((finding) => finding.id)).not.toContain('isolation-table-coverage')
  })

  it('flags missing global tables declared in isolation config', () => {
    const rootDir = createFixture({
      'convex/functions.ts': `
        export const { query } = defineTrellis({ query, mutation }, {
          isolation: {
            tables: ['tasks'],
            sharedTables: ['auditEvents'],
          },
        })
      `,
      'convex/schema.ts': `
        export default defineSchema({
          tasks: defineTable({
            workspaceId: v.id('workspaces'),
            title: v.string(),
          }).index('by_workspace', ['workspaceId']),
        })
      `,
    })

    const findings = collectModuleValidationFindings({
      rootDir,
      authEnabled: true,
    })

    expect(findings.map((finding) => finding.message)).toContain(
      'Shared isolation table "auditEvents" does not exist in `convex/schema.ts`.',
    )
  })

  it('derives tenant classification from feature manifests and feature schema files', () => {
    const rootDir = createFixture({
      'convex/functions.ts': `
        export const { query } = defineTrellis({ query, mutation }, {
          isolation: {
            tables: tenantTables,
            sharedTables,
          },
        })
      `,
      'convex/schema.ts': `
        import { defineSchema } from 'convex/server'
        import { tasksTables } from './features/tasks'
        import { auditEventsTables } from './features/auditEvents'

        export default defineSchema({
          ...tasksTables,
          ...auditEventsTables,
        })
      `,
      'convex/features/tasks/schema.ts': `
        export const tasksTables = {
          tasks: defineTable({
            workspaceId: v.id('workspaces'),
            title: v.string(),
          }).index('by_workspace', ['workspaceId']),
        }
      `,
      'convex/features/tasks/feature.ts': `
        export const tasksFeature = defineFeature({
          name: 'tasks',
          schema: tasksTables,
        })
      `,
      'convex/features/auditEvents/schema.ts': `
        export const auditEventsTables = {
          auditEvents: defineTable({
            workspaceId: v.id('workspaces'),
            type: v.string(),
          }).index('by_workspace', ['workspaceId']),
        }
      `,
      'convex/features/auditEvents/feature.ts': `
        export const auditEventsFeature = defineFeature({
          name: 'auditEvents',
          schema: auditEventsTables,
          sharedTables: ['auditEvents'],
        })
      `,
    })

    const analysis = analyzeProject(rootDir)

    expect(analysis.isolation).toMatchObject({
      source: 'manifest',
      tables: ['tasks'],
      sharedTables: ['auditEvents'],
    })
    expect(analysis.schemaTables.map((table) => table.name).sort()).toEqual([
      'auditEvents',
      'tasks',
    ])
  })

  it('flags manifest coverage drift when a tenant-shaped feature table is omitted', () => {
    const rootDir = createFixture({
      'convex/functions.ts': `
        export const { query } = defineTrellis({ query, mutation }, {
          isolation: {
            tables: tenantTables,
            sharedTables,
          },
        })
      `,
      'convex/schema.ts': `
        import { defineSchema } from 'convex/server'
        import { tasksTables } from './features/tasks'
        import { commentsTables } from './features/comments'

        export default defineSchema({
          ...tasksTables,
          ...commentsTables,
        })
      `,
      'convex/features/tasks/schema.ts': `
        export const tasksTables = {
          tasks: defineTable({
            workspaceId: v.id('workspaces'),
            title: v.string(),
          }).index('by_workspace', ['workspaceId']),
        }
      `,
      'convex/features/tasks/feature.ts': `
        export const tasksFeature = defineFeature({
          name: 'tasks',
          schema: tasksTables,
        })
      `,
      'convex/features/comments/schema.ts': `
        export const commentsTables = {
          comments: defineTable({
            workspaceId: v.id('workspaces'),
            body: v.string(),
          }).index('by_workspace', ['workspaceId']),
        }
      `,
      'convex/features/comments/feature.ts': `
        export const commentsFeature = defineFeature({
          name: 'comments',
          schema: commentsTables,
        })
      `,
    })

    const analysis = analyzeProject(rootDir)

    expect(analysis.isolation?.source).toBe('manifest')
    expect(analysis.isolation?.sharedTables).toEqual([])
    expect(analysis.isolation?.tables).toEqual(expect.arrayContaining(['tasks', 'comments']))
  })
})
