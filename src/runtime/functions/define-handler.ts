import type { PropertyValidators } from 'convex/values'

import { can, deny, enforce } from '../auth'
import {
  isGuard,
  isOpenGuard,
  type AnyCheck,
  type Guard,
  type OpenGuard,
} from '../auth/define-guard'

type MaybePromise<T> = T | Promise<T>

type ActorContext<TActor> = {
  actor: () => Promise<TActor | null>
}

type AnyBuilder = (definition: {
  args: PropertyValidators
  handler: (ctx: unknown, args: Record<string, unknown>) => unknown
}) => unknown

type LoadedValue = Record<string, unknown> | undefined

type ActorForGuard<TActor, TGuard> = TGuard extends OpenGuard ? TActor | null : NonNullable<TActor>

type NarrowedCtx<TCtx, TActor, TGuard> = Omit<TCtx, 'actor'> & {
  actor: () => Promise<ActorForGuard<TActor, TGuard>>
}

type LoadFn<TCtx, TActor, TGuard, TArgs, TLoaded> = (
  ctx: NarrowedCtx<TCtx, TActor, TGuard>,
  args: TArgs,
) => MaybePromise<TLoaded>

type AuthorizeConfig<TCtx, TActor, TGuard, TArgs, TLoaded> = {
  label?: string
  check: (
    actor: ActorForGuard<TActor, TGuard>,
    loaded: TLoaded,
    args: TArgs,
    ctx: NarrowedCtx<TCtx, TActor, TGuard>,
  ) => MaybePromise<AnyCheck<ActorForGuard<TActor, TGuard>>>
}

type HandlerDefinition<TCtx, TActor, TGuard, TArgs, TLoaded, TResult> = {
  args: PropertyValidators
  guard: TGuard
  load?: LoadFn<TCtx, TActor, TGuard, TArgs, TLoaded>
  authorize?: AuthorizeConfig<TCtx, TActor, TGuard, TArgs, TLoaded>
  handler: (
    ctx: NarrowedCtx<TCtx, TActor, TGuard>,
    args: TArgs,
    loaded: TLoaded,
  ) => MaybePromise<TResult>
}

function resolveActorAccessor<TCtx extends object, TActor>(
  ctx: TCtx,
): () => Promise<TActor | null> {
  if ('actor' in ctx && typeof ctx.actor === 'function') {
    return ctx.actor as () => Promise<TActor | null>
  }

  return async () => null
}

function createActorContext<TCtx extends object, TActor, TGuard>(
  ctx: TCtx,
  actor: ActorForGuard<TActor, TGuard>,
): NarrowedCtx<TCtx, TActor, TGuard> {
  return {
    ...ctx,
    actor: async () => actor,
  } as NarrowedCtx<TCtx, TActor, TGuard>
}

function getAuthorizationLabel<P>(check: AnyCheck<P>, fallback: string): string {
  return isGuard(check) ? check.label : fallback
}

function createStructuredBuilder<TCtx extends object, TActor>(builder: AnyBuilder) {
  return function structuredBuilder<
    TGuard extends Guard<TActor | null> | OpenGuard,
    TArgs extends Record<string, unknown>,
    TLoaded extends LoadedValue = undefined,
    TResult = unknown,
  >(definition: HandlerDefinition<TCtx, TActor, TGuard, TArgs, TLoaded, TResult>) {
    return builder({
      args: definition.args,
      handler: async (rawCtx, rawArgs) => {
        const ctx = rawCtx as TCtx
        const args = rawArgs as TArgs
        const actor = await resolveActorAccessor<TCtx, TActor>(ctx)()

        if (!isOpenGuard(definition.guard)) {
          enforce(actor, definition.guard.label, definition.guard)
        }

        const handlerCtx = createActorContext<TCtx, TActor, TGuard>(
          ctx,
          actor as ActorForGuard<TActor, TGuard>,
        )

        const loaded = (
          definition.load ? await definition.load(handlerCtx, args) : undefined
        ) as TLoaded

        if (definition.authorize) {
          const authorization = await definition.authorize.check(
            await handlerCtx.actor(),
            loaded,
            args,
            handlerCtx,
          )

          if (!can(await handlerCtx.actor(), authorization)) {
            deny(
              `Forbidden: ${getAuthorizationLabel(authorization, definition.authorize.label ?? 'Access denied')}`,
            )
          }
        }

        return await definition.handler(handlerCtx, args, loaded)
      },
    })
  }
}

export function buildStructuredFunctions<
  TQueryCtx extends ActorContext<TActor>,
  TMutationCtx extends ActorContext<TActor>,
  TActor,
>(
  query: AnyBuilder,
  mutation: AnyBuilder,
): {
  query: ReturnType<typeof createStructuredBuilder<TQueryCtx, TActor>>
  mutation: ReturnType<typeof createStructuredBuilder<TMutationCtx, TActor>>
}

export function buildStructuredFunctions<
  TQueryCtx extends object = Record<string, unknown>,
  TMutationCtx extends object = Record<string, unknown>,
  TActor = never,
>(
  query: AnyBuilder,
  mutation: AnyBuilder,
): {
  query: ReturnType<typeof createStructuredBuilder<TQueryCtx, TActor>>
  mutation: ReturnType<typeof createStructuredBuilder<TMutationCtx, TActor>>
}

export function buildStructuredFunctions<
  TQueryCtx extends object = Record<string, unknown>,
  TMutationCtx extends object = Record<string, unknown>,
  TActor = never,
>(query: AnyBuilder, mutation: AnyBuilder) {
  return {
    query: createStructuredBuilder<TQueryCtx, TActor>(query),
    mutation: createStructuredBuilder<TMutationCtx, TActor>(mutation),
  }
}
