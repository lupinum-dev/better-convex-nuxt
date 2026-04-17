import type { GenericValidator, ObjectType, PropertyValidators } from 'convex/values'

import {
  isAuthenticatedGuard,
  isGuard,
  isOpenGuard,
  type AnyCheck,
  type AuthenticatedGuard,
  type Guard,
  type OpenGuard,
} from '../auth/define-guard.js'
import { can, deny, enforce, requireAuth } from '../auth/index.js'
import {
  isAnonymousPrincipal,
  type AuthenticatedPrincipal,
} from '../auth/principal-state.js'
import { stampOperationProjection, trellisOperationProjectionMetadataKey } from './operation-metadata.js'

type MaybePromise<T> = T | Promise<T>

type RuntimeContext<TPrincipal, TActor> = {
  principal: () => Promise<TPrincipal>
  actor: () => Promise<TActor | null>
  observe?: (event: {
    name:
      | 'guard.allowed'
      | 'guard.denied'
      | 'authorize.allowed'
      | 'authorize.denied'
    status: 'success' | 'deny'
    transport?: 'convex'
    reasonCode?: string
    details?: Record<string, unknown>
  }) => Promise<void>
}

type AnyBuilder = (definition: {
  args: PropertyValidators
  returns?: GenericValidator
  handler: (ctx: unknown, args: Record<string, unknown>) => unknown
}) => unknown

export type StructuredLoadedValue = Record<string, unknown> | undefined

type HandlerArgs<TArgsValidator extends PropertyValidators> = ObjectType<TArgsValidator>

export type StructuredGuard<_TPrincipal, TActor> =
  | Guard<NonNullable<TActor>>
  | Guard<TActor | null>
  | AuthenticatedGuard
  | OpenGuard

type PrincipalForGuard<TPrincipal, TGuard> = TGuard extends OpenGuard
  ? TPrincipal
  : AuthenticatedPrincipal<TPrincipal>

type ActorForGuard<TActor, TGuard> = TGuard extends OpenGuard | AuthenticatedGuard
  ? TActor | null
  : NonNullable<TActor>

type NarrowedCtx<TCtx, TPrincipal, TActor, TGuard> = Omit<TCtx, 'actor' | 'principal'> & {
  principal: () => Promise<PrincipalForGuard<TPrincipal, TGuard>>
  actor: () => Promise<ActorForGuard<TActor, TGuard>>
}

type LoadFn<TCtx, TPrincipal, TActor, TGuard, TArgsValidator extends PropertyValidators, TLoaded> = (
  ctx: NarrowedCtx<TCtx, TPrincipal, TActor, TGuard>,
  args: HandlerArgs<TArgsValidator>,
) => MaybePromise<TLoaded>

type AuthorizeConfig<
  TCtx,
  TPrincipal,
  TActor,
  TGuard,
  TArgsValidator extends PropertyValidators,
  TLoaded,
> = {
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
    ctx: NarrowedCtx<TCtx, TPrincipal, TActor, TGuard>,
  ) => MaybePromise<AnyCheck<ActorForGuard<TActor, TGuard>>>
}

type HandlerDefinition<
  TCtx,
  TPrincipal,
  TActor,
  TGuard extends StructuredGuard<TPrincipal, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded,
  TResult,
> = {
  args: TArgsValidator
  returns?: GenericValidator
  guard: TGuard
  load?: LoadFn<TCtx, TPrincipal, TActor, TGuard, TArgsValidator, TLoaded>
  authorize?: AuthorizeConfig<TCtx, TPrincipal, TActor, TGuard, TArgsValidator, TLoaded>
  handler: (
    ctx: NarrowedCtx<TCtx, TPrincipal, TActor, TGuard>,
    args: HandlerArgs<TArgsValidator>,
    loaded: TLoaded,
  ) => MaybePromise<TResult>
  [trellisOperationProjectionMetadataKey]?: {
    operationId: string
    projection: 'execute' | 'preview'
  }
}

export type StructuredHandlerDefinition<
  TCtx,
  TPrincipal,
  TActor,
  TGuard extends StructuredGuard<TPrincipal, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded,
  TResult,
