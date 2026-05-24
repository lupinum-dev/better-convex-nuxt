import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  extractPublicSurfaceCodegenMetadata,
  renderPublicSurfaceCodegenTypes,
} from '../../src/module-internals/public-surface-codegen'

function createFixture(files: Record<string, string>) {
  const rootDir = mkdtempSync(resolve(tmpdir(), 'trellis-public-surface-codegen-'))
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = resolve(rootDir, relativePath)
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, contents, 'utf8')
  }
  return rootDir
}

describe('public surface codegen', () => {
  it('extracts operations, projections, and MCP tool metadata', () => {
    const rootDir = createFixture({
      'convex/features/tasks/operations.ts': `
        import { defineOperation, operationPreview, previewOf } from '@lupinum/trellis/backend'
        import { mutation, query } from '../../functions'

        export const archiveTaskOp = defineOperation({
          id: 'tasks.archive',
          name: 'archiveTask',
          kind: 'destructive',
          args: {},
          guard: true,
          preview: async () => operationPreview({ summary: 'Archive task', confirm: { id: 'task_1' } }),
          handler: async () => null,
        })

        export const archiveTask = mutation.protected(archiveTaskOp)
        export const previewArchiveTask = query.protected(previewOf(archiveTaskOp))
      `,
      'server/mcp/tools/tasks/archive-task.ts': `
        import { archiveTaskOp, archiveTask, previewArchiveTask } from '~/convex/features/tasks/operations'
        import { tool } from '../../runtime'

        export default tool.operation(archiveTaskOp, {
          execute: archiveTask,
          preview: previewArchiveTask,
          meta: {
            name: 'archive-task',
          },
        })
      `,
    })

    const metadata = extractPublicSurfaceCodegenMetadata(rootDir)

    expect(metadata.operations).toEqual([
      {
        exportName: 'archiveTaskOp',
        file: 'convex/features/tasks/operations.ts',
        id: 'tasks.archive',
        kind: 'destructive',
        line: expect.any(Number),
        name: 'archiveTask',
      },
    ])

    expect(metadata.projections).toEqual([
      {
        exportName: 'archiveTask',
        file: 'convex/features/tasks/operations.ts',
        line: expect.any(Number),
        operationExportName: 'archiveTaskOp',
        operationId: 'tasks.archive',
        projection: 'execute',
      },
      {
        exportName: 'previewArchiveTask',
        file: 'convex/features/tasks/operations.ts',
        line: expect.any(Number),
        operationExportName: 'archiveTaskOp',
        operationId: 'tasks.archive',
        projection: 'preview',
      },
    ])

    expect(metadata.tools).toEqual([
      {
        file: 'server/mcp/tools/tasks/archive-task.ts',
        line: expect.any(Number),
        name: 'archive-task',
        operationExportName: 'archiveTaskOp',
        operationId: 'tasks.archive',
        source: 'operation',
      },
    ])
  }, 15_000)

  it('renders additive module augmentation types for generated operation and tool maps', () => {
    const rootDir = createFixture({
      'convex/features/tasks/operations.ts': `
        import { defineOperation, operationPreview, previewOf } from '@lupinum/trellis/backend'
        import { mutation, query } from '../../functions'

        export const archiveTaskOp = defineOperation({
          id: 'tasks.archive',
          kind: 'destructive',
          args: {},
          guard: true,
          preview: async () => operationPreview({ summary: 'Archive task', confirm: { id: 'task_1' } }),
          handler: async () => null,
        })

        export const archiveTask = mutation.protected(archiveTaskOp)
        export const previewArchiveTask = query.protected(previewOf(archiveTaskOp))
      `,
      'server/mcp/tools/tasks/archive-task.ts': `
        import { archiveTaskOp, archiveTask, previewArchiveTask } from '~/convex/features/tasks/operations'
        import { tool } from '../../runtime'

        export default tool.operation(archiveTaskOp, {
          execute: archiveTask,
          preview: previewArchiveTask,
          meta: { name: 'archive-task' },
        })
      `,
    })

    const metadata = extractPublicSurfaceCodegenMetadata(rootDir)
    const types = renderPublicSurfaceCodegenTypes(metadata)

    expect(types).toContain(`import '@lupinum/trellis/backend'`)
    expect(types).toContain(`import '@lupinum/trellis/mcp'`)
    expect(types).toContain(`declare module '@lupinum/trellis/backend'`)
    expect(types).toContain('interface OperationsById')
    expect(types).toContain('"tasks.archive": typeof __trellisOperation0')
    expect(types).toContain('interface OperationExecutionsById')
    expect(types).toContain('interface OperationPreviewsById')
    expect(types).toContain(`declare module '@lupinum/trellis/mcp'`)
    expect(types).toContain('interface ToolsByName')
    expect(types).toContain('"archive-task": typeof __trellisTool0')
  })
})
