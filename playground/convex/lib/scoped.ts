import { createScoped, extractScopedTables } from '../../../src/runtime/scoping'
import { commentTableMeta } from '../../shared/schemas/comment'
import { postTableMeta } from '../../shared/schemas/post'

import { requireActor, tryResolveActor } from './actor'

export const scoped = createScoped({
  requireActor,
  tryResolveActor,
  orgField: 'organizationId',
  scopedTables: extractScopedTables({
    posts: postTableMeta,
    comments: commentTableMeta,
    invites: { tenant: { scoped: true } },
    mcpKeys: { tenant: { scoped: true } },
  }),
})
