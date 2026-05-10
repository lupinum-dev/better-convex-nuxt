import { api } from '#trellis/api'
import { listRunbooks } from '~/shared/features/runbooks/contract'

import { tool } from '../../runtime'

export default tool.query({
  schema: listRunbooks,
  call: api.features.runbooks.domain.listPublic,
  group: 'public',
  tags: ['read-only', 'public'],
  meta: {
    name: 'list-public-runbooks',
  },
})
