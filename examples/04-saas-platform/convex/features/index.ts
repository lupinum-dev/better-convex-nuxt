import { composeFeatures } from '@lupinum/trellis/workspace'

import { commentsFeature } from './comments/feature'
import { filesFeature } from './files/feature'
import { membersFeature } from './members/feature'
import { projectsFeature } from './projects/feature'
import { tasksFeature } from './tasks/feature'
import { usersFeature } from './users'
import { workspacesFeature } from './workspaces/feature'

const manifest = composeFeatures([
  workspacesFeature,
  usersFeature,
  projectsFeature,
  tasksFeature,
  commentsFeature,
  filesFeature,
  membersFeature,
])

export const schema = manifest.schema
export const permissions = manifest.permissions
export const tenantTables = manifest.tenantTables
export const sharedTables = manifest.sharedTables
