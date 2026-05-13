import type { GenericValidator, ObjectType, PropertyValidators } from 'convex/values'

import { isAnonymousCaller, type AuthenticatedCaller } from '../auth/caller-state.js'
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
import { createDenialExplanation, type TrellisObservationEvent } from '../observability/index.js'
import {
  getOperationProjectionMetadata,
  stampOperationProjection,
  trellisOperationProjectionMetadataKey,
} from './operation-metadata.js'

type MaybePromise<T> = T | Promise<T>
type Callback<TArgs extends unknown[], TResult> = (...args: TArgs) => TResult

type RuntimeContext<TCaller, TActingFor, TActor> = {
  caller: () => Promise<TCaller>
  actingFor?: () => Promise<TActingFor | null>
  appIdentity?: () => Promise<TActor | null>
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
  identityForwardingFunctionRef?: string
  identityForwardingTransport?: 'server' | 'mcp' | 'bridge'
  handler: (ctx: unknown, args: Record<string, unknown>) => unknown
}) => unknown

export type StructuredLoadedValue = Record<string, unknown> | undefined

type HandlerArgs<TArgsValidator extends PropertyValidators> = ObjectType<TArgsValidator>

export type StructuredGuard<_TCaller, TActor> =
  | Guard<NonNullable<TActor>>
  | Guard<TActor | null>
  | ErasedPermissionDefinition<string>
  | AuthRequiredGuard
  | OpenGuard

type CallerForGuard<TCaller, TGuard> = TGuard extends OpenGuard
  ? TCaller
  : AuthenticatedCaller<TCaller>

type AppIdentityForGuard<TActor, TGuard> = TGuard extends OpenGuard
  ? TActor | null
  : NonNullable<TActor>

type NarrowedCtx<TCtx, TCaller, TActingFor, TActor, TGuard> = Omit<
  TCtx,
  'appIdentity' | 'caller' | 'actingFor'
> & {
  caller: () => Promise<CallerForGuard<TCaller, TGuard>>
  actingFor: () => Promise<TActingFor | null>
  appIdentity: () => Promise<AppIdentityForGuard<TActor, TGuard>>
}

type LoadFn<
  TCtx,
  TCaller,
  TActingFor,
  TActor,
  TGuard,
  TArgsValidator extends PropertyValidators,
  TLoaded,
> = Callback<
  [NarrowedCtx<TCtx, TCaller, TActingFor, TActor, TGuard>, HandlerArgs<TArgsValidator>],
  MaybePromise<TLoaded>
>

type AuthorizeConfig<
  TCtx,
  TCaller,
  TActingFor,
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
   * - `boolean` — inline one-off check: `(appIdentity, { todo }) => appIdentity.userId === todo.ownerId`
   * - `Guard` — from a factory for labeled, composable checks: `(_actor, { todo }) => canUpdateTodo(todo)`
   * - `Check` function — a reusable predicate without a label
   */
  check: (
    appIdentity: AppIdentityForGuard<TActor, TGuard>,
    loaded: TLoaded,
    args: HandlerArgs<TArgsValidator>,
    ctx: NarrowedCtx<TCtx, TCaller, TActingFor, TActor, TGuard>,
  ) => MaybePromise<AnyCheck<AppIdentityForGuard<TActor, TGuard>>>
}

type AuthorizeShorthand<
  TCtx,
  TCaller,
  TActingFor,
  TActor,
  TGuard,
  TArgsValidator extends PropertyValidators,
  TLoaded,
> =
  | Guard<AppIdentityForGuard<TActor, TGuard>>
  | boolean
  | AuthorizeConfig<TCtx, TCaller, TActingFor, TActor, TGuard, TArgsValidator, TLoaded>['check']

type HandlerDefinition<
  TCtx,
  TCaller,
  TActingFor,
  TActor,
  TGuard extends StructuredGuard<TCaller, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded,
  TResult,
