// Types
export type { Actor, ActorConfig, AnyCtx, ArgsWithServiceAuth, ServiceActorData } from './types'

// Service auth args (spread into Convex function args)
export { serviceAuthArgs, cleanArgs } from './service-auth-args'

// Actor resolution factories
export { createTryResolveActor, createResolveActor, createRequireActor } from './resolve-actor'

// Scoped DB factory
export { createScoped } from './create-scoped'
export type { ScopedConfig, ScopedFn, ScopedResult, ScopedQueryResult, ScopedMutationResult } from './create-scoped'
