import type { Customization } from 'convex-helpers/server/customFunctions'
import {
  type Rules,
  wrapDatabaseReader,
  wrapDatabaseWriter,
} from 'convex-helpers/server/rowLevelSecurity'
import type { Triggers } from 'convex-helpers/server/triggers'
import { addFieldsToValidator } from 'convex-helpers/validators'
import type {
  ActionBuilder,
  FunctionVisibility,
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  MutationBuilder,
  QueryBuilder,
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
  TableNamesInDataModel,
} from 'convex/server'
import type { GenericValidator, Infer, ObjectType, PropertyValidators } from 'convex/values'
import { v } from 'convex/values'

import { defineActor, type DefaultActor } from '../auth/define-actor.js'
import type { ServiceDefinitions } from '../auth/define-services.js'
import { can, deny, open } from '../auth/index.js'
import {
  buildObservationEnvelopeValidators,
  createObservationEmitter,
  createDenialExplanation,
  type ObservationEventInput,
  type PartialObservationEvent,
  type TrellisObservabilityOptions,
  getObservationEnvelope,
  stripObservationEnvelope,
  toObservationContext,
} from '../observability/index.js'
import {
  getTrustedForwarding,
  setTrustedForwardingContext,
  type TrustedForwardingKeyInput,
} from '../trusted-forwarding/index.js'
import {
  getTrustedForwardingEnvelopeState,
  hasForwardedIdentityFields,
  stripForwardedIdentityFields,
  trustedForwardingValidators,
} from '../trusted-forwarding/shared.js'
import type { NoInfer, SerializableValue } from '../types/type-utils.js'
import { isNonEmptyPlainObject } from '../utils/value-helpers.js'
import { hashConfirmationValue, verifyConfirmationToken } from './confirmation-token.js'
import {
  defineDelegation,
  type Delegation,
  type DelegationDefinition,
} from './define-delegation.js'
import { buildStructuredBuilder } from './define-handler.js'
import type {
  StructuredGuard,
  StructuredHandlerDefinition,
  StructuredLoadedValue,
} from './define-handler.js'
import {
  getOperationMetadata,
  getOperationProjectionMetadata,
  isOperationPreviewEnvelope,
  type OperationPreviewEnvelope,
} from './define-operation.js'
import {
  definePrincipal,
  type DefaultPrincipal,
  type PrincipalDefinition,
} from './define-principal.js'
import { assertUnsafePermit, type TrellisUnsafePermit } from './unsafe-permit.js'

export type {
  StructuredGuard,
  StructuredHandlerDefinition,
  StructuredLoadedValue,
} from './define-handler.js'
export {
  defineOperationDescriptor,
  defineOperationMetadata,
  defineOperation,
  blockedOperationPreview,
  executeOperationRef,
  getOperationMetadata,
  isOperationPreviewEnvelope,
  operationEffect,
  operationIssue,
  operationPreview,
  operationPreviewEffectValidator,
  operationPreviewIssueValidator,
  operationPreviewValidator,
  previewOperationRef,
  projectOperationRef,
  transportExecuteOperationRef,
  implementOperation,
  previewOf,
  trellisOperationMetadataKey,
  trellisOperationProjectionMetadataKey,
} from './define-operation.js'
export type {
  InferOperationLoaded,
  InferOperationResult,
  InferOperationPreview,
  McpWriteSafety,
  OperationDescriptor,
  OperationDefinition,
  OperationMetadataDefinition,
  OperationPreviewEffect,
  OperationPreviewEnvelope,
  OperationPreviewIssue,
  OperationIdOf,
  OperationKind,
  OperationProjectionRef,
  TrellisOperationMetadata,
  TrellisOperationProjectionMetadata,
  ValidateOperationDefinition,
  ValidateOperationId,
  ValidateOperationProjectionRef,
} from './define-operation.js'
export { defineDelegation } from './define-delegation.js'
export type { Delegation, DelegationDefinition } from './define-delegation.js'
export { definePrincipal } from './define-principal.js'
export type { DefaultPrincipal, PrincipalDefinition } from './define-principal.js'
export { unsafe } from './unsafe-permit.js'
export type { TrellisUnsafePermit } from './unsafe-permit.js'

type DataCtx<DataModel extends GenericDataModel> =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>

type AnyCtx<DataModel extends GenericDataModel> = DataCtx<DataModel> | GenericActionCtx<DataModel>

export type PrincipalAccessor<TPrincipal> = () => Promise<TPrincipal>
export type DelegationAccessor<TDelegation> = () => Promise<TDelegation | null>
export type ActorAccessor<TActor> = () => Promise<TActor | null>
type ObserveFn = (event: ObservationEventInput) => Promise<void>
type UnsafeDefinition = {
  permit: TrellisUnsafePermit
  trustedForwardingFunctionRef?: string
  trustedForwardingTransport?: 'server' | 'mcp' | 'bridge'
}
type EscapeTenantIsolationOptions = { reason: string }
type UnsafeArgsFor<TArgsValidator> = [TArgsValidator] extends [PropertyValidators]
  ? ObjectType<TArgsValidator>
  : [TArgsValidator] extends [GenericValidator]
    ? Infer<TArgsValidator>
    : Record<string, never>

export const trellisBackendLaneMetadataKey = Symbol.for('trellis.backendLane')

