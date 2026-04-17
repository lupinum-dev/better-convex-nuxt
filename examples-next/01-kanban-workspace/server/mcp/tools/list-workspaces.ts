import { defineArgs } from '@lupinum/trellis/args'

import { api } from '#trellis/api'

import { tool } from '../runtime'

export default tool({
  schema: defineArgs({
    description: 'List workspaces the current agent can access',
    args: {},
  }),
  call: api.workspaces.listAccessibleWorkspaces,
  operation: 'query',
  capability: 'listWorkspaces',
  meta: {
    name: 'list-workspaces',
  },
})
