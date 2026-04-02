/// <reference types="vite/client" />

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

export function createConvexTestModules(
  modules?: ConvexTestModules,
): ConvexTestModules {
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

function withGeneratedModuleHint(
  modules: ConvexTestModules,
): ConvexTestModules {
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
  asTrustedCaller: (actor: { userId: string }) => TestClient<TSchema>
}

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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function createTrustedCallerClient<TSchema extends AnySchemaDefinition>(
  raw: TestConvex<TSchema>,
  trustedCallerKey: string,
  actor: { userId: string },
): TestClient<TSchema> {
  function withTrustedCallerArgs<TArgs extends Record<string, unknown> | undefined>(args: TArgs) {
    return {
      ...(args ?? {}),
      _trustedCallerKey: trustedCallerKey,
      _trustedCaller: {
        userId: actor.userId,
      },
    }
  }

  return {
    query: async <Query extends FunctionReference<'query'>>(
      fn: Query,
      ...args: OptionalRestArgs<Query>
    ): Promise<FunctionReturnType<Query>> => {
      const payload = withTrustedCallerArgs(args[0] as Record<string, unknown> | undefined)
      return await raw.query(fn, payload as OptionalRestArgs<Query>[0])
    },
    mutation: async <Mutation extends FunctionReference<'mutation'>>(
      fn: Mutation,
      ...args: OptionalRestArgs<Mutation>
    ): Promise<FunctionReturnType<Mutation>> => {
      const payload = withTrustedCallerArgs(args[0] as Record<string, unknown> | undefined)
      return await raw.mutation(fn, payload as OptionalRestArgs<Mutation>[0])
    },
    action: async <Action extends FunctionReference<'action'>>(
      fn: Action,
      ...args: OptionalRestArgs<Action>
    ): Promise<FunctionReturnType<Action>> => {
      const payload = withTrustedCallerArgs(args[0] as Record<string, unknown> | undefined)
      return await raw.action(fn, payload as OptionalRestArgs<Action>[0])
    },
  }
}

export function convexTestConfig(options: ConvexTestConfigOptions = {}): UserConfig {
  return mergeInlineDeps(options)
}

export function createTestContext<
  TSchema extends AnySchemaDefinition,
  TRole extends string = string,
>(options: CreateTestContextOptions<TSchema>): TestContext<TSchema, TRole> {
  const modules = withGeneratedModuleHint(options.modules ?? defaultModules)
  const raw = convexTest(options.schema, modules) as unknown as TestConvex<TSchema>
  const trustedCallerKey =
    options.trustedCallerKey ?? process.env.CONVEX_TRUSTED_CALLER_KEY ?? 'test-trusted-caller-key'
  process.env.CONVEX_TRUSTED_CALLER_KEY = trustedCallerKey

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

  function asTrustedCaller(actor: { userId: string }): TestClient<TSchema> {
    return createTrustedCallerClient(raw, trustedCallerKey, actor)
  }

  return {
    raw,
    seed,
    readAll,
    seedTenant,
    asTrustedCaller,
  }
}
