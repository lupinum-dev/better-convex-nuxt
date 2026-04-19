import type { GenericValidator, ObjectType, PropertyValidators } from 'convex/values'

import {
  isAuthRequiredGuard,
  isGuard,
  isOpenGuard,
  type AnyCheck,
  type AuthRequiredGuard,
  type Guard,
  type OpenGuard,
} from '../auth/define-guard.js'
import {
  isPermissionDefinition,
  resolvePermissionCheck,
  resolvePermissionLabel,
  type ErasedPermissionDefinition,
} from '../auth/define-permission.js'
import { can, deny, enforce, requireAuth } from '../auth/index.js'
import { isAnonymousPrincipal, type AuthenticatedPrincipal } from '../auth/principal-state.js'
import { createDenialExplanation, type TrellisObservationEvent } from '../utils/observability.js'
import {
  stampOperationProjection,
  trellisOperationProjectionMetadataKey,
} from './operation-metadata.js'

type MaybePromise<T> = T | Promise<T>
type Callback<TArgs extends unknown[], TResult> = (...args: TArgs) => TResult

type RuntimeContext<TPrincipal, TDelegation, TActor> = {
  principal: () => Promise<TPrincipal>
  delegation?: () => Promise<TDelegation | null>
  actor?: () => Promise<TActor | null>
  observe?: (event: {
    name: 'guard.allowed' | 'guard.denied' | 'authorize.allowed' | 'authorize.denied'
    status: 'success' | 'deny'
    transport?: TrellisObservationEvent['transport']
    reasonCode?: TrellisObservationEvent['reasonCode']
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
  | ErasedPermissionDefinition<string>
  | AuthRequiredGuard
  | OpenGuard

type PrincipalForGuard<TPrincipal, TGuard> = TGuard extends OpenGuard
  ? TPrincipal
  : AuthenticatedPrincipal<TPrincipal>

type ActorForGuard<TActor, TGuard> = TGuard extends OpenGuard ? TActor | null : NonNullable<TActor>

type NarrowedCtx<TCtx, TPrincipal, TDelegation, TActor, TGuard> = Omit<
  TCtx,
  'actor' | 'principal' | 'delegation'
> & {
  principal: () => Promise<PrincipalForGuard<TPrincipal, TGuard>>
  delegation: () => Promise<TDelegation | null>
  actor: () => Promise<ActorForGuard<TActor, TGuard>>
}

type LoadFn<
  TCtx,
  TPrincipal,
  TDelegation,
  TActor,
  TGuard,
  TArgsValidator extends PropertyValidators,
  TLoaded,
> = Callback<
  [NarrowedCtx<TCtx, TPrincipal, TDelegation, TActor, TGuard>, HandlerArgs<TArgsValidator>],
  MaybePromise<TLoaded>
>

type AuthorizeConfig<
  TCtx,
  TPrincipal,
  TDelegation,
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
    ctx: NarrowedCtx<TCtx, TPrincipal, TDelegation, TActor, TGuard>,
  ) => MaybePromise<AnyCheck<ActorForGuard<TActor, TGuard>>>
}

type HandlerDefinition<
  TCtx,
  TPrincipal,
  TDelegation,
  TActor,
  TGuard extends StructuredGuard<TPrincipal, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded,
  TResult,
> = {
  args: TArgsValidator
  returns?: GenericValidator
  guard: TGuard
  load?: LoadFn<TCtx, TPrincipal, TDelegation, TActor, TGuard, TArgsValidator, TLoaded>
  authorize?: AuthorizeConfig<
    TCtx,
    TPrincipal,
    TDelegation,
    TActor,
    TGuard,
    TArgsValidator,
    TLoaded
  >
  handler: Callback<
    [
      NarrowedCtx<TCtx, TPrincipal, TDelegation, TActor, TGuard>,
      HandlerArgs<TArgsValidator>,
      TLoaded,
    ],
    MaybePromise<TResult>
  >
  [trellisOperationProjectionMetadataKey]?: {
    operationId: string
    projection: 'execute' | 'preview'
  }
}

export type StructuredHandlerDefinition<
  TCtx,
  TPrincipal,
  TDelegation,
  TActor,
  TGuard extends StructuredGuard<TPrincipal, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded,
  TResult,
> = HandlerDefinition<
  TCtx,
  TPrincipal,
  TDelegation,
  TActor,
  TGuard,
  TArgsValidator,
  TLoaded,
  TResult
>

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

function resolveDelegationAccessor<TCtx extends object, TDelegation>(
  ctx: TCtx,
): () => Promise<TDelegation | null> {
  if ('delegation' in ctx && typeof ctx.delegation === 'function') {
    return ctx.delegation as () => Promise<TDelegation | null>
  }

  return async () => null
}

function createHandlerContext<TCtx extends object, TPrincipal, TDelegation, TActor, TGuard>(
  ctx: TCtx,
  principal: PrincipalForGuard<TPrincipal, TGuard>,
  delegation: () => Promise<TDelegation | null>,
  actor: () => Promise<ActorForGuard<TActor, TGuard>>,
): NarrowedCtx<TCtx, TPrincipal, TDelegation, TActor, TGuard> {
  return {
    ...ctx,
    principal: async () => principal,
    delegation,
    actor,
  } as NarrowedCtx<TCtx, TPrincipal, TDelegation, TActor, TGuard>
}

function getAuthorizationLabel<P>(check: AnyCheck<P>, fallback: string): string {
  return isGuard(check) ? check.label : fallback
}

function getGuardCheck<TPrincipal, TActor>(
  guard: StructuredGuard<TPrincipal, TActor>,
): AnyCheck<unknown> {
  if (isPermissionDefinition(guard)) {
    return resolvePermissionCheck(guard)
  }

  return guard as AnyCheck<unknown>
}

function getGuardLabel<TPrincipal, TActor>(guard: StructuredGuard<TPrincipal, TActor>): string {
  if (isPermissionDefinition(guard)) {
    return resolvePermissionLabel(guard)
  }

  return (guard as Guard<unknown>).label
}

function getObserve(ctx: object): RuntimeContext<unknown, unknown, unknown>['observe'] {
  return 'observe' in ctx && typeof (ctx as { observe?: unknown }).observe === 'function'
    ? (ctx as { observe: RuntimeContext<unknown, unknown, unknown>['observe'] }).observe
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

function createStructuredBuilder<
  TCtx extends object,
  TPrincipal,
  TDelegation,
  TActor,
  TBuilder extends AnyBuilder,
>(builder: TBuilder) {
  return function structuredBuilder<
    TGuard extends StructuredGuard<TPrincipal, TActor>,
    TArgsValidator extends PropertyValidators,
    TLoaded extends StructuredLoadedValue = undefined,
    TResult = unknown,
  >(
    definition: HandlerDefinition<
      TCtx,
      TPrincipal,
      TDelegation,
      TActor,
      TGuard,
      TArgsValidator,
      TLoaded,
      TResult
    >,
  ): ReturnType<TBuilder> {
    const built = builder({
      args: definition.args,
      returns: definition.returns,
      handler: async (rawCtx, rawArgs) => {
        const ctx = rawCtx as TCtx
        const args = rawArgs as HandlerArgs<TArgsValidator>
        const principal = await resolvePrincipalAccessor<TCtx, TPrincipal>(ctx)()
        const delegationAccessor = resolveDelegationAccessor<TCtx, TDelegation>(ctx)
        const rawActorAccessor = resolveActorAccessor<TCtx, TActor>(ctx)
        let actorPromise: Promise<TActor | null> | null = null
        const actorAccessor = async () => {
          actorPromise ??= rawActorAccessor()
          return await actorPromise
        }
        const observe = getObserve(ctx)

        if (isAuthRequiredGuard(definition.guard)) {
          const authRequiredGuard = definition.guard as AuthRequiredGuard
          if (isAnonymousPrincipal(principal)) {
            await observe?.({
              name: 'guard.denied',
              status: 'deny',
              reasonCode: 'guard.auth_required',
              details: {
                explanation: createDenialExplanation({
                  reasonCode: 'guard.auth_required',
                  decision: 'guard',
                  message: authRequiredGuard.label,
                  suggestedAction: 'sign_in',
                }),
              },
            })
            requireAuth(
              principal,
              `Forbidden: ${formatGuardFailure(authRequiredGuard.label, principal, null)}`,
            )
          }

          const actor = await actorAccessor()
          const allowed = actor != null
          await observe?.({
            name: allowed ? 'guard.allowed' : 'guard.denied',
            status: allowed ? 'success' : 'deny',
            reasonCode: allowed ? undefined : 'guard.denied',
            details: allowed
              ? undefined
              : {
                  label: authRequiredGuard.label,
                  explanation: createDenialExplanation({
                    reasonCode: 'guard.denied',
                    decision: 'guard',
                    message: authRequiredGuard.label,
                    policy: authRequiredGuard.label,
                    suggestedAction: 'grant_capability',
                  }),
                },
          })
          if (!allowed) {
            throw deny(
              `Forbidden: ${formatGuardFailure(authRequiredGuard.label, principal, actor)}`,
            )
          }
        } else if (!isOpenGuard(definition.guard)) {
          const actor = await actorAccessor()
          const guardCheck = getGuardCheck<TPrincipal, TActor>(definition.guard)
          const guardLabel = getGuardLabel<TPrincipal, TActor>(definition.guard)
          const allowed = actor != null && can(actor as NonNullable<TActor>, guardCheck)
          await observe?.({
            name: allowed ? 'guard.allowed' : 'guard.denied',
            status: allowed ? 'success' : 'deny',
            reasonCode: allowed ? undefined : 'guard.denied',
            details: allowed
              ? undefined
              : {
                  label: guardLabel,
                  explanation: createDenialExplanation({
                    reasonCode: 'guard.denied',
                    decision: 'guard',
                    message: guardLabel,
                    policy: guardLabel,
                    suggestedAction: 'grant_capability',
                  }),
                },
          })
          enforce<TActor | null>(
            actor,
            formatGuardFailure(guardLabel, principal, actor),
            guardCheck as AnyCheck<NonNullable<TActor | null>>,
          )
        }

        const handlerCtx = createHandlerContext<TCtx, TPrincipal, TDelegation, TActor, TGuard>(
          ctx,
          principal as PrincipalForGuard<TPrincipal, TGuard>,
          delegationAccessor,
          actorAccessor as () => Promise<ActorForGuard<TActor, TGuard>>,
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
            reasonCode: allowed ? undefined : 'authorize.denied',
            details: allowed
              ? undefined
              : {
                  label: getAuthorizationLabel(
                    authorization,
                    definition.authorize.label ?? 'Access denied',
                  ),
                  explanation: createDenialExplanation({
                    reasonCode: 'authorize.denied',
                    decision: 'authorize',
                    message: getAuthorizationLabel(
                      authorization,
                      definition.authorize.label ?? 'Access denied',
                    ),
                    policy: definition.authorize.label ?? 'Access denied',
                    suggestedAction: 'grant_capability',
                  }),
                },
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
  TCtx extends RuntimeContext<TPrincipal, TDelegation, TActor>,
  TPrincipal,
  TDelegation,
  TActor,
  TBuilder extends AnyBuilder,
>(builder: TBuilder) {
  return createStructuredBuilder<TCtx, TPrincipal, TDelegation, TActor, TBuilder>(builder)
}

export function buildStructuredFunctions<
  TQueryCtx extends RuntimeContext<TPrincipal, TDelegation, TActor>,
  TMutationCtx extends RuntimeContext<TPrincipal, TDelegation, TActor>,
  TPrincipal,
  TActor,
  TDelegation = never,
  TQueryBuilder extends AnyBuilder = AnyBuilder,
  TMutationBuilder extends AnyBuilder = AnyBuilder,
>(
  query: TQueryBuilder,
  mutation: TMutationBuilder,
): {
  query: ReturnType<
    typeof createStructuredBuilder<TQueryCtx, TPrincipal, TDelegation, TActor, TQueryBuilder>
  >
  mutation: ReturnType<
    typeof createStructuredBuilder<TMutationCtx, TPrincipal, TDelegation, TActor, TMutationBuilder>
  >
}

export function buildStructuredFunctions<
  TQueryCtx extends object = Record<string, unknown>,
  TMutationCtx extends object = Record<string, unknown>,
  TPrincipal = never,
  TActor = never,
  TDelegation = never,
  TQueryBuilder extends AnyBuilder = AnyBuilder,
  TMutationBuilder extends AnyBuilder = AnyBuilder,
>(
  query: TQueryBuilder,
  mutation: TMutationBuilder,
): {
  query: ReturnType<
    typeof createStructuredBuilder<TQueryCtx, TPrincipal, TDelegation, TActor, TQueryBuilder>
  >
  mutation: ReturnType<
    typeof createStructuredBuilder<TMutationCtx, TPrincipal, TDelegation, TActor, TMutationBuilder>
  >
}

export function buildStructuredFunctions<
  TQueryCtx extends object = Record<string, unknown>,
  TMutationCtx extends object = Record<string, unknown>,
  TPrincipal = never,
  TActor = never,
  TDelegation = never,
  TQueryBuilder extends AnyBuilder = AnyBuilder,
  TMutationBuilder extends AnyBuilder = AnyBuilder,
>(query: TQueryBuilder, mutation: TMutationBuilder) {
  return {
    query: createStructuredBuilder<TQueryCtx, TPrincipal, TDelegation, TActor, TQueryBuilder>(
      query,
    ),
    mutation: createStructuredBuilder<
      TMutationCtx,
      TPrincipal,
      TDelegation,
      TActor,
      TMutationBuilder
    >(mutation),
  }
}
