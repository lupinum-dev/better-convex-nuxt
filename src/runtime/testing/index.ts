/// <reference types="vite/client" />

import { dirname, resolve } from 'node:path'

import { convexTest, type TestConvex } from 'convex-test'
import type {
  DataModelFromSchemaDefinition,
  FunctionReference,
  FunctionReturnType,
  GenericSchema,
  OptionalRestArgs,
  SchemaDefinition,
} from 'convex/server'
import type { ViteUserConfig as UserConfig } from 'vitest/config'

import type { Subject } from '../auth/index.js'
import { subject } from '../auth/subject.js'
import { getFunctionName } from '../convex/shared/convex-shared.js'
import type { AnyConvexFunction } from '../convex/shared/convex-shared.js'
import { createIdentityForwardingEnvelopeArgs } from '../identity-forwarding/shared.js'
import { registerObservationCaptureListener } from '../observability/capture.js'
import type { TrellisObservationEvent } from '../observability/index.js'

const defaultModules =
  typeof import.meta.glob === 'function' ? import.meta.glob('/convex/**/*.*s') : {}

type ConvexTestModules = Record<string, () => Promise<unknown>>

const GENERATED_SERVER_VIRTUAL_PREFIX = '\0trellis:generated-server:'

/**
 * Normalize a Convex module glob for Trellis testing helpers.
 *
 * This is an advanced testing surface intended for apps that want security- and
 * tenant-aware integration tests against real Convex handlers.
 */
export function createConvexTestModules(modules?: ConvexTestModules): ConvexTestModules {
  return withGeneratedModuleHint(modules ?? defaultModules)
}

/** The mock factory for `vi.mock('./_generated/server', convexServerMock)` in test setup files. */
export const convexServerMock = async () => {
  const server = await import('convex/server')
  return {
    query: server.queryGeneric,
    mutation: server.mutationGeneric,
    action: server.actionGeneric,
    internalQuery: server.internalQueryGeneric,
    internalMutation: server.internalMutationGeneric,
    internalAction: server.internalActionGeneric,
    httpAction: server.httpActionGeneric,
  }
}

/**
 * Replace relative `./_generated/server` imports with a virtual module during
 * tests so app code can keep using normal Convex imports without a per-project
 * `vi.mock(...)` stanza.
 */
function createGeneratedServerPlugin() {
  return {
    name: 'trellis-generated-server-mock',
    enforce: 'pre' as const,
    resolveId(source: string, importer?: string) {
      if (source === './_generated/server' || source.endsWith('/_generated/server')) {
        const resolved = importer ? resolve(dirname(importer), source) : source
        return `${GENERATED_SERVER_VIRTUAL_PREFIX}${resolved}`
      }

      return null
    },
    load(id: string) {
      if (!id.startsWith(GENERATED_SERVER_VIRTUAL_PREFIX)) return null

      return [
        'export {',
        '  queryGeneric as query,',
        '  mutationGeneric as mutation,',
        '  actionGeneric as action,',
        '  internalQueryGeneric as internalQuery,',
        '  internalMutationGeneric as internalMutation,',
        '  internalActionGeneric as internalAction,',
        '  httpActionGeneric as httpAction,',
        "} from 'convex/server'",
      ].join('\n')
    },
  }
}

function withGeneratedModuleHint(modules: ConvexTestModules): ConvexTestModules {
  if (
    Object.keys(modules).some(
      (path) => path.includes('/_generated/') || path.includes('./_generated/'),
    )
  ) {
    return modules
  }

  const firstPath = Object.keys(modules)[0]
  if (!firstPath) {
    return modules
  }

  const generatedPath = firstPath.startsWith('/convex/')
    ? '/convex/_generated/api.ts'
    : './_generated/api.ts'

  return {
    ...modules,
    [generatedPath]: async () => ({
      api: {},
      internal: {},
    }),
  }
}

