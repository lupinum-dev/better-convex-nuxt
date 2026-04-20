import { api } from '#trellis/api'
import { runbookCreate } from '~/convex/auth/permissions'
import { createRunbook } from '~/convex/domain/runbook.contract'

import { tool } from '../../runtime'

export default tool({
  schema: createRunbook,
  call: api.domain.runbooks.create,
  permission: runbookCreate,
  group: 'workspace',
  maxItems: { field: 'tags', limit: 6 },
  middleware: async (args, ctx, next) => {
    if (!args.content.trim().startsWith('# ')) {
      return ctx.error('validation', 'Runbook content must start with a markdown heading.')
    }
    return await next()
  },
  meta: {
    name: 'create-runbook',
  },
})
