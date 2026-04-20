import { api } from '#trellis/api'
import { listRunbooks } from '~/shared/features/runbooks/contract'

import { tool } from '../../runtime'

export default tool({
  schema: listRunbooks,
  call: api.features.runbooks.domain.listPublic,
  operation: 'query',
  group: 'public',
  tags: ['read-only', 'public'],
  meta: {
    name: 'list-public-runbooks',
  },
})
