import type { ObjectType, PropertyValidators } from 'convex/values'

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

export type StructuredLoadedValue = Record<string, unknown> | undefined

type HandlerArgs<TArgsValidator extends PropertyValidators> = ObjectType<TArgsValidator>

export type StructuredGuard<TActor> = Guard<TActor | null> | OpenGuard

type ActorForGuard<TActor, TGuard> = TGuard extends OpenGuard ? TActor | null : NonNullable<TActor>

type NarrowedCtx<TCtx, TActor, TGuard> = Omit<TCtx, 'actor'> & {
  actor: () => Promise<ActorForGuard<TActor, TGuard>>
}

type LoadFn<TCtx, TActor, TGuard, TArgsValidator extends PropertyValidators, TLoaded> = (
  ctx: NarrowedCtx<TCtx, TActor, TGuard>,
  args: HandlerArgs<TArgsValidator>,
) => MaybePromise<TLoaded>

type AuthorizeConfig<TCtx, TActor, TGuard, TArgsValidator extends PropertyValidators, TLoaded> = {
  label?: string
  /**
   * Resource-level authorization check, evaluated after `load`.
   *
   * Return one of:
   * - `boolean` — inline one-off check: `(actor, { todo }) => actor.userId === todo.ownerId`
   * - `Guard` — from a factory for labeled, composable checks: `(_actor, { todo }) => canUpdateTodo(todo)`
   * - `Check` function — a reusable predicate without a label
   */
  check: (
    actor: ActorForGuard<TActor, TGuard>,
    loaded: TLoaded,
    args: HandlerArgs<TArgsValidator>,
    ctx: NarrowedCtx<TCtx, TActor, TGuard>,
  ) => MaybePromise<AnyCheck<ActorForGuard<TActor, TGuard>>>
}

type HandlerDefinition<
  TCtx,
  TActor,
  TGuard extends StructuredGuard<TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded,
  TResult,
> = {
  args: TArgsValidator
  guard: TGuard
  load?: LoadFn<TCtx, TActor, TGuard, TArgsValidator, TLoaded>
  authorize?: AuthorizeConfig<TCtx, TActor, TGuard, TArgsValidator, TLoaded>
  handler: (
    ctx: NarrowedCtx<TCtx, TActor, TGuard>,
    args: HandlerArgs<TArgsValidator>,
    loaded: TLoaded,
  ) => MaybePromise<TResult>
}

export type StructuredHandlerDefinition<
  TCtx,
  TActor,
  TGuard extends StructuredGuard<TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded,
  TResult,
> = HandlerDefinition<TCtx, TActor, TGuard, TArgsValidator, TLoaded, TResult>

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

function createStructuredBuilder<TCtx extends object, TActor, TBuilder extends AnyBuilder>(
  builder: TBuilder,
) {
  return function structuredBuilder<
    TGuard extends StructuredGuard<TActor>,
    TArgsValidator extends PropertyValidators,
    TLoaded extends StructuredLoadedValue = undefined,
    TResult = unknown,
  >(
    definition: HandlerDefinition<TCtx, TActor, TGuard, TArgsValidator, TLoaded, TResult>,
  ): ReturnType<TBuilder> {
    return builder({
      args: definition.args,
      handler: async (rawCtx, rawArgs) => {
        const ctx = rawCtx as TCtx
        const args = rawArgs as HandlerArgs<TArgsValidator>
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
    }) as ReturnType<TBuilder>
  }
}

export function buildStructuredFunctions<
  TQueryCtx extends ActorContext<TActor>,
  TMutationCtx extends ActorContext<TActor>,
  TActor,
  TQueryBuilder extends AnyBuilder,
  TMutationBuilder extends AnyBuilder,
>(
  query: TQueryBuilder,
  mutation: TMutationBuilder,
): {
  query: ReturnType<typeof createStructuredBuilder<TQueryCtx, TActor, TQueryBuilder>>
  mutation: ReturnType<typeof createStructuredBuilder<TMutationCtx, TActor, TMutationBuilder>>
}

export function buildStructuredFunctions<
  TQueryCtx extends object = Record<string, unknown>,
  TMutationCtx extends object = Record<string, unknown>,
  TActor = never,
  TQueryBuilder extends AnyBuilder = AnyBuilder,
  TMutationBuilder extends AnyBuilder = AnyBuilder,
>(
  query: TQueryBuilder,
  mutation: TMutationBuilder,
): {
  query: ReturnType<typeof createStructuredBuilder<TQueryCtx, TActor, TQueryBuilder>>
  mutation: ReturnType<typeof createStructuredBuilder<TMutationCtx, TActor, TMutationBuilder>>
}

export function buildStructuredFunctions<
  TQueryCtx extends object = Record<string, unknown>,
  TMutationCtx extends object = Record<string, unknown>,
  TActor = never,
  TQueryBuilder extends AnyBuilder = AnyBuilder,
  TMutationBuilder extends AnyBuilder = AnyBuilder,
>(query: TQueryBuilder, mutation: TMutationBuilder) {
  return {
    query: createStructuredBuilder<TQueryCtx, TActor, TQueryBuilder>(query),
    mutation: createStructuredBuilder<TMutationCtx, TActor, TMutationBuilder>(mutation),
  }
}
