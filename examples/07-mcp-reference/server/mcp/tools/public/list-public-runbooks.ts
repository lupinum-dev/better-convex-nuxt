import { api } from '#trellis/api'
import { listRunbooks } from '~/shared/schemas/runbook'

import { tool } from '../../runtime'

export default tool({
  schema: listRunbooks,
  call: api.runbooks.listPublic,
  operation: 'query',
  group: 'public',
  tags: ['read-only', 'public'],
  meta: {
    name: 'list-public-runbooks',
  },
})
