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

import { defineAppIdentity, type DefaultAppIdentity } from '../auth/define-app-identity.js'
import type { ServiceDefinitions } from '../auth/define-services.js'
import { can, deny, open } from '../auth/index.js'
import {
  getIdentityForwarding,
  setIdentityForwardingContext,
  type IdentityForwardingKeyInput,
} from '../identity-forwarding/index.js'
import {
  getIdentityForwardingEnvelopeState,
  hasForwardedIdentityFields,
  stripForwardedIdentityFields,
  identityForwardingValidators,
} from '../identity-forwarding/shared.js'
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
import type { NoInfer, SerializableValue } from '../types/type-utils.js'
import {
  createConfirmationToken,
  hashConfirmationValue,
  hashConfirmationToken,
  normalizeStoredConfirmationPayload,
  type StoredToolConfirmationRow,
  type ToolConfirmationPayload,
} from './confirmation-token.js'
import { defineActingFor, type ActingFor, type ActingForDefinition } from './define-acting-for.js'
import { defineCaller, type DefaultCaller, type CallerDefinition } from './define-caller.js'
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
  type TrellisOperationMetadata,
  type TrellisOperationProjectionMetadata,
  type OperationPreviewEnvelope,
} from './define-operation.js'
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
export { defineActingFor } from './define-acting-for.js'
export type { ActingFor, ActingForDefinition } from './define-acting-for.js'
export { defineCaller } from './define-caller.js'
export type { DefaultCaller, CallerDefinition } from './define-caller.js'
export { unsafe } from './unsafe-permit.js'
export type { TrellisUnsafePermit } from './unsafe-permit.js'

type DataCtx<DataModel extends GenericDataModel> =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>

type AnyCtx<DataModel extends GenericDataModel> = DataCtx<DataModel> | GenericActionCtx<DataModel>

export type CallerAccessor<TCaller> = () => Promise<TCaller>
export type ActingForAccessor<TActingFor> = () => Promise<TActingFor | null>
export type AppIdentityAccessor<TActor> = () => Promise<TActor | null>
type ObserveFn = (event: ObservationEventInput) => Promise<void>
type UnsafeDefinition = {
  permit: TrellisUnsafePermit
  identityForwardingFunctionRef?: string
  identityForwardingTransport?: 'server' | 'mcp' | 'bridge'
}
type EscapeIsolationOptions = { reason: string }
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

export type FunctionsCtxExtension<TCaller, TActingFor, TActor> = {
  caller: CallerAccessor<TCaller>
  actingFor: ActingForAccessor<TActingFor>
  appIdentity: AppIdentityAccessor<TActor>
  observe: ObserveFn
}

type QueryDbWithRuntime<DataModel extends GenericDataModel> = GenericQueryCtx<DataModel>['db'] & {
  escapeIsolation: (options: EscapeIsolationOptions) => GenericQueryCtx<DataModel>['db']
  [trellisUnsafeDbKey]: GenericQueryCtx<DataModel>['db']
}

type MutationDbWithRuntime<DataModel extends GenericDataModel> =
  GenericMutationCtx<DataModel>['db'] & {
    escapeIsolation: (options: EscapeIsolationOptions) => GenericMutationCtx<DataModel>['db']
    [trellisUnsafeDbKey]: GenericMutationCtx<DataModel>['db']
  }

type AnyCtxWithRuntime<
  DataModel extends GenericDataModel,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
> = AnyCtx<DataModel> & FunctionsCtxExtension<TCaller, TActingFor, TActor>

type QueryCtxWithRuntime<
  DataModel extends GenericDataModel,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
> = Omit<GenericQueryCtx<DataModel>, 'db'> & {
  db: QueryDbWithRuntime<DataModel>
} & FunctionsCtxExtension<TCaller, TActingFor, TActor>

type MutationCtxWithRuntime<
  DataModel extends GenericDataModel,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
> = Omit<GenericMutationCtx<DataModel>, 'db'> & {
  db: MutationDbWithRuntime<DataModel>
} & FunctionsCtxExtension<TCaller, TActingFor, TActor>

type ActionCtxWithRuntime<
  DataModel extends GenericDataModel,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
> = GenericActionCtx<DataModel> & FunctionsCtxExtension<TCaller, TActingFor, TActor>

type RuleCtx<
  DataModel extends GenericDataModel,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
> = DataCtx<DataModel> & FunctionsCtxExtension<TCaller, TActingFor, TActor>

type OnSuccessArgs<Ctx> = {
  ctx: Ctx
  args: Record<string, unknown>
  result: unknown
}

type IsolationOptions<DataModel extends GenericDataModel> = {
  tables: Array<TableNamesInDataModel<DataModel>>
  sharedTables?: Array<TableNamesInDataModel<DataModel>>
  field?: string
}

type ServiceAccessDefinition<DataModel extends GenericDataModel, TCaller> = ServiceDefinitions<
  TableNamesInDataModel<DataModel>,
  TCaller
>

type QueryCustomizationCtx<
  DataModel extends GenericDataModel,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
> = GenericQueryCtx<DataModel> & FunctionsCtxExtension<TCaller, TActingFor, TActor>

type MutationCustomizationCtx<
  DataModel extends GenericDataModel,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
> = GenericMutationCtx<DataModel> & FunctionsCtxExtension<TCaller, TActingFor, TActor>

type ActionCustomizationCtx<
  DataModel extends GenericDataModel,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
> = GenericActionCtx<DataModel> & FunctionsCtxExtension<TCaller, TActingFor, TActor>

type IdentityForwardingCustomizationExtra = {
  identityForwardingFunctionRef?: string
  identityForwardingTransport?: 'server' | 'mcp' | 'bridge'
}

type DestructiveConfirmationReader<DataModel extends GenericDataModel> = {
  query: (table: TableNamesInDataModel<DataModel>) => {
    withIndex: (
      indexName: string,
      callback: (q: { eq: (field: string, value: unknown) => unknown }) => unknown,
    ) => { unique: () => Promise<unknown> }
  }
}

type DestructiveOperationsDb<DataModel extends GenericDataModel> =
  DestructiveConfirmationReader<DataModel> & {
    insert: (table: TableNamesInDataModel<DataModel>, value: unknown) => Promise<unknown>
    patch: (id: unknown, value: unknown) => Promise<unknown>
  }

type Awaitable<T> = T | Promise<T>

type DestructivePreviewConfirmationOptions<
  DataModel extends GenericDataModel,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
