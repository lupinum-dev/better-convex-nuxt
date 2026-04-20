import { api } from '#trellis/api'
import { listRunbooks } from '~/convex/domain/runbook.contract'

import { tool } from '../../runtime'

export default tool({
  schema: listRunbooks,
  call: api.domain.runbooks.listPublic,
  operation: 'query',
  group: 'public',
  tags: ['read-only', 'public'],
  meta: {
    name: 'list-public-runbooks',
  },
})
