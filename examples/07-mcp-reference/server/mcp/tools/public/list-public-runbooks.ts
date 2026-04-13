import { api } from '#trellis/api'
import { listRunbooks } from '~/shared/schemas/runbook'
import { projectTool } from '../../runtime'

export default projectTool({
  schema: listRunbooks,
  call: api.runbooks.listPublic,
  operation: 'query',
  group: 'public',
  tags: ['read-only', 'public'],
  meta: {
    name: 'list-public-runbooks',
  },
})
