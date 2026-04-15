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
        "export {",
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
  authId?: string
  displayName?: string
  email?: string
  [key: string]: unknown
}

type SeedTenantOptions<TRole extends string> = Record<string, unknown> & {
  name: string
  users: Record<string, SeedTenantUserInput<TRole>>
}

type SeededTenantUser<
  TSchema extends AnySchemaDefinition,
  TRole extends string,
> = TestClient<TSchema> & {
  id: string
  authId: string
  role: TRole
}

export type ConvexTestConfigOptions = UserConfig

export interface CreateTestContextOptions<TSchema extends AnySchemaDefinition> {
  schema: TSchema
  modules?: ConvexTestModules
  trustedCallerKey?: string
  /** Advanced override for non-canonical tenant schemas. Omit for the default `workspaces.workspaceId` model. */
  tenant?: {
    table?: string
    field?: string
  }
  /** Advanced override for non-canonical user schemas. Omit for the default `users.authId/role/workspaceId` model. */
  users?: {
    table?: string
    authField?: string
    roleField?: string
    tenantField?: string
    nameField?: string
    emailField?: string
  }
}

export interface TestContext<TSchema extends AnySchemaDefinition, TRole extends string = string> {
  raw: TestConvex<TSchema>
  seed: <TTable extends TableName<TSchema>>(
    table: TTable,
    data: InsertDataFor<TSchema, TTable>,
  ) => Promise<DocumentFor<TSchema, TTable>['_id']>
  readAll: <TTable extends TableName<TSchema>>(
    table: TTable,
  ) => Promise<Array<DocumentFor<TSchema, TTable>>>
  seedTenant: (options: SeedTenantOptions<TRole>) => Promise<{
    id: string
    users: Record<string, SeededTenantUser<TSchema, TRole>>
  }>
  asPrincipal: (principal: Record<string, unknown>) => TestClient<TSchema>
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
  principal: Record<string, unknown>,
): TestClient<TSchema> {
  function withPrincipalArgs<TArgs extends Record<string, unknown> | undefined>(args: TArgs) {
    return {
      ...(args ?? {}),
      principal,
    }
  }

  const client = {
    query: async <Query extends FunctionReference<'query'>>(
      fn: Query,
      ...args: OptionalRestArgs<Query>
    ): Promise<FunctionReturnType<Query>> => {
      const payload = withPrincipalArgs(args[0] as Record<string, unknown> | undefined)
      const query = raw.query as unknown as (
        ref: Query,
        args?: OptionalRestArgs<Query>[0],
      ) => Promise<FunctionReturnType<Query>>
      return await query(fn, payload as OptionalRestArgs<Query>[0])
    },
    mutation: async <Mutation extends FunctionReference<'mutation'>>(
      fn: Mutation,
      ...args: OptionalRestArgs<Mutation>
    ): Promise<FunctionReturnType<Mutation>> => {
      const payload = withPrincipalArgs(args[0] as Record<string, unknown> | undefined)
      const mutation = raw.mutation as unknown as (
        ref: Mutation,
        args?: OptionalRestArgs<Mutation>[0],
      ) => Promise<FunctionReturnType<Mutation>>
      return await mutation(fn, payload as OptionalRestArgs<Mutation>[0])
    },
    action: async <Action extends FunctionReference<'action'>>(
      fn: Action,
      ...args: OptionalRestArgs<Action>
    ): Promise<FunctionReturnType<Action>> => {
      const payload = withPrincipalArgs(args[0] as Record<string, unknown> | undefined)
      const action = raw.action as unknown as (
        ref: Action,
        args?: OptionalRestArgs<Action>[0],
      ) => Promise<FunctionReturnType<Action>>
      return await action(fn, payload as OptionalRestArgs<Action>[0])
    },
  }

  return client as unknown as TestClient<TSchema>
}

export function convexTestConfig(options: ConvexTestConfigOptions = {}): UserConfig {
  const plugins = Array.isArray(options.plugins) ? options.plugins : options.plugins ? [options.plugins] : []

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
>(options: CreateTestContextOptions<TSchema>): TestContext<TSchema, TRole> {
  const modules = withGeneratedModuleHint(options.modules ?? defaultModules)
  const raw = convexTest(options.schema, modules) as unknown as TestConvex<TSchema>
  if (options.trustedCallerKey) {
    process.env.CONVEX_TRUSTED_CALLER_KEY = options.trustedCallerKey
  }

  const tenantTable = options.tenant?.table ?? 'workspaces'
  const tenantField = options.tenant?.field ?? 'workspaceId'
  const userTable = options.users?.table ?? 'users'
  const authField = options.users?.authField ?? 'authId'
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

  async function seedTenant(seedOptions: SeedTenantOptions<TRole>): Promise<{
    id: string
    users: Record<string, SeededTenantUser<TSchema, TRole>>
  }> {
    const { name, users, ...tenantData } = seedOptions
    const slug = slugify(name) || 'tenant'
    const entries = Object.entries(users)
    const ownerEntry = entries.find(([, user]) => user.role === 'owner') ?? entries[0]
    const ownerAuthId = ownerEntry?.[1].authId ?? `${slug}-${ownerEntry?.[0] ?? 'owner'}`
    const now = Date.now()

    const id = await raw.run(async (ctx) => {
      return await ctx.db.insert(
        tenantTable as TableName<TSchema>,
        {
          name,
          slug,
          ownerId: ownerAuthId,
          createdAt: now,
          updatedAt: now,
          ...tenantData,
        } as never,
      )
    })

    const seededUsers = {} as Record<string, SeededTenantUser<TSchema, TRole>>

    for (const [key, user] of entries) {
      const { role, authId, displayName, email, ...userData } = user
      const resolvedAuthId = authId ?? `${slug}-${key}`
      const resolvedDisplayName = displayName ?? key.replace(/[-_]/g, ' ')
      const resolvedEmail = email ?? `${slug}-${key}@example.test`

      const userId = await raw.run(async (ctx) => {
        return await ctx.db.insert(
          userTable as TableName<TSchema>,
          {
            [authField]: resolvedAuthId,
            [roleField]: role,
            [userTenantField]: id,
            [nameField]: resolvedDisplayName,
            [emailField]: resolvedEmail,
            createdAt: now,
            updatedAt: now,
            ...userData,
          } as never,
        )
      })

      const caller = raw.withIdentity({ subject: resolvedAuthId })
      seededUsers[key] = {
        id: userId,
        authId: resolvedAuthId,
        role,
        query: caller.query,
        mutation: caller.mutation,
        action: caller.action,
      }
    }

    return {
      id,
      users: seededUsers,
    }
  }

  function asPrincipal(principal: Record<string, unknown>): TestClient<TSchema> {
    return createPrincipalClient(raw, principal)
  }

  return {
    raw,
    seed,
    readAll,
    seedTenant,
    asPrincipal,
  }
}