> = {
  args: TArgsValidator
  returns?: GenericValidator
  guard: TGuard
  load?: LoadFn<TCtx, TCaller, TActingFor, TActor, TGuard, TArgsValidator, TLoaded>
  authorize?:
    | AuthorizeConfig<TCtx, TCaller, TActingFor, TActor, TGuard, TArgsValidator, TLoaded>
    | AuthorizeShorthand<TCtx, TCaller, TActingFor, TActor, TGuard, TArgsValidator, TLoaded>
  handler: Callback<
    [NarrowedCtx<TCtx, TCaller, TActingFor, TActor, TGuard>, HandlerArgs<TArgsValidator>, TLoaded],
    MaybePromise<TResult>
  >
  /**
   * Internal alpha metadata. When present, protected handler setup verifies
   * signed identity-forwarding envelopes against this exact Convex function ref.
   */
  identityForwardingFunctionRef?: string
  identityForwardingTransport?: 'server' | 'mcp' | 'bridge'
  [trellisOperationProjectionMetadataKey]?: {
    operationId: string
    projection: 'execute' | 'preview'
  }
}

export type StructuredHandlerDefinition<
  TCtx,
  TCaller,
  TActingFor,
  TActor,
  TGuard extends StructuredGuard<TCaller, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded,
  TResult,
> = HandlerDefinition<TCtx, TCaller, TActingFor, TActor, TGuard, TArgsValidator, TLoaded, TResult>

function resolveCallerAccessor<TCtx extends object, TCaller>(ctx: TCtx): () => Promise<TCaller> {
  if ('caller' in ctx && typeof ctx.caller === 'function') {
    return ctx.caller as () => Promise<TCaller>
  }

  if (process.env.NODE_ENV !== 'production') {
    throw new Error(
      'Context is missing caller() accessor. Use defineTrellis(...) or provide caller() in tests.',
    )
  }

  return async () => null as TCaller
}

function resolveAppIdentityAccessor<TCtx extends object, TActor>(
  ctx: TCtx,
): () => Promise<TActor | null> {
  if ('appIdentity' in ctx && typeof ctx.appIdentity === 'function') {
    return ctx.appIdentity as () => Promise<TActor | null>
  }

  if (process.env.NODE_ENV !== 'production') {
    return async () => {
      throw new Error(
        'Context is missing appIdentity() accessor. Use defineTrellis(...) or provide appIdentity() in tests.',
      )
    }
  }

  return async () => null
}

function resolveActingForAccessor<TCtx extends object, TActingFor>(
  ctx: TCtx,
): () => Promise<TActingFor | null> {
  if ('actingFor' in ctx && typeof ctx.actingFor === 'function') {
    return ctx.actingFor as () => Promise<TActingFor | null>
  }

  return async () => null
}

function createHandlerContext<TCtx extends object, TCaller, TActingFor, TActor, TGuard>(
  ctx: TCtx,
  caller: CallerForGuard<TCaller, TGuard>,
  actingFor: () => Promise<TActingFor | null>,
  appIdentity: () => Promise<AppIdentityForGuard<TActor, TGuard>>,
): NarrowedCtx<TCtx, TCaller, TActingFor, TActor, TGuard> {
  return {
    ...ctx,
    caller: async () => caller,
    actingFor,
    appIdentity,
  } as NarrowedCtx<TCtx, TCaller, TActingFor, TActor, TGuard>
}

function getAuthorizationLabel<P>(check: AnyCheck<P>, fallback: string): string {
  return isGuard(check) ? check.label : fallback
}

function getGuardCheck<TCaller, TActor>(
  guard: StructuredGuard<TCaller, TActor>,
): AnyCheck<unknown> {
  if (isPermissionDefinition(guard)) {
    return resolvePermissionCheck(guard)
  }

  return guard as AnyCheck<unknown>
}