> = HandlerDefinition<TCtx, TPrincipal, TActor, TGuard, TArgsValidator, TLoaded, TResult>

function resolvePrincipalAccessor<TCtx extends object, TPrincipal>(
  ctx: TCtx,
): () => Promise<TPrincipal> {
  if ('principal' in ctx && typeof ctx.principal === 'function') {
    return ctx.principal as () => Promise<TPrincipal>
  }

  if (process.env.NODE_ENV !== 'production') {
    throw new Error(
      'Context is missing principal() accessor. Use defineTrellis(...) or provide principal() in tests.',
    )
  }

  return async () => null as TPrincipal
}

function resolveActorAccessor<TCtx extends object, TActor>(
  ctx: TCtx,
): () => Promise<TActor | null> {
  if ('actor' in ctx && typeof ctx.actor === 'function') {
    return ctx.actor as () => Promise<TActor | null>
  }

  return async () => null
}

function createHandlerContext<TCtx extends object, TPrincipal, TActor, TGuard>(
  ctx: TCtx,
  principal: PrincipalForGuard<TPrincipal, TGuard>,
  actor: ActorForGuard<TActor, TGuard>,
): NarrowedCtx<TCtx, TPrincipal, TActor, TGuard> {
  return {
    ...ctx,
    principal: async () => principal,
    actor: async () => actor,
  } as NarrowedCtx<TCtx, TPrincipal, TActor, TGuard>
}

function getAuthorizationLabel<P>(check: AnyCheck<P>, fallback: string): string {
  return isGuard(check) ? check.label : fallback
}

function getObserve(ctx: object): RuntimeContext<unknown, unknown>['observe'] {
  return 'observe' in ctx && typeof (ctx as { observe?: unknown }).observe === 'function'
    ? ((ctx as { observe: RuntimeContext<unknown, unknown>['observe'] }).observe)
    : undefined
}

function describePrincipalState(principal: unknown): string {
  return isAnonymousPrincipal(principal) ? 'anonymous' : 'authenticated'
}

function describeActorState(actor: unknown): string {
  return actor == null ? 'missing' : 'resolved'
}

function formatGuardFailure(label: string, principal: unknown, actor: unknown): string {
  if (process.env.NODE_ENV === 'production') return label
  return `${label} [principal:${describePrincipalState(principal)} actor:${describeActorState(actor)}]`
}