> = {
  callerKey: (
    ctx: AnyCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
    args: Record<string, unknown>,
    loaded: unknown,
  ) => Awaitable<string>
  scopeKey: (
    ctx: AnyCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
    args: Record<string, unknown>,
    loaded: unknown,
  ) => Awaitable<string>
  ttlSeconds?: number
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
  TCaller = DefaultCaller,
  TActingFor extends ActingFor = ActingFor,
  TActor = DefaultAppIdentity,
> {
  caller?: CallerDefinition<AnyCtx<DataModel>, TCaller>
  actingFor?: ActingForDefinition<AnyCtx<DataModel>, TActingFor>
  appIdentity?: (
    ctx: AnyCtx<DataModel> &
      Pick<FunctionsCtxExtension<TCaller, TActingFor, TActor>, 'caller' | 'actingFor'>,
    args: Record<string, unknown>,
    caller: TCaller,
    actingFor: TActingFor | null,
  ) => Promise<TActor | null>
  isolation?: IsolationOptions<DataModel>
  services?: ServiceAccessDefinition<DataModel, TCaller>
  observability?: TrellisObservabilityOptions
  identityForwardingKey?: IdentityForwardingKeyInput
  destructiveOperations?: {
    confirmationTable: TableNamesInDataModel<DataModel>
    auditTable: TableNamesInDataModel<DataModel>
    previewConfirmation?: DestructivePreviewConfirmationOptions<
      DataModel,
      TCaller,
      TActingFor,
      TActor
    >
  }
  triggers?: Triggers<
    DataModel,
    GenericMutationCtx<DataModel> & FunctionsCtxExtension<TCaller, TActingFor, TActor>
  >
  onSuccess?: {
    query?: (
      args: OnSuccessArgs<AnyCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>>,
    ) => Promise<void> | void
    mutation?: (
      args: OnSuccessArgs<AnyCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>>,
    ) => Promise<void> | void
    action?: (
      args: OnSuccessArgs<AnyCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>>,
    ) => Promise<void> | void
  }
}

function validateIsolationOptions<DataModel extends GenericDataModel>(
  options: IsolationOptions<DataModel> | undefined,
): void {
  if (!options) return

  if (options.tables.length === 0) {
    throw new Error('isolation.tables must include at least one table.')
  }

  const seen = new Set<string>()
  for (const table of options.tables) {
    if (typeof table !== 'string' || table.trim().length === 0) {
      throw new Error('isolation.tables must only contain non-empty table names.')
    }
    if (seen.has(table)) {
      throw new Error(`isolation.tables contains a duplicate table: "${table}".`)
    }
    seen.add(table)
  }

  const seenGlobal = new Set<string>()
  for (const table of options.sharedTables ?? []) {
    if (typeof table !== 'string' || table.trim().length === 0) {
      throw new Error('isolation.sharedTables must only contain non-empty table names.')
    }
    if (seenGlobal.has(table)) {
      throw new Error(`isolation.sharedTables contains a duplicate table: "${table}".`)
    }
    if (seen.has(table)) {
      throw new Error(
        `isolation cannot classify table "${table}" as both tenant-scoped and global.`,
      )
    }
    seenGlobal.add(table)
  }

  if (options.field !== undefined && options.field.trim().length === 0) {
    throw new Error('isolation.field must be a non-empty string when provided.')
  }
}

function rejectRemovedCustomRlsOption(options: unknown): void {
  if (
    typeof options === 'object' &&
    options !== null &&
    Object.prototype.hasOwnProperty.call(options, 'rls')
  ) {
    throw new Error(
      'defineTrellis({ rls }) has been removed. Keep business authorization in guard/load/authorize/handler and use isolation/services for runtime guardrails.',
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

function destructiveOperationsMisconfiguredError(
  operationId: string,
  safety: { confirmationTable: string; auditTable: string },
): Error {
  return new Error(
    `Destructive safety for operation "${operationId}" is misconfigured. Ensure table "${safety.confirmationTable}" exists with "tokenHash" and "jti" fields plus "by_token_hash" and "by_jti" indexes, and ensure audit table "${safety.auditTable}" exists before executing destructive operations.`,
  )
}

function getDestructiveConfirmationReader<DataModel extends GenericDataModel>(
  db: unknown,
  operationId: string,
  safety: { confirmationTable: string; auditTable: string },
): DestructiveConfirmationReader<DataModel> {
  if (
    !db ||
    typeof db !== 'object' ||
    !('query' in db) ||
    typeof (db as { query?: unknown }).query !== 'function'
  ) {
    throw destructiveOperationsMisconfiguredError(operationId, safety)
  }

  return db as DestructiveConfirmationReader<DataModel>
}

function getDestructiveOperationsDb<DataModel extends GenericDataModel>(
  db: unknown,
  operationId: string,
  safety: { confirmationTable: string; auditTable: string },
): DestructiveOperationsDb<DataModel> {
  const reader = getDestructiveConfirmationReader<DataModel>(db, operationId, safety)
  if (
    !('insert' in reader) ||
    typeof (reader as { insert?: unknown }).insert !== 'function' ||
    !('patch' in reader) ||
    typeof (reader as { patch?: unknown }).patch !== 'function'
  ) {
    throw destructiveOperationsMisconfiguredError(operationId, safety)
  }

  return reader as DestructiveOperationsDb<DataModel>
}

async function assertNoOperationExecuteEnvelopeReplay<
  DataModel extends GenericDataModel,
  TCtx extends AnyCtx<DataModel>,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
>(
  ctx: TCtx,
  ctxWithIdentityForwarding: TCtx & Record<PropertyKey, unknown>,
  options: DefineTrellisOptions<DataModel, TCaller, TActingFor, TActor>,
): Promise<void> {
  const envelope = getIdentityForwardingEnvelopeState(ctxWithIdentityForwarding)
  if (envelope?.purpose !== 'operation-execute') return
  if (typeof envelope.jti !== 'string') return

  if (!options.destructiveOperations) {
    throw deny(
      'Identity forwarding operation-execute envelopes require destructive safety confirmation.',
      {
        source: 'identity-forwarding',
        category: 'auth',
      },
    )
  }

  const db = 'db' in ctx ? (ctx as { db?: unknown }).db : undefined
  if (!db || typeof db !== 'object') {
    throw deny('Identity forwarding operation-execute replay checks require database access.', {
      source: 'identity-forwarding',
      category: 'auth',
    })
  }

  const unsafeDb = getDestructiveConfirmationReader<DataModel>(
    getInternalUnsafeDb(db as object) ?? db,
    envelope.functionRef,
    options.destructiveOperations,
  )

  let existingConfirmation
  try {
    existingConfirmation = await unsafeDb
      .query(options.destructiveOperations.confirmationTable)
      .withIndex('by_jti', (q) => q.eq('jti', envelope.jti))
      .unique()
  } catch (error) {
    throw toDestructiveOperationsError(error, envelope.functionRef, options.destructiveOperations)
  }

  if (
    existingConfirmation &&
    typeof (existingConfirmation as { redeemedAt?: unknown }).redeemedAt === 'number'
  ) {
    throw deny('Identity forwarding operation-execute envelope has already been redeemed.', {
      source: 'identity-forwarding',
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

function hasWorkspaceId(value: unknown): value is { workspaceId?: unknown } {
  return typeof value === 'object' && value !== null && 'workspaceId' in value
}

function getWorkspaceId(appIdentity: unknown): unknown {
  if (!hasWorkspaceId(appIdentity)) return undefined
  return appIdentity.workspaceId
}

function describePrincipalKind(caller: unknown): string {
  if (typeof caller === 'object' && caller !== null && 'kind' in caller) {
    const kind = (caller as { kind?: unknown }).kind
    if (typeof kind === 'string') return kind
  }
  if (caller == null) return 'anonymous'
  return typeof caller
}

function describeActorKind(appIdentity: unknown): string {
  if (appIdentity == null) return 'missing'
  if (typeof appIdentity === 'object' && appIdentity !== null && 'role' in appIdentity) {
    const role = (appIdentity as { role?: unknown }).role
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
      workspaceId: unknown
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
  workspaceId: unknown,
) {
  return async (ctx: unknown, doc: TDoc) => {
    const documentWorkspaceId = doc[field as keyof TDoc]

    if (
      hasTenantScope(workspaceId) &&
      hasTenantScope(documentWorkspaceId) &&
      documentWorkspaceId === workspaceId
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
          expectedWorkspaceId: workspaceId,
          actualWorkspaceId: documentWorkspaceId,
          explanation: createDenialExplanation({
            reasonCode: 'service.access.denied',
            decision: 'service',
            message: 'Service tenant scope denied access to this document.',
            policy: field,
            workspaceId: typeof workspaceId === 'string' ? workspaceId : undefined,
            suggestedAction: 'contact_admin',
          }),
        },
      })
      return false
    }

    throw new Error(
      `Service scope denied access.\nExpected: ${String(workspaceId)}\nReason: ${field} ${String(documentWorkspaceId)}`,
    )
  }
}

function createIsolationRule<
  DataModel extends GenericDataModel,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
  TDoc extends Record<string, unknown>,
>(field: string) {
  return async (ctx: AnyCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>, doc: TDoc) => {
    const appIdentityWorkspaceId = getWorkspaceId(await ctx.appIdentity())
    const documentWorkspaceId = doc[field as keyof TDoc]

    if (
      hasTenantScope(appIdentityWorkspaceId) &&
      hasTenantScope(documentWorkspaceId) &&
      documentWorkspaceId === appIdentityWorkspaceId
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
          appIdentityWorkspaceId,
          documentWorkspaceId,
          explanation: createDenialExplanation({
            reasonCode: 'rls.denied',
            decision: 'rls',
            message: 'Isolation denied access to this document.',
            policy: field,
            workspaceId:
              typeof appIdentityWorkspaceId === 'string' ? appIdentityWorkspaceId : undefined,
            suggestedAction: 'switch_tenant',
          }),
        },
      })
      return false
    }

    throw new Error(
      `Document belongs to a different isolation scope.\nAppIdentity: ${String(appIdentityWorkspaceId)}\nReason: ${field} ${String(documentWorkspaceId)}`,
    )
  }
}

function buildIsolationRules<
  DataModel extends GenericDataModel,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
>(
  options: IsolationOptions<DataModel> | undefined,
): Rules<RuleCtx<DataModel, TCaller, TActingFor, TActor>, DataModel> {
  const rules = {} as Rules<RuleCtx<DataModel, TCaller, TActingFor, TActor>, DataModel>
  if (!options) return rules

  const field = options.field ?? 'workspaceId'

  for (const table of options.tables) {
    const tenantRule = createIsolationRule<
      DataModel,
      TCaller,
      TActingFor,
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
  TCaller,
  TActingFor extends ActingFor,
  TActor,
>(
  ctx: RuleCtx<DataModel, TCaller, TActingFor, TActor>,
  args: Record<string, unknown>,
  options: DefineTrellisOptions<DataModel, TCaller, TActingFor, TActor>,
): Promise<ResolvedServiceAccess<DataModel>> {
  const caller = await ctx.caller()
  if (!isServicePrincipal(caller)) return null

  const service = options.services?.[caller.serviceId]
  if (!service) {
    throw new Error(
      `Service "${caller.serviceId}" is not configured in defineTrellis({ services }).`,
    )
  }

  if (service.access === 'unrestricted') {
    return {
      serviceId: caller.serviceId,
      access: 'unrestricted',
    }
  }

  const workspaceId =
    service.access.tenant === 'derived'
      ? await service.access.deriveTenant({
          caller,
          args: stripTransportReservedArgs(args),
        })
      : null

  return {
    serviceId: caller.serviceId,
    access: 'restricted',
    tables: new Set(service.access.tables),
    tenant: service.access.tenant,
    workspaceId,
  }
}

function buildServiceRules<
  DataModel extends GenericDataModel,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
>(
  access: ResolvedServiceAccess<DataModel>,
  options: IsolationOptions<DataModel> | undefined,
): Rules<RuleCtx<DataModel, TCaller, TActingFor, TActor>, DataModel> {
  const rules = {} as Rules<RuleCtx<DataModel, TCaller, TActingFor, TActor>, DataModel>
  if (!access || access.access === 'unrestricted') return rules
  if (access.tenant !== 'derived') return rules

  const field = options?.field ?? 'workspaceId'

  for (const table of access.tables) {
    const scopeRule = createServiceScopeRule<Record<string, unknown>>(field, access.workspaceId)
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
  TCaller,
  TActingFor extends ActingFor,
  TActor,
> = {
  dbRules: Rules<RuleCtx<DataModel, TCaller, TActingFor, TActor>, DataModel> | null
  crossTenantRules: Rules<RuleCtx<DataModel, TCaller, TActingFor, TActor>, DataModel> | null
  serviceAccess: ResolvedServiceAccess<DataModel>
}

async function resolveRules<
  DataModel extends GenericDataModel,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
>(
  ctx: RuleCtx<DataModel, TCaller, TActingFor, TActor>,
  args: Record<string, unknown>,
  options: DefineTrellisOptions<DataModel, TCaller, TActingFor, TActor>,
): Promise<ResolvedRules<DataModel, TCaller, TActingFor, TActor>> {
  const tenantRules = buildIsolationRules<DataModel, TCaller, TActingFor, TActor>(options.isolation)
  const serviceAccess = await resolveServiceAccess(ctx, stripTransportReservedArgs(args), options)
  const serviceRules = buildServiceRules<DataModel, TCaller, TActingFor, TActor>(
    serviceAccess,
    options.isolation,
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
    caller: () => Promise<unknown>
    actingFor: () => Promise<unknown | null>
  },
  Visibility extends FunctionVisibility,
  TActor,
> = <
  TGuard extends StructuredGuard<Awaited<ReturnType<TCtx['caller']>>, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded extends StructuredLoadedValue = undefined,
  TResult = unknown,
>(
  definition: StructuredHandlerDefinition<
    TCtx,
    Awaited<ReturnType<TCtx['caller']>>,
    Awaited<ReturnType<TCtx['actingFor']>>,
    TActor,
    TGuard,
    TArgsValidator,
    TLoaded,
    TResult
  >,
) => RegisteredQuery<Visibility, ObjectType<TArgsValidator>, TResult>

type PublicStructuredQueryBuilder<
  TCtx extends {
    caller: () => Promise<unknown>
    actingFor: () => Promise<unknown | null>
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
      Awaited<ReturnType<TCtx['caller']>>,
      Awaited<ReturnType<TCtx['actingFor']>>,
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
    caller: () => Promise<unknown>
    actingFor: () => Promise<unknown | null>
  },
  Visibility extends FunctionVisibility,
  TActor,
> = <
  TGuard extends StructuredGuard<Awaited<ReturnType<TCtx['caller']>>, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded extends StructuredLoadedValue = undefined,
  TResult = unknown,
>(
  definition: StructuredHandlerDefinition<
    TCtx,
    Awaited<ReturnType<TCtx['caller']>>,
    Awaited<ReturnType<TCtx['actingFor']>>,
    TActor,
    TGuard,
    TArgsValidator,
    TLoaded,
    TResult
  >,
) => RegisteredMutation<Visibility, ObjectType<TArgsValidator>, TResult>

type PublicStructuredMutationBuilder<
  TCtx extends {
    caller: () => Promise<unknown>
    actingFor: () => Promise<unknown | null>
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
      Awaited<ReturnType<TCtx['caller']>>,
      Awaited<ReturnType<TCtx['actingFor']>>,
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
    caller: () => Promise<unknown>
    actingFor: () => Promise<unknown | null>
  },
  Visibility extends FunctionVisibility,
  TActor,
> = <
  TGuard extends StructuredGuard<Awaited<ReturnType<TCtx['caller']>>, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded extends StructuredLoadedValue = undefined,
  TResult = unknown,
>(
  definition: StructuredHandlerDefinition<
    TCtx,
    Awaited<ReturnType<TCtx['caller']>>,
    Awaited<ReturnType<TCtx['actingFor']>>,
    TActor,
    TGuard,
    TArgsValidator,
    TLoaded,
    TResult
  >,
) => RegisteredMutation<Visibility, ObjectType<TArgsValidator>, TResult>

type StructuredActionBuilder<
  TCtx extends {
    caller: () => Promise<unknown>
    actingFor: () => Promise<unknown | null>
  },
  Visibility extends FunctionVisibility,
  TActor,
> = <
  TGuard extends StructuredGuard<Awaited<ReturnType<TCtx['caller']>>, TActor>,
  TArgsValidator extends PropertyValidators,
  TLoaded extends StructuredLoadedValue = undefined,
  TResult = unknown,
>(
  definition: StructuredHandlerDefinition<
    TCtx,
    Awaited<ReturnType<TCtx['caller']>>,
    Awaited<ReturnType<TCtx['actingFor']>>,
    TActor,
    TGuard,
    TArgsValidator,
    TLoaded,
    TResult
  >,
) => RegisteredAction<Visibility, ObjectType<TArgsValidator>, TResult>

type PublicStructuredActionBuilder<
  TCtx extends {
    caller: () => Promise<unknown>
    actingFor: () => Promise<unknown | null>
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
      Awaited<ReturnType<TCtx['caller']>>,
      Awaited<ReturnType<TCtx['actingFor']>>,
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
  TCaller,
  TActingFor extends ActingFor,
  TActor,
> = {
  caller: CallerAccessor<TCaller>
  actingFor: ActingForAccessor<TActingFor>
  appIdentity: AppIdentityAccessor<TActor>
  baseCtx: TCtx & FunctionsCtxExtension<TCaller, TActingFor, TActor>
}

function resolveCaller<DataModel extends GenericDataModel, TCaller>(
  callerDefinition: CallerDefinition<AnyCtx<DataModel>, TCaller> | undefined,
): CallerDefinition<AnyCtx<DataModel>, TCaller> {
  return (callerDefinition ?? defineCaller.fromAuth<DataModel>()) as CallerDefinition<
    AnyCtx<DataModel>,
    TCaller
  >
}

function resolveActingFor<DataModel extends GenericDataModel, TActingFor extends ActingFor>(
  delegationDefinition: ActingForDefinition<AnyCtx<DataModel>, TActingFor> | undefined,
): ActingForDefinition<AnyCtx<DataModel>, TActingFor> {
  return (delegationDefinition ?? defineActingFor.none<DataModel>()) as ActingForDefinition<
    AnyCtx<DataModel>,
    TActingFor
  >
}

function resolveActor<
  DataModel extends GenericDataModel,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
>(
  actorResolver:
    | ((
        ctx: AnyCtx<DataModel> &
          Pick<FunctionsCtxExtension<TCaller, TActingFor, TActor>, 'caller' | 'actingFor'>,
        args: Record<string, unknown>,
        caller: TCaller,
        actingFor: TActingFor | null,
      ) => Promise<TActor | null>)
    | undefined,
): (
  ctx: AnyCtx<DataModel> &
    Pick<FunctionsCtxExtension<TCaller, TActingFor, TActor>, 'caller' | 'actingFor'>,
  args: Record<string, unknown>,
  caller: TCaller,
  actingFor: TActingFor | null,
) => Promise<TActor | null> {
  return (actorResolver ??
    (async (ctx) => await defineAppIdentity.fromAuth<DataModel>().resolve(ctx))) as (
    ctx: AnyCtx<DataModel> &
      Pick<FunctionsCtxExtension<TCaller, TActingFor, TActor>, 'caller' | 'actingFor'>,
    args: Record<string, unknown>,
    caller: TCaller,
    actingFor: TActingFor | null,
  ) => Promise<TActor | null>
}

async function createContextWithRuntime<
  DataModel extends GenericDataModel,
  TCtx extends AnyCtx<DataModel>,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
>(
  ctx: TCtx,
  args: Record<string, unknown>,
  options: DefineTrellisOptions<DataModel, TCaller, TActingFor, TActor>,
  principalResolver: CallerDefinition<AnyCtx<DataModel>, TCaller>,
  delegationResolver: ActingForDefinition<AnyCtx<DataModel>, TActingFor>,
  actorResolver: (
    ctx: TCtx & Pick<FunctionsCtxExtension<TCaller, TActingFor, TActor>, 'caller' | 'actingFor'>,
    args: Record<string, unknown>,
    caller: TCaller,
    actingFor: TActingFor | null,
  ) => Promise<TActor | null>,
  extra?: IdentityForwardingCustomizationExtra,
): Promise<RuntimeBundle<DataModel, TCtx, TCaller, TActingFor, TActor>> {
  const rawAppArgs = stripObservationEnvelope(args)
  const observationEnvelope = getObservationEnvelope(args)
  if (
    Object.prototype.hasOwnProperty.call(rawAppArgs, '_trellisForwarding') &&
    !extra?.identityForwardingFunctionRef
  ) {
    throw deny(
      'Signed identity forwarding requires exact identityForwardingFunctionRef metadata on the target handler.',
      {
        source: 'identity-forwarding',
        category: 'auth',
      },
    )
  }
  const ctxWithIdentityForwarding = { ...ctx } as TCtx & Record<PropertyKey, unknown>
  setIdentityForwardingContext(ctxWithIdentityForwarding, rawAppArgs, {
    expectedKeyOverride: options.identityForwardingKey,
    expectedTransport: extra?.identityForwardingTransport ?? 'server',
    ...(extra?.identityForwardingFunctionRef
      ? { expectedFunctionRef: extra.identityForwardingFunctionRef }
      : {}),
  })
  await assertNoOperationExecuteEnvelopeReplay(ctx, ctxWithIdentityForwarding, options)
  const identityForwarding = getIdentityForwarding(ctxWithIdentityForwarding)
  if (!identityForwarding && hasForwardedIdentityFields(rawAppArgs)) {
    throw deny(
      'Forwarded identity fields are only allowed on verified identity forwarding paths.',
      {
        source: 'identity-forwarding',
        category: 'auth',
      },
    )
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

  let callerPromise: Promise<TCaller> | null = null
  const caller: CallerAccessor<TCaller> = async () => {
    callerPromise ??= Promise.resolve(
      principalResolver.resolve(ctxWithIdentityForwarding, appArgs),
    ).then(async (value) => {
      await observe({
        name: 'caller.resolved',
        status: 'success',
        principalKind: describePrincipalKind(value),
      })
      return value
    })
    return await callerPromise
  }

  let delegationPromise: Promise<TActingFor | null> | null = null
  const actingFor: ActingForAccessor<TActingFor> = async () => {
    delegationPromise ??= Promise.resolve(
      delegationResolver.resolve(ctxWithIdentityForwarding, appArgs),
    )
    return await delegationPromise
  }

  const ctxWithCaller = {
    ...ctxWithIdentityForwarding,
    caller,
    actingFor,
    observe,
  } as TCtx &
    Pick<FunctionsCtxExtension<TCaller, TActingFor, TActor>, 'caller' | 'actingFor' | 'observe'>

  let actorPromise: Promise<TActor | null> | null = null
  const appIdentity: AppIdentityAccessor<TActor> = async () => {
    actorPromise ??= actorResolver(ctxWithCaller, appArgs, await caller(), await actingFor()).then(
      async (value) => {
        await observe({
          name: value == null ? 'appIdentity.missing' : 'appIdentity.resolved',
          status: value == null ? 'skip' : 'success',
          actorKind: describeActorKind(value),
          workspaceId:
            typeof getWorkspaceId(value) === 'string'
              ? (getWorkspaceId(value) as string)
              : undefined,
        })
        return value
      },
    )
    return await actorPromise
  }

  return {
    caller,
    actingFor,
    appIdentity,
    baseCtx: {
      ...ctxWithCaller,
      appIdentity,
      observe,
    } as TCtx & FunctionsCtxExtension<TCaller, TActingFor, TActor>,
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
  escapeIsolation: (options: EscapeIsolationOptions) => TDb
  [trellisUnsafeDbKey]: TDb
} {
  const instrument = (targetDb: TDb, name: 'db.escape_isolation.used', reason: string): TDb =>
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
    escapeIsolation: ({ reason }: EscapeIsolationOptions) =>
      instrument(
        crossTenantDb,
        'db.escape_isolation.used',
        requireNonEmptyReason(reason, 'ctx.db.escapeIsolation'),
      ),
  }) as TDb & {
    escapeIsolation: (options: EscapeIsolationOptions) => TDb
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

function getDestructivePreviewExecutePath(
  metadata: TrellisOperationMetadata,
  projectionMetadata: TrellisOperationProjectionMetadata | null,
): string {
  const executePath = projectionMetadata?.executeFunctionRef
  if (!executePath) {
    throw new Error(
      `Destructive operation "${metadata.id ?? metadata.name ?? 'unknown'}" preview confirmation requires the operation definition to provide identityForwardingFunctionRef for the execute function.`,
    )
  }
  return executePath
}

function getDestructivePreviewPath(
  definition: { identityForwardingFunctionRef?: string },
  projectionMetadata: TrellisOperationProjectionMetadata | null,
): string {
  return definition.identityForwardingFunctionRef ?? projectionMetadata?.functionRef ?? 'preview'
}

function getStoredConfirmationId(row: StoredToolConfirmationRow): unknown {
  if (row._id === undefined) {
    throw new Error('Stored destructive confirmation row is missing "_id".')
  }
  return row._id
}

function confirmationTokenInvalidError(): Error {
  return new Error('Invalid or expired confirmation token. Preview again before executing.')
}

function assertStoredConfirmationMatches(input: {
  payload: ToolConfirmationPayload
  metadata: TrellisOperationMetadata
  executePath?: string
  callerKey: string
  scopeKey: string
}): void {
  if (input.payload.operationId !== input.metadata.id) {
    throw new Error(
      `Confirmation token targets operation "${input.payload.operationId}", not "${input.metadata.id}".`,
    )
  }
  if (input.executePath && input.payload.executePath !== input.executePath) {
    throw new Error(
      `Confirmation token targets execute path "${input.payload.executePath}", not "${input.executePath}".`,
    )
  }
  if (input.payload.callerKey !== input.callerKey) {
    throw new Error('Confirmation token no longer matches this caller. Preview again.')
  }
  if (input.payload.scopeKey !== input.scopeKey) {
    throw new Error('Confirmation token no longer matches this scope. Preview again.')
  }
}

async function attachDestructivePreviewConfirmation<
  DataModel extends GenericDataModel,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
>(input: {
  ctx: AnyCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>
  args: Record<string, unknown>
  loaded: unknown
  metadata: TrellisOperationMetadata
  projectionMetadata: TrellisOperationProjectionMetadata | null
  definition: { identityForwardingFunctionRef?: string }
  previewResult: unknown
  options: DefineTrellisOptions<DataModel, TCaller, TActingFor, TActor>
}): Promise<unknown> {
  const confirmationOptions = input.options.destructiveOperations?.previewConfirmation
  if (!confirmationOptions) return input.previewResult
  if (!isDestructivePreviewPayload(input.previewResult)) return input.previewResult
  if (input.previewResult.allowed === false || input.previewResult.blockers.length > 0) {
    return input.previewResult
  }

  const ttlSeconds = confirmationOptions.ttlSeconds ?? 5 * 60
  const now = Date.now()
  const executePath = getDestructivePreviewExecutePath(input.metadata, input.projectionMetadata)
  const previewPath = getDestructivePreviewPath(input.definition, input.projectionMetadata)
  const [callerKey, scopeKey, argsHash, previewHash, versionHash] = await Promise.all([
    confirmationOptions.callerKey(input.ctx, input.args, input.loaded),
    confirmationOptions.scopeKey(input.ctx, input.args, input.loaded),
    hashConfirmationValue(input.args),
    hashConfirmationValue(input.previewResult.confirm),
    hashPreviewVersion(input.previewResult.version),
  ])
  const token = createConfirmationToken()
  const tokenHash = await hashConfirmationToken(token)
  const operationId = input.metadata.id
  if (!operationId) {
    throw new Error('Destructive preview confirmation requires `operation.id`.')
  }
  const db = 'db' in input.ctx ? (input.ctx as { db?: unknown }).db : undefined
  const unsafeDb = getDestructiveOperationsDb<DataModel>(
    getInternalUnsafeDb((db as object) ?? {}) ?? db,
    operationId,
    input.options.destructiveOperations!,
  )

  try {
    await unsafeDb.insert(input.options.destructiveOperations!.confirmationTable, {
      tokenHash,
      jti: crypto.randomUUID(),
      operationId,
      executePath,
      previewPath,
      callerKey,
      scopeKey,
      argsHash,
      previewHash,
      ...(versionHash ? { versionHash } : {}),
      createdAt: now,
      expiresAt: now + ttlSeconds * 1000,
    })
  } catch (error) {
    throw toDestructiveOperationsError(error, operationId, input.options.destructiveOperations!)
  }

  return {
    ...input.previewResult,
    confirmation: {
      token,
      expiresAt: now + ttlSeconds * 1000,
    },
  }
}

function toDestructiveOperationsError(
  error: unknown,
  operationId: string,
  safety: { confirmationTable: string; auditTable: string },
): Error {
  if (!(error instanceof Error)) {
    return new Error(String(error))
  }

  if (
    /by_token_hash|by_jti|missing.*index|does not exist|unknown table|unknown index|schema|is not a function/i.test(
      error.message,
    )
  ) {
    return destructiveOperationsMisconfiguredError(operationId, safety)
  }

  return error
}

function createQueryCustomization<
  DataModel extends GenericDataModel,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
>(
  options: DefineTrellisOptions<DataModel, TCaller, TActingFor, TActor>,
): Customization<
  GenericQueryCtx<DataModel>,
  PropertyValidators,
  QueryCustomizationCtx<DataModel, TCaller, TActingFor, TActor>,
  Record<string, never>,
  IdentityForwardingCustomizationExtra
> {
  const callerDefinition = resolveCaller(options.caller)
  const delegationDefinition = resolveActingFor(options.actingFor)
  const actorResolver = resolveActor(options.appIdentity)
  const principalArgs: PropertyValidators = {
    ...identityForwardingValidators,
    ...buildObservationEnvelopeValidators(),
  }

  return {
    args: principalArgs,
    input: async (ctx, args, extra) => {
      const { baseCtx } = await createContextWithRuntime(
        ctx,
        args,
        options,
        callerDefinition,
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
      const finalCtx: QueryCtxWithRuntime<DataModel, TCaller, TActingFor, TActor> = {
        ...(baseCtx as unknown as QueryCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>),
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
  TCaller,
  TActingFor extends ActingFor,
  TActor,
>(
  options: DefineTrellisOptions<DataModel, TCaller, TActingFor, TActor>,
): Customization<
  GenericMutationCtx<DataModel>,
  PropertyValidators,
  MutationCustomizationCtx<DataModel, TCaller, TActingFor, TActor>,
  Record<string, never>,
  IdentityForwardingCustomizationExtra
> {
  const callerDefinition = resolveCaller(options.caller)
  const delegationDefinition = resolveActingFor(options.actingFor)
  const actorResolver = resolveActor(options.appIdentity)
  const principalArgs: PropertyValidators = {
    ...identityForwardingValidators,
    ...buildObservationEnvelopeValidators(),
  }

  return {
    args: principalArgs,
    input: async (ctx, args, extra) => {
      const { baseCtx } = await createContextWithRuntime(
        ctx,
        args,
        options,
        callerDefinition,
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
          ...(baseCtx as unknown as MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>),
          db,
        }).db
        crossTenantDb = options.triggers.wrapDB({
          ...(baseCtx as unknown as MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>),
          db: crossTenantDb,
        }).db
      }

      const finalCtx: MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor> = {
        ...(baseCtx as unknown as MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>),
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
  TCaller,
  TActingFor extends ActingFor,
  TActor,
>(
  options: DefineTrellisOptions<DataModel, TCaller, TActingFor, TActor>,
): Customization<
  GenericActionCtx<DataModel>,
  PropertyValidators,
  ActionCustomizationCtx<DataModel, TCaller, TActingFor, TActor>,
  Record<string, never>,
  IdentityForwardingCustomizationExtra
> {
  const callerDefinition = resolveCaller(options.caller)
  const delegationDefinition = resolveActingFor(options.actingFor)
  const actorResolver = resolveActor(options.appIdentity)
  const principalArgs: PropertyValidators = {
    ...identityForwardingValidators,
    ...buildObservationEnvelopeValidators(),
  }

  return {
    args: principalArgs,
    input: async (ctx, args, extra) => {
      const { baseCtx } = await createContextWithRuntime(
        ctx,
        args,
        options,
        callerDefinition,
        delegationDefinition,
        actorResolver,
        extra,
      )
      const finalCtx = baseCtx as unknown as ActionCtxWithRuntime<
        DataModel,
        TCaller,
        TActingFor,
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
  TCaller,
  TActingFor extends ActingFor,
  TActor,
> = {
  public: PublicStructuredQueryBuilder<
    QueryCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
    Visibility,
    TActor
  >
  protected: StructuredQueryBuilder<
    QueryCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
    Visibility,
    TActor
  >
  unsafe: UnsafeBuilder<QueryBuilder<DataModel, Visibility>>
}

type MutationWithBackendLanes<
  DataModel extends GenericDataModel,
  Visibility extends FunctionVisibility,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
> = {
  public: PublicStructuredMutationBuilder<
    MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
    Visibility,
    TActor
  >
  protected: StructuredMutationBuilder<
    MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
    Visibility,
    TActor
  >
  unsafe: UnsafeBuilder<MutationBuilder<DataModel, Visibility>>
}

type ActionWithBackendLanes<
  DataModel extends GenericDataModel,
  Visibility extends FunctionVisibility,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
> = {
  public: PublicStructuredActionBuilder<
    ActionCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
    Visibility,
    TActor
  >
  protected: StructuredActionBuilder<
    ActionCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
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
  TCaller,
  TActingFor extends ActingFor,
  TActor,
> = {
  query: QueryWithBackendLanes<DataModel, QueryVisibility, TCaller, TActingFor, TActor>
  mutation: MutationWithBackendLanes<DataModel, MutationVisibility, TCaller, TActingFor, TActor>
  transportMutation: StructuredTransportMutationBuilder<
    MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
    MutationVisibility,
    TActor
  >
  action?: ActionWithBackendLanes<DataModel, ActionVisibility, TCaller, TActingFor, TActor>
  internalQuery?: QueryWithBackendLanes<
    DataModel,
    InternalQueryVisibility,
    TCaller,
    TActingFor,
    TActor
  >
  internalMutation?: MutationWithBackendLanes<
    DataModel,
    InternalMutationVisibility,
    TCaller,
    TActingFor,
    TActor
  >
  internalTransportMutation?: StructuredTransportMutationBuilder<
    MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
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
  TCaller,
  TActingFor extends ActingFor = ActingFor,
  TActor = DefaultAppIdentity,
>(
  builders: AppBuilders<
    DataModel,
    QueryVisibility,
    MutationVisibility,
    InternalQueryVisibility,
    InternalMutationVisibility,
    ActionVisibility
  >,
  options: DefineTrellisOptions<DataModel, TCaller, TActingFor, TActor> = {},
): ForwardingBuilderRuntime<
  DataModel,
  QueryVisibility,
  MutationVisibility,
  InternalQueryVisibility,
  InternalMutationVisibility,
  ActionVisibility
> {
  rejectRemovedCustomRlsOption(options)
  validateIsolationOptions(options.isolation)

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

function buildStructuredQueryRuntime<
  DataModel extends GenericDataModel,
  Visibility extends FunctionVisibility,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
>(
  builder: unknown,
  options: DefineTrellisOptions<DataModel, TCaller, TActingFor, TActor>,
): StructuredQueryBuilder<
  QueryCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
  Visibility,
  TActor
> {
  const structured = buildStructuredBuilder<
    QueryCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
    TCaller,
    TActingFor,
    TActor,
    never
  >(builder as never)

  return ((definition) => {
    const metadata = getOperationMetadata(definition as never)
    const projectionMetadata = getOperationProjectionMetadata(definition as never)
    if (metadata.kind !== 'destructive' || projectionMetadata?.projection !== 'preview') {
      return structured(definition as never)
    }

    if (!metadata.id) {
      throw new Error('query(previewOf(op)) requires `operation.id` for destructive operations.')
    }

    if (options.destructiveOperations?.previewConfirmation) {
      throw new Error(
        `query(previewOf(op)) for destructive operation "${metadata.id}" cannot issue confirmation tokens. Register the preview with mutation(previewOf(op)) so Trellis can store confirmation state.`,
      )
    }

    const originalHandler = definition.handler as (
      ctx: QueryCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
      args: Record<string, unknown>,
      loaded: unknown,
    ) => Promise<unknown> | unknown

    const transformed = {
      ...definition,
      handler: async (
        ctx: QueryCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
        args: Record<string, unknown>,
        loaded: unknown,
      ) => {
        const previewResult = await originalHandler(ctx, args, loaded)
        return await attachDestructivePreviewConfirmation({
          ctx,
          args,
          loaded,
          metadata,
          projectionMetadata,
          definition,
          previewResult,
          options,
        })
      },
    }

    return structured(transformed as never)
  }) as StructuredQueryBuilder<
    QueryCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
    Visibility,
    TActor
  >
}

function buildStructuredMutationRuntime<
  DataModel extends GenericDataModel,
  Visibility extends FunctionVisibility,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
>(
  builder: unknown,
  options: DefineTrellisOptions<DataModel, TCaller, TActingFor, TActor>,
): StructuredMutationBuilder<
  MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
  Visibility,
  TActor
> {
  const structured = buildStructuredBuilder<
    MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
    TCaller,
    TActingFor,
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
    const operationId = metadata.id

    if (projectionMetadata?.projection === 'preview') {
      const originalHandler = definition.handler as (
        ctx: MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
        args: Record<string, unknown>,
        loaded: unknown,
      ) => Promise<unknown> | unknown

      const transformed = {
        ...definition,
        handler: async (
          ctx: MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
          args: Record<string, unknown>,
          loaded: unknown,
        ) => {
          const previewResult = await originalHandler(ctx, args, loaded)
          return await attachDestructivePreviewConfirmation({
            ctx,
            args,
            loaded,
            metadata,
            projectionMetadata,
            definition,
            previewResult,
            options,
          })
        },
      }

      return structured(transformed as never)
    }

    if (!('preview' in definition) || typeof definition.preview !== 'function') {
      throw new Error(
        `mutation(op) for destructive operation "${metadata.id}" requires preview(...) so Trellis can bind confirmation to previewed state.`,
      )
    }

    if (!options.destructiveOperations) {
      throw new Error(
        `defineTrellis({ destructiveOperations }) is required before registering destructive operation "${metadata.id}".`,
      )
    }

    const preview = (
      definition as {
        preview: (
          ctx: MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
          args: Record<string, unknown>,
          loaded: unknown,
        ) => Promise<unknown> | unknown
      }
    ).preview
    const originalLoad = definition.load as
      | ((
          ctx: MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
          args: Record<string, unknown>,
        ) => Promise<unknown> | unknown)
      | undefined
    const originalAuthorize = definition.authorize as
      | {
          label?: string
          check: (
            appIdentity: unknown,
            loaded: unknown,
            args: unknown,
            ctx: unknown,
          ) => Promise<unknown> | unknown
        }
      | undefined
    const originalHandler = definition.handler as (
      ctx: MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
      args: Record<string, unknown>,
      loaded: unknown,
    ) => Promise<unknown> | unknown
    const safety = options.destructiveOperations

    const transformed = {
      ...definition,
      ...(definition.identityForwardingFunctionRef
        ? {
            identityForwardingFunctionRef: definition.identityForwardingFunctionRef,
          }
        : projectionMetadata?.functionRef
          ? { identityForwardingFunctionRef: projectionMetadata.functionRef }
          : {}),
      ...(definition.identityForwardingTransport
        ? { identityForwardingTransport: definition.identityForwardingTransport }
        : {}),
      args: {
        ...definition.args,
        _confirmationToken: v.optional(v.string()),
      },
      load: originalLoad
        ? async (
            ctx: MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
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
              appIdentity: unknown,
              loaded: unknown,
              rawArgs: Record<string, unknown>,
              ctx: unknown,
            ) => {
              if (getConfirmationToken(rawArgs)) {
                return true
              }

              return await originalAuthorize.check(
                appIdentity,
                loaded,
                stripConfirmationToken(rawArgs),
                ctx,
              )
            },
          }
        : undefined,
      handler: async (
        ctx: MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
        rawArgs: Record<string, unknown>,
        _loaded: unknown,
      ) => {
        const confirmationToken = getConfirmationToken(rawArgs)
        const executeArgs = stripConfirmationToken(rawArgs)

        if (!confirmationToken) {
          await ctx.observe({
            name: 'operation.confirm.missing',
            status: 'deny',
            operation: operationId,
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
          operation: operationId,
        })

        const confirmationOptions = safety.previewConfirmation
        if (!confirmationOptions) {
          throw new TypeError(
            `Destructive operation "${operationId}" requires defineTrellis({ destructiveOperations.previewConfirmation }) to redeem stored confirmation tokens.`,
          )
        }

        const unsafeDb = getDestructiveOperationsDb<DataModel>(
          getInternalUnsafeDb(ctx.db) ?? ctx.db,
          operationId,
          safety,
        )

        const tokenHash = await hashConfirmationToken(confirmationToken)
        let payload: StoredToolConfirmationRow | null
        try {
          payload = normalizeStoredConfirmationPayload(
            await unsafeDb
              .query(safety.confirmationTable)
              .withIndex('by_token_hash', (q) => q.eq('tokenHash', tokenHash))
              .unique(),
          )
        } catch (error) {
          throw toDestructiveOperationsError(error, operationId, safety)
        }

        if (!payload || payload.expiresAt <= Date.now()) {
          throw confirmationTokenInvalidError()
        }
        if (typeof payload.redeemedAt === 'number') {
          throw new TypeError('Confirmation token has already been redeemed.')
        }
        if (payload.operationId !== operationId) {
          throw new Error(
            `Confirmation token targets operation "${payload.operationId}", not "${operationId}".`,
          )
        }
        const executePath =
          definition.identityForwardingFunctionRef ?? projectionMetadata?.functionRef
        if (executePath && payload.executePath !== executePath) {
          throw new Error(
            `Confirmation token targets execute path "${payload.executePath}", not "${executePath}".`,
          )
        }
        const forwardingEnvelope = getIdentityForwardingEnvelopeState(ctx)
        if (
          forwardingEnvelope?.purpose === 'operation-execute' &&
          typeof forwardingEnvelope.jti === 'string' &&
          forwardingEnvelope.jti !== payload.jti
        ) {
          throw new Error(
            'Identity forwarding operation-execute envelope does not match the confirmation token.',
          )
        }

        const argsHash = await hashConfirmationValue(executeArgs)
        if (payload.argsHash !== argsHash) {
          await ctx.observe({
            name: 'operation.confirm.drifted',
            status: 'deny',
            operation: operationId,
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

        const freshLoaded = originalLoad ? await originalLoad(ctx, executeArgs) : undefined

        if (originalAuthorize) {
          const appIdentity = await ctx.appIdentity()
          const authorization = await originalAuthorize.check(
            appIdentity,
            freshLoaded,
            executeArgs,
            ctx,
          )
          if (!can(appIdentity, authorization as never)) {
            deny(`Forbidden: ${originalAuthorize.label ?? 'Access denied'}`)
          }
        }

        const [callerKey, scopeKey] = await Promise.all([
          confirmationOptions.callerKey(ctx, executeArgs, freshLoaded),
          confirmationOptions.scopeKey(ctx, executeArgs, freshLoaded),
        ])
        assertStoredConfirmationMatches({
          payload,
          metadata,
          executePath,
          callerKey,
          scopeKey,
        })

        const previewResult = await preview(ctx, executeArgs, freshLoaded)
        if (!isDestructivePreviewPayload(previewResult)) {
          throw new Error(
            `Destructive operation "${operationId}" preview must return an OperationPreviewEnvelope with allowed, summary, blockers, warnings, effects, and a non-empty plain-object confirm payload.`,
          )
        }
        await ctx.observe({
          name: 'operation.preview.completed',
          status: 'success',
          operation: operationId,
        })

        if (previewResult.allowed === false || previewResult.blockers.length > 0) {
          await ctx.observe({
            name: 'operation.confirm.drifted',
            status: 'deny',
            operation: operationId,
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
            operation: operationId,
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
            operation: operationId,
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
          operation: operationId,
        })

        const now = Date.now()
        try {
          await unsafeDb.patch(getStoredConfirmationId(payload), { redeemedAt: now })
        } catch (error) {
          throw toDestructiveOperationsError(error, operationId, safety)
        }

        try {
          const result = await originalHandler(ctx, executeArgs, freshLoaded)

          try {
            await unsafeDb.insert(safety.auditTable, {
              operationId: payload.operationId,
              jti: payload.jti,
              callerKey: payload.callerKey,
              scopeKey: payload.scopeKey,
              argsHash,
              previewHash,
              executedAt: now,
              executePath: payload.executePath,
            })
          } catch (error) {
            throw toDestructiveOperationsError(error, operationId, safety)
          }

          await ctx.observe({
            name: 'operation.execute.completed',
            status: 'success',
            operation: operationId,
          })

          return result
        } catch (error) {
          await ctx.observe({
            name: 'operation.execute.failed',
            status: 'error',
            operation: operationId,
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
    MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
    Visibility,
    TActor
  >
}

function buildStructuredTransportMutationRuntime<
  DataModel extends GenericDataModel,
  Visibility extends FunctionVisibility,
  TCaller,
  TActingFor extends ActingFor,
  TActor,
>(
  builder: unknown,
): StructuredTransportMutationBuilder<
  MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
  Visibility,
  TActor
> {
  const structured = buildStructuredBuilder<
    MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
    TCaller,
    TActingFor,
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
    const operationId = metadata.id

    const originalLoad = definition.load as
      | ((
          ctx: MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
          args: Record<string, unknown>,
        ) => Promise<unknown> | unknown)
      | undefined
    const originalAuthorize = definition.authorize as
      | {
          label?: string
          check: (
            appIdentity: unknown,
            loaded: unknown,
            args: unknown,
            ctx: unknown,
          ) => Promise<unknown> | unknown
        }
      | undefined
    const originalHandler = definition.handler as (
      ctx: MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
      args: Record<string, unknown>,
      loaded: unknown,
    ) => Promise<unknown> | unknown

    const transformed = {
      ...definition,
      ...(definition.identityForwardingFunctionRef
        ? {
            identityForwardingFunctionRef: definition.identityForwardingFunctionRef,
          }
        : projectionMetadata?.functionRef
          ? { identityForwardingFunctionRef: projectionMetadata.functionRef }
          : {}),
      ...(definition.identityForwardingTransport
        ? { identityForwardingTransport: definition.identityForwardingTransport }
        : {}),
      load: originalLoad
        ? async (
            ctx: MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
            rawArgs: Record<string, unknown>,
          ) => await originalLoad(ctx, stripConfirmationToken(rawArgs))
        : undefined,
      authorize: originalAuthorize
        ? {
            ...originalAuthorize,
            check: async (
              appIdentity: unknown,
              loaded: unknown,
              rawArgs: Record<string, unknown>,
              ctx: unknown,
            ) =>
              await originalAuthorize.check(
                appIdentity,
                loaded,
                stripConfirmationToken(rawArgs),
                ctx,
              ),
          }
        : undefined,
      handler: async (
        ctx: MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
        rawArgs: Record<string, unknown>,
        loaded: unknown,
      ) => {
        const forwardingEnvelope = getIdentityForwardingEnvelopeState(ctx)
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
            operation: operationId,
            transport: 'mcp',
          })
          return result
        } catch (error) {
          await ctx.observe({
            name: 'operation.execute.failed',
            status: 'error',
            operation: operationId,
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
    MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
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
  TCaller = DefaultCaller,
  TActingFor extends ActingFor = ActingFor,
  TActor = DefaultAppIdentity,
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
  options: DefineTrellisOptions<DataModel, TCaller, TActingFor, TActor> = {},
) {
  const unsafe = buildUnsafeFunctions(builders, options)
  const structured = {
    query: buildStructuredQueryRuntime<DataModel, QueryVisibility, TCaller, TActingFor, TActor>(
      unsafe.query,
      options,
    ),
    mutation: buildStructuredMutationRuntime<
      DataModel,
      MutationVisibility,
      TCaller,
      TActingFor,
      TActor
    >(unsafe.mutation, options),
    transportMutation: buildStructuredTransportMutationRuntime<
      DataModel,
      MutationVisibility,
      TCaller,
      TActingFor,
      TActor
    >(unsafe.mutation),
  }

  const structuredInternal =
    unsafe.internal.query && unsafe.internal.mutation
      ? {
          query: buildStructuredQueryRuntime<
            DataModel,
            InternalQueryVisibility,
            TCaller,
            TActingFor,
            TActor
          >(unsafe.internal.query, options),
          mutation: buildStructuredMutationRuntime<
            DataModel,
            InternalMutationVisibility,
            TCaller,
            TActingFor,
            TActor
          >(unsafe.internal.mutation, options),
          transportMutation: buildStructuredTransportMutationRuntime<
            DataModel,
            InternalMutationVisibility,
            TCaller,
            TActingFor,
            TActor
          >(unsafe.internal.mutation),
        }
      : undefined

  const action = unsafe.action
    ? (buildStructuredBuilder<
        ActionCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
        TCaller,
        TActingFor,
        TActor,
        typeof unsafe.action
      >(unsafe.action) as StructuredActionBuilder<
        ActionCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
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
      QueryCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
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
      MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
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
          QueryCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
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
          MutationCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
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
            ActionCtxWithRuntime<DataModel, TCaller, TActingFor, TActor>,
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
 * Build the protected Trellis backend runtime for a caller-first app.
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
  TCaller = DefaultCaller,
  TActingFor extends ActingFor = ActingFor,
  TActor = DefaultAppIdentity,
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
  options: DefineTrellisOptions<DataModel, TCaller, TActingFor, TActor> = {},
): TrellisBackendRuntime<
  DataModel,
  QueryVisibility,
  MutationVisibility,
  InternalQueryVisibility,
  InternalMutationVisibility,
  ActionVisibility,
  TCaller,
  TActingFor,
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