function getGuardLabel<TCaller, TActor>(guard: StructuredGuard<TCaller, TActor>): string {
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

function normalizeAuthorize<
  TCtx,
  TCaller,
  TActingFor,
  TActor,
  TGuard,
  TArgsValidator extends PropertyValidators,
  TLoaded,
>(
  authorize:
    | HandlerDefinition<
        TCtx,
        TCaller,
        TActingFor,
        TActor,
        TGuard extends StructuredGuard<TCaller, TActor> ? TGuard : never,
        TArgsValidator,
        TLoaded,
        unknown
      >['authorize']
    | undefined,
): AuthorizeConfig<TCtx, TCaller, TActingFor, TActor, TGuard, TArgsValidator, TLoaded> | undefined {
  if (!authorize) return undefined

  if (typeof authorize === 'boolean' || isGuard(authorize)) {
    return {
      check: async () => authorize,
    }
  }

  if (typeof authorize === 'function') {
    return {
      check: authorize as AuthorizeConfig<
        TCtx,
        TCaller,
        TActingFor,
        TActor,
        TGuard,
        TArgsValidator,
        TLoaded
      >['check'],
    }
  }

  return authorize
}

function describePrincipalState(caller: unknown): string {
  return isAnonymousCaller(caller) ? 'anonymous' : 'authenticated'
}

function describeActorState(appIdentity: unknown): string {
  return appIdentity == null ? 'missing' : 'resolved'
}

function formatGuardFailure(label: string, caller: unknown, appIdentity: unknown): string {
  if (process.env.NODE_ENV === 'production') return label
  return `${label} [caller:${describePrincipalState(caller)} appIdentity:${describeActorState(appIdentity)}]`
}

function createStructuredBuilder<
  TCtx extends object,
  TCaller,
  TActingFor,
  TActor,
  TBuilder extends AnyBuilder,
>(builder: TBuilder) {
  return function structuredBuilder<
    TGuard extends StructuredGuard<TCaller, TActor>,
    TArgsValidator extends PropertyValidators,
    TLoaded extends StructuredLoadedValue = undefined,
    TResult = unknown,
  >(
    definition: HandlerDefinition<
      TCtx,
      TCaller,
      TActingFor,
      TActor,
      TGuard,
      TArgsValidator,
      TLoaded,
      TResult
    >,
  ): ReturnType<TBuilder> {
    const functionRef =
      definition.identityForwardingFunctionRef ??
      getOperationProjectionMetadata(definition)?.functionRef
    const built = builder({
      args: definition.args,
      returns: definition.returns,
      ...(functionRef ? { identityForwardingFunctionRef: functionRef } : {}),
      ...(definition.identityForwardingTransport
        ? { identityForwardingTransport: definition.identityForwardingTransport }
        : {}),
      handler: async (rawCtx, rawArgs) => {
        const ctx = rawCtx as TCtx
        const args = rawArgs as HandlerArgs<TArgsValidator>
        const caller = await resolveCallerAccessor<TCtx, TCaller>(ctx)()
        const delegationAccessor = resolveActingForAccessor<TCtx, TActingFor>(ctx)
        const rawAppIdentityAccessor = resolveAppIdentityAccessor<TCtx, TActor>(ctx)
        let actorPromise: Promise<TActor | null> | null = null
        const actorAccessor = async () => {
          actorPromise ??= rawAppIdentityAccessor()
          return await actorPromise
        }
        const observe = getObserve(ctx)

        if (isAuthRequiredGuard(definition.guard)) {
          const authRequiredGuard = definition.guard as AuthRequiredGuard
          if (isAnonymousCaller(caller)) {
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
              caller,
              `Forbidden: ${formatGuardFailure(authRequiredGuard.label, caller, null)}`,
            )
          }

          const appIdentity = await actorAccessor()
          const allowed = appIdentity != null
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
                    suggestedAction: 'grant_recordAccess',
                  }),
                },
          })
          if (!allowed) {
            throw deny(
              `Forbidden: ${formatGuardFailure(authRequiredGuard.label, caller, appIdentity)}`,
            )
          }
        } else if (!isOpenGuard(definition.guard)) {
          const appIdentity = await actorAccessor()
          const guardCheck = getGuardCheck<TCaller, TActor>(definition.guard)
          const guardLabel = getGuardLabel<TCaller, TActor>(definition.guard)
          const allowed = appIdentity != null && can(appIdentity as NonNullable<TActor>, guardCheck)
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
                    suggestedAction: 'grant_recordAccess',
                  }),
                },
          })
          enforce<TActor | null>(
            appIdentity,
            formatGuardFailure(guardLabel, caller, appIdentity),
            guardCheck as AnyCheck<NonNullable<TActor | null>>,
          )
        }

        const handlerCtx = createHandlerContext<TCtx, TCaller, TActingFor, TActor, TGuard>(
          ctx,
          caller as CallerForGuard<TCaller, TGuard>,
          delegationAccessor,
          actorAccessor as () => Promise<AppIdentityForGuard<TActor, TGuard>>,
        )

        const loaded = (
          definition.load ? await definition.load(handlerCtx, args) : undefined
        ) as TLoaded

        const authorize = normalizeAuthorize(definition.authorize)

        if (authorize) {
          const authorization = await authorize.check(
            await handlerCtx.appIdentity(),
            loaded,
            args,
            handlerCtx,
          )
          const allowed = can(await handlerCtx.appIdentity(), authorization)
          await getObserve(handlerCtx)?.({
            name: allowed ? 'authorize.allowed' : 'authorize.denied',
            status: allowed ? 'success' : 'deny',
            reasonCode: allowed ? undefined : 'authorize.denied',
            details: allowed
              ? undefined
              : {
                  label: getAuthorizationLabel(authorization, authorize.label ?? 'Access denied'),
                  explanation: createDenialExplanation({
                    reasonCode: 'authorize.denied',
                    decision: 'authorize',
                    message: getAuthorizationLabel(
                      authorization,
                      authorize.label ?? 'Access denied',
                    ),
                    policy: authorize.label ?? 'Access denied',
                    suggestedAction: 'grant_recordAccess',
                  }),
                },
          })

          if (!allowed) {
            deny(
              `Forbidden: ${formatGuardFailure(
                getAuthorizationLabel(authorization, authorize.label ?? 'Access denied'),
                await handlerCtx.caller(),
                await handlerCtx.appIdentity(),
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
  TCtx extends RuntimeContext<TCaller, TActingFor, TActor>,
  TCaller,
  TActingFor,
  TActor,
  TBuilder extends AnyBuilder,
>(builder: TBuilder) {
  return createStructuredBuilder<TCtx, TCaller, TActingFor, TActor, TBuilder>(builder)
}

export function buildStructuredFunctions<
  TQueryCtx extends RuntimeContext<TCaller, TActingFor, TActor>,
  TMutationCtx extends RuntimeContext<TCaller, TActingFor, TActor>,
  TCaller,
  TActor,
  TActingFor = never,
  TQueryBuilder extends AnyBuilder = AnyBuilder,
  TMutationBuilder extends AnyBuilder = AnyBuilder,
>(
  query: TQueryBuilder,
  mutation: TMutationBuilder,
): {
  query: ReturnType<
    typeof createStructuredBuilder<TQueryCtx, TCaller, TActingFor, TActor, TQueryBuilder>
  >
  mutation: ReturnType<
    typeof createStructuredBuilder<TMutationCtx, TCaller, TActingFor, TActor, TMutationBuilder>
  >
}

export function buildStructuredFunctions<
  TQueryCtx extends object = Record<string, unknown>,
  TMutationCtx extends object = Record<string, unknown>,
  TCaller = never,
  TActor = never,
  TActingFor = never,
  TQueryBuilder extends AnyBuilder = AnyBuilder,
  TMutationBuilder extends AnyBuilder = AnyBuilder,
>(
  query: TQueryBuilder,
  mutation: TMutationBuilder,
): {
  query: ReturnType<
    typeof createStructuredBuilder<TQueryCtx, TCaller, TActingFor, TActor, TQueryBuilder>
  >
  mutation: ReturnType<
    typeof createStructuredBuilder<TMutationCtx, TCaller, TActingFor, TActor, TMutationBuilder>
  >
}

export function buildStructuredFunctions<
  TQueryCtx extends object = Record<string, unknown>,
  TMutationCtx extends object = Record<string, unknown>,
  TCaller = never,
  TActor = never,
  TActingFor = never,
  TQueryBuilder extends AnyBuilder = AnyBuilder,
  TMutationBuilder extends AnyBuilder = AnyBuilder,
>(query: TQueryBuilder, mutation: TMutationBuilder) {
  return {
    query: createStructuredBuilder<TQueryCtx, TCaller, TActingFor, TActor, TQueryBuilder>(query),
    mutation: createStructuredBuilder<TMutationCtx, TCaller, TActingFor, TActor, TMutationBuilder>(
      mutation,
    ),
  }
}
