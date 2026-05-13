import { composeFeatures } from '@lupinum/trellis/workspace'

import { mcpKeysFeature } from './mcpKeys/feature'
import { runbooksFeature } from './runbooks/feature'
import { usersFeature } from './users/feature'
import { workspacesFeature } from './workspaces/feature'

const manifest = composeFeatures([workspacesFeature, usersFeature, runbooksFeature, mcpKeysFeature])

export const schema = manifest.schema
export const permissions = manifest.permissions
export const tenantTables = manifest.tenantTables
export const sharedTables = manifest.sharedTables

export type McpReferencePermissionKey = (typeof permissions)[number]['key']
