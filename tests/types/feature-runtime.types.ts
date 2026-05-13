import { definePermission } from '../../src/runtime/auth'
import { composeFeatures, defineFeature, type FeatureManifest } from '../../src/runtime/feature'

const taskRead = definePermission({
  key: 'task.read',
  check: true,
})

const tasks = defineFeature({
  name: 'tasks',
  schema: {
    tasks: { table: 'tasks' as const },
  },
  permissions: [taskRead] as const,
  tenantTables: ['tasks'] as const,
  sharedTables: ['workspaces'] as const,
})

const manifest = composeFeatures([tasks] as const)
const { schema, permissions, tenantTables, sharedTables } = manifest

const schemaTableName: 'tasks' = schema.tasks.table
const tenantTable: 'tasks' = tenantTables[0]!
const globalTable: 'workspaces' = sharedTables[0]!
const permissionKey: 'task.read' = permissions[0]!.key

void schemaTableName
void tenantTable
void globalTable
void permissionKey

const featureManifest: FeatureManifest<
  { tasks: { table: 'tasks' } },
  readonly (typeof taskRead)[],
  'tasks',
  'workspaces'
> = manifest

void featureManifest
