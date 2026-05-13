import { composeFeatures } from '@lupinum/trellis/workspace'

import { articlesFeature } from './articles/feature'
import { knowledgeBasesFeature } from './knowledgeBases/feature'
import { usersFeature } from './users/feature'
import { workspacesFeature } from './workspaces/feature'

const manifest = composeFeatures([
  workspacesFeature,
  usersFeature,
  knowledgeBasesFeature,
  articlesFeature,
])

export const schema = manifest.schema
export const permissions = manifest.permissions
export const tenantTables = manifest.tenantTables
export const sharedTables = manifest.sharedTables
