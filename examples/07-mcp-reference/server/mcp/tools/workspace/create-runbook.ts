import { api } from '#trellis/api'
import { createRunbook } from '~/shared/schemas/runbook'

import { tool } from '../../runtime'

export default tool({
  schema: createRunbook,
  call: api.domain.runbooks.create,
  capability: 'writeWorkspaceRunbooks',
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
