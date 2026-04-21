import { defineSchema } from 'convex/server'

import { membershipTables } from './features/memberships/schema'
import { projectTables } from './features/projects/schema'
import { userTables } from './features/users/schema'
import { workspaceTables } from './features/workspaces/schema'

export default defineSchema({
  ...workspaceTables,
  ...userTables,
  ...membershipTables,
  ...projectTables,
})
