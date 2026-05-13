import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  extractPermissionCodegenMetadata,
  renderPermissionCodegenTypes,
  renderPermissionRuntimeExports,
} from '../../src/module-internals/permissions-codegen'

function createFixture(files: Record<string, string>) {
  const rootDir = mkdtempSync(resolve(tmpdir(), 'trellis-permissions-codegen-'))
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = resolve(rootDir, relativePath)
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, contents, 'utf8')
  }
  return rootDir
}

describe('permission codegen', () => {
  it('extracts static permission metadata and resolves exported inventories', () => {
    const rootDir = createFixture({
      'convex/auth/permissions.ts': `
        import { definePermission } from '@lupinum/trellis/auth'

        export const taskRead = definePermission({
          key: 'task.read',
          label: 'Read tasks',
          roles: ['owner', 'member'],
          check: true,
        })

        export const taskCreate = definePermission({
          key: 'task.create',
          roles: ['owner'],
          project: false,
          check: true,
        })

        const hiddenPermissions = [taskRead]

        export const appPermissions = [
          ...hiddenPermissions,
          taskCreate,
          missingPermission,
        ] as const

        export const appPermissionMatrix = buildPermissionMatrix(appPermissions)
      `,
    })

    const metadata = extractPermissionCodegenMetadata(rootDir, ['convex/auth/permissions.ts'])

    expect(metadata.permissions).toEqual([
      {
        exportName: 'taskRead',
        file: 'convex/auth/permissions.ts',
        key: 'task.read',
        label: 'Read tasks',
        line: expect.any(Number),
        projected: true,
        roles: ['owner', 'member'],
      },
      {
        exportName: 'taskCreate',
        file: 'convex/auth/permissions.ts',
        key: 'task.create',
        line: expect.any(Number),
        projected: false,
        roles: ['owner'],
      },
    ])

    expect(metadata.inventories).toEqual([
      {
        exportName: 'appPermissions',
        file: 'convex/auth/permissions.ts',
        line: expect.any(Number),
        entries: [
          { kind: 'array', name: 'hiddenPermissions' },
          { kind: 'permission', name: 'taskCreate' },
          { kind: 'permission', name: 'missingPermission' },
        ],
        permissions: ['taskRead', 'taskCreate'],
        unknown: ['missingPermission'],
      },
    ])

    expect(metadata.matrices).toEqual([
      {
        exportName: 'appPermissionMatrix',
        file: 'convex/auth/permissions.ts',
        line: expect.any(Number),
        permissions: ['taskRead', 'taskCreate'],
        sourceInventory: 'appPermissions',
        unknown: ['missingPermission'],
      },
    ])
  }, 15_000)

  it('renders additive module augmentation types', () => {
    const rootDir = createFixture({
      'convex/auth/permissions.ts': `
        import { definePermission } from '@lupinum/trellis/auth'

        export const taskRead = definePermission({ key: 'task.read', check: true })
        export const taskCreate = definePermission({ key: 'task.create', project: false, check: true })
        export const appPermissions = [taskRead, taskCreate] as const
      `,
    })

    const metadata = extractPermissionCodegenMetadata(rootDir, ['convex/auth/permissions.ts'])
    const types = renderPermissionCodegenTypes(metadata)

    expect(types).toContain(`import '@lupinum/trellis/auth'`)
    expect(types).toContain(`import '@lupinum/trellis/mcp'`)
    expect(types).toContain(`export type TrellisPermissionKey = "task.read" | "task.create"`)
    expect(types).toContain(`export type TrellisProjectedPermissionKey = "task.read"`)
    expect(types).toContain(`interface PermissionKeysByKey`)
    expect(types).toContain(`interface ProjectedPermissionKeysByKey`)
    expect(types).toContain(`interface AccessKeysByKey`)
  })

  it('renders client-safe projected permission exports and matrix rows', () => {
    const rootDir = createFixture({
      'convex/auth/permissions.ts': `
        import { definePermission, buildPermissionMatrix } from '@lupinum/trellis/auth'

        export const taskRead = definePermission({
          key: 'task.read',
          label: 'Read tasks',
          roles: ['owner', 'member'],
          check: true,
        })
        export const taskCreate = definePermission({
          key: 'task.create',
          roles: ['owner'],
          project: false,
          check: true,
        })
        export const appPermissions = [taskRead, taskCreate] as const
        export const appPermissionMatrix = buildPermissionMatrix(appPermissions)
      `,
    })

    const metadata = extractPermissionCodegenMetadata(rootDir, ['convex/auth/permissions.ts'])
    const runtime = renderPermissionRuntimeExports(metadata)

    expect(runtime).toContain(`export const taskRead = "task.read" as const`)
    expect(runtime).not.toContain(`export const taskCreate = "task.create" as const`)
    expect(runtime).toContain(`export const permissions = {`)
    expect(runtime).toContain(`"taskRead": taskRead`)
    expect(runtime).toContain(`export const appPermissionMatrix = [`)
    expect(runtime).toContain(`"key": "task.read"`)
    expect(runtime).toContain(`"label": "Read tasks"`)
    expect(runtime).toContain(`"roles": [`)
    expect(runtime).not.toContain(`"key": "task.create"`)
  })
})