type AnySchemaDefinition = SchemaDefinition<GenericSchema, boolean>
type DataModelFor<TSchema extends AnySchemaDefinition> = DataModelFromSchemaDefinition<TSchema>
type TableName<TSchema extends AnySchemaDefinition> = keyof DataModelFor<TSchema> & string
type DefaultTenantTable<TSchema extends AnySchemaDefinition> =
  Extract<'workspaces', TableName<TSchema>> extends never
    ? TableName<TSchema>
    : Extract<'workspaces', TableName<TSchema>>
type DefaultUserTable<TSchema extends AnySchemaDefinition> =
  Extract<'users', TableName<TSchema>> extends never
    ? TableName<TSchema>
    : Extract<'users', TableName<TSchema>>
type DocumentFor<
  TSchema extends AnySchemaDefinition,
  TTable extends TableName<TSchema>,
> = DataModelFor<TSchema>[TTable]['document']
type InsertDataFor<TSchema extends AnySchemaDefinition, TTable extends TableName<TSchema>> = Omit<
  DocumentFor<TSchema, TTable>,
  '_id' | '_creationTime'
>

type TestClient<TSchema extends AnySchemaDefinition> = Pick<
  TestConvex<TSchema>,
  'query' | 'mutation' | 'action'
>

type SeedTenantUserInput<TRole extends string> = {
  role: TRole
  authKey?: string
  displayName?: string
  email?: string
  [key: string]: unknown
}

type SeedTenantOptions<
  TRole extends string,
  TUsers extends Record<string, SeedTenantUserInput<TRole>> = Record<
    string,
    SeedTenantUserInput<TRole>
  >,
> = Record<string, unknown> & {
  name: string
  users: TUsers
}

type SeededTenantUser<
  TSchema extends AnySchemaDefinition,
  TRole extends string,
  TUserTable extends TableName<TSchema>,
> = TestClient<TSchema> & {
  id: DocumentFor<TSchema, TUserTable>['_id']
  authKey: string
  role: TRole
}

type SeededTenantUsers<
  TSchema extends AnySchemaDefinition,
  TRole extends string,
  TUserTable extends TableName<TSchema>,
  TUsers extends Record<string, SeedTenantUserInput<TRole>>,
> = {
  [K in keyof TUsers]: SeededTenantUser<TSchema, TUsers[K]['role'], TUserTable>
}

export type ConvexTestConfigOptions = UserConfig

export interface CreateTestContextOptions<
  TSchema extends AnySchemaDefinition,
  TTenantTable extends TableName<TSchema> = DefaultTenantTable<TSchema>,
  TUserTable extends TableName<TSchema> = DefaultUserTable<TSchema>,
> {
  schema: TSchema
  modules?: ConvexTestModules
  identityForwardingKey?: string
  /** Advanced override for non-canonical tenant schemas. Omit for the default `workspaces.workspaceId` model. */
  tenant?: {
    table?: TTenantTable
    field?: string
  }
  /** Advanced override for non-canonical user schemas. Omit for the default `users.authKey/role/workspaceId` model. */
  users?: {
    table?: TUserTable
    authField?: string
    roleField?: string
    tenantField?: string
    nameField?: string
    emailField?: string
  }
}

export interface TestContext<
  TSchema extends AnySchemaDefinition,
  TRole extends string = string,
  TTenantTable extends TableName<TSchema> = DefaultTenantTable<TSchema>,
  TUserTable extends TableName<TSchema> = DefaultUserTable<TSchema>,
> {
  raw: TestConvex<TSchema>
  seed: <TTable extends TableName<TSchema>>(
    table: TTable,
    data: InsertDataFor<TSchema, TTable>,
  ) => Promise<DocumentFor<TSchema, TTable>['_id']>
  readAll: <TTable extends TableName<TSchema>>(
    table: TTable,
  ) => Promise<Array<DocumentFor<TSchema, TTable>>>
  seedTenant: <TUsers extends Record<string, SeedTenantUserInput<TRole>>>(
    options: SeedTenantOptions<TRole, TUsers>,
  ) => Promise<{
    id: DocumentFor<TSchema, TTenantTable>['_id']
    users: SeededTenantUsers<TSchema, TRole, TUserTable, TUsers>
  }>
  asCaller: (caller: Record<string, unknown>) => TestClient<TSchema>
}

