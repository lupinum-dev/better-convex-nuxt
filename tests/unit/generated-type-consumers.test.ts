import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { Project } from 'ts-morph'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
  extractPermissionCodegenMetadata,
  renderPermissionCodegenTypes,
} from '../../src/module-internals/permissions-codegen'
import {
  extractPublicSurfaceCodegenMetadata,
  renderPublicSurfaceCodegenTypes,
} from '../../src/module-internals/public-surface-codegen'

function writeFile(rootDir: string, relativePath: string, contents: string) {
  const absolutePath = resolve(rootDir, relativePath)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, contents, 'utf8')
}

function createFixture(files: Record<string, string>) {
  const rootDir = mkdtempSync(resolve(tmpdir(), 'trellis-generated-type-consumer-'))

  writeFile(
    rootDir,
    'node_modules/@lupinum/trellis/auth/index.d.ts',
    `
export interface RegisteredPermissions {
  keys: RegisteredPermissionKey
  projected: RegisteredProjectedPermissionKey
}

export interface PermissionKeysByKey {}

export interface ProjectedPermissionKeysByKey extends PermissionKeysByKey {}

export type RegisteredPermissionKey = Extract<keyof PermissionKeysByKey, string>
export type RegisteredProjectedPermissionKey = Extract<keyof ProjectedPermissionKeysByKey, string>
`,
  )

  writeFile(
    rootDir,
    'node_modules/@lupinum/trellis/backend/index.d.ts',
    `
export interface OperationsById {}
export interface OperationExecutionsById {}
export interface OperationPreviewsById {}

export interface RegisteredOperations {
  byId: OperationsById
}

export interface RegisteredOperationProjections {
  executeById: OperationExecutionsById
  previewById: OperationPreviewsById
}

export type RegisteredOperationId = Extract<keyof OperationsById, string>
export type ValidateRegisteredOperationId<TId extends string = string> =
  TId extends RegisteredOperationId ? TId : never
export type ValidateOperationProjection<
  TId extends RegisteredOperationId,
  TProjection extends 'execute' | 'preview' = 'execute' | 'preview',
> = TProjection
`,
  )

  writeFile(
    rootDir,
    'node_modules/@lupinum/trellis/mcp/index.d.ts',
    `
export interface AccessKeysByKey {}

export interface ToolsByName {}

export interface RegisteredAccess {
  byKey: AccessKeysByKey
}

export interface RegisteredTools {
  byName: ToolsByName
}

export type RegisteredAccessKey = Extract<keyof AccessKeysByKey, string>
export type RegisteredToolName = Extract<keyof RegisteredTools['byName'], string>
export type ValidateAccessKey<TKey extends string = string> =
  TKey extends RegisteredAccessKey ? TKey : never
export type ValidateToolName<TName extends string = string> =
  TName extends RegisteredToolName ? TName : never
`,
  )

  writeFile(
    rootDir,
    'node_modules/@lupinum/trellis/type-primitives/index.d.ts',
    `
export type {
  OperationExecutionsById,
  OperationPreviewsById,
  OperationsById,
  RegisteredOperationId,
  ValidateOperationProjection,
  ValidateRegisteredOperationId,
} from '@lupinum/trellis/backend'

export type {
  RegisteredAccessKey,
  RegisteredToolName,
  ToolsByName,
  ValidateAccessKey,
  ValidateToolName,
} from '@lupinum/trellis/mcp'
`,
  )

  writeFile(
    rootDir,
    'node_modules/convex/server/index.d.ts',
    `
export interface FunctionReference<
  TKind extends string = string,
  TVisibility extends string = string,
  TArgs = unknown,
  TResult = unknown,
> {
  _type: TKind
  _visibility: TVisibility
  _args: TArgs
  _result: TResult
}
`,
  )

  for (const [relativePath, contents] of Object.entries(files)) {
    writeFile(rootDir, relativePath, contents)
  }

  return rootDir
}

function createConsumerProject(rootDir: string) {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      noEmit: true,
      strict: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      baseUrl: rootDir,
      ignoreDeprecations: '6.0',
    },
  })

  project.addSourceFilesAtPaths(resolve(rootDir, 'consumer.ts'))
  project.addSourceFilesAtPaths(resolve(rootDir, 'convex/**/*.ts'))
  project.addSourceFilesAtPaths(resolve(rootDir, 'server/**/*.ts'))
  project.addSourceFilesAtPaths(resolve(rootDir, '.nuxt/types/**/*.d.ts'))
  project.addSourceFilesAtPaths(resolve(rootDir, 'node_modules/**/*.d.ts'))

  return project
}

function expectProjectToTypecheck(rootDir: string) {
  const project = createConsumerProject(rootDir)
  const diagnostics = project.getPreEmitDiagnostics()

  expect(diagnostics.map((diagnostic) => diagnostic.getMessageText())).toEqual([])
}

