import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { describe, expect, it } from 'vitest'

import { definePermission } from '../../src/runtime/auth/define-permission'
import {
  composeFeatures,
  defineAppInventory,
  defineFeature,
  toAppInventoryJson,
} from '../../src/runtime/feature'
import {
  defineOperation,
  defineOperationDescriptor,
  getOperationMetadata,
  operationPreview,
} from '../../src/runtime/functions'

describe('feature composition', () => {
  it('composes schema, permissions, and tenant/global tables into a manifest', () => {
    const taskRead = definePermission({
      key: 'task.read',
      check: true,
      label: 'Read tasks',
    })
    const projectRead = definePermission({
      key: 'project.read',
      check: true,
      label: 'Read projects',
    })

    const tasks = defineFeature({
      name: 'tasks',
      schema: {
        tasks: { table: 'tasks' as const },
      },
      permissions: [taskRead] as const,
      tenantTables: ['tasks'] as const,
    })
    const projects = defineFeature({
      name: 'projects',
      schema: {
        projects: { table: 'projects' as const },
      },
      permissions: [projectRead] as const,
      tenantTables: ['projects'] as const,
      sharedTables: ['workspaces'] as const,
    })

    const manifest = composeFeatures([tasks, projects] as const)

    expect(manifest.schema).toEqual({
      tasks: { table: 'tasks' },
      projects: { table: 'projects' },
    })
    expect(manifest.permissions).toEqual([taskRead, projectRead])
    expect(manifest.tenantTables).toEqual(['tasks', 'projects'])
    expect(manifest.sharedTables).toEqual(['workspaces'])
  })

  it('throws on duplicate feature names', () => {
    const one = defineFeature({ name: 'tasks' })
    const two = defineFeature({ name: 'tasks' })

    expect(() => composeFeatures([one, two] as const)).toThrow(
      'composeFeatures(...) received duplicate feature name "tasks".',
    )
  })

  it('throws on duplicate schema keys from different features', () => {
    const one = defineFeature({
      name: 'tasks',
      schema: {
        tasks: { table: 'tasks' as const },
      },
    })
    const two = defineFeature({
      name: 'archive',
      schema: {
        tasks: { table: 'tasks_archive' as const },
      },
    })

    expect(() => composeFeatures([one, two] as const)).toThrow(
      'composeFeatures(...) received duplicate schema key "tasks" from features "tasks" and "archive".',
    )
  })

  it('throws on duplicate permission keys from different features', () => {
    const read = definePermission({
      key: 'task.read',
      check: true,
    })

    const one = defineFeature({
      name: 'tasks',
      permissions: [read] as const,
    })
    const two = defineFeature({
      name: 'archive',
      permissions: [read] as const,
    })

    expect(() => composeFeatures([one, two] as const)).toThrow(
      'composeFeatures(...) received duplicate permission key "task.read" from features "tasks" and "archive".',
    )
  })

  it('throws when a table is classified as both tenant-scoped and global', () => {
    const one = defineFeature({
      name: 'tasks',
      tenantTables: ['tasks'] as const,
    })
    const two = defineFeature({
      name: 'shared',
      sharedTables: ['tasks'] as const,
    })

    expect(() => composeFeatures([one, two] as const)).toThrow(
      'composeFeatures(...) classified table "tasks" as both tenant-scoped and global.',
    )
  })

  it('deduplicates tenant and global tables while preserving order', () => {
    const one = defineFeature({
      name: 'tasks',
      tenantTables: ['tasks', 'projects'] as const,
      sharedTables: ['workspaces'] as const,
    })
    const two = defineFeature({
      name: 'projects',
      tenantTables: ['projects', 'comments'] as const,
      sharedTables: ['workspaces', 'users'] as const,
    })

    const manifest = composeFeatures([one, two] as const)

    expect(manifest.tenantTables).toEqual(['tasks', 'projects', 'comments'])
    expect(manifest.sharedTables).toEqual(['workspaces', 'users'])
  })

  it('derives tenant-scoped tables from schema shape and lets global overrides remove them', () => {
    const tasks = defineFeature({
      name: 'tasks',
      schema: {
        tasks: defineTable({
          workspaceId: v.id('workspaces'),
          title: v.string(),
        }).index('by_workspace', ['workspaceId']),
      },
    })
    const workspaces = defineFeature({
      name: 'workspaces',
      schema: {
        workspaces: defineTable({
          name: v.string(),
        }),
        auditEvents: defineTable({
          workspaceId: v.id('workspaces'),
          action: v.string(),
        }).index('by_workspace', ['workspaceId']),
      },
      sharedTables: ['auditEvents'] as const,
    })

    const manifest = composeFeatures([tasks, workspaces] as const)

    expect(manifest.tenantTables).toEqual(['tasks'])
    expect(manifest.sharedTables).toEqual(['auditEvents'])
  })

  it('composes operation descriptors into app inventory', () => {
    const taskArchive = definePermission({
      key: 'task.archive',
      check: true,
    })
    const archiveTask = defineOperationDescriptor({
      id: 'tasks.archive',
      name: 'ArchiveTask',
      kind: 'destructive',
      args: { id: v.string() },
      permission: taskArchive,
      safety: 'destructive-write',
    })
    const tasks = defineFeature({
      name: 'tasks',
      operations: [archiveTask] as const,
    })

    const inventory = defineAppInventory({
      features: [tasks] as const,
    })

    expect(inventory.schemaVersion).toBe(1)
    expect(inventory.manifest.operations).toEqual([archiveTask])
    expect(toAppInventoryJson(inventory)).toEqual({
      schemaVersion: 1,
      layers: [],
      features: ['tasks'],
      operations: [
        {
          id: 'tasks.archive',
          name: 'ArchiveTask',
          kind: 'destructive',
          feature: 'tasks',
          permissionKey: 'task.archive',
          safety: 'destructive-write',
        },
      ],
      findings: [],
    })
  })

  it('rejects Convex operation implementations in feature manifests', () => {
    const archiveTask = defineOperation({
      id: 'tasks.archive',
      kind: 'destructive',
      args: { id: v.string() },
      guard: definePermission({ key: 'task.archive', check: true }),
      preview: async () => operationPreview({ summary: 'Archive task', confirm: { id: 'task-1' } }),
      handler: async () => null,
    })

    expect(getOperationMetadata(archiveTask)).toMatchObject({ id: 'tasks.archive' })
    expect(() =>
      defineFeature({
        name: 'tasks',
        operations: [archiveTask] as never,
      }),
    ).toThrow(
      'defineFeature(tasks) operations must be shared operation descriptors, not Convex operation implementations.',
    )
  })

  it('throws on duplicate operation ids from different features', () => {
    const one = defineFeature({
      name: 'tasks',
      operations: [
        defineOperationDescriptor({
          id: 'tasks.archive',
          kind: 'destructive',
          args: { id: v.string() },
        }),
      ] as const,
    })
    const two = defineFeature({
      name: 'archive',
      operations: [
        defineOperationDescriptor({
          id: 'tasks.archive',
          kind: 'destructive',
          args: { id: v.string() },
        }),
      ] as const,
    })

    expect(() => composeFeatures([one, two] as const)).toThrow(
      'composeFeatures(...) received duplicate operation id "tasks.archive" from features "tasks" and "archive".',
    )
  })
})
