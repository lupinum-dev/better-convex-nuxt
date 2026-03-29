import {
  createTryResolveActor,
  createResolveActor,
  createRequireActor,
} from '../../../src/runtime/actor'
import actorConfig from '../actor.config'

export { serviceAuthArgs, cleanArgs } from '../../../src/runtime/actor'

export const tryResolveActor = createTryResolveActor(actorConfig)
export const resolveActor = createResolveActor(actorConfig)
export const requireActor = createRequireActor(actorConfig)
