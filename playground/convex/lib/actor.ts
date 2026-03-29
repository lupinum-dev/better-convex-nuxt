import {
  createTryResolveActor,
  createResolveActor,
  createRequireActor,
  createScoped,
} from '../../../src/runtime/actor'
import { extractScopedTables } from '../../../src/runtime/tenant'
import { commentTableMeta } from '../../shared/schemas/comment'
import { postTableMeta } from '../../shared/schemas/post'
import actorConfig from '../actor.config'

export { serviceAuthArgs, cleanArgs } from '../../../src/runtime/actor'

export const tryResolveActor = createTryResolveActor(actorConfig)
export const resolveActor = createResolveActor(actorConfig)
export const requireActor = createRequireActor(actorConfig)

export const scoped = createScoped({
  actor: actorConfig,
  orgField: 'organizationId',
  scopedTables: extractScopedTables({
    posts: postTableMeta,
    comments: commentTableMeta,
    invites: { tenant: { scoped: true } },
  }),
})