export type TrellisBackendLane = 'public' | 'protected' | 'unsafe'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Declaration-merged registry seam.
export interface OperationsById {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Declaration-merged registry seam.
export interface OperationExecutionsById {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Declaration-merged registry seam.
export interface OperationPreviewsById {}

export interface RegisteredOperations {
  byId: OperationsById
}

export interface RegisteredOperationProjections {
  executeById: OperationExecutionsById
  previewById: OperationPreviewsById
}

export type RegisteredOperationId = Extract<keyof OperationsById, string>
export type RegisteredOperationDefinition<TId extends RegisteredOperationId> = OperationsById[TId]
export type RegisteredOperationExecution<TId extends RegisteredOperationId> =
  OperationExecutionsById[TId]
export type RegisteredOperationPreview<TId extends RegisteredOperationId> =
  OperationPreviewsById[TId]

type AvailableOperationProjection<TId extends RegisteredOperationId> =
  | (TId extends keyof OperationExecutionsById ? 'execute' : never)
  | (TId extends keyof OperationPreviewsById ? 'preview' : never)

export type ValidateRegisteredOperationId<TId extends string = string> =
  TId extends NoInfer<RegisteredOperationId> ? TId : never

export type ValidateOperationProjection<
  TId extends RegisteredOperationId,
  TProjection extends 'execute' | 'preview' = 'execute' | 'preview',
> = TProjection extends NoInfer<AvailableOperationProjection<TId>> ? TProjection : never

const trellisUnsafeDbKey = Symbol('trellisUnsafeDb')

function safeObserve(observe: ObserveFn | undefined, event: Parameters<ObserveFn>[0]): void {
  try {
    void observe?.(event)
  } catch {
    // Observability must never break business logic, even if a caller swaps in a bad implementation.
  }
}

function stripTransportReservedArgs<TArgs extends Record<string, unknown>>(args: TArgs): TArgs {
  return stripForwardedIdentityFields(stripObservationEnvelope(args)) as TArgs
}

export type FunctionsCtxExtension<TPrincipal, TDelegation, TActor> = {
  principal: PrincipalAccessor<TPrincipal>
  delegation: DelegationAccessor<TDelegation>
  actor: ActorAccessor<TActor>
  observe: ObserveFn
}

type QueryDbWithRuntime<DataModel extends GenericDataModel> = GenericQueryCtx<DataModel>['db'] & {
  escapeTenantIsolation: (options: EscapeTenantIsolationOptions) => GenericQueryCtx<DataModel>['db']
  [trellisUnsafeDbKey]: GenericQueryCtx<DataModel>['db']
}

type MutationDbWithRuntime<DataModel extends GenericDataModel> =
  GenericMutationCtx<DataModel>['db'] & {
    escapeTenantIsolation: (
      options: EscapeTenantIsolationOptions,
    ) => GenericMutationCtx<DataModel>['db']
    [trellisUnsafeDbKey]: GenericMutationCtx<DataModel>['db']
  }

type AnyCtxWithRuntime<
  DataModel extends GenericDataModel,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
> = AnyCtx<DataModel> & FunctionsCtxExtension<TPrincipal, TDelegation, TActor>

type QueryCtxWithRuntime<
  DataModel extends GenericDataModel,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
> = Omit<GenericQueryCtx<DataModel>, 'db'> & {
  db: QueryDbWithRuntime<DataModel>
} & FunctionsCtxExtension<TPrincipal, TDelegation, TActor>

type MutationCtxWithRuntime<
  DataModel extends GenericDataModel,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
> = Omit<GenericMutationCtx<DataModel>, 'db'> & {
  db: MutationDbWithRuntime<DataModel>
} & FunctionsCtxExtension<TPrincipal, TDelegation, TActor>

type ActionCtxWithRuntime<
  DataModel extends GenericDataModel,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
> = GenericActionCtx<DataModel> & FunctionsCtxExtension<TPrincipal, TDelegation, TActor>

type RuleCtx<
  DataModel extends GenericDataModel,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
> = DataCtx<DataModel> & FunctionsCtxExtension<TPrincipal, TDelegation, TActor>

type OnSuccessArgs<Ctx> = {
  ctx: Ctx
  args: Record<string, unknown>
  result: unknown
}

type TenantIsolationOptions<DataModel extends GenericDataModel> = {
  tables: Array<TableNamesInDataModel<DataModel>>
  globalTables?: Array<TableNamesInDataModel<DataModel>>
  field?: string
}

type ServiceAccessDefinition<DataModel extends GenericDataModel, TPrincipal> = ServiceDefinitions<
  TableNamesInDataModel<DataModel>,
  TPrincipal
>

type QueryCustomizationCtx<
  DataModel extends GenericDataModel,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
> = GenericQueryCtx<DataModel> & FunctionsCtxExtension<TPrincipal, TDelegation, TActor>

type MutationCustomizationCtx<
  DataModel extends GenericDataModel,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
> = GenericMutationCtx<DataModel> & FunctionsCtxExtension<TPrincipal, TDelegation, TActor>

type ActionCustomizationCtx<
  DataModel extends GenericDataModel,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
> = GenericActionCtx<DataModel> & FunctionsCtxExtension<TPrincipal, TDelegation, TActor>

type TrustedForwardingCustomizationExtra = {
  trustedForwardingFunctionRef?: string
  trustedForwardingTransport?: 'server' | 'mcp' | 'bridge'
}

type DestructiveRedemptionReader<DataModel extends GenericDataModel> = {
  query: (table: TableNamesInDataModel<DataModel>) => {
    withIndex: (
      indexName: string,
      callback: (q: { eq: (field: string, value: unknown) => unknown }) => unknown,
    ) => { unique: () => Promise<unknown> }
  }
}

type DestructiveSafetyDb<DataModel extends GenericDataModel> =
  DestructiveRedemptionReader<DataModel> & {
    insert: (table: TableNamesInDataModel<DataModel>, value: unknown) => Promise<unknown>
  }

type AppBuilders<
  DataModel extends GenericDataModel,
  QueryVisibility extends FunctionVisibility,
  MutationVisibility extends FunctionVisibility,
  InternalQueryVisibility extends FunctionVisibility = 'internal',
  InternalMutationVisibility extends FunctionVisibility = 'internal',
  ActionVisibility extends FunctionVisibility = 'public',
> = {
  query: QueryBuilder<DataModel, QueryVisibility>
  mutation: MutationBuilder<DataModel, MutationVisibility>
  action?: ActionBuilder<DataModel, ActionVisibility>
  internalQuery?: QueryBuilder<DataModel, InternalQueryVisibility>
  internalMutation?: MutationBuilder<DataModel, InternalMutationVisibility>
}

export interface DefineTrellisOptions<
  DataModel extends GenericDataModel,
  TPrincipal = DefaultPrincipal,
  TDelegation extends Delegation = Delegation,
  TActor = DefaultActor,
> {
  principal?: PrincipalDefinition<AnyCtx<DataModel>, TPrincipal>
  delegation?: DelegationDefinition<AnyCtx<DataModel>, TDelegation>
  actor?: (
    ctx: AnyCtx<DataModel> &
      Pick<FunctionsCtxExtension<TPrincipal, TDelegation, TActor>, 'principal' | 'delegation'>,
    args: Record<string, unknown>,
    principal: TPrincipal,
    delegation: TDelegation | null,
  ) => Promise<TActor | null>
  tenantIsolation?: TenantIsolationOptions<DataModel>
  services?: ServiceAccessDefinition<DataModel, TPrincipal>
  observability?: TrellisObservabilityOptions
  trustedForwardingKey?: TrustedForwardingKeyInput
  destructiveSafety?: {
    redemptionTable: TableNamesInDataModel<DataModel>
    auditTable: TableNamesInDataModel<DataModel>
  }
  triggers?: Triggers<
    DataModel,
    GenericMutationCtx<DataModel> & FunctionsCtxExtension<TPrincipal, TDelegation, TActor>
  >
  onSuccess?: {
    query?: (
      args: OnSuccessArgs<AnyCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>>,
    ) => Promise<void> | void
    mutation?: (
      args: OnSuccessArgs<AnyCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>>,
    ) => Promise<void> | void
    action?: (
      args: OnSuccessArgs<AnyCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>>,
    ) => Promise<void> | void
  }
}

function validateTenantIsolationOptions<DataModel extends GenericDataModel>(
  options: TenantIsolationOptions<DataModel> | undefined,
): void {
  if (!options) return

  if (options.tables.length === 0) {
    throw new Error('tenantIsolation.tables must include at least one table.')
  }

  const seen = new Set<string>()
  for (const table of options.tables) {
    if (typeof table !== 'string' || table.trim().length === 0) {
      throw new Error('tenantIsolation.tables must only contain non-empty table names.')
    }
    if (seen.has(table)) {
      throw new Error(`tenantIsolation.tables contains a duplicate table: "${table}".`)
    }
    seen.add(table)
  }

  const seenGlobal = new Set<string>()
  for (const table of options.globalTables ?? []) {
    if (typeof table !== 'string' || table.trim().length === 0) {
      throw new Error('tenantIsolation.globalTables must only contain non-empty table names.')
    }
    if (seenGlobal.has(table)) {
      throw new Error(`tenantIsolation.globalTables contains a duplicate table: "${table}".`)
    }
    if (seen.has(table)) {
      throw new Error(
        `tenantIsolation cannot classify table "${table}" as both tenant-scoped and global.`,
      )
    }
    seenGlobal.add(table)
  }

  if (options.field !== undefined && options.field.trim().length === 0) {
    throw new Error('tenantIsolation.field must be a non-empty string when provided.')
  }
}

function rejectRemovedCustomRlsOption(options: unknown): void {
  if (
    typeof options === 'object' &&
    options !== null &&
    Object.prototype.hasOwnProperty.call(options, 'rls')
  ) {
    throw new Error(
      'defineTrellis({ rls }) has been removed. Keep business authorization in guard/load/authorize/handler and use tenantIsolation/services for runtime guardrails.',
    )
  }
}

function requireUnsafePermit(
  definition: UnsafeDefinition | undefined,
  surface: string,
): TrellisUnsafePermit {
  const permit = definition?.permit
  assertUnsafePermit(permit, `${surface}({ permit })`)
  return permit
}

function requireNonEmptyReason(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${context} requires a non-empty reason.`)
  }
  return value.trim()
}

function getInternalUnsafeDb<TDb extends object>(db: TDb): TDb {
  return (db as TDb & { [trellisUnsafeDbKey]: TDb })[trellisUnsafeDbKey]
}

function destructiveSafetyMisconfiguredError(
  operationId: string,
  safety: { redemptionTable: string; auditTable: string },
): Error {
  return new Error(
    `Destructive safety for operation "${operationId}" is misconfigured. Ensure table "${safety.redemptionTable}" exists with a "jti" field and a "by_jti" index, and ensure audit table "${safety.auditTable}" exists before executing destructive operations.`,
  )
}

function getDestructiveRedemptionReader<DataModel extends GenericDataModel>(
  db: unknown,
  operationId: string,
  safety: { redemptionTable: string; auditTable: string },
): DestructiveRedemptionReader<DataModel> {
  if (
    !db ||
    typeof db !== 'object' ||
    !('query' in db) ||
    typeof (db as { query?: unknown }).query !== 'function'
  ) {
    throw destructiveSafetyMisconfiguredError(operationId, safety)
  }

  return db as DestructiveRedemptionReader<DataModel>
}

function getDestructiveSafetyDb<DataModel extends GenericDataModel>(
  db: unknown,
  operationId: string,
  safety: { redemptionTable: string; auditTable: string },
): DestructiveSafetyDb<DataModel> {
  const reader = getDestructiveRedemptionReader<DataModel>(db, operationId, safety)
  if (!('insert' in reader) || typeof (reader as { insert?: unknown }).insert !== 'function') {
    throw destructiveSafetyMisconfiguredError(operationId, safety)
  }

  return reader as DestructiveSafetyDb<DataModel>
}

async function assertNoOperationExecuteEnvelopeReplay<
  DataModel extends GenericDataModel,
  TCtx extends AnyCtx<DataModel>,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
>(
  ctx: TCtx,
  ctxWithTrustedForwarding: TCtx & Record<PropertyKey, unknown>,
  options: DefineTrellisOptions<DataModel, TPrincipal, TDelegation, TActor>,
): Promise<void> {
  const envelope = getTrustedForwardingEnvelopeState(ctxWithTrustedForwarding)
  if (envelope?.purpose !== 'operation-execute') return

  if (!options.destructiveSafety) {
    throw deny(
      'Trusted forwarding operation-execute envelopes require destructive safety redemption.',
      {
        source: 'trusted-forwarding',
        category: 'auth',
      },
    )
  }

  const db = 'db' in ctx ? (ctx as { db?: unknown }).db : undefined
  if (!db || typeof db !== 'object') {
    throw deny('Trusted forwarding operation-execute replay checks require database access.', {
      source: 'trusted-forwarding',
      category: 'auth',
    })
  }

  const unsafeDb = getDestructiveRedemptionReader<DataModel>(
    getInternalUnsafeDb(db as object) ?? db,
    envelope.functionRef,
    options.destructiveSafety,
  )

  let existingRedemption
  try {
    existingRedemption = await unsafeDb
      .query(options.destructiveSafety.redemptionTable)
      .withIndex('by_jti', (q) => q.eq('jti', envelope.jti))
      .unique()
  } catch (error) {
    throw toDestructiveSafetyError(error, envelope.functionRef, options.destructiveSafety)
  }

  if (existingRedemption) {
    throw deny('Trusted forwarding operation-execute envelope has already been redeemed.', {
      source: 'trusted-forwarding',
      category: 'auth',
    })
  }
}

type UnsafeQueryBuilder<
  DataModel extends GenericDataModel,
  Visibility extends FunctionVisibility,
> = <
  TArgsValidator extends PropertyValidators | GenericValidator | undefined,
  TReturnsValidator extends PropertyValidators | GenericValidator | undefined,
  TReturnValue = unknown,
>(
  definition: {
    args?: TArgsValidator
    returns?: TReturnsValidator
    handler: (ctx: GenericQueryCtx<DataModel>, args: UnsafeArgsFor<TArgsValidator>) => TReturnValue
  } & UnsafeDefinition,
) => RegisteredQuery<Visibility, UnsafeArgsFor<TArgsValidator>, TReturnValue>

type UnsafeMutationBuilder<
  DataModel extends GenericDataModel,
  Visibility extends FunctionVisibility,
> = <
  TArgsValidator extends PropertyValidators | GenericValidator | undefined,
  TReturnsValidator extends PropertyValidators | GenericValidator | undefined,
  TReturnValue = unknown,
>(
  definition: {
    args?: TArgsValidator
    returns?: TReturnsValidator
    handler: (
      ctx: GenericMutationCtx<DataModel>,
      args: UnsafeArgsFor<TArgsValidator>,
    ) => TReturnValue
  } & UnsafeDefinition,
) => RegisteredMutation<Visibility, UnsafeArgsFor<TArgsValidator>, TReturnValue>

type UnsafeActionBuilder<
  DataModel extends GenericDataModel,
  Visibility extends FunctionVisibility,
> = <
  TArgsValidator extends PropertyValidators | GenericValidator | undefined,
  TReturnsValidator extends PropertyValidators | GenericValidator | undefined,
  TReturnValue = unknown,
>(
  definition: {
    args?: TArgsValidator
    returns?: TReturnsValidator
    handler: (ctx: GenericActionCtx<DataModel>, args: UnsafeArgsFor<TArgsValidator>) => TReturnValue
  } & UnsafeDefinition,
) => RegisteredAction<Visibility, UnsafeArgsFor<TArgsValidator>, TReturnValue>

type UnsafeBuilder<TBuilder> =
  TBuilder extends QueryBuilder<infer DataModel, infer Visibility>
    ? UnsafeQueryBuilder<DataModel, Visibility>
    : TBuilder extends MutationBuilder<infer DataModel, infer Visibility>
      ? UnsafeMutationBuilder<DataModel, Visibility>
      : TBuilder extends ActionBuilder<infer DataModel, infer Visibility>
        ? UnsafeActionBuilder<DataModel, Visibility>
        : TBuilder

function wrapUnsafeBuilder<TBuilder extends (...args: never[]) => unknown>(
  builder: TBuilder,
  label: string,
): UnsafeBuilder<TBuilder> {
  if (typeof builder !== 'function') return builder

  return ((definition: unknown) => {
    const permit = requireUnsafePermit(definition as UnsafeDefinition | undefined, label)
    const maybeDefinition =
      definition && typeof definition === 'object'
        ? (definition as Record<string, unknown>)
        : undefined
    const originalHandler = maybeDefinition?.handler

    const wrappedDefinition =
      maybeDefinition && typeof originalHandler === 'function'
        ? {
            ...maybeDefinition,
            handler: async (ctx: { observe?: ObserveFn }, ...args: unknown[]) => {
              safeObserve(ctx.observe, {
                name: 'unsafe.handler.used',
                status: 'success',
                details: {
                  kind: permit.kind,
                  reason: permit.reason,
                  reviewBy: permit.reviewBy,
                  scope: permit.scope,
                  surface: label,
                },
              })
              return await (originalHandler as (...args: unknown[]) => unknown)(ctx, ...args)
            },
          }
        : definition

    return (builder as unknown as (definition: unknown) => unknown)(wrappedDefinition)
  }) as unknown as UnsafeBuilder<TBuilder>
}

function stampBackendLane<TResult>(value: TResult, lane: TrellisBackendLane): TResult {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return value
  }

  Object.defineProperty(value, trellisBackendLaneMetadataKey, {
    value: lane,
    enumerable: false,
    configurable: false,
    writable: false,
  })
  return value
}

function createPublicLaneBuilder<TBuilder extends (definition: never) => unknown>(
  protectedBuilder: TBuilder,
): TBuilder {
  return ((definition: unknown) => {
    if (
      definition &&
      typeof definition === 'object' &&
      Object.prototype.hasOwnProperty.call(definition, 'guard')
    ) {
      throw new Error(
        'public backend handlers must not provide `guard`; use protected(...) instead.',
      )
    }

    return stampBackendLane(
      protectedBuilder({
        ...(definition as object),
        guard: open,
      } as never),
      'public',
    )
  }) as unknown as TBuilder
}

function createProtectedLaneBuilder<TBuilder extends (definition: never) => unknown>(
  protectedBuilder: TBuilder,
): TBuilder {
  return ((definition: unknown) => {
    if (
      !definition ||
      typeof definition !== 'object' ||
      !Object.prototype.hasOwnProperty.call(definition, 'guard')
    ) {
      throw new Error(
        'protected backend handlers require `guard`; use public(...) for unauthenticated access.',
      )
    }

    return stampBackendLane(protectedBuilder(definition as never), 'protected')
  }) as unknown as TBuilder
}

function createUnsafeLaneBuilder<TBuilder extends (definition: never) => unknown>(
  unsafeBuilder: TBuilder,
): TBuilder {
  return ((definition: never) => stampBackendLane(unsafeBuilder(definition), 'unsafe')) as TBuilder
}

function attachBackendQueryLanes<
  TProtectedBuilder extends (definition: never) => unknown,
  TUnsafeBuilder extends ((definition: never) => unknown) | undefined,
>(
  protectedBuilder: TProtectedBuilder,
  unsafeBuilder?: TUnsafeBuilder,
): {
  public: (definition: never) => unknown
  protected: TProtectedBuilder
  unsafe?: TUnsafeBuilder
} {
  const lanes: {
    public: (definition: never) => unknown
    protected: TProtectedBuilder
    unsafe?: TUnsafeBuilder
  } = {
    public: createPublicLaneBuilder(protectedBuilder),
    protected: createProtectedLaneBuilder(protectedBuilder),
  }
  if (unsafeBuilder) {
    lanes.unsafe = createUnsafeLaneBuilder(unsafeBuilder as never) as TUnsafeBuilder
  }
  return lanes
}

function hasTenantId(value: unknown): value is { tenantId?: unknown } {
  return typeof value === 'object' && value !== null && 'tenantId' in value
}

function getTenantId(actor: unknown): unknown {
  if (!hasTenantId(actor)) return undefined
  return actor.tenantId
}

function describePrincipalKind(principal: unknown): string {
  if (typeof principal === 'object' && principal !== null && 'kind' in principal) {
    const kind = (principal as { kind?: unknown }).kind
    if (typeof kind === 'string') return kind
  }
  if (principal == null) return 'anonymous'
  return typeof principal
}

function describeActorKind(actor: unknown): string {
  if (actor == null) return 'missing'
  if (typeof actor === 'object' && actor !== null && 'role' in actor) {
    const role = (actor as { role?: unknown }).role
    if (typeof role === 'string') return role
  }
  return 'resolved'
}

function hasTenantScope(value: unknown): boolean {
  return value !== undefined && value !== null
}

function isServicePrincipal(value: unknown): value is { kind: 'service'; serviceId: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    (value as { kind?: unknown }).kind === 'service' &&
    typeof (value as { serviceId?: unknown }).serviceId === 'string'
  )
}

type ResolvedServiceAccess<DataModel extends GenericDataModel> =
  | null
  | {
      serviceId: string
      access: 'unrestricted'
    }
  | {
      serviceId: string
      access: 'restricted'
      tables: ReadonlySet<TableNamesInDataModel<DataModel>>
      tenant: 'global' | 'derived'
      tenantId: unknown
    }

function getServiceError(serviceId: string, table: string): Error {
  return new Error(`Service "${serviceId}" has no access to table "${table}".`)
}

function getServiceTableFromId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const separator = value.lastIndexOf(';')
  if (separator === -1) return null
  return value.slice(separator + 1)
}

function assertServiceTableAccess<DataModel extends GenericDataModel>(
  access: ResolvedServiceAccess<DataModel>,
  table: string,
  observe?: ObserveFn,
): void {
  if (!access || access.access === 'unrestricted') return
  if (!access.tables.has(table as TableNamesInDataModel<DataModel>)) {
    safeObserve(observe, {
      name: 'service.access.denied',
      status: 'deny',
      serviceId: access.serviceId,
      reasonCode: 'service.access.denied',
      details: {
        table,
        explanation: createDenialExplanation({
          reasonCode: 'service.access.denied',
          decision: 'service',
          message: `Service "${access.serviceId}" cannot access table "${table}".`,
          policy: table,
          suggestedAction: 'contact_admin',
        }),
      },
    })
    throw getServiceError(access.serviceId, table)
  }
  safeObserve(observe, {
    name: 'service.access.checked',
    status: 'success',
    serviceId: access.serviceId,
    details: { table },
  })
}

function wrapServiceDb<TDb extends object, DataModel extends GenericDataModel>(
  db: TDb,
  access: ResolvedServiceAccess<DataModel>,
  observe?: ObserveFn,
): TDb {
  if (!access || access.access === 'unrestricted') return db

  return new Proxy(db, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver)
      if (typeof original !== 'function') return original

      if (prop === 'query') {
        return (table: TableNamesInDataModel<DataModel>) => {
          assertServiceTableAccess(access, String(table), observe)
          return original.call(target, table)
        }
      }

      if (prop === 'insert') {
        return (table: TableNamesInDataModel<DataModel>, value: unknown) => {
          assertServiceTableAccess(access, String(table), observe)
          return original.call(target, table, value)
        }
      }

      if (prop === 'get' || prop === 'patch' || prop === 'replace' || prop === 'delete') {
        return (id: unknown, ...args: unknown[]) => {
          const table = getServiceTableFromId(id)
          if (!table) {
            throw new Error(`Could not determine table from Convex id "${String(id)}".`)
          }
          assertServiceTableAccess(access, table, observe)
          return original.call(target, id, ...args)
        }
      }

      return original.bind(target)
    },
  }) as TDb
}

function createServiceScopeRule<TDoc extends Record<string, unknown>>(
  field: string,
  tenantId: unknown,
) {
  return async (ctx: unknown, doc: TDoc) => {
    const documentTenantId = doc[field as keyof TDoc]

    if (
      hasTenantScope(tenantId) &&
      hasTenantScope(documentTenantId) &&
      documentTenantId === tenantId
    ) {
      return true
    }

    if (process.env.NODE_ENV === 'production') {
      safeObserve((ctx as { observe?: ObserveFn }).observe, {
        name: 'rls.denied',
        status: 'deny',
        reasonCode: 'service.access.denied',
        details: {
          field,
          expectedTenantId: tenantId,
          actualTenantId: documentTenantId,
          explanation: createDenialExplanation({
            reasonCode: 'service.access.denied',
            decision: 'service',
            message: 'Service tenant scope denied access to this document.',
            policy: field,
            tenantId: typeof tenantId === 'string' ? tenantId : undefined,
            suggestedAction: 'contact_admin',
          }),
        },
      })
      return false
    }

    throw new Error(
      `Service scope denied access.\nExpected: ${String(tenantId)}\nReason: ${field} ${String(documentTenantId)}`,
    )
  }
}

function createTenantIsolationRule<
  DataModel extends GenericDataModel,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
  TDoc extends Record<string, unknown>,
>(field: string) {
  return async (ctx: AnyCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>, doc: TDoc) => {
    const actorTenantId = getTenantId(await ctx.actor())
    const documentTenantId = doc[field as keyof TDoc]

    if (
      hasTenantScope(actorTenantId) &&
      hasTenantScope(documentTenantId) &&
      documentTenantId === actorTenantId
    ) {
      return true
    }

    if (process.env.NODE_ENV === 'production') {
      await ctx.observe({
        name: 'rls.denied',
        status: 'deny',
        reasonCode: 'rls.denied',
        details: {
          field,
          actorTenantId,
          documentTenantId,
          explanation: createDenialExplanation({
            reasonCode: 'rls.denied',
            decision: 'rls',
            message: 'Tenant isolation denied access to this document.',
            policy: field,
            tenantId: typeof actorTenantId === 'string' ? actorTenantId : undefined,
            suggestedAction: 'switch_tenant',
          }),
        },
      })
      return false
    }

    throw new Error(
      `Document belongs to a different tenant.\nActor: ${String(actorTenantId)}\nReason: ${field} ${String(documentTenantId)}`,
    )
  }
}

function buildTenantIsolationRules<
  DataModel extends GenericDataModel,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
>(
  options: TenantIsolationOptions<DataModel> | undefined,
): Rules<RuleCtx<DataModel, TPrincipal, TDelegation, TActor>, DataModel> {
  const rules = {} as Rules<RuleCtx<DataModel, TPrincipal, TDelegation, TActor>, DataModel>
  if (!options) return rules

  const field = options.field ?? 'workspaceId'

  for (const table of options.tables) {
    const tenantRule = createTenantIsolationRule<
      DataModel,
      TPrincipal,
      TDelegation,
      TActor,
      Record<string, unknown>
    >(field)
    rules[table] = {
      read: tenantRule,
      modify: tenantRule,
      insert: tenantRule,
    }
  }

  return rules
}

async function resolveServiceAccess<
  DataModel extends GenericDataModel,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
>(
  ctx: RuleCtx<DataModel, TPrincipal, TDelegation, TActor>,
  args: Record<string, unknown>,
  options: DefineTrellisOptions<DataModel, TPrincipal, TDelegation, TActor>,
): Promise<ResolvedServiceAccess<DataModel>> {
  const principal = await ctx.principal()
  if (!isServicePrincipal(principal)) return null

  const service = options.services?.[principal.serviceId]
  if (!service) {
    throw new Error(
      `Service "${principal.serviceId}" is not configured in defineTrellis({ services }).`,
    )
  }

  if (service.access === 'unrestricted') {
    return {
      serviceId: principal.serviceId,
      access: 'unrestricted',
    }
  }

  const tenantId =
    service.access.tenant === 'derived'
      ? await service.access.deriveTenant({
          principal,
          args: stripTransportReservedArgs(args),
        })
      : null

  return {
    serviceId: principal.serviceId,
    access: 'restricted',
    tables: new Set(service.access.tables),
    tenant: service.access.tenant,
    tenantId,
  }
}

function buildServiceRules<
  DataModel extends GenericDataModel,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
>(
  access: ResolvedServiceAccess<DataModel>,
  options: TenantIsolationOptions<DataModel> | undefined,
): Rules<RuleCtx<DataModel, TPrincipal, TDelegation, TActor>, DataModel> {
  const rules = {} as Rules<RuleCtx<DataModel, TPrincipal, TDelegation, TActor>, DataModel>
  if (!access || access.access === 'unrestricted') return rules
  if (access.tenant !== 'derived') return rules

  const field = options?.field ?? 'workspaceId'

  for (const table of access.tables) {
    const scopeRule = createServiceScopeRule<Record<string, unknown>>(field, access.tenantId)
    rules[table] = {
      read: scopeRule,
      modify: scopeRule,
      insert: scopeRule,
    }
  }

  return rules
}

type ResolvedRules<
  DataModel extends GenericDataModel,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
> = {
  dbRules: Rules<RuleCtx<DataModel, TPrincipal, TDelegation, TActor>, DataModel> | null
  crossTenantRules: Rules<RuleCtx<DataModel, TPrincipal, TDelegation, TActor>, DataModel> | null
  serviceAccess: ResolvedServiceAccess<DataModel>
}

async function resolveRules<
  DataModel extends GenericDataModel,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
>(
  ctx: RuleCtx<DataModel, TPrincipal, TDelegation, TActor>,
  args: Record<string, unknown>,
  options: DefineTrellisOptions<DataModel, TPrincipal, TDelegation, TActor>,
): Promise<ResolvedRules<DataModel, TPrincipal, TDelegation, TActor>> {
  const tenantRules = buildTenantIsolationRules<DataModel, TPrincipal, TDelegation, TActor>(
    options.tenantIsolation,
  )
  const serviceAccess = await resolveServiceAccess(ctx, stripTransportReservedArgs(args), options)
  const serviceRules = buildServiceRules<DataModel, TPrincipal, TDelegation, TActor>(
    serviceAccess,
    options.tenantIsolation,
  )

  const isService = serviceAccess !== null
  const dbRules = isService ? serviceRules : tenantRules
  const crossTenantRules = serviceRules

  return {
    dbRules: Object.keys(dbRules).length > 0 ? dbRules : null,
    crossTenantRules: Object.keys(crossTenantRules).length > 0 ? crossTenantRules : null,
    serviceAccess,
  }
}

type StructuredQueryBuilder<
  TCtx extends {
    principal: () => Promise<unknown>
    delegation: () => Promise<unknown | null>
  },
  Visibility extends FunctionVisibility,
  TActor,
> = <
  TGuard extends StructuredGuard<Awaited<ReturnType<TCtx['principal']>>, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded extends StructuredLoadedValue = undefined,
  TResult = unknown,
>(
  definition: StructuredHandlerDefinition<
    TCtx,
    Awaited<ReturnType<TCtx['principal']>>,
    Awaited<ReturnType<TCtx['delegation']>>,
    TActor,
    TGuard,
    TArgsValidator,
    TLoaded,
    TResult
  >,
) => RegisteredQuery<Visibility, ObjectType<TArgsValidator>, TResult>

type PublicStructuredQueryBuilder<
  TCtx extends {
    principal: () => Promise<unknown>
    delegation: () => Promise<unknown | null>
  },
  Visibility extends FunctionVisibility,
  TActor,
> = <
  TArgsValidator extends PropertyValidators,
  TLoaded extends StructuredLoadedValue = undefined,
  TResult = unknown,
>(
  definition: Omit<
    StructuredHandlerDefinition<
      TCtx,
      Awaited<ReturnType<TCtx['principal']>>,
      Awaited<ReturnType<TCtx['delegation']>>,
      TActor,
      typeof open,
      TArgsValidator,
      TLoaded,
      TResult
    >,
    'guard'
  > & { guard?: never },
) => RegisteredQuery<Visibility, ObjectType<TArgsValidator>, TResult>

type StructuredMutationBuilder<
  TCtx extends {
    principal: () => Promise<unknown>
    delegation: () => Promise<unknown | null>
  },
  Visibility extends FunctionVisibility,
  TActor,
> = <
  TGuard extends StructuredGuard<Awaited<ReturnType<TCtx['principal']>>, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded extends StructuredLoadedValue = undefined,
  TResult = unknown,
>(
  definition: StructuredHandlerDefinition<
    TCtx,
    Awaited<ReturnType<TCtx['principal']>>,
    Awaited<ReturnType<TCtx['delegation']>>,
    TActor,
    TGuard,
    TArgsValidator,
    TLoaded,
    TResult
  >,
) => RegisteredMutation<Visibility, ObjectType<TArgsValidator>, TResult>

type PublicStructuredMutationBuilder<
  TCtx extends {
    principal: () => Promise<unknown>
    delegation: () => Promise<unknown | null>
  },
  Visibility extends FunctionVisibility,
  TActor,
> = <
  TArgsValidator extends PropertyValidators,
  TLoaded extends StructuredLoadedValue = undefined,
  TResult = unknown,
>(
  definition: Omit<
    StructuredHandlerDefinition<
      TCtx,
      Awaited<ReturnType<TCtx['principal']>>,
      Awaited<ReturnType<TCtx['delegation']>>,
      TActor,
      typeof open,
      TArgsValidator,
      TLoaded,
      TResult
    >,
    'guard'
  > & { guard?: never },
) => RegisteredMutation<Visibility, ObjectType<TArgsValidator>, TResult>

type StructuredTransportMutationBuilder<
  TCtx extends {
    principal: () => Promise<unknown>
    delegation: () => Promise<unknown | null>
  },
  Visibility extends FunctionVisibility,
  TActor,
> = <
  TGuard extends StructuredGuard<Awaited<ReturnType<TCtx['principal']>>, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded extends StructuredLoadedValue = undefined,
  TResult = unknown,
>(
  definition: StructuredHandlerDefinition<
    TCtx,
    Awaited<ReturnType<TCtx['principal']>>,
    Awaited<ReturnType<TCtx['delegation']>>,
    TActor,
    TGuard,
    TArgsValidator,
    TLoaded,
    TResult
  >,
) => RegisteredMutation<Visibility, ObjectType<TArgsValidator>, TResult>

type StructuredActionBuilder<
  TCtx extends {
    principal: () => Promise<unknown>
    delegation: () => Promise<unknown | null>
  },
  Visibility extends FunctionVisibility,
  TActor,
> = <
  TGuard extends StructuredGuard<Awaited<ReturnType<TCtx['principal']>>, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded extends StructuredLoadedValue = undefined,
  TResult = unknown,
>(
  definition: StructuredHandlerDefinition<
    TCtx,
    Awaited<ReturnType<TCtx['principal']>>,
    Awaited<ReturnType<TCtx['delegation']>>,
    TActor,
    TGuard,
    TArgsValidator,
    TLoaded,
    TResult
  >,
) => RegisteredAction<Visibility, ObjectType<TArgsValidator>, TResult>

type PublicStructuredActionBuilder<
  TCtx extends {
    principal: () => Promise<unknown>
    delegation: () => Promise<unknown | null>
  },
  Visibility extends FunctionVisibility,
  TActor,
> = <
  TArgsValidator extends PropertyValidators,
  TLoaded extends StructuredLoadedValue = undefined,
  TResult = unknown,
>(
  definition: Omit<
    StructuredHandlerDefinition<
      TCtx,
      Awaited<ReturnType<TCtx['principal']>>,
      Awaited<ReturnType<TCtx['delegation']>>,
      TActor,
      typeof open,
      TArgsValidator,
      TLoaded,
      TResult
    >,
    'guard'
  > & { guard?: never },
) => RegisteredAction<Visibility, ObjectType<TArgsValidator>, TResult>

type RuntimeBundle<
  DataModel extends GenericDataModel,
  TCtx extends AnyCtx<DataModel>,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
> = {
  principal: PrincipalAccessor<TPrincipal>
  delegation: DelegationAccessor<TDelegation>
  actor: ActorAccessor<TActor>
  baseCtx: TCtx & FunctionsCtxExtension<TPrincipal, TDelegation, TActor>
}

function resolvePrincipal<DataModel extends GenericDataModel, TPrincipal>(
  principalDefinition: PrincipalDefinition<AnyCtx<DataModel>, TPrincipal> | undefined,
): PrincipalDefinition<AnyCtx<DataModel>, TPrincipal> {
  return (principalDefinition ?? definePrincipal.fromAuth<DataModel>()) as PrincipalDefinition<
    AnyCtx<DataModel>,
    TPrincipal
  >
}

function resolveDelegation<DataModel extends GenericDataModel, TDelegation extends Delegation>(
  delegationDefinition: DelegationDefinition<AnyCtx<DataModel>, TDelegation> | undefined,
): DelegationDefinition<AnyCtx<DataModel>, TDelegation> {
  return (delegationDefinition ?? defineDelegation.none<DataModel>()) as DelegationDefinition<
    AnyCtx<DataModel>,
    TDelegation
  >
}

function resolveActor<
  DataModel extends GenericDataModel,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
>(
  actorResolver:
    | ((
        ctx: AnyCtx<DataModel> &
          Pick<FunctionsCtxExtension<TPrincipal, TDelegation, TActor>, 'principal' | 'delegation'>,
        args: Record<string, unknown>,
        principal: TPrincipal,
        delegation: TDelegation | null,
      ) => Promise<TActor | null>)
    | undefined,
): (
  ctx: AnyCtx<DataModel> &
    Pick<FunctionsCtxExtension<TPrincipal, TDelegation, TActor>, 'principal' | 'delegation'>,
  args: Record<string, unknown>,
  principal: TPrincipal,
  delegation: TDelegation | null,
) => Promise<TActor | null> {
  return (actorResolver ??
    (async (ctx) => await defineActor.fromAuth<DataModel>().resolve(ctx))) as (
    ctx: AnyCtx<DataModel> &
      Pick<FunctionsCtxExtension<TPrincipal, TDelegation, TActor>, 'principal' | 'delegation'>,
    args: Record<string, unknown>,
    principal: TPrincipal,
    delegation: TDelegation | null,
  ) => Promise<TActor | null>
}

async function createContextWithRuntime<
  DataModel extends GenericDataModel,
  TCtx extends AnyCtx<DataModel>,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
>(
  ctx: TCtx,
  args: Record<string, unknown>,
  options: DefineTrellisOptions<DataModel, TPrincipal, TDelegation, TActor>,
  principalResolver: PrincipalDefinition<AnyCtx<DataModel>, TPrincipal>,
  delegationResolver: DelegationDefinition<AnyCtx<DataModel>, TDelegation>,
  actorResolver: (
    ctx: TCtx &
      Pick<FunctionsCtxExtension<TPrincipal, TDelegation, TActor>, 'principal' | 'delegation'>,
    args: Record<string, unknown>,
    principal: TPrincipal,
    delegation: TDelegation | null,
  ) => Promise<TActor | null>,
  extra?: TrustedForwardingCustomizationExtra,
): Promise<RuntimeBundle<DataModel, TCtx, TPrincipal, TDelegation, TActor>> {
  const rawAppArgs = stripObservationEnvelope(args)
  const observationEnvelope = getObservationEnvelope(args)
  if (
    Object.prototype.hasOwnProperty.call(rawAppArgs, '_trellisForwarding') &&
    !extra?.trustedForwardingFunctionRef
  ) {
    throw deny(
      'Signed trusted forwarding requires exact trustedForwardingFunctionRef metadata on the target handler.',
      {
        source: 'trusted-forwarding',
        category: 'auth',
      },
    )
  }
  const ctxWithTrustedForwarding = { ...ctx } as TCtx & Record<PropertyKey, unknown>
  setTrustedForwardingContext(ctxWithTrustedForwarding, rawAppArgs, {
    expectedKeyOverride: options.trustedForwardingKey,
    expectedTransport: extra?.trustedForwardingTransport ?? 'server',
    ...(extra?.trustedForwardingFunctionRef
      ? { expectedFunctionRef: extra.trustedForwardingFunctionRef }
      : {}),
  })
  await assertNoOperationExecuteEnvelopeReplay(ctx, ctxWithTrustedForwarding, options)
  const trustedForwarding = getTrustedForwarding(ctxWithTrustedForwarding)
  if (!trustedForwarding && hasForwardedIdentityFields(rawAppArgs)) {
    throw deny('Forwarded identity fields are only allowed on verified trusted forwarding paths.', {
      source: 'trusted-forwarding',
      category: 'auth',
    })
  }
  const appArgs = stripForwardedIdentityFields(rawAppArgs)
  const observeRuntime = createObservationEmitter(options.observability, {
    transport: 'convex',
    ...toObservationContext(observationEnvelope),
  })
  const observe: ObserveFn = async (event) => {
    await observeRuntime.emit({
      ...event,
      transport: event.transport ?? 'convex',
      originTransport: event.originTransport ?? observationEnvelope?.originTransport,
    } as PartialObservationEvent)
  }

  let principalPromise: Promise<TPrincipal> | null = null
  const principal: PrincipalAccessor<TPrincipal> = async () => {
    principalPromise ??= Promise.resolve(
      principalResolver.resolve(ctxWithTrustedForwarding, appArgs),
    ).then(async (value) => {
      await observe({
        name: 'principal.resolved',
        status: 'success',
        principalKind: describePrincipalKind(value),
      })
      return value
    })
    return await principalPromise
  }

  let delegationPromise: Promise<TDelegation | null> | null = null
  const delegation: DelegationAccessor<TDelegation> = async () => {
    delegationPromise ??= Promise.resolve(
      delegationResolver.resolve(ctxWithTrustedForwarding, appArgs),
    )
    return await delegationPromise
  }

  const ctxWithPrincipal = {
    ...ctxWithTrustedForwarding,
    principal,
    delegation,
    observe,
  } as TCtx &
    Pick<
      FunctionsCtxExtension<TPrincipal, TDelegation, TActor>,
      'principal' | 'delegation' | 'observe'
    >

  let actorPromise: Promise<TActor | null> | null = null
  const actor: ActorAccessor<TActor> = async () => {
    actorPromise ??= actorResolver(
      ctxWithPrincipal,
      appArgs,
      await principal(),
      await delegation(),
    ).then(async (value) => {
      await observe({
        name: value == null ? 'actor.missing' : 'actor.resolved',
        status: value == null ? 'skip' : 'success',
        actorKind: describeActorKind(value),
        tenantId:
          typeof getTenantId(value) === 'string' ? (getTenantId(value) as string) : undefined,
      })
      return value
    })
    return await actorPromise
  }

  return {
    principal,
    delegation,
    actor,
    baseCtx: {
      ...ctxWithPrincipal,
      actor,
      observe,
    } as TCtx & FunctionsCtxExtension<TPrincipal, TDelegation, TActor>,
  }
}

function createOnSuccessHandler<Ctx>(
  handler: ((args: OnSuccessArgs<Ctx>) => Promise<void> | void) | undefined,
  ctx: Ctx,
): ((payload: { args: Record<string, unknown>; result: unknown }) => Promise<void>) | undefined {
  if (!handler) return undefined

  return async ({ args, result }) => {
    await handler({
      ctx,
      args: stripTransportReservedArgs(args),
      result,
    })
  }
}

function decorateDb<TDb extends object>(
  db: TDb,
  unsafeDb: TDb,
  crossTenantDb: TDb,
  observe: ObserveFn,
): TDb & {
  escapeTenantIsolation: (options: EscapeTenantIsolationOptions) => TDb
  [trellisUnsafeDbKey]: TDb
} {
  const instrument = (
    targetDb: TDb,
    name: 'db.escape_tenant_isolation.used',
    reason: string,
  ): TDb =>
    new Proxy(targetDb, {
      get(target, prop, receiver) {
        const original = Reflect.get(target, prop, receiver)
        if (typeof original !== 'function') return original
        return (...args: unknown[]) => {
          const table =
            typeof args[0] === 'string'
              ? String(args[0])
              : typeof prop === 'string' &&
                  ['get', 'patch', 'replace', 'delete'].includes(prop) &&
                  typeof getServiceTableFromId(args[0]) === 'string'
                ? getServiceTableFromId(args[0])
                : null
          safeObserve(observe, {
            name,
            status: 'success',
            details: {
              reason,
              ...(table ? { table } : {}),
            },
          })
          return original.apply(target, args)
        }
      },
    }) as TDb

  Object.defineProperty(db, trellisUnsafeDbKey, {
    value: unsafeDb,
    enumerable: false,
    configurable: false,
    writable: false,
  })

  return Object.assign(db, {
    escapeTenantIsolation: ({ reason }: EscapeTenantIsolationOptions) =>
      instrument(
        crossTenantDb,
        'db.escape_tenant_isolation.used',
        requireNonEmptyReason(reason, 'ctx.db.escapeTenantIsolation'),
      ),
  }) as TDb & {
    escapeTenantIsolation: (options: EscapeTenantIsolationOptions) => TDb
    [trellisUnsafeDbKey]: TDb
  }
}

function stripConfirmationToken(args: Record<string, unknown>): Record<string, unknown> {
  return stripObservationEnvelope(
    Object.fromEntries(Object.entries(args).filter(([key]) => key !== '_confirmationToken')),
  )
}

function getConfirmationToken(args: Record<string, unknown>): string | undefined {
  return typeof args._confirmationToken === 'string' ? args._confirmationToken : undefined
}

function isDestructivePreviewPayload(value: unknown): value is OperationPreviewEnvelope<{
  [key: string]: SerializableValue
}> {
  return isOperationPreviewEnvelope(value)
}

async function hashPreviewVersion(version: SerializableValue | undefined): Promise<string | null> {
  return version === undefined ? null : await hashConfirmationValue(version)
}

function toDestructiveSafetyError(
  error: unknown,
  operationId: string,
  safety: { redemptionTable: string; auditTable: string },
): Error {
  if (!(error instanceof Error)) {
    return new Error(String(error))
  }

  if (
    /by_jti|missing.*index|does not exist|unknown table|unknown index|schema|is not a function/i.test(
      error.message,
    )
  ) {
    return destructiveSafetyMisconfiguredError(operationId, safety)
  }

  return error
}

function createQueryCustomization<
  DataModel extends GenericDataModel,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
>(
  options: DefineTrellisOptions<DataModel, TPrincipal, TDelegation, TActor>,
): Customization<
  GenericQueryCtx<DataModel>,
  PropertyValidators,
  QueryCustomizationCtx<DataModel, TPrincipal, TDelegation, TActor>,
  Record<string, never>,
  TrustedForwardingCustomizationExtra
> {
  const principalDefinition = resolvePrincipal(options.principal)
  const delegationDefinition = resolveDelegation(options.delegation)
  const actorResolver = resolveActor(options.actor)
  const principalArgs: PropertyValidators = {
    ...trustedForwardingValidators,
    ...buildObservationEnvelopeValidators(),
  }

  return {
    args: principalArgs,
    input: async (ctx, args, extra) => {
      const { baseCtx } = await createContextWithRuntime(
        ctx,
        args,
        options,
        principalDefinition,
        delegationDefinition,
        actorResolver,
        extra,
      )
      const { dbRules, crossTenantRules, serviceAccess } = await resolveRules(
        baseCtx,
        args,
        options,
      )
      const rawDb = ctx.db
      const serviceDb = wrapServiceDb(rawDb, serviceAccess, baseCtx.observe)
      const db = dbRules ? wrapDatabaseReader(baseCtx, serviceDb, dbRules) : serviceDb
      const crossTenantDb = crossTenantRules
        ? wrapDatabaseReader(baseCtx, serviceDb, crossTenantRules)
        : serviceDb
      const finalCtx: QueryCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor> = {
        ...(baseCtx as unknown as QueryCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>),
        db: decorateDb(db, rawDb, crossTenantDb, baseCtx.observe),
      }

      return {
        ctx: finalCtx,
        args: {},
        onSuccess: createOnSuccessHandler(options.onSuccess?.query, finalCtx),
      }
    },
  }
}

function createMutationCustomization<
  DataModel extends GenericDataModel,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
>(
  options: DefineTrellisOptions<DataModel, TPrincipal, TDelegation, TActor>,
): Customization<
  GenericMutationCtx<DataModel>,
  PropertyValidators,
  MutationCustomizationCtx<DataModel, TPrincipal, TDelegation, TActor>,
  Record<string, never>,
  TrustedForwardingCustomizationExtra
> {
  const principalDefinition = resolvePrincipal(options.principal)
  const delegationDefinition = resolveDelegation(options.delegation)
  const actorResolver = resolveActor(options.actor)
  const principalArgs: PropertyValidators = {
    ...trustedForwardingValidators,
    ...buildObservationEnvelopeValidators(),
  }

  return {
    args: principalArgs,
    input: async (ctx, args, extra) => {
      const { baseCtx } = await createContextWithRuntime(
        ctx,
        args,
        options,
        principalDefinition,
        delegationDefinition,
        actorResolver,
        extra,
      )
      const { dbRules, crossTenantRules, serviceAccess } = await resolveRules(
        baseCtx,
        args,
        options,
      )
      const rawDb = ctx.db
      const serviceDb = wrapServiceDb(rawDb, serviceAccess, baseCtx.observe)
      let db = dbRules ? wrapDatabaseWriter(baseCtx, serviceDb, dbRules) : serviceDb
      let crossTenantDb = crossTenantRules
        ? wrapDatabaseWriter(baseCtx, serviceDb, crossTenantRules)
        : serviceDb

      if (options.triggers) {
        db = options.triggers.wrapDB({
          ...(baseCtx as unknown as MutationCtxWithRuntime<
            DataModel,
            TPrincipal,
            TDelegation,
            TActor
          >),
          db,
        }).db
        crossTenantDb = options.triggers.wrapDB({
          ...(baseCtx as unknown as MutationCtxWithRuntime<
            DataModel,
            TPrincipal,
            TDelegation,
            TActor
          >),
          db: crossTenantDb,
        }).db
      }

      const finalCtx: MutationCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor> = {
        ...(baseCtx as unknown as MutationCtxWithRuntime<
          DataModel,
          TPrincipal,
          TDelegation,
          TActor
        >),
        db: decorateDb(db, rawDb, crossTenantDb, baseCtx.observe),
      }

      return {
        ctx: finalCtx,
        args: {},
        onSuccess: createOnSuccessHandler(options.onSuccess?.mutation, finalCtx),
      }
    },
  }
}

function createActionCustomization<
  DataModel extends GenericDataModel,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
>(
  options: DefineTrellisOptions<DataModel, TPrincipal, TDelegation, TActor>,
): Customization<
  GenericActionCtx<DataModel>,
  PropertyValidators,
  ActionCustomizationCtx<DataModel, TPrincipal, TDelegation, TActor>,
  Record<string, never>,
  TrustedForwardingCustomizationExtra
> {
  const principalDefinition = resolvePrincipal(options.principal)
  const delegationDefinition = resolveDelegation(options.delegation)
  const actorResolver = resolveActor(options.actor)
  const principalArgs: PropertyValidators = {
    ...trustedForwardingValidators,
    ...buildObservationEnvelopeValidators(),
  }

  return {
    args: principalArgs,
    input: async (ctx, args, extra) => {
      const { baseCtx } = await createContextWithRuntime(
        ctx,
        args,
        options,
        principalDefinition,
        delegationDefinition,
        actorResolver,
        extra,
      )
      const finalCtx = baseCtx as unknown as ActionCtxWithRuntime<
        DataModel,
        TPrincipal,
        TDelegation,
        TActor
      >

      return {
        ctx: finalCtx,
        args: {},
        onSuccess: createOnSuccessHandler(options.onSuccess?.action, finalCtx),
      }
    },
  }
}

type CustomFunctionDefinition = {
  args?: PropertyValidators
  returns?: PropertyValidators | GenericValidator
  handler?: (ctx: unknown, args: Record<string, unknown>) => unknown
  [key: string]: unknown
}

type FullArgsCustomizationResult<
  TCtx,
  TCustomCtx extends object,
  TCustomArgs extends Record<string, unknown>,
> = {
  ctx: TCustomCtx
  args: TCustomArgs
  onSuccess?: (obj: {
    ctx: TCtx
    args: Record<string, unknown>
    result: unknown
  }) => void | Promise<void>
}

type FullArgsCustomization<
  TCtx,
  TCustomCtx extends object,
  TCustomArgs extends Record<string, unknown>,
  TExtra extends object,
> = {
  args?: PropertyValidators
  input?: (
    ctx: TCtx,
    args: Record<string, unknown>,
    extra: TExtra,
  ) =>
    | Promise<FullArgsCustomizationResult<TCtx, TCustomCtx, TCustomArgs>>
    | FullArgsCustomizationResult<TCtx, TCustomCtx, TCustomArgs>
}

function omitKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const omitted = new Set(keys)
  return Object.fromEntries(Object.entries(value).filter(([key]) => !omitted.has(key)))
}

function createFullArgsCustomBuilder<
  TBuilder extends (...args: never[]) => unknown,
  TCtx,
  TCustomCtx extends object,
  TCustomArgs extends Record<string, unknown>,
  TExtra extends object,
>(
  builder: TBuilder,
  customization: FullArgsCustomization<TCtx, TCustomCtx, TCustomArgs, TExtra>,
): TBuilder {
  const inputArgs = customization.args ?? {}
  const inputKeys = Object.keys(inputArgs)
  const customInput: NonNullable<
    FullArgsCustomization<TCtx, TCustomCtx, TCustomArgs, TExtra>['input']
  > =
    customization.input ??
    (async () =>
      ({ ctx: {}, args: {} }) as FullArgsCustomizationResult<TCtx, TCustomCtx, TCustomArgs>)

  return ((definition: CustomFunctionDefinition) => {
    const { args, handler = definition as unknown, returns, ...extra } = definition
    if (!args) {
      if (inputKeys.length > 0) {
        throw new Error(
          'If you are using a custom function with arguments for the input customization, you must declare the arguments for the function too.',
        )
      }

      return (builder as unknown as (definition: CustomFunctionDefinition) => unknown)({
        returns,
        handler: async (ctx: unknown, rawArgs: Record<string, unknown>) => {
          const added = await customInput(ctx as TCtx, rawArgs, extra as TExtra)
          const finalCtx = { ...(ctx as object), ...added.ctx }
          const finalArgs = { ...rawArgs, ...added.args }
          const result = await (
            handler as (ctx: unknown, args: Record<string, unknown>) => unknown
          )(finalCtx, finalArgs)
          if (added.onSuccess) {
            await added.onSuccess({ ctx: ctx as TCtx, args: rawArgs, result })
          }
          return result
        },
      })
    }

    return (builder as unknown as (definition: CustomFunctionDefinition) => unknown)({
      args: addFieldsToValidator(args, inputArgs) as unknown as PropertyValidators,
      returns,
      handler: async (ctx: unknown, allArgs: Record<string, unknown>) => {
        const added = await customInput(ctx as TCtx, allArgs, extra as TExtra)
        const appArgs = omitKeys(allArgs, inputKeys)
        const finalCtx = { ...(ctx as object), ...added.ctx }
        const finalArgs = { ...appArgs, ...added.args }
        const result = await (handler as (ctx: unknown, args: Record<string, unknown>) => unknown)(
          finalCtx,
          finalArgs,
        )
        if (added.onSuccess) {
          await added.onSuccess({ ctx: ctx as TCtx, args: appArgs, result })
        }
        return result
      },
    })
  }) as unknown as TBuilder
}

type ExplicitUnsafeRuntime<
  DataModel extends GenericDataModel,
  QueryVisibility extends FunctionVisibility,
  MutationVisibility extends FunctionVisibility,
  InternalQueryVisibility extends FunctionVisibility,
  InternalMutationVisibility extends FunctionVisibility,
  ActionVisibility extends FunctionVisibility,
> = {
  query: UnsafeBuilder<QueryBuilder<DataModel, QueryVisibility>>
  mutation: UnsafeBuilder<MutationBuilder<DataModel, MutationVisibility>>
  action?: UnsafeBuilder<ActionBuilder<DataModel, ActionVisibility>>
  internalQuery?: UnsafeBuilder<QueryBuilder<DataModel, InternalQueryVisibility>>
  internalMutation?: UnsafeBuilder<MutationBuilder<DataModel, InternalMutationVisibility>>
}

type ForwardingBuilderRuntime<
  DataModel extends GenericDataModel,
  QueryVisibility extends FunctionVisibility,
  MutationVisibility extends FunctionVisibility,
  InternalQueryVisibility extends FunctionVisibility,
  InternalMutationVisibility extends FunctionVisibility,
  ActionVisibility extends FunctionVisibility,
> = {
  query: QueryBuilder<DataModel, QueryVisibility>
  mutation: MutationBuilder<DataModel, MutationVisibility>
  action?: ActionBuilder<DataModel, ActionVisibility>
  internal: {
    query?: QueryBuilder<DataModel, InternalQueryVisibility>
    mutation?: MutationBuilder<DataModel, InternalMutationVisibility>
  }
}

type QueryWithBackendLanes<
  DataModel extends GenericDataModel,
  Visibility extends FunctionVisibility,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
> = {
  public: PublicStructuredQueryBuilder<
    QueryCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
    Visibility,
    TActor
  >
  protected: StructuredQueryBuilder<
    QueryCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
    Visibility,
    TActor
  >
  unsafe: UnsafeBuilder<QueryBuilder<DataModel, Visibility>>
}

type MutationWithBackendLanes<
  DataModel extends GenericDataModel,
  Visibility extends FunctionVisibility,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
> = {
  public: PublicStructuredMutationBuilder<
    MutationCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
    Visibility,
    TActor
  >
  protected: StructuredMutationBuilder<
    MutationCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
    Visibility,
    TActor
  >
  unsafe: UnsafeBuilder<MutationBuilder<DataModel, Visibility>>
}

type ActionWithBackendLanes<
  DataModel extends GenericDataModel,
  Visibility extends FunctionVisibility,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
> = {
  public: PublicStructuredActionBuilder<
    ActionCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
    Visibility,
    TActor
  >
  protected: StructuredActionBuilder<
    ActionCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
    Visibility,
    TActor
  >
  unsafe: UnsafeBuilder<ActionBuilder<DataModel, Visibility>>
}

type TrellisBackendRuntime<
  DataModel extends GenericDataModel,
  QueryVisibility extends FunctionVisibility,
  MutationVisibility extends FunctionVisibility,
  InternalQueryVisibility extends FunctionVisibility,
  InternalMutationVisibility extends FunctionVisibility,
  ActionVisibility extends FunctionVisibility,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
> = {
  query: QueryWithBackendLanes<DataModel, QueryVisibility, TPrincipal, TDelegation, TActor>
  mutation: MutationWithBackendLanes<DataModel, MutationVisibility, TPrincipal, TDelegation, TActor>
  transportMutation: StructuredTransportMutationBuilder<
    MutationCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
    MutationVisibility,
    TActor
  >
  action?: ActionWithBackendLanes<DataModel, ActionVisibility, TPrincipal, TDelegation, TActor>
  internalQuery?: QueryWithBackendLanes<
    DataModel,
    InternalQueryVisibility,
    TPrincipal,
    TDelegation,
    TActor
  >
  internalMutation?: MutationWithBackendLanes<
    DataModel,
    InternalMutationVisibility,
    TPrincipal,
    TDelegation,
    TActor
  >
  internalTransportMutation?: StructuredTransportMutationBuilder<
    MutationCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
    InternalMutationVisibility,
    TActor
  >
  unsafe: ExplicitUnsafeRuntime<
    DataModel,
    QueryVisibility,
    MutationVisibility,
    InternalQueryVisibility,
    InternalMutationVisibility,
    ActionVisibility
  >
}

function buildUnsafeFunctions<
  DataModel extends GenericDataModel,
  QueryVisibility extends FunctionVisibility,
  MutationVisibility extends FunctionVisibility,
  InternalQueryVisibility extends FunctionVisibility,
  InternalMutationVisibility extends FunctionVisibility,
  ActionVisibility extends FunctionVisibility,
  TPrincipal,
  TDelegation extends Delegation = Delegation,
  TActor = DefaultActor,
>(
  builders: AppBuilders<
    DataModel,
    QueryVisibility,
    MutationVisibility,
    InternalQueryVisibility,
    InternalMutationVisibility,
    ActionVisibility
  >,
  options: DefineTrellisOptions<DataModel, TPrincipal, TDelegation, TActor> = {},
): ForwardingBuilderRuntime<
  DataModel,
  QueryVisibility,
  MutationVisibility,
  InternalQueryVisibility,
  InternalMutationVisibility,
  ActionVisibility
> {
  rejectRemovedCustomRlsOption(options)
  validateTenantIsolationOptions(options.tenantIsolation)

  if (!!builders.internalQuery !== !!builders.internalMutation) {
    throw new Error(
      'defineTrellis(...) requires both internalQuery and internalMutation when either internal builder is provided.',
    )
  }

  const queryCustomization = createQueryCustomization(options)
  const mutationCustomization = createMutationCustomization(options)
  const actionCustomization = createActionCustomization(options)

  const unsafeQuery = createFullArgsCustomBuilder(builders.query, queryCustomization)
  const unsafeMutation = createFullArgsCustomBuilder(builders.mutation, mutationCustomization)
  const unsafeAction = builders.action
    ? createFullArgsCustomBuilder(builders.action, actionCustomization)
    : undefined
  const unsafeInternalQuery = builders.internalQuery
    ? createFullArgsCustomBuilder(builders.internalQuery, queryCustomization)
    : undefined
  const unsafeInternalMutation = builders.internalMutation
    ? createFullArgsCustomBuilder(builders.internalMutation, mutationCustomization)
    : undefined

  return {
    query: unsafeQuery,
    mutation: unsafeMutation,
    action: unsafeAction,
    internal: {
      query: unsafeInternalQuery,
      mutation: unsafeInternalMutation,
    },
  }
}

function buildStructuredMutationRuntime<
  DataModel extends GenericDataModel,
  Visibility extends FunctionVisibility,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
>(
  builder: unknown,
  options: DefineTrellisOptions<DataModel, TPrincipal, TDelegation, TActor>,
): StructuredMutationBuilder<
  MutationCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
  Visibility,
  TActor
> {
  const structured = buildStructuredBuilder<
    MutationCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
    TPrincipal,
    TDelegation,
    TActor,
    never
  >(builder as never)

  return ((definition) => {
    const metadata = getOperationMetadata(definition as never)
    const projectionMetadata = getOperationProjectionMetadata(definition as never)
    if (metadata.kind !== 'destructive') {
      return structured(definition as never)
    }

    if (!metadata.id) {
      throw new Error('mutation(op) requires `operation.id` for destructive operations.')
    }

    if (!('preview' in definition) || typeof definition.preview !== 'function') {
      throw new Error(
        `mutation(op) for destructive operation "${metadata.id}" requires preview(...) so Trellis can bind confirmation to previewed state.`,
      )
    }

    if (!options.destructiveSafety) {
      throw new Error(
        `defineTrellis({ destructiveSafety }) is required before registering destructive operation "${metadata.id}".`,
      )
    }

    const preview = (
      definition as {
        preview: (
          ctx: MutationCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
          args: Record<string, unknown>,
          loaded: unknown,
        ) => Promise<unknown> | unknown
      }
    ).preview
    const originalLoad = definition.load as
      | ((
          ctx: MutationCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
          args: Record<string, unknown>,
        ) => Promise<unknown> | unknown)
      | undefined
    const originalAuthorize = definition.authorize as
      | {
          label?: string
          check: (
            actor: unknown,
            loaded: unknown,
            args: unknown,
            ctx: unknown,
          ) => Promise<unknown> | unknown
        }
      | undefined
    const originalHandler = definition.handler as (
      ctx: MutationCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
      args: Record<string, unknown>,
      loaded: unknown,
    ) => Promise<unknown> | unknown
    const safety = options.destructiveSafety

    const transformed = {
      ...definition,
      ...(definition.trustedForwardingFunctionRef
        ? {
            trustedForwardingFunctionRef: definition.trustedForwardingFunctionRef,
          }
        : projectionMetadata?.functionRef
          ? { trustedForwardingFunctionRef: projectionMetadata.functionRef }
          : {}),
      ...(definition.trustedForwardingTransport
        ? { trustedForwardingTransport: definition.trustedForwardingTransport }
        : {}),
      args: {
        ...definition.args,
        _confirmationToken: v.optional(v.string()),
      },
      load: originalLoad
        ? async (
            ctx: MutationCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
            rawArgs: Record<string, unknown>,
          ) => {
            if (getConfirmationToken(rawArgs)) {
              return undefined
            }

            return await originalLoad(ctx, stripConfirmationToken(rawArgs))
          }
        : undefined,
      authorize: originalAuthorize
        ? {
            ...originalAuthorize,
            check: async (
              actor: unknown,
              loaded: unknown,
              rawArgs: Record<string, unknown>,
              ctx: unknown,
            ) => {
              if (getConfirmationToken(rawArgs)) {
                return true
              }

              return await originalAuthorize.check(
                actor,
                loaded,
                stripConfirmationToken(rawArgs),
                ctx,
              )
            },
          }
        : undefined,
      handler: async (
        ctx: MutationCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
        rawArgs: Record<string, unknown>,
        _loaded: unknown,
      ) => {
        const confirmationToken = getConfirmationToken(rawArgs)
        const executeArgs = stripConfirmationToken(rawArgs)

        if (!confirmationToken) {
          await ctx.observe({
            name: 'operation.confirm.missing',
            status: 'deny',
            operation: metadata.id,
            reasonCode: 'tool.confirmation_mismatch',
            details: {
              explanation: createDenialExplanation({
                reasonCode: 'tool.confirmation_mismatch',
                decision: 'destructive_confirm',
                message: 'Destructive operation execution requires a confirmation token.',
                suggestedAction: 'retry_with_confirmation',
              }),
            },
          })
          throw new Error(
            'Destructive operation requires confirmation. Preview again before executing.',
          )
        }

        await ctx.observe({
          name: 'operation.preview.started',
          status: 'success',
          operation: metadata.id,
        })

        const payload = await verifyConfirmationToken(confirmationToken)
        if (payload.operationId !== metadata.id) {
          throw new Error(
            `Confirmation token targets operation "${payload.operationId}", not "${metadata.id}".`,
          )
        }
        const forwardingEnvelope = getTrustedForwardingEnvelopeState(ctx)
        if (
          forwardingEnvelope?.purpose === 'operation-execute' &&
          forwardingEnvelope.jti !== payload.jti
        ) {
          throw new Error(
            'Trusted forwarding operation-execute envelope does not match the confirmation token.',
          )
        }

        const argsHash = await hashConfirmationValue(executeArgs)
        if (payload.argsHash !== argsHash) {
          await ctx.observe({
            name: 'operation.confirm.drifted',
            status: 'deny',
            operation: metadata.id,
            reasonCode: 'tool.confirmation_mismatch',
            details: {
              cause: 'args_mismatch',
              explanation: createDenialExplanation({
                reasonCode: 'tool.confirmation_mismatch',
                decision: 'destructive_confirm',
                message: 'Confirmation token no longer matches the destructive request arguments.',
                suggestedAction: 'retry_with_confirmation',
              }),
            },
          })
          throw new Error(
            'Confirmation token no longer matches this destructive request. Preview again before executing.',
          )
        }

        const unsafeDb = getDestructiveSafetyDb<DataModel>(
          getInternalUnsafeDb(ctx.db),
          metadata.id,
          safety,
        )

        let existingRedemption
        try {
          existingRedemption = await unsafeDb
            .query(safety.redemptionTable)
            .withIndex('by_jti', (q) => q.eq('jti', payload.jti))
            .unique()
        } catch (error) {
          throw toDestructiveSafetyError(error, metadata.id, safety)
        }

        if (existingRedemption) {
          throw new Error('Confirmation token has already been redeemed.')
        }

        const freshLoaded = originalLoad ? await originalLoad(ctx, executeArgs) : undefined

        if (originalAuthorize) {
          const actor = await ctx.actor()
          const authorization = await originalAuthorize.check(actor, freshLoaded, executeArgs, ctx)
          if (!can(actor, authorization as never)) {
            deny(`Forbidden: ${originalAuthorize.label ?? 'Access denied'}`)
          }
        }

        const previewResult = await preview(ctx, executeArgs, freshLoaded)
        if (!isDestructivePreviewPayload(previewResult)) {
          throw new Error(
            `Destructive operation "${metadata.id}" preview must return an OperationPreviewEnvelope with allowed, summary, blockers, warnings, effects, and a non-empty plain-object confirm payload.`,
          )
        }
        await ctx.observe({
          name: 'operation.preview.completed',
          status: 'success',
          operation: metadata.id,
        })

        if (previewResult.allowed === false || previewResult.blockers.length > 0) {
          await ctx.observe({
            name: 'operation.confirm.drifted',
            status: 'deny',
            operation: metadata.id,
            reasonCode: 'tool.confirmation_mismatch',
            details: {
              cause: 'preview_blocked',
              explanation: createDenialExplanation({
                reasonCode: 'tool.confirmation_mismatch',
                decision: 'destructive_confirm',
                message: 'Previewed state is now blocked and can no longer be executed.',
                suggestedAction: 'retry_with_confirmation',
              }),
            },
          })
          throw new Error('Previewed state is blocked and can no longer be executed.')
        }

        const previewHash = await hashConfirmationValue(previewResult.confirm)
        if (payload.previewHash !== previewHash) {
          await ctx.observe({
            name: 'operation.confirm.drifted',
            status: 'deny',
            operation: metadata.id,
            reasonCode: 'tool.confirmation_mismatch',
            details: {
              cause: 'preview_mismatch',
              explanation: createDenialExplanation({
                reasonCode: 'tool.confirmation_mismatch',
                decision: 'destructive_confirm',
                message: 'Previewed state changed before confirmation completed.',
                suggestedAction: 'retry_with_confirmation',
              }),
            },
          })
          throw new Error(
            'Previewed state changed before confirmation. Preview again before executing.',
          )
        }
        if ((payload.versionHash ?? null) !== (await hashPreviewVersion(previewResult.version))) {
          await ctx.observe({
            name: 'operation.confirm.drifted',
            status: 'deny',
            operation: metadata.id,
            reasonCode: 'tool.confirmation_mismatch',
            details: {
              cause: 'preview_version_mismatch',
              explanation: createDenialExplanation({
                reasonCode: 'tool.confirmation_mismatch',
                decision: 'destructive_confirm',
                message: 'Preview version changed before confirmation completed.',
                suggestedAction: 'retry_with_confirmation',
              }),
            },
          })
          throw new Error(
            'Preview version changed before confirmation. Preview again before executing.',
          )
        }
        await ctx.observe({
          name: 'operation.confirm.validated',
          status: 'success',
          operation: metadata.id,
        })

        const now = Date.now()
        try {
          await unsafeDb.insert(safety.redemptionTable, {
            jti: payload.jti,
            operationId: payload.operationId,
            principalKey: payload.principalKey,
            tenantKey: payload.tenantKey,
            redeemedAt: now,
          })
        } catch (error) {
          throw toDestructiveSafetyError(error, metadata.id, safety)
        }

        try {
          const result = await originalHandler(ctx, executeArgs, freshLoaded)

          try {
            await unsafeDb.insert(safety.auditTable, {
              operationId: payload.operationId,
              jti: payload.jti,
              principalKey: payload.principalKey,
              tenantKey: payload.tenantKey,
              argsHash,
              previewHash,
              executedAt: now,
              executePath: payload.executePath,
            })
          } catch (error) {
            throw toDestructiveSafetyError(error, metadata.id, safety)
          }

          await ctx.observe({
            name: 'operation.execute.completed',
            status: 'success',
            operation: metadata.id,
          })

          return result
        } catch (error) {
          await ctx.observe({
            name: 'operation.execute.failed',
            status: 'error',
            operation: metadata.id,
            reasonCode: 'operation.execute.failed',
            details:
              error instanceof Error
                ? {
                    message: error.message,
                    explanation: createDenialExplanation({
                      reasonCode: 'operation.execute.failed',
                      decision: 'destructive_confirm',
                      message: error.message,
                      suggestedAction: 'contact_admin',
                    }),
                  }
                : undefined,
          })
          throw error
        }
      },
    }

    return structured(transformed as never)
  }) as StructuredMutationBuilder<
    MutationCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
    Visibility,
    TActor
  >
}

function buildStructuredTransportMutationRuntime<
  DataModel extends GenericDataModel,
  Visibility extends FunctionVisibility,
  TPrincipal,
  TDelegation extends Delegation,
  TActor,
>(
  builder: unknown,
): StructuredTransportMutationBuilder<
  MutationCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
  Visibility,
  TActor
> {
  const structured = buildStructuredBuilder<
    MutationCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
    TPrincipal,
    TDelegation,
    TActor,
    never
  >(builder as never)

  return ((definition) => {
    const metadata = getOperationMetadata(definition as never)
    const projectionMetadata = getOperationProjectionMetadata(definition as never)
    if (metadata.kind !== 'destructive') {
      return structured(definition as never)
    }

    if (!metadata.id) {
      throw new Error('transportMutation(op) requires `operation.id` for destructive operations.')
    }

    const originalLoad = definition.load as
      | ((
          ctx: MutationCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
          args: Record<string, unknown>,
        ) => Promise<unknown> | unknown)
      | undefined
    const originalAuthorize = definition.authorize as
      | {
          label?: string
          check: (
            actor: unknown,
            loaded: unknown,
            args: unknown,
            ctx: unknown,
          ) => Promise<unknown> | unknown
        }
      | undefined
    const originalHandler = definition.handler as (
      ctx: MutationCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
      args: Record<string, unknown>,
      loaded: unknown,
    ) => Promise<unknown> | unknown

    const transformed = {
      ...definition,
      ...(definition.trustedForwardingFunctionRef
        ? {
            trustedForwardingFunctionRef: definition.trustedForwardingFunctionRef,
          }
        : projectionMetadata?.functionRef
          ? { trustedForwardingFunctionRef: projectionMetadata.functionRef }
          : {}),
      ...(definition.trustedForwardingTransport
        ? { trustedForwardingTransport: definition.trustedForwardingTransport }
        : {}),
      load: originalLoad
        ? async (
            ctx: MutationCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
            rawArgs: Record<string, unknown>,
          ) => await originalLoad(ctx, stripConfirmationToken(rawArgs))
        : undefined,
      authorize: originalAuthorize
        ? {
            ...originalAuthorize,
            check: async (
              actor: unknown,
              loaded: unknown,
              rawArgs: Record<string, unknown>,
              ctx: unknown,
            ) => await originalAuthorize.check(actor, loaded, stripConfirmationToken(rawArgs), ctx),
          }
        : undefined,
      handler: async (
        ctx: MutationCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
        rawArgs: Record<string, unknown>,
        loaded: unknown,
      ) => {
        const forwardingEnvelope = getTrustedForwardingEnvelopeState(ctx)
        if (
          forwardingEnvelope?.purpose !== 'operation-execute' ||
          typeof forwardingEnvelope.jti !== 'string' ||
          forwardingEnvelope.jti.length === 0
        ) {
          throw new Error(
            'Destructive transport mutation requires a trusted operation-execute forwarding envelope.',
          )
        }

        const executeArgs = stripConfirmationToken(rawArgs)

        try {
          const result = await originalHandler(ctx, executeArgs, loaded)
          await ctx.observe({
            name: 'operation.execute.completed',
            status: 'success',
            operation: metadata.id,
            transport: 'mcp',
          })
          return result
        } catch (error) {
          await ctx.observe({
            name: 'operation.execute.failed',
            status: 'error',
            operation: metadata.id,
            transport: 'mcp',
            reasonCode: 'operation.execute.failed',
            details:
              error instanceof Error
                ? {
                    message: error.message,
                    explanation: createDenialExplanation({
                      reasonCode: 'operation.execute.failed',
                      decision: 'destructive_confirm',
                      message: error.message,
                      suggestedAction: 'contact_admin',
                    }),
                  }
                : undefined,
          })
          throw error
        }
      },
    }

    return structured(transformed as never)
  }) as StructuredTransportMutationBuilder<
    MutationCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
    Visibility,
    TActor
  >
}

function buildTrellisRuntime<
  DataModel extends GenericDataModel,
  QueryVisibility extends FunctionVisibility,
  MutationVisibility extends FunctionVisibility,
  InternalQueryVisibility extends FunctionVisibility = 'internal',
  InternalMutationVisibility extends FunctionVisibility = 'internal',
  TPrincipal = DefaultPrincipal,
  TDelegation extends Delegation = Delegation,
  TActor = DefaultActor,
  ActionVisibility extends FunctionVisibility = 'public',
>(
  builders: AppBuilders<
    DataModel,
    QueryVisibility,
    MutationVisibility,
    InternalQueryVisibility,
    InternalMutationVisibility,
    ActionVisibility
  >,
  options: DefineTrellisOptions<DataModel, TPrincipal, TDelegation, TActor> = {},
) {
  const unsafe = buildUnsafeFunctions(builders, options)
  const structured = {
    query: buildStructuredBuilder<
      QueryCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
      TPrincipal,
      TDelegation,
      TActor,
      typeof unsafe.query
    >(unsafe.query) as StructuredQueryBuilder<
      QueryCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
      QueryVisibility,
      TActor
    >,
    mutation: buildStructuredMutationRuntime<
      DataModel,
      MutationVisibility,
      TPrincipal,
      TDelegation,
      TActor
    >(unsafe.mutation, options),
    transportMutation: buildStructuredTransportMutationRuntime<
      DataModel,
      MutationVisibility,
      TPrincipal,
      TDelegation,
      TActor
    >(unsafe.mutation),
  }

  const structuredInternal =
    unsafe.internal.query && unsafe.internal.mutation
      ? {
          query: buildStructuredBuilder<
            QueryCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
            TPrincipal,
            TDelegation,
            TActor,
            NonNullable<typeof unsafe.internal.query>
          >(unsafe.internal.query) as StructuredQueryBuilder<
            QueryCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
            InternalQueryVisibility,
            TActor
          >,
          mutation: buildStructuredMutationRuntime<
            DataModel,
            InternalMutationVisibility,
            TPrincipal,
            TDelegation,
            TActor
          >(unsafe.internal.mutation, options),
          transportMutation: buildStructuredTransportMutationRuntime<
            DataModel,
            InternalMutationVisibility,
            TPrincipal,
            TDelegation,
            TActor
          >(unsafe.internal.mutation),
        }
      : undefined

  const action = unsafe.action
    ? (buildStructuredBuilder<
        ActionCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
        TPrincipal,
        TDelegation,
        TActor,
        typeof unsafe.action
      >(unsafe.action) as StructuredActionBuilder<
        ActionCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
        ActionVisibility,
        TActor
      >)
    : undefined

  const explicitUnsafe = {
    query: wrapUnsafeBuilder(unsafe.query, 'unsafe.query'),
    mutation: wrapUnsafeBuilder(unsafe.mutation, 'unsafe.mutation'),
    ...(unsafe.action ? { action: wrapUnsafeBuilder(unsafe.action, 'unsafe.action') } : {}),
    ...(unsafe.internal.query
      ? {
          internalQuery: wrapUnsafeBuilder(unsafe.internal.query, 'unsafe.internalQuery'),
        }
      : {}),
    ...(unsafe.internal.mutation
      ? {
          internalMutation: wrapUnsafeBuilder(unsafe.internal.mutation, 'unsafe.internalMutation'),
        }
      : {}),
  }

  const queryWithLanes = attachBackendQueryLanes(
    structured.query as never,
    explicitUnsafe.query as never,
  ) as unknown as {
    public: PublicStructuredQueryBuilder<
      QueryCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
      QueryVisibility,
      TActor
    >
    protected: typeof structured.query
    unsafe: typeof explicitUnsafe.query
  }
  const mutationWithLanes = attachBackendQueryLanes(
    structured.mutation as never,
    explicitUnsafe.mutation as never,
  ) as unknown as {
    public: PublicStructuredMutationBuilder<
      MutationCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
      MutationVisibility,
      TActor
    >
    protected: typeof structured.mutation
    unsafe: typeof explicitUnsafe.mutation
  }
  const internalQueryWithLanes = structuredInternal?.query
    ? (attachBackendQueryLanes(
        structuredInternal.query as never,
        explicitUnsafe.internalQuery as never,
      ) as unknown as {
        public: PublicStructuredQueryBuilder<
          QueryCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
          InternalQueryVisibility,
          TActor
        >
        protected: typeof structuredInternal.query
        unsafe: NonNullable<typeof explicitUnsafe.internalQuery>
      })
    : undefined
  const internalMutationWithLanes = structuredInternal?.mutation
    ? (attachBackendQueryLanes(
        structuredInternal.mutation as never,
        explicitUnsafe.internalMutation as never,
      ) as unknown as {
        public: PublicStructuredMutationBuilder<
          MutationCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
          InternalMutationVisibility,
          TActor
        >
        protected: typeof structuredInternal.mutation
        unsafe: NonNullable<typeof explicitUnsafe.internalMutation>
      })
    : undefined
  const actionWithLanes =
    action && explicitUnsafe.action
      ? (attachBackendQueryLanes(action as never, explicitUnsafe.action as never) as unknown as {
          public: PublicStructuredActionBuilder<
            ActionCtxWithRuntime<DataModel, TPrincipal, TDelegation, TActor>,
            ActionVisibility,
            TActor
          >
          protected: typeof action
          unsafe: typeof explicitUnsafe.action
        })
      : undefined

  return {
    query: queryWithLanes,
    mutation: mutationWithLanes,
    transportMutation: structured.transportMutation,
    ...(actionWithLanes ? { action: actionWithLanes } : {}),
    ...(structuredInternal && internalQueryWithLanes && internalMutationWithLanes
      ? {
          internalQuery: internalQueryWithLanes,
          internalMutation: internalMutationWithLanes,
          internalTransportMutation: structuredInternal.transportMutation,
        }
      : {}),
    unsafe: explicitUnsafe,
  }
}

/**
 * Build the protected Trellis backend runtime for a principal-first app.
 *
 * This is the canonical backend seam for Trellis apps. It exposes the protected
 * builders directly and keeps unsafe builder access as an explicit escape hatch.
 */
export function defineTrellis<
  DataModel extends GenericDataModel,
  QueryVisibility extends FunctionVisibility,
  MutationVisibility extends FunctionVisibility,
  InternalQueryVisibility extends FunctionVisibility = 'internal',
  InternalMutationVisibility extends FunctionVisibility = 'internal',
  TPrincipal = DefaultPrincipal,
  TDelegation extends Delegation = Delegation,
  TActor = DefaultActor,
  ActionVisibility extends FunctionVisibility = 'public',
>(
  builders: AppBuilders<
    DataModel,
    QueryVisibility,
    MutationVisibility,
    InternalQueryVisibility,
    InternalMutationVisibility,
    ActionVisibility
  >,
  options: DefineTrellisOptions<DataModel, TPrincipal, TDelegation, TActor> = {},
): TrellisBackendRuntime<
  DataModel,
  QueryVisibility,
  MutationVisibility,
  InternalQueryVisibility,
  InternalMutationVisibility,
  ActionVisibility,
  TPrincipal,
  TDelegation,
  TActor
> {
  const runtime = buildTrellisRuntime(builders, options)

  return {
    query: runtime.query,
    mutation: runtime.mutation,
    transportMutation: runtime.transportMutation,
    ...(runtime.action ? { action: runtime.action } : {}),
    ...(runtime.internalQuery
      ? {
          internalQuery: runtime.internalQuery,
          internalMutation: runtime.internalMutation,
          internalTransportMutation: runtime.internalTransportMutation,
        }
      : {}),
    unsafe: runtime.unsafe,
  }
}