describe('generated type consumer verification', () => {
  it('consumer-compiles generated permission recordAccess', () => {
    const rootDir = createFixture({
      'convex/auth/permissions.ts': `
        declare function definePermission<T>(value: T): T

        export const taskRead = definePermission({
          key: 'task.read',
          check: true,
        })
      `,
      'consumer.ts': `
        import type { RegisteredProjectedPermissionKey } from '@lupinum/trellis/auth'
        import type { RegisteredAccessKey, ValidateAccessKey } from '@lupinum/trellis/mcp'

        type _Projected = RegisteredProjectedPermissionKey
        type _RecordAccess = RegisteredAccessKey
        type _Validated = ValidateAccessKey<'task.read'>

        const projected: _Projected = 'task.read'
        const recordAccess: _RecordAccess = 'task.read'
        const validated: _Validated = 'task.read'

        void projected
        void recordAccess
        void validated
      `,
    })

    const metadata = extractPermissionCodegenMetadata(rootDir, ['convex/auth/permissions.ts'])
    writeFile(
      rootDir,
      '.nuxt/types/trellis-permissions.d.ts',
      renderPermissionCodegenTypes(metadata),
    )

    expectProjectToTypecheck(rootDir)
  })

  it('consumer-compiles generated operation and tool registries', () => {
    const rootDir = createFixture({
      'convex/features/tasks/operations.ts': `
        declare function defineOperation<T>(value: T): T
        declare function previewOf<T>(value: T): T
        declare function operationPreview<TConfirm extends Record<string, unknown>>(value: { summary: string; confirm: TConfirm }): {
          allowed: boolean
          summary: string
          blockers: []
          warnings: []
          effects: []
          confirm: TConfirm
        }

        const open = true as const

        const mutation = <TResult>(_operation: unknown) => ({
          _type: 'mutation' as const,
          _result: null as unknown as TResult,
        })
        const query = <TResult>(_operation: unknown) => ({
          _type: 'query' as const,
          _result: null as unknown as TResult,
        })

        export const archiveTaskOp = defineOperation({
          id: 'tasks.archive',
          kind: 'destructive',
          args: {},
          guard: open,
          preview: async () => operationPreview({ summary: 'Archive task', confirm: { id: 'task_1' } }),
          handler: async () => ({ archived: true as const }),
        })

        export const archiveTask = mutation<{ archived: true }>(archiveTaskOp)
        export const previewArchiveTask = query<ReturnType<typeof operationPreview<{ id: string }>>>(previewOf(archiveTaskOp))
      `,
      'server/mcp/tools/tasks/archive-task.ts': `
        import { archiveTaskOp, archiveTask, previewArchiveTask } from '../../../../convex/features/tasks/operations'

        const tool = {
          operation: <_TOperation>(
            _operation: _TOperation,
            _options: unknown,
          ) => ({ name: 'archive-task' as const }),
        }

        export default tool.operation(archiveTaskOp, {
          execute: archiveTask,
          preview: previewArchiveTask,
          meta: {
            name: 'archive-task',
          },
        })
      `,
      'consumer.ts': `
        import type {
          OperationExecutionsById,
          OperationPreviewsById,
          OperationsById,
          RegisteredOperationId,
          RegisteredToolName,
          ToolsByName,
          ValidateOperationProjection,
          ValidateRegisteredOperationId,
          ValidateToolName,
        } from '@lupinum/trellis/type-primitives'

        type _OperationId = RegisteredOperationId
        type _ValidatedOperationId = ValidateRegisteredOperationId<'tasks.archive'>
        type _ValidatedProjection = ValidateOperationProjection<'tasks.archive', 'preview'>
        type _ToolName = RegisteredToolName
        type _ValidatedToolName = ValidateToolName<'archive-task'>
        type _Operation = OperationsById['tasks.archive']
        type _Execute = OperationExecutionsById['tasks.archive']
        type _Preview = OperationPreviewsById['tasks.archive']
        type _Tool = ToolsByName['archive-task']

        const operationId: _OperationId = 'tasks.archive'
        const validatedOperationId: _ValidatedOperationId = 'tasks.archive'
        const projection: _ValidatedProjection = 'preview'
        const toolName: _ToolName = 'archive-task'
        const validatedToolName: _ValidatedToolName = 'archive-task'
        const toolNameLiteral: _Tool['name'] = 'archive-task'
        const operationLiteral: _Operation['id'] = 'tasks.archive'
        const executeKind: _Execute['_type'] = 'mutation'
        const previewKind: _Preview['_type'] = 'query'

        void operationId
        void validatedOperationId
        void projection
        void toolName
        void validatedToolName
        void toolNameLiteral
        void operationLiteral
        void executeKind
        void previewKind
      `,
    })

    const metadata = extractPublicSurfaceCodegenMetadata(rootDir)
    writeFile(
      rootDir,
      '.nuxt/types/trellis-public-surface.d.ts',
      renderPublicSurfaceCodegenTypes(metadata),
    )

    expectProjectToTypecheck(rootDir)
  }, 15_000)
})