const DEFAULT_CONVEX_TEST_TSCONFIG = {
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    strict: true,
    skipLibCheck: true,
    esModuleInterop: true,
    resolveJsonModule: true,
    types: ['node', 'vite/client'],
  },
} as const

function mergeInlineDeps(config: UserConfig): UserConfig {
  const existingInline = Array.isArray(config.test?.server?.deps?.inline)
    ? config.test.server.deps.inline
    : []
  return {
    ...config,
    test: {
      environment: 'edge-runtime',
      ...config.test,
      server: {
        ...config.test?.server,
        deps: {
          ...config.test?.server?.deps,
          inline: [...existingInline, /convex/],
        },
      },
    },
  }
}

function mergeStableTestTsconfig(config: UserConfig): UserConfig {
  const esbuildConfig =
    config.esbuild && typeof config.esbuild === 'object' ? config.esbuild : undefined

  const existingRaw =
    esbuildConfig?.tsconfigRaw && typeof esbuildConfig.tsconfigRaw === 'object'
      ? esbuildConfig.tsconfigRaw
      : {}

  const existingCompilerOptions =
    'compilerOptions' in existingRaw &&
    existingRaw.compilerOptions &&
    typeof existingRaw.compilerOptions === 'object'
      ? existingRaw.compilerOptions
      : {}

  return {
    ...config,
    esbuild: {
      ...(esbuildConfig ?? {}),
      tsconfigRaw: {
        ...DEFAULT_CONVEX_TEST_TSCONFIG,
        ...existingRaw,
        compilerOptions: {
          ...DEFAULT_CONVEX_TEST_TSCONFIG.compilerOptions,
          ...existingCompilerOptions,
        },
      },
    },
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function createPrincipalClient<TSchema extends AnySchemaDefinition>(
  raw: TestConvex<TSchema>,
  caller: Record<string, unknown>,
  identityForwardingKey?: string,
): TestClient<TSchema> {
  const effectiveIdentityForwardingKey =
    identityForwardingKey?.trim() || process.env.CONVEX_IDENTITY_FORWARDING_KEY

  if (!effectiveIdentityForwardingKey) {
    throw new Error(
      'ctx.asCaller(...) requires createTestContext({ identityForwardingKey }) or CONVEX_IDENTITY_FORWARDING_KEY.',
    )
  }

  const principalSubject = resolveIdentityForwardingSubject(caller)

  function withPrincipalArgs<TKind extends 'query' | 'mutation' | 'action'>(
    kind: TKind,
    fn: FunctionReference<TKind>,
    args: Record<string, unknown> | undefined,
    principalMode: 'plain' | 'trusted',
  ) {
    if (principalMode === 'trusted') {
      return createIdentityForwardingEnvelopeArgs({
        args,
        caller: {
          ...caller,
          subject: principalSubject,
        },
        functionRef: getFunctionName(fn as unknown as AnyConvexFunction),
        operation: kind,
        key: effectiveIdentityForwardingKey,
        transport: 'server',
      })
    }

    return {
      ...(args ?? {}),
      caller,
    }
  }

  function shouldRetryWithoutTrustedTransport(error: unknown): boolean {
    if (!(error instanceof Error)) return false

    return error.message.includes('Unexpected field `_trellisForwarding` in object')
  }

  async function callWithCaller<
    TKind extends 'query' | 'mutation' | 'action',
    TFn extends FunctionReference<TKind>,
  >(kind: TKind, fn: TFn, args: OptionalRestArgs<TFn>[0]): Promise<FunctionReturnType<TFn>> {
    const caller = raw[kind] as unknown as (
      ref: TFn,
      callArgs?: OptionalRestArgs<TFn>[0],
    ) => Promise<FunctionReturnType<TFn>>

    const trustedPayload = withPrincipalArgs(
      kind,
      fn,
      args as Record<string, unknown> | undefined,
      'trusted',
    )

    try {
      return await caller(fn, trustedPayload as OptionalRestArgs<TFn>[0])
    } catch (error) {
      if (!shouldRetryWithoutTrustedTransport(error)) {
        throw error
      }

      const plainPayload = withPrincipalArgs(
        kind,
        fn,
        args as Record<string, unknown> | undefined,
        'plain',
      )
      return await caller(fn, plainPayload as OptionalRestArgs<TFn>[0])
    }
  }

  const client = {
    query: async <Query extends FunctionReference<'query'>>(
      fn: Query,
      ...args: OptionalRestArgs<Query>
    ): Promise<FunctionReturnType<Query>> => {
      return await callWithCaller('query', fn, args[0])
    },
    mutation: async <Mutation extends FunctionReference<'mutation'>>(
      fn: Mutation,
      ...args: OptionalRestArgs<Mutation>
    ): Promise<FunctionReturnType<Mutation>> => {
      return await callWithCaller('mutation', fn, args[0])
    },
    action: async <Action extends FunctionReference<'action'>>(
      fn: Action,
      ...args: OptionalRestArgs<Action>
    ): Promise<FunctionReturnType<Action>> => {
      return await callWithCaller('action', fn, args[0])
    },
  }

  return client as unknown as TestClient<TSchema>
}

function resolveIdentityForwardingSubject(caller: Record<string, unknown>): Subject {
  if (typeof caller.subject === 'string' && caller.subject) {
    return caller.subject as Subject
  }

  if (typeof caller.userId === 'string' && caller.userId) {
    return subject.user(caller.userId)
  }

  if (typeof caller.authKey === 'string' && caller.authKey) {
    return subject.auth(caller.authKey)
  }

  if (typeof caller.agentId === 'string' && caller.agentId) {
    return subject.agent(caller.agentId)
  }

  if (typeof caller.serviceId === 'string' && caller.serviceId) {
    return subject.service(caller.serviceId)
  }

  if (typeof caller.kind === 'string' && caller.kind) {
    return subject.agent(caller.kind)
  }

  return subject.agent('identity-forwarding-test')
}

export function convexTestConfig(options: ConvexTestConfigOptions = {}): UserConfig {
  const plugins = Array.isArray(options.plugins)
    ? options.plugins
    : options.plugins
      ? [options.plugins]
      : []

  return mergeInlineDeps(
    mergeStableTestTsconfig({
      ...options,
      plugins: [createGeneratedServerPlugin(), ...plugins],
    }),
  )
}

/**
 * Create a high-level test harness for protected Trellis apps.
 *
 * Use this when your tests should seed tenants and users, execute the real
 * protected handlers, and assert authorization boundaries without inventing a
 * duplicate test-only permission model.
 */
export function createTestContext<
  TSchema extends AnySchemaDefinition,
  TRole extends string = string,
  TTenantTable extends TableName<TSchema> = DefaultTenantTable<TSchema>,
  TUserTable extends TableName<TSchema> = DefaultUserTable<TSchema>,
>(
  options: CreateTestContextOptions<TSchema, TTenantTable, TUserTable>,
): TestContext<TSchema, TRole, TTenantTable, TUserTable> {
  const modules = withGeneratedModuleHint(options.modules ?? defaultModules)
  const raw = convexTest(options.schema, modules) as unknown as TestConvex<TSchema>
  if (options.identityForwardingKey) {
    process.env.CONVEX_IDENTITY_FORWARDING_KEY = options.identityForwardingKey
  }
  const identityForwardingKey =
    options.identityForwardingKey ?? process.env.CONVEX_IDENTITY_FORWARDING_KEY

  const tenantTable = (options.tenant?.table ?? 'workspaces') as TTenantTable
  const tenantField = options.tenant?.field ?? 'workspaceId'
  const userTable = (options.users?.table ?? 'users') as TUserTable
  const authField = options.users?.authField ?? 'authKey'
  const roleField = options.users?.roleField ?? 'role'
  const userTenantField = options.users?.tenantField ?? tenantField
  const nameField = options.users?.nameField ?? 'displayName'
  const emailField = options.users?.emailField ?? 'email'

  async function seed<TTable extends TableName<TSchema>>(
    table: TTable,
    data: InsertDataFor<TSchema, TTable>,
  ): Promise<DocumentFor<TSchema, TTable>['_id']> {
    return await raw.run(async (ctx) => {
      return await ctx.db.insert(table, data as never)
    })
  }

  async function readAll<TTable extends TableName<TSchema>>(
    table: TTable,
  ): Promise<Array<DocumentFor<TSchema, TTable>>> {
    return await raw.run(async (ctx) => {
      return (await ctx.db.query(table).collect()) as Array<DocumentFor<TSchema, TTable>>
    })
  }

  async function seedTenant<TUsers extends Record<string, SeedTenantUserInput<TRole>>>(
    seedOptions: SeedTenantOptions<TRole, TUsers>,
  ): Promise<{
    id: DocumentFor<TSchema, TTenantTable>['_id']
    users: SeededTenantUsers<TSchema, TRole, TUserTable, TUsers>
  }> {
    const { name, users, ...tenantData } = seedOptions
    const slug = slugify(name) || 'tenant'
    const entries = Object.entries(users) as Array<[keyof TUsers & string, TUsers[keyof TUsers]]>
    const now = Date.now()

    const seededUsers = {} as SeededTenantUsers<TSchema, TRole, TUserTable, TUsers>
    let ownerUserId: DocumentFor<TSchema, TUserTable>['_id'] | null = null

    for (const [key, user] of entries) {
      const { role, authKey, displayName, email, ...userData } = user
      const resolvedAuthKey = authKey ?? `${slug}-${key}`
      const resolvedDisplayName = displayName ?? key.replace(/[-_]/g, ' ')
      const resolvedEmail = email ?? `${slug}-${key}@example.test`

      const userId = await raw.run(async (ctx) => {
        return await ctx.db.insert(userTable, {
          [authField]: resolvedAuthKey,
          [roleField]: role,
          [nameField]: resolvedDisplayName,
          [emailField]: resolvedEmail,
          createdAt: now,
          updatedAt: now,
          ...userData,
        } as never)
      })

      const caller = raw.withIdentity({
        subject: resolvedAuthKey,
        tokenIdentifier: resolvedAuthKey,
      } as never)
      seededUsers[key] = {
        id: userId,
        authKey: resolvedAuthKey,
        role,
        query: caller.query,
        mutation: caller.mutation,
        action: caller.action,
      }

      if (!ownerUserId && (role === 'owner' || entries.length === 1)) {
        ownerUserId = userId
      }
    }

    ownerUserId ??= Object.values(seededUsers)[0]?.id ?? null

    if (!ownerUserId) {
      throw new Error('seedTenant requires at least one user.')
    }

    const id = await raw.run(async (ctx) => {
      return await ctx.db.insert(tenantTable, {
        name,
        slug,
        ownerId: ownerUserId,
        createdAt: now,
        updatedAt: now,
        ...tenantData,
      } as never)
    })

    for (const user of Object.values(seededUsers)) {
      await raw.run(async (ctx) => {
        await ctx.db.patch(
          user.id as never,
          {
            [userTenantField]: id,
          } as never,
        )
      })
    }

    return {
      id,
      users: seededUsers,
    }
  }

  function asCaller(caller: Record<string, unknown>): TestClient<TSchema> {
    return createPrincipalClient(raw, caller, identityForwardingKey)
  }

  return {
    raw,
    seed,
    readAll,
    seedTenant,
    asCaller,
  }
}

export function createObservationCapture() {
  const events: TrellisObservationEvent[] = []
  const stop = registerObservationCaptureListener((event: TrellisObservationEvent) => {
    events.push(event)
  })

  return {
    events,
    clear() {
      events.length = 0
    },
    stop,
    find(name: TrellisObservationEvent['name']) {
      return events.filter((event) => event.name === name)
    },
  }
}
