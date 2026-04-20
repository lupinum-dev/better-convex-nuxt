import { composeFeatures } from '@lupinum/trellis/feature'

import { dashboardFeature } from './dashboard/feature'
import { membershipsFeature } from './memberships/feature'
import { projectsFeature } from './projects/feature'
import { usersFeature } from './users/feature'
import { workspacesFeature } from './workspaces/feature'

const manifest = composeFeatures([
  workspacesFeature,
  usersFeature,
  membershipsFeature,
  projectsFeature,
  dashboardFeature,
])

export const schema = manifest.schema
export const permissions = manifest.permissions
export const tenantTables = manifest.tenantTables
export const globalTables = manifest.globalTables
