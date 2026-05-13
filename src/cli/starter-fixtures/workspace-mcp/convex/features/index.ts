import { composeFeatures } from '@lupinum/trellis/workspace'

import { todosFeature } from './todos/feature'
import { usersFeature } from './users/feature'
import { workspacesFeature } from './workspaces/feature'

const manifest = composeFeatures([workspacesFeature, usersFeature, todosFeature])

export const schema = manifest.schema
export const permissions = manifest.permissions
export const tenantTables = manifest.tenantTables
export const sharedTables = manifest.sharedTables
