import { api } from '#trellis/api'
import { searchRunbooks } from '~/shared/features/runbooks/contract'

import { tool } from '../../runtime'

export default tool.query({
  schema: searchRunbooks,
  call: api.features.runbooks.domain.searchPublic,
  group: 'public',
  tags: ['search', 'public'],
  rateLimit: { max: 20, window: '1m' },
  middleware: async (args, ctx, next) => {
    if (args.term.trim().length < 2) {
      return ctx.error('validation', 'Search term must be at least 2 characters.')
    }
    return await next()
  },
  meta: {
    name: 'search-public-runbooks',
  },
})