function createStructuredBuilder<TCtx extends object, TPrincipal, TActor, TBuilder extends AnyBuilder>(
  builder: TBuilder,
) {
  return function structuredBuilder<
    TGuard extends StructuredGuard<TPrincipal, TActor>,
    TArgsValidator extends PropertyValidators,
    TLoaded extends StructuredLoadedValue = undefined,
    TResult = unknown,
  >(
    definition: HandlerDefinition<TCtx, TPrincipal, TActor, TGuard, TArgsValidator, TLoaded, TResult>,
  ): ReturnType<TBuilder> {
    const built = builder({
      args: definition.args,
      returns: definition.returns,
      handler: async (rawCtx, rawArgs) => {
        const ctx = rawCtx as TCtx
        const args = rawArgs as HandlerArgs<TArgsValidator>
        const principal = await resolvePrincipalAccessor<TCtx, TPrincipal>(ctx)()
        const actor = await resolveActorAccessor<TCtx, TActor>(ctx)()
        const observe = getObserve(ctx)

        if (isAuthenticatedGuard(definition.guard)) {
          await observe?.({
            name: isAnonymousPrincipal(principal) ? 'guard.denied' : 'guard.allowed',
            status: isAnonymousPrincipal(principal) ? 'deny' : 'success',
            transport: 'convex',
            reasonCode: isAnonymousPrincipal(principal) ? 'guard.auth_required' : undefined,
          })
          requireAuth(
            principal,
            `Forbidden: ${formatGuardFailure(definition.guard.label, principal, actor)}`,
          )
        } else if (!isOpenGuard(definition.guard)) {
          const allowed =
            actor != null &&
            can(actor as NonNullable<TActor>, definition.guard as AnyCheck<NonNullable<TActor>>)
          await observe?.({
            name: allowed ? 'guard.allowed' : 'guard.denied',
            status: allowed ? 'success' : 'deny',
            transport: 'convex',
            reasonCode: allowed ? undefined : definition.guard.label,
          })
          enforce<TActor | null>(
            actor,
            formatGuardFailure(definition.guard.label, principal, actor),
            definition.guard as AnyCheck<NonNullable<TActor | null>>,
          )
        }

        const handlerCtx = createHandlerContext<TCtx, TPrincipal, TActor, TGuard>(
          ctx,
          principal as PrincipalForGuard<TPrincipal, TGuard>,
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
          const allowed = can(await handlerCtx.actor(), authorization)
          await getObserve(handlerCtx)?.({
            name: allowed ? 'authorize.allowed' : 'authorize.denied',
            status: allowed ? 'success' : 'deny',
            transport: 'convex',
            reasonCode: allowed
              ? undefined
              : getAuthorizationLabel(
                  authorization,
                  definition.authorize.label ?? 'Access denied',
                ),
          })

          if (!allowed) {
            deny(
              `Forbidden: ${formatGuardFailure(
                getAuthorizationLabel(authorization, definition.authorize.label ?? 'Access denied'),
                await handlerCtx.principal(),
                await handlerCtx.actor(),
              )}`,
            )
          }
        }

        return await definition.handler(handlerCtx, args, loaded)
      },
    }) as ReturnType<TBuilder>

    return stampOperationProjection(
      built,
      definition[trellisOperationProjectionMetadataKey],
    ) as ReturnType<TBuilder>
  }
}

export function buildStructuredBuilder<
  TCtx extends RuntimeContext<TPrincipal, TActor>,
  TPrincipal,
  TActor,
  TBuilder extends AnyBuilder,
>(builder: TBuilder) {
  return createStructuredBuilder<TCtx, TPrincipal, TActor, TBuilder>(builder)
}

export function buildStructuredFunctions<
  TQueryCtx extends RuntimeContext<TPrincipal, TActor>,
  TMutationCtx extends RuntimeContext<TPrincipal, TActor>,
  TPrincipal,
  TActor,
  TQueryBuilder extends AnyBuilder,
  TMutationBuilder extends AnyBuilder,
>(
  query: TQueryBuilder,
  mutation: TMutationBuilder,
): {
  query: ReturnType<typeof createStructuredBuilder<TQueryCtx, TPrincipal, TActor, TQueryBuilder>>
  mutation: ReturnType<typeof createStructuredBuilder<TMutationCtx, TPrincipal, TActor, TMutationBuilder>>
}

export function buildStructuredFunctions<
  TQueryCtx extends object = Record<string, unknown>,
  TMutationCtx extends object = Record<string, unknown>,
  TPrincipal = never,
  TActor = never,
  TQueryBuilder extends AnyBuilder = AnyBuilder,
  TMutationBuilder extends AnyBuilder = AnyBuilder,
>(
  query: TQueryBuilder,
  mutation: TMutationBuilder,
): {
  query: ReturnType<typeof createStructuredBuilder<TQueryCtx, TPrincipal, TActor, TQueryBuilder>>
  mutation: ReturnType<typeof createStructuredBuilder<TMutationCtx, TPrincipal, TActor, TMutationBuilder>>
}

export function buildStructuredFunctions<
  TQueryCtx extends object = Record<string, unknown>,
  TMutationCtx extends object = Record<string, unknown>,
  TPrincipal = never,
  TActor = never,
  TQueryBuilder extends AnyBuilder = AnyBuilder,
  TMutationBuilder extends AnyBuilder = AnyBuilder,
>(query: TQueryBuilder, mutation: TMutationBuilder) {
  return {
    query: createStructuredBuilder<TQueryCtx, TPrincipal, TActor, TQueryBuilder>(query),
    mutation: createStructuredBuilder<TMutationCtx, TPrincipal, TActor, TMutationBuilder>(mutation),
  }
}
