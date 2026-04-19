import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'

import { buildResourceTemplateSet } from './resource.js'

export type AppTemplate = 'personal' | 'workspace' | 'workspace-mcp' | 'cms'

export interface TemplateFile {
  path: string
  content: string
  ownership: 'authored' | 'generated'
}

export interface InitTemplateSet {
  label: string
  description: string
  files: TemplateFile[]
  afterWrite?: (cwd: string) => Promise<void>
}

export type CanonicalAppTemplate = 'personal' | 'workspace' | 'cms'
export type AddFeature = 'mcp' | 'uploads' | 'operation' | 'resource'

function authTsTemplate() {
  return `
import { defineAuth } from '@lupinum/trellis/auth'

import { components, internal } from './_generated/api'
import { mutation } from './_generated/server'
import authConfig from './auth.config'

export const { authComponent, createAuth, createUserIfNeeded } = defineAuth(
  { components, internal, mutation, authConfig },
  {
    emailPassword: true,
    // oauth: ['github', 'google'],
  },
)

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi()
`.trimStart()
}

function authConfigTemplate() {
  return `
import { getAuthConfigProvider } from '@convex-dev/better-auth/auth-config'
import type { AuthConfig } from 'convex/server'

export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig
`.trimStart()
}

function httpTemplate() {
  return `
import { httpRouter } from 'convex/server'

import { authComponent, createAuth } from './auth'

const http = httpRouter()

authComponent.registerRoutes(http, createAuth)

export default http
`.trimStart()
}

function convexConfigTemplate() {
  return `
import { defineApp } from 'convex/server'
import betterAuth from '@convex-dev/better-auth/convex.config'

const app = defineApp()

app.use(betterAuth, { name: 'betterAuth' })

export default app
`.trimStart()
}

function testSetupTemplate() {
  return `
/// <reference types="vite/client" />

import { createConvexTestModules } from '@lupinum/trellis/testing'

export const modules = createConvexTestModules(import.meta.glob('./**/*.ts', {
  eager: false,
}))
`.trimStart()
}

function personalActorTemplate() {
  return `
import { getAuth, type DefaultActor } from '@lupinum/trellis/auth'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel } from '../_generated/dataModel'

type PersonalCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export type Actor = DefaultActor | null

function missingUserRowMessage(authId: string): string {
  return [
    \`Expected a Trellis users row for auth subject "\${authId}", but none was found.\`,
    'Ensure convex/auth.ts exports onCreate, onUpdate, and onDelete from authComponent.triggersApi().',
    'If the auth wiring is already correct, ensure auth:createUserIfNeeded has run for this user.',
  ].join(' ')
}

export async function getActor(ctx: PersonalCtx): Promise<Actor> {
  const auth = await getAuth(ctx)
  if (!auth) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', auth.subject))
    .first()

  if (!user) {
    throw new Error(missingUserRowMessage(auth.subject))
  }

  return {
    kind: 'user',
    userId: user.authId,
    role: typeof user.role === 'string' ? user.role : 'member',
    ...(user.workspaceId ? { tenantId: String(user.workspaceId) } : {}),
  }
}
`.trimStart()
}

function personalChecksTemplate() {
  return `
import { defineGuard } from '@lupinum/trellis/auth'

import type { Actor } from './actor'

export const isAuthenticated = defineGuard<Actor>('authenticated', (actor) => actor !== null)

export const isOwnerOf = (resource: { ownerId: string }) =>
  defineGuard<Actor>(\`owner:\${resource.ownerId}\`, (actor) =>
    !!actor && actor.kind === 'user' && actor.userId === resource.ownerId
  )
`.trimStart()
}

function personalFunctionsTemplate() {
  return `
import { defineTrellis } from '@lupinum/trellis/functions'

import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import { getActor } from './auth/actor'

export const { mutation, query, raw } = defineTrellis(
  { query: generatedQuery, mutation: generatedMutation },
  {
    actor: getActor,
  },
)
`.trimStart()
}

function personalPermissionQueryTemplate() {
  return `
import { definePermissionContext } from '@lupinum/trellis/auth'

import { personalPermissions } from '../auth/permissions'
import { getActor } from '../auth/actor'
import { query } from '../functions'

export const getPermissionContext = query(
  definePermissionContext({
    resolve: getActor,
    permissions: personalPermissions,
  }),
)
`.trimStart()
}

function personalPermissionsTemplate() {
  return `
import { definePermission } from '@lupinum/trellis/auth'

import { isAuthenticated } from './checks'

export const profileRead = definePermission({
  key: 'profile.read',
  check: isAuthenticated,
})

export const todoCreate = definePermission({
  key: 'todo.create',
  check: isAuthenticated,
})

export const personalPermissions = [profileRead, todoCreate] as const
`.trimStart()
}

function workspaceActorTemplate() {
  return `
import { getAuth, type DefaultActor } from '@lupinum/trellis/auth'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel, Id } from '../_generated/dataModel'
import type { Role, WorkspacePrincipal } from './principal'

type WorkspaceCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export type Actor = DefaultActor & {
  role: Role
  tenantId: Id<'workspaces'>
}

export type PermissionActor = DefaultActor & {
  role: Role
  tenantId?: Id<'workspaces'>
}

async function loadActorByAuthId(ctx: WorkspaceCtx, authId: string): Promise<PermissionActor | null> {
  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', (q) => q.eq('authId', authId))
    .first()

  if (!user) return null

  return {
    kind: 'user',
    userId: user.authId,
    role: (user.role ?? 'viewer') as Role,
    tenantId: user.workspaceId as Id<'workspaces'> | undefined,
  }
}

function missingUserRowMessage(authId: string): string {
  return [
    \`Expected a Trellis users row for auth subject "\${authId}", but none was found.\`,
    'Ensure convex/auth.ts exports onCreate, onUpdate, and onDelete from authComponent.triggersApi().',
    'If the auth wiring is already correct, ensure auth:createUserIfNeeded has run for this user.',
  ].join(' ')
}

function requirePermissionActor(
  authId: string,
  actor: PermissionActor | null,
): PermissionActor {
  if (actor) return actor
  throw new Error(missingUserRowMessage(authId))
}

export async function getActorFromPrincipal(
  ctx: WorkspaceCtx,
  _args: Record<string, unknown>,
  principal: WorkspacePrincipal,
): Promise<Actor | null> {
  switch (principal.kind) {
    case 'anonymous':
      return null
    case 'agent':
      return principal.tenantId
        ? {
            kind: 'user',
            userId: principal.userId,
            role: principal.role,
            tenantId: principal.tenantId,
          }
        : null
    case 'user': {
      const actor = requirePermissionActor(principal.userId, await loadActorByAuthId(ctx, principal.userId))
      return actor?.tenantId ? { ...actor, tenantId: actor.tenantId } : null
    }
  }
}

export async function getPermissionActor(ctx: WorkspaceCtx): Promise<PermissionActor | null> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  return requirePermissionActor(auth.subject, await loadActorByAuthId(ctx, auth.subject))
}

export async function getActor(ctx: WorkspaceCtx): Promise<Actor | null> {
  const actor = await getPermissionActor(ctx)
  return actor?.tenantId ? { ...actor, tenantId: actor.tenantId } : null
}
`.trimStart()
}

function workspacePrincipalTemplate() {
  return `
import { getAuth } from '@lupinum/trellis/auth'
import { defineDelegation, definePrincipal } from '@lupinum/trellis/functions'
import {
  getForwardedDelegation,
  getForwardedPrincipal,
} from '@lupinum/trellis/trusted-forwarding'
import { v } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel'

export type Role = Doc<'users'>['role']

export type WorkspacePrincipal =
  | { kind: 'anonymous'; subject: 'system:anonymous' }
  | { kind: 'user'; userId: string; subject: \`user:\${string}\` }
  | {
      kind: 'agent'
      agentId: string
      subject: \`agent:\${string}\`
      role: Role
      tenantId?: Id<'workspaces'>
      provider?: 'mcp'
    }

export const workspacePrincipalValidator = v.union(
  v.object({
    kind: v.literal('anonymous'),
    subject: v.literal('system:anonymous'),
  }),
  v.object({
    kind: v.literal('user'),
    userId: v.string(),
    subject: v.string(),
  }),
  v.object({
    kind: v.literal('agent'),
    agentId: v.string(),
    subject: v.string(),
    role: v.union(
      v.literal('owner'),
      v.literal('admin'),
      v.literal('member'),
      v.literal('viewer'),
    ),
    tenantId: v.optional(v.id('workspaces')),
    provider: v.optional(v.literal('mcp')),
  }),
)

export const principal = definePrincipal({
  validator: workspacePrincipalValidator,
  resolve: async (ctx, args): Promise<WorkspacePrincipal> => {
    const forwarded = getForwardedPrincipal<WorkspacePrincipal>(ctx, args)
    if (forwarded) return forwarded

    const auth = await getAuth(ctx)
    if (!auth) {
      return { kind: 'anonymous', subject: 'system:anonymous' }
    }

    return {
      kind: 'user',
      userId: auth.subject,
      subject: \`user:\${auth.subject}\`,
    }
  },
})

export const delegation = defineDelegation({
  validator: v.object({
    subject: v.string(),
    reason: v.optional(v.string()),
    grantedBy: v.optional(v.string()),
  }),
  resolve: async (ctx, args) => getForwardedDelegation(ctx, args),
})
`.trimStart()
}

function workspaceFunctionsTemplate() {
  return `
import { defineTrellis } from '@lupinum/trellis/functions'

import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import { getActorFromPrincipal } from './auth/actor'
import { delegation } from './auth/principal'
import { principal } from './auth/principal'

export const { mutation, query, raw } = defineTrellis(
  { query: generatedQuery, mutation: generatedMutation },
  {
    principal,
    delegation,
    actor: getActorFromPrincipal,
    // Add tenantIsolation only for tables that actually store the tenant field.
    // Example:
    // tenantIsolation: {
    //   tables: ['todos'],
    // },
  },
)
`.trimStart()
}

function workspaceChecksTemplate() {
  return `
import { defineGuard } from '@lupinum/trellis/auth'

import type { PermissionActor } from './actor'
import type { Role } from './principal'

export const isAuthenticated = defineGuard<PermissionActor>(
  'authenticated',
  (actor) => actor !== null,
)

export const hasWorkspace = defineGuard<PermissionActor>(
  'workspace-member',
  (actor) => !!actor?.tenantId,
)

export const hasMinimumRole = (minimum: Role) =>
  defineGuard<PermissionActor>(\`role>=\${minimum}\`, (actor) => {
    if (!actor?.tenantId) return false

    const ranks: Record<Role, number> = {
      owner: 4,
      admin: 3,
      member: 2,
      viewer: 1,
    }

    return ranks[actor.role] >= ranks[minimum]
  })

export const isWorkspaceMember = (tenantId: string) =>
  defineGuard<PermissionActor>(
    \`workspace:\${tenantId}\`,
    (actor) => !!actor?.tenantId && actor.tenantId === tenantId,
  )

export const canManageWorkspace = defineGuard<PermissionActor>(
  'manage-workspace',
  hasWorkspace.and(hasMinimumRole('admin')),
)
`.trimStart()
}

function workspacePermissionQueryTemplate() {
  return `
import { definePermissionContext } from '@lupinum/trellis/auth'

import { workspacePermissions } from '../auth/permissions'
import { getPermissionActor } from '../auth/actor'
import { query } from '../functions'

export const getPermissionContext = query(
  definePermissionContext({
    resolve: getPermissionActor,
    permissions: workspacePermissions,
  }),
)
`.trimStart()
}

function workspacePermissionsTemplate() {
  return `
import { definePermission } from '@lupinum/trellis/auth'

import { hasMinimumRole, hasWorkspace, isAuthenticated } from './checks'

export const workspaceRead = definePermission({
  key: 'workspace.read',
  check: isAuthenticated,
})

export const workspaceMembers = definePermission({
  key: 'workspace.members',
  check: hasWorkspace.and(hasMinimumRole('admin')),
})

export const todoCreate = definePermission({
  key: 'todo.create',
  check: hasWorkspace.and(hasMinimumRole('member')),
})

export const workspacePermissions = [workspaceRead, workspaceMembers, todoCreate] as const
`.trimStart()
}

function mcpMiddlewareTemplate() {
  return `
import { createHash } from 'node:crypto'

import { defineEventHandler, getHeader, createError } from 'h3'

import { api } from '#trellis/api'
import { serverConvexQuery } from '@lupinum/trellis/server'

export default defineEventHandler(async (event) => {
  const header = getHeader(event, 'authorization')
  if (!header?.startsWith('Bearer ')) {
    return
  }

  const token = header.slice('Bearer '.length).trim()
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Missing MCP bearer token.' })
  }

  const hash = createHash('sha256').update(token).digest('hex')
  const key = await serverConvexQuery(api.domain.mcpKeys.validate, { hash }, { auth: 'none' })
  if (!key) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid MCP bearer token.' })
  }

  event.context.mcpAuth = key
})
`.trimStart()
}

function mcpRuntimeTemplate() {
  return `
import { api } from '#trellis/api'
import { defineMcpApp } from '@lupinum/trellis/mcp'
import { createServerConvexCaller } from '@lupinum/trellis/server'
import type { H3Event } from 'h3'

import type { Id } from '~/convex/_generated/dataModel'
import { todoCreate, workspaceRead } from '~/convex/auth/permissions'
import type { WorkspacePrincipal } from '~/convex/auth/principal'

type McpAuthContext = {
  userId?: string
  role?: 'owner' | 'admin' | 'member' | 'viewer'
  tenantId?: string
}

function getMcpPrincipal(event: H3Event): WorkspacePrincipal {
  const auth = event.context.mcpAuth as McpAuthContext | undefined
  if (!auth?.userId || !auth.role) {
    return { kind: 'anonymous', subject: 'system:anonymous' }
  }

  return {
    kind: 'agent',
    agentId: auth.userId,
    subject: \`agent:\${auth.userId}\`,
    role: auth.role,
    tenantId: auth.tenantId as Id<'workspaces'> | undefined,
    provider: 'mcp',
  }
}

export const mcpRuntime = defineMcpApp<WorkspacePrincipal>({
  callConvex: async (event, { principal, delegation }) =>
    createServerConvexCaller(
      event,
      principal.kind === 'agent'
        ? {
            auth: 'trusted',
            principal,
            delegation,
          }
        : { auth: 'none' },
    ),
  resolvePrincipal: async (event) => getMcpPrincipal(event),
  resolveDelegation: async ({ event }) => {
    const auth = event.context.mcpAuth as McpAuthContext | undefined
    return auth?.userId
      ? {
          subject: \`user:\${auth.userId}\`,
          reason: 'user-approved MCP session',
        }
      : null
  },
  resolveCapabilities: async ({ principal, convex }) =>
    principal.kind === 'agent'
      ? ((await convex.query(api.permissions.context.getPermissionContext, {}))?.can ?? {
          [workspaceRead.key]: false,
          [todoCreate.key]: false,
        })
      : {
          [workspaceRead.key]: false,
          [todoCreate.key]: false,
        },
  principalKey: (principal) =>
    principal.kind === 'agent' ? \`\${principal.userId}:\${principal.tenantId ?? 'none'}\` : principal.kind,
})

// Project root internal refs or bridge refs from tool files.
export const tool = mcpRuntime.tool
`.trimStart()
}

function nuxtConfigTemplate(options: {
  permissionsQuery: string
  mcp?: boolean
  mcpName?: string
}) {
  return `
export default defineNuxtConfig({
  modules: ['@lupinum/trellis'],
  trellis: {
    url: process.env.CONVEX_URL,
    auth: true,
    permissions: '${options.permissionsQuery}',
${options.mcp ? `    mcp: { name: '${options.mcpName ?? 'starter-app'}', sessions: true },` : ''}
  },
})
`.trimStart()
}

function sharedTodoSchemaTemplate(kind: 'personal' | 'workspace') {
  return `
import { defineArgs } from '@lupinum/trellis/args'
import { v } from 'convex/values'

export const createTodo = defineArgs({
  description: '${kind === 'personal' ? 'Create a personal todo' : 'Create a workspace todo'}',
  args: {
    title: v.string(),
  },
})

export const listTodos = defineArgs({
  description: 'List the current todo collection',
  args: {},
})
`.trimStart()
}

function personalSchemaTemplate() {
  return `
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  users: defineTable({
    authId: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_auth_id', ['authId']),

  todos: defineTable({
    ownerId: v.string(),
    title: v.string(),
    completed: v.boolean(),
    createdAt: v.number(),
  }).index('by_owner', ['ownerId']),
})
`.trimStart()
}

function personalTodosTemplate() {
  return `
import { v } from 'convex/values'

import { createTodo } from '../../shared/schemas/todo'
import { deny } from '@lupinum/trellis/auth'
import { isAuthenticated } from '../auth/checks'
import { mutation, query } from '../functions'

export const list = query({
  args: {},
  guard: isAuthenticated,
  handler: async (ctx) => {
    const actor = await ctx.actor()

    return await ctx.db
      .query('todos')
      .withIndex('by_owner', (q) => q.eq('ownerId', actor.userId))
      .order('desc')
      .collect()
  },
})

export const create = mutation({
  args: createTodo.args,
  guard: isAuthenticated,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()

    return await ctx.db.insert('todos', {
      ownerId: actor.userId,
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  },
})

export const toggle = mutation({
  args: { id: v.id('todos') },
  guard: isAuthenticated,
  load: async (ctx, args) => {
    const actor = await ctx.actor()
    const todo = await ctx.db.get(args.id)

    if (!todo || todo.ownerId !== actor.userId) {
      throw deny('Todo not found.')
    }

    return { todo }
  },
  handler: async (ctx, args, { todo }) => {
    await ctx.db.patch(args.id, {
      completed: !todo.completed,
    })
  },
})
`.trimStart()
}

function personalPageTemplate() {
  return `
<script setup lang="ts">
import { api } from '#trellis/api'

const { isAuthenticated, isPending, signOut, user } = useConvexAuth()
const { signIn, pending: signInPending, error: signInError } = useConvexSignIn()
const { signUp, pending: signUpPending, error: signUpError } = useConvexSignUp()

const email = ref('demo@example.com')
const password = ref('password1234')
const title = ref('')

const todoArgs = computed(() => (isAuthenticated.value ? {} : undefined))
const { data: todos } = await useConvexQuery(api.domain.todos.list, todoArgs)
const createTodo = useConvexMutation(api.domain.todos.create)
const toggleTodo = useConvexMutation(api.domain.todos.toggle)

async function handleSignIn() {
  await signIn({
    email: email.value,
    password: password.value,
  })
}

async function handleSignUp() {
  await signUp({
    email: email.value,
    password: password.value,
    name: email.value.split('@')[0],
  })
}

async function handleCreateTodo() {
  if (!title.value.trim()) return
  await createTodo({ title: title.value.trim() })
  title.value = ''
}
</script>

<template>
  <main style="max-width: 720px; margin: 0 auto; padding: 40px 16px;">
    <h1>Personal Starter</h1>
    <p>Trellis app starter: Better Auth + Convex + app-owned permissions.</p>

    <div v-if="isPending">
      Loading auth...
    </div>

    <div v-else-if="!isAuthenticated" style="display: grid; gap: 12px; max-width: 320px;">
      <input v-model="email" type="email" placeholder="Email" />
      <input v-model="password" type="password" placeholder="Password" />
      <div style="display: flex; gap: 8px;">
        <button :disabled="signInPending" @click="handleSignIn">Sign in</button>
        <button :disabled="signUpPending" @click="handleSignUp">Sign up</button>
      </div>
      <p v-if="signInError">{{ signInError.message }}</p>
      <p v-if="signUpError">{{ signUpError.message }}</p>
    </div>

    <div v-else style="display: grid; gap: 16px;">
      <p>Signed in as {{ user?.email ?? user?.name ?? 'user' }}</p>
      <div style="display: flex; gap: 8px;">
        <input v-model="title" type="text" placeholder="Add a todo" />
        <button :disabled="createTodo.pending.value" @click="handleCreateTodo">Add</button>
        <button @click="signOut()">Sign out</button>
      </div>

      <ul style="display: grid; gap: 8px; padding-left: 20px;">
        <li v-for="todo in todos ?? []" :key="todo._id">
          <label style="display: flex; gap: 8px; align-items: center;">
            <input
              type="checkbox"
              :checked="todo.completed"
              @change="toggleTodo({ id: todo._id })"
            />
            <span>{{ todo.title }}</span>
          </label>
        </li>
      </ul>
    </div>
  </main>
</template>
`.trimStart()
}

function workspaceFunctionsAppTemplate() {
  return `
import { defineTrellis } from '@lupinum/trellis/functions'

import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import { getActorFromPrincipal } from './auth/actor'
import { principal } from './auth/principal'

export const { mutation, query, raw } = defineTrellis(
  { query: generatedQuery, mutation: generatedMutation },
  {
    principal,
    actor: getActorFromPrincipal,
    tenantIsolation: {
      tables: ['todos'],
    },
  },
)
`.trimStart()
}

function workspaceSchemaTemplate(includeMcpKeys: boolean) {
  return `
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  users: defineTable({
    authId: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    role: v.optional(
      v.union(
        v.literal('owner'),
        v.literal('admin'),
        v.literal('member'),
        v.literal('viewer'),
      ),
    ),
    workspaceId: v.optional(v.id('workspaces')),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_auth_id', ['authId']),

  workspaces: defineTable({
    name: v.string(),
    createdAt: v.number(),
  }),

  todos: defineTable({
    workspaceId: v.id('workspaces'),
    title: v.string(),
    completed: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_workspace', ['workspaceId']),
${
  includeMcpKeys
    ? `
  mcpKeys: defineTable({
    hash: v.string(),
    name: v.string(),
    boundAuthId: v.string(),
    boundRole: v.union(
      v.literal('owner'),
      v.literal('admin'),
      v.literal('member'),
      v.literal('viewer'),
    ),
    boundWorkspaceId: v.id('workspaces'),
    status: v.union(v.literal('active'), v.literal('revoked')),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index('by_hash', ['hash'])
    .index('by_bound_workspace', ['boundWorkspaceId']),
`
    : ''
}
})
`.trimStart()
}

function workspaceOnboardingTemplate() {
  return `
import { getAuth } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import { raw } from '../functions'

export const createFirstWorkspace = raw.mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const auth = await getAuth(ctx)
    if (!auth) {
      throw new Error('Not authenticated.')
    }

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', auth.subject))
      .first()

    if (!user) {
      throw new Error(
        [
          \`Expected a Trellis users row for auth subject "\${auth.subject}", but none was found.\`,
          'Ensure convex/auth.ts exports onCreate, onUpdate, and onDelete from authComponent.triggersApi().',
          'If the auth wiring is already correct, ensure auth:createUserIfNeeded has run for this user.',
        ].join(' '),
      )
    }

    if (user.workspaceId) {
      return user.workspaceId
    }

    const now = Date.now()
    const workspaceId = await ctx.db.insert('workspaces', {
      name: args.name,
      createdAt: now,
    })

    await ctx.db.patch(user._id, {
      workspaceId,
      role: 'owner',
      updatedAt: now,
    })

    return workspaceId
  },
})
`.trimStart()
}

function workspaceTodosTemplate() {
  return `
import { createTodo } from '../../shared/schemas/todo'
import { hasMinimumRole, hasWorkspace } from '../auth/checks'
import { mutation, query } from '../functions'

export const list = query({
  args: {},
  guard: hasWorkspace,
  handler: async (ctx) => {
    const actor = await ctx.actor()

    return await ctx.db
      .query('todos')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
      .order('desc')
      .collect()
  },
})

export const create = mutation({
  args: createTodo.args,
  guard: hasWorkspace.and(hasMinimumRole('member')),
  handler: async (ctx, args) => {
    const actor = await ctx.actor()

    return await ctx.db.insert('todos', {
      workspaceId: actor.tenantId,
      title: args.title,
      completed: false,
      createdAt: Date.now(),
    })
  },
})
`.trimStart()
}

function workspacePageTemplate(options: { title: string; mcp: boolean }) {
  return `
<script setup lang="ts">
import { api } from '#trellis/api'

const { isAuthenticated, isPending, signOut, user } = useConvexAuth()
const { signIn, pending: signInPending, error: signInError } = useConvexSignIn()
const { signUp, pending: signUpPending, error: signUpError } = useConvexSignUp()
const { ready, tenantId, role } = usePermissions()

const email = ref('owner@example.com')
const password = ref('password1234')
const workspaceName = ref('My workspace')
const title = ref('')

const todoArgs = computed(() => (ready.value ? {} : undefined))
const { data: todos } = await useConvexQuery(api.domain.todos.list, todoArgs)

const createWorkspace = useConvexMutation(api.operations.onboarding.createFirstWorkspace)
const createTodo = useConvexMutation(api.domain.todos.create)

async function handleSignIn() {
  await signIn({
    email: email.value,
    password: password.value,
  })
}

async function handleSignUp() {
  await signUp({
    email: email.value,
    password: password.value,
    name: email.value.split('@')[0],
  })
}

async function handleCreateWorkspace() {
  await createWorkspace({ name: workspaceName.value.trim() || 'My workspace' })
}

async function handleCreateTodo() {
  if (!title.value.trim()) return
  await createTodo({ title: title.value.trim() })
  title.value = ''
}
</script>

<template>
  <main style="max-width: 760px; margin: 0 auto; padding: 40px 16px;">
    <h1>${options.title}</h1>
    <p>
      Workspace starter with tenant-aware backend handlers${options.mcp ? ' and MCP wiring' : ''}.
    </p>

    <div v-if="isPending">
      Loading auth...
    </div>

    <div v-else-if="!isAuthenticated" style="display: grid; gap: 12px; max-width: 320px;">
      <input v-model="email" type="email" placeholder="Email" />
      <input v-model="password" type="password" placeholder="Password" />
      <div style="display: flex; gap: 8px;">
        <button :disabled="signInPending" @click="handleSignIn">Sign in</button>
        <button :disabled="signUpPending" @click="handleSignUp">Sign up</button>
      </div>
      <p v-if="signInError">{{ signInError.message }}</p>
      <p v-if="signUpError">{{ signUpError.message }}</p>
    </div>

    <div v-else-if="!ready" style="display: grid; gap: 12px; max-width: 320px;">
      <p>Signed in as {{ user?.email ?? user?.name ?? 'user' }}. Create your first workspace.</p>
      <input v-model="workspaceName" type="text" placeholder="Workspace name" />
      <button :disabled="createWorkspace.pending.value" @click="handleCreateWorkspace">
        Create workspace
      </button>
    </div>

    <div v-else style="display: grid; gap: 16px;">
      <p>
        Workspace: {{ tenantId }} | Role: {{ role }}
      </p>
      <div style="display: flex; gap: 8px;">
        <input v-model="title" type="text" placeholder="Add a workspace todo" />
        <button :disabled="createTodo.pending.value" @click="handleCreateTodo">Add</button>
        <button @click="signOut()">Sign out</button>
      </div>

      <ul style="display: grid; gap: 8px; padding-left: 20px;">
        <li v-for="todo in todos ?? []" :key="todo._id">
          {{ todo.title }}
        </li>
      </ul>
    </div>
  </main>
</template>
`.trimStart()
}

function sharedPageSchemaTemplate() {
  return `
import { defineArgs } from '@lupinum/trellis/args'
import { v } from 'convex/values'

export const pageStatusValidator = v.union(v.literal('draft'), v.literal('published'))

export const publishedPageValidator = v.object({
  _id: v.id('pages'),
  slug: v.string(),
  title: v.string(),
  body: v.string(),
  status: pageStatusValidator,
  authorId: v.string(),
  updatedAt: v.number(),
  publishedAt: v.union(v.number(), v.null()),
})

export const studioPageValidator = v.object({
  _id: v.id('pages'),
  slug: v.string(),
  title: v.string(),
  draftBody: v.string(),
  publishedBody: v.string(),
  status: pageStatusValidator,
  authorId: v.string(),
  updatedAt: v.number(),
  publishedAt: v.union(v.number(), v.null()),
})

export const publishPreviewValidator = v.object({
  summary: v.string(),
  warn: v.optional(v.string()),
  affects: v.optional(
    v.object({
      pages: v.number(),
    }),
  ),
})

export const listPublishedPages = defineArgs({
  description: 'List published pages for the public site',
  args: {},
})

export const getPublishedPage = defineArgs({
  description: 'Read one published page by slug',
  args: {
    slug: v.string(),
  },
})

export const listStudioPages = defineArgs({
  description: 'List pages visible in the signed-in studio',
  args: {},
})

export const createPage = defineArgs({
  description: 'Create a new page draft',
  args: {
    slug: v.string(),
    title: v.string(),
    draftBody: v.optional(v.string()),
  },
})

export const saveDraft = defineArgs({
  description: 'Save a page draft',
  args: {
    id: v.id('pages'),
    slug: v.string(),
    title: v.string(),
    draftBody: v.string(),
  },
})

export const publishPage = defineArgs({
  description: 'Publish a page draft',
  args: {
    id: v.id('pages'),
  },
})
`.trimStart()
}

function cmsChecksTemplate() {
  return `
import { defineGuard } from '@lupinum/trellis/auth'

import type { Actor } from './actor'

export const isAuthenticated = defineGuard<Actor>('authenticated', (actor) => actor !== null)

export const hasRole = (...roles: string[]) =>
  defineGuard<Actor>(\`role:\${roles.join('|')}\`, (actor) =>
    !!actor && roles.includes(actor.role),
  )

export const isOwnerOfPage = (page: { authorId: string }) =>
  defineGuard<Actor>(\`owner:\${page.authorId}\`, (actor) => !!actor && actor.userId === page.authorId)

export const canEditPage = (page: { authorId: string }) =>
  defineGuard<Actor>(
    'page.edit',
    isAuthenticated.and(hasRole('admin').or(isOwnerOfPage(page))),
  )

export const canPublishPage = (page: { authorId: string }) =>
  defineGuard<Actor>(
    'page.publish',
    isAuthenticated.and(hasRole('admin').or(isOwnerOfPage(page))),
  )
`.trimStart()
}

function cmsPermissionQueryTemplate() {
  return `
import { definePermissionContext } from '@lupinum/trellis/auth'

import { cmsPermissions } from '../auth/permissions'
import { getActor } from '../auth/actor'
import { query } from '../functions'

export const getPermissionContext = query(
  definePermissionContext({
    resolve: getActor,
    permissions: cmsPermissions,
  }),
)
`.trimStart()
}

function cmsPermissionsTemplate() {
  return `
import { definePermission } from '@lupinum/trellis/auth'

import { isAuthenticated } from './checks'

export const studioRead = definePermission({
  key: 'studio.read',
  check: isAuthenticated,
})

export const pageCreate = definePermission({
  key: 'page.create',
  check: isAuthenticated,
})

export const pagePublish = definePermission({
  key: 'page.publish',
  check: isAuthenticated,
})

export const cmsPermissions = [studioRead, pageCreate, pagePublish] as const
`.trimStart()
}

function cmsSchemaTemplate() {
  return `
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  users: defineTable({
    authId: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    role: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_auth_id', ['authId']),

  pages: defineTable({
    slug: v.string(),
    title: v.string(),
    draftBody: v.string(),
    publishedBody: v.string(),
    status: v.union(v.literal('draft'), v.literal('published')),
    authorId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    publishedAt: v.optional(v.number()),
  })
    .index('by_slug', ['slug'])
    .index('by_status', ['status'])
    .index('by_author', ['authorId']),
})
`.trimStart()
}

function cmsPagesTemplate() {
  return `
import { open, requireRecord } from '@lupinum/trellis/auth'
import { defineOperation, previewOf } from '@lupinum/trellis/functions'
import { v } from 'convex/values'

import {
  createPage as createPageSchema,
  getPublishedPage as getPublishedPageSchema,
  listPublishedPages as listPublishedPagesSchema,
  listStudioPages as listStudioPagesSchema,
  publishPage as publishPageSchema,
  publishPreviewValidator,
  publishedPageValidator,
  saveDraft as saveDraftSchema,
  studioPageValidator,
} from '../../shared/schemas/page'
import { canEditPage, canPublishPage, isAuthenticated } from '../auth/checks'
import { mutation, query } from '../functions'

export const listPublished = query({
  args: listPublishedPagesSchema.args,
  returns: v.array(publishedPageValidator),
  guard: open,
  handler: async (ctx) =>
    await ctx.db
      .query('pages')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .order('desc')
      .collect()
      .then((pages) =>
        pages.map((page) => ({
          _id: page._id,
          slug: page.slug,
          title: page.title,
          body: page.publishedBody,
          status: page.status,
          authorId: page.authorId,
          updatedAt: page.updatedAt,
          publishedAt: page.publishedAt ?? null,
        })),
      ),
})

export const getPublished = query({
  args: getPublishedPageSchema.args,
  returns: v.union(publishedPageValidator, v.null()),
  guard: open,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query('pages')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()

    if (!page || page.status !== 'published') {
      return null
    }

    return {
      _id: page._id,
      slug: page.slug,
      title: page.title,
      body: page.publishedBody,
      status: page.status,
      authorId: page.authorId,
      updatedAt: page.updatedAt,
      publishedAt: page.publishedAt ?? null,
    }
  },
})

export const listStudio = query({
  args: listStudioPagesSchema.args,
  returns: v.array(studioPageValidator),
  guard: isAuthenticated,
  handler: async (ctx) => {
    const actor = await ctx.actor()

    return await ctx.db
      .query('pages')
      .withIndex('by_author', (q) => q.eq('authorId', actor.userId))
      .order('desc')
      .collect()
      .then((pages) =>
        pages.map((page) => ({
          _id: page._id,
          slug: page.slug,
          title: page.title,
          draftBody: page.draftBody,
          publishedBody: page.publishedBody,
          status: page.status,
          authorId: page.authorId,
          updatedAt: page.updatedAt,
          publishedAt: page.publishedAt ?? null,
        })),
      )
  },
})

export const create = mutation({
  args: createPageSchema.args,
  returns: v.id('pages'),
  guard: isAuthenticated,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const now = Date.now()

    return await ctx.db.insert('pages', {
      slug: args.slug,
      title: args.title,
      draftBody: args.draftBody ?? '',
      publishedBody: '',
      status: 'draft',
      authorId: actor.userId,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const save = mutation({
  args: saveDraftSchema.args,
  returns: v.null(),
  guard: isAuthenticated,
  load: async (ctx, args) => {
    const page = await ctx.db.get(args.id)
    requireRecord(page, 'Page')
    return { page }
  },
  authorize: {
    check: (_actor, { page }) => canEditPage(page),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      slug: args.slug,
      title: args.title,
      draftBody: args.draftBody,
      updatedAt: Date.now(),
    })
    return null
  },
})

const publishPageOp = defineOperation({
  name: 'publishPage',
  args: publishPageSchema.args,
  returns: v.object({
    pageId: v.id('pages'),
    published: v.boolean(),
  }),
  previewReturns: v.object({
    display: publishPreviewValidator,
    confirm: v.object({
      targetId: v.id('pages'),
      slug: v.string(),
    }),
  }),
  guard: isAuthenticated,
  load: async (ctx, args) => {
    const page = await ctx.db.get(args.id)
    requireRecord(page, 'Page')
    return { page }
  },
  authorize: {
    check: (_actor, { page }) => canPublishPage(page),
  },
  preview: async (_ctx, _args, { page }) => ({
    display: {
      summary:
        page.status === 'published'
          ? \`Republish "\${page.title}" with the current draft.\`
          : \`Publish "\${page.title}" to the public site.\`,
      warn: 'Publishing copies the current draft into the public body.',
      affects: {
        pages: 1,
      },
    },
    confirm: {
      targetId: page._id,
      slug: page.slug,
    },
  }),
  handler: async (ctx, args, { page }) => {
    const now = Date.now()

    await ctx.db.patch(args.id, {
      publishedBody: page.draftBody,
      status: 'published',
      publishedAt: now,
      updatedAt: now,
    })

    return {
      pageId: args.id,
      published: true,
    }
  },
})

export const publish = mutation(publishPageOp)
export const previewPublish = query(previewOf(publishPageOp))
`.trimStart()
}

function cmsPublicPageTemplate() {
  return `
<script setup lang="ts">
import { api } from '#trellis/api'

const { data: pages } = await useConvexQuery(api.domain.pages.listPublished, {})
</script>

<template>
  <main style="max-width: 760px; margin: 0 auto; padding: 40px 16px; display: grid; gap: 20px;">
    <header style="display: grid; gap: 8px;">
      <h1>CMS Starter</h1>
      <p>Public published pages on the left, signed-in studio at <code>/studio</code>.</p>
      <NuxtLink to="/studio">Open studio</NuxtLink>
    </header>

    <ul style="display: grid; gap: 12px; padding-left: 20px;">
      <li v-for="page in pages ?? []" :key="page._id">
        <NuxtLink :to="\`/\${page.slug}\`">{{ page.title }}</NuxtLink>
      </li>
    </ul>
  </main>
</template>
`.trimStart()
}

function cmsStudioPageTemplate() {
  return `
<script setup lang="ts">
import { api } from '#trellis/api'
import { pageCreate, pagePublish } from '~/convex/auth/permissions'

const { isAuthenticated, isPending, signOut, user } = useConvexAuth()
const { signIn, pending: signInPending, error: signInError } = useConvexSignIn()
const { signUp, pending: signUpPending, error: signUpError } = useConvexSignUp()
const { ready, allows } = usePermissions()

const email = ref('editor@example.com')
const password = ref('password1234')
const form = reactive({
  slug: 'welcome',
  title: 'Welcome',
  draftBody: 'Hello from the Trellis CMS starter.',
})
const selectedId = ref<string | null>(null)

const studioArgs = computed(() => (ready.value ? {} : undefined))
const { data: pages } = await useConvexQuery(api.domain.pages.listStudio, studioArgs)
const previewArgs = computed(() =>
  selectedId.value ? ({ id: selectedId.value as never }) : undefined,
)
const { data: publishPreview } = await useConvexQuery(api.domain.pages.previewPublish, previewArgs, {
  server: false,
  subscribe: false,
})

const createPage = useConvexMutation(api.domain.pages.create)
const saveDraft = useConvexMutation(api.domain.pages.save)
const publishPage = useConvexMutation(api.domain.pages.publish)

watchEffect(() => {
  const first = pages.value?.[0]
  if (!first || selectedId.value) return

  selectedId.value = first._id as string
  form.slug = first.slug
  form.title = first.title
  form.draftBody = first.draftBody
})

async function handleSignIn() {
  await signIn({
    email: email.value,
    password: password.value,
  })
}

async function handleSignUp() {
  await signUp({
    email: email.value,
    password: password.value,
    name: email.value.split('@')[0],
  })
}

async function handleCreatePage() {
  const id = await createPage({
    slug: form.slug.trim(),
    title: form.title.trim(),
    draftBody: form.draftBody,
  })
  selectedId.value = id as string
}

async function handleSaveDraft() {
  if (!selectedId.value) return
  await saveDraft({
    id: selectedId.value as never,
    slug: form.slug.trim(),
    title: form.title.trim(),
    draftBody: form.draftBody,
  })
}

async function handlePublish() {
  if (!selectedId.value) return
  await publishPage({
    id: selectedId.value as never,
  })
}
</script>

<template>
  <main style="max-width: 880px; margin: 0 auto; padding: 40px 16px; display: grid; gap: 20px;">
    <header style="display: grid; gap: 8px;">
      <h1>Studio</h1>
      <p>Draft, save, and publish through one Trellis-backed content module.</p>
    </header>

    <div v-if="isPending">Loading auth…</div>

    <div v-else-if="!isAuthenticated" style="display: grid; gap: 12px; max-width: 320px;">
      <input v-model="email" type="email" placeholder="Email" />
      <input v-model="password" type="password" placeholder="Password" />
      <div style="display: flex; gap: 8px;">
        <button :disabled="signInPending" @click="handleSignIn">Sign in</button>
        <button :disabled="signUpPending" @click="handleSignUp">Sign up</button>
      </div>
      <p v-if="signInError">{{ signInError.message }}</p>
      <p v-if="signUpError">{{ signUpError.message }}</p>
    </div>

    <div v-else-if="!ready">Waiting for permissions…</div>

    <div v-else style="display: grid; gap: 20px;">
      <p>Signed in as {{ user?.email ?? user?.name ?? 'editor' }}</p>

      <section style="display: grid; gap: 12px; max-width: 720px;">
        <input v-model="form.slug" type="text" placeholder="Slug" />
        <input v-model="form.title" type="text" placeholder="Title" />
        <textarea v-model="form.draftBody" rows="10" placeholder="Draft body"></textarea>

        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button :disabled="!allows(pageCreate).value || createPage.pending.value" @click="handleCreatePage">
            Create draft
          </button>
          <button :disabled="!selectedId || saveDraft.pending.value" @click="handleSaveDraft">
            Save draft
          </button>
          <button :disabled="!allows(pagePublish).value || !selectedId || publishPage.pending.value" @click="handlePublish">
            Publish
          </button>
          <button @click="signOut()">Sign out</button>
        </div>
      </section>

      <section v-if="publishPreview" style="display: grid; gap: 4px;">
        <strong>Publish preview</strong>
        <p>{{ publishPreview.display.summary }}</p>
        <p v-if="publishPreview.display.warn">{{ publishPreview.display.warn }}</p>
      </section>

      <section style="display: grid; gap: 8px;">
        <h2>Your pages</h2>
        <ul style="display: grid; gap: 8px; padding-left: 20px;">
          <li v-for="page in pages ?? []" :key="page._id">
            <button
              style="all: unset; cursor: pointer; text-decoration: underline;"
              @click="
                selectedId = page._id as string
                form.slug = page.slug
                form.title = page.title
                form.draftBody = page.draftBody
              "
            >
              {{ page.title }} · {{ page.status }}
            </button>
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>
`.trimStart()
}

function cmsSlugPageTemplate() {
  return `
<script setup lang="ts">
import { api } from '#trellis/api'

const route = useRoute()
const slug = computed(() => String(route.params.slug ?? ''))
const pageArgs = computed(() => (slug.value ? { slug: slug.value } : undefined))
const { data: page } = await useConvexQuery(api.domain.pages.getPublished, pageArgs)
</script>

<template>
  <main style="max-width: 760px; margin: 0 auto; padding: 40px 16px; display: grid; gap: 16px;">
    <NuxtLink to="/">← Back</NuxtLink>

    <template v-if="page">
      <h1>{{ page.title }}</h1>
      <p style="white-space: pre-wrap;">{{ page.body }}</p>
    </template>

    <p v-else>Page not found.</p>
  </main>
</template>
`.trimStart()
}

function mcpKeysTemplate() {
  return `
import { open } from '@lupinum/trellis/auth'
import { v } from 'convex/values'

import { mutation, query } from '../functions'

const TOUCH_DEBOUNCE_MS = 60_000

export const validate = query({
  guard: open,
  args: {
    hash: v.string(),
  },
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query('mcpKeys')
      .withIndex('by_hash', (q) => q.eq('hash', args.hash))
      .first()

    if (!key || key.status !== 'active') return null

    return {
      id: key._id,
      role: key.boundRole,
      userId: key.boundAuthId,
      tenantId: key.boundWorkspaceId,
      lastUsedAt: key.lastUsedAt ?? null,
    }
  },
})

export const touch = mutation({
  guard: open,
  args: {
    id: v.id('mcpKeys'),
    seenAt: v.number(),
  },
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.id)
    if (!key || key.status !== 'active') return

    const lastUsedAt = typeof key.lastUsedAt === 'number' ? key.lastUsedAt : 0
    if (args.seenAt - lastUsedAt < TOUCH_DEBOUNCE_MS) return

    await ctx.db.patch(args.id, {
      lastUsedAt: args.seenAt,
    })
  },
})
`.trimStart()
}

function mcpListTodosToolTemplate() {
  return `
import { api } from '#trellis/api'
import { workspaceRead } from '~/convex/auth/permissions'
import { listTodos } from '~/shared/schemas/todo'

import { tool } from '../runtime'

export default tool({
  schema: listTodos,
  call: api.domain.todos.list,
  operation: 'query',
  permission: workspaceRead,
  meta: {
    name: 'list-todos',
  },
})
`.trimStart()
}

function mcpCreateTodoToolTemplate() {
  return `
import { api } from '#trellis/api'
import { todoCreate } from '~/convex/auth/permissions'
import { createTodo } from '~/shared/schemas/todo'

import { tool } from '../runtime'

export default tool({
  schema: createTodo,
  call: api.domain.todos.create,
  operation: 'mutation',
  permission: todoCreate,
  meta: {
    name: 'create-todo',
  },
})
`.trimStart()
}

function buildAuthTemplateSet(): InitTemplateSet {
  return {
    label: 'auth',
    description: 'Scaffold Better Auth + Convex bridge files',
    files: [
      { path: 'convex/auth.ts', content: authTsTemplate(), ownership: 'authored' },
      { path: 'convex/auth.config.ts', content: authConfigTemplate(), ownership: 'generated' },
      { path: 'convex/http.ts', content: httpTemplate(), ownership: 'generated' },
      {
        path: 'convex/convex.config.ts',
        content: convexConfigTemplate(),
        ownership: 'generated',
      },
      { path: 'convex/test.setup.ts', content: testSetupTemplate(), ownership: 'generated' },
    ],
  }
}

function buildPersonalPermissionsTemplateSet(): InitTemplateSet {
  return {
    label: 'permissions:personal',
    description: 'Scaffold app-owned personal actor and permission context files',
    files: [
      { path: 'convex/auth/actor.ts', content: personalActorTemplate(), ownership: 'authored' },
      {
        path: 'convex/functions.ts',
        content: personalFunctionsTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/auth/checks.ts',
        content: personalChecksTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/auth/permissions.ts',
        content: personalPermissionsTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/permissions/context.ts',
        content: personalPermissionQueryTemplate(),
        ownership: 'authored',
      },
    ],
  }
}

function buildWorkspacePermissionsTemplateSet(
  model: 'workspace' | 'workspace-mcp',
): InitTemplateSet {
  return {
    label: `permissions:${model}`,
    description: 'Scaffold workspace permission policy files',
    files: [
      {
        path: 'convex/auth/principal.ts',
        content: workspacePrincipalTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/auth/actor.ts',
        content: workspaceActorTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/auth/checks.ts',
        content: workspaceChecksTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/auth/permissions.ts',
        content: workspacePermissionsTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/functions.ts',
        content: workspaceFunctionsTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/permissions/context.ts',
        content: workspacePermissionQueryTemplate(),
        ownership: 'authored',
      },
    ],
    afterWrite: async (_cwd) => {
      // Workspace model: userFields in defineAuth should include role: 'member'
    },
  }
}

function buildMcpTemplateSet(): InitTemplateSet {
  return {
    label: 'mcp',
    description: 'Scaffold MCP middleware glue',
    files: [
      {
        path: 'server/middleware/mcp-auth.ts',
        content: mcpMiddlewareTemplate(),
        ownership: 'authored',
      },
      {
        path: 'server/mcp/runtime.ts',
        content: mcpRuntimeTemplate(),
        ownership: 'authored',
      },
    ],
  }
}

function mergeTemplateSets(...sets: InitTemplateSet[]): TemplateFile[] {
  const merged = new Map<string, TemplateFile>()

  for (const set of sets) {
    for (const file of set.files) {
      merged.set(file.path, file)
    }
  }

  return [...merged.values()]
}

function buildAppTemplateSet(template: AppTemplate): InitTemplateSet {
  if (template === 'personal') {
    return {
      label: 'app:personal',
      description: 'Bootstrap a personal Trellis app inside the current workspace',
      files: mergeTemplateSets(
        buildAuthTemplateSet(),
        buildPersonalPermissionsTemplateSet(),
      ).concat([
        {
          path: 'nuxt.config.ts',
          content: nuxtConfigTemplate({
            permissionsQuery: 'permissions/context.getPermissionContext',
          }),
          ownership: 'authored',
        },
        {
          path: 'convex/schema.ts',
          content: personalSchemaTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/domain/todos.ts',
          content: personalTodosTemplate(),
          ownership: 'authored',
        },
        {
          path: 'shared/schemas/todo.ts',
          content: sharedTodoSchemaTemplate('personal'),
          ownership: 'authored',
        },
        {
          path: 'pages/index.vue',
          content: personalPageTemplate(),
          ownership: 'authored',
        },
      ]),
    }
  }

  if (template === 'workspace') {
    return {
      label: 'app:workspace',
      description: 'Bootstrap a workspace Trellis app inside the current workspace',
      files: mergeTemplateSets(
        buildAuthTemplateSet(),
        buildWorkspacePermissionsTemplateSet('workspace'),
      ).concat([
        {
          path: 'nuxt.config.ts',
          content: nuxtConfigTemplate({
            permissionsQuery: 'permissions/context.getPermissionContext',
          }),
          ownership: 'authored',
        },
        {
          path: 'convex/functions.ts',
          content: workspaceFunctionsAppTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/schema.ts',
          content: workspaceSchemaTemplate(false),
          ownership: 'authored',
        },
        {
          path: 'convex/operations/onboarding.ts',
          content: workspaceOnboardingTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/domain/todos.ts',
          content: workspaceTodosTemplate(),
          ownership: 'authored',
        },
        {
          path: 'shared/schemas/todo.ts',
          content: sharedTodoSchemaTemplate('workspace'),
          ownership: 'authored',
        },
        {
          path: 'pages/index.vue',
          content: workspacePageTemplate({ title: 'Workspace Starter', mcp: false }),
          ownership: 'authored',
        },
      ]),
    }
  }

  if (template === 'cms') {
    return {
      label: 'app:cms',
      description: 'Bootstrap a CMS Trellis app with public pages and a signed-in studio',
      files: mergeTemplateSets(buildAuthTemplateSet()).concat([
        {
          path: 'convex/auth/actor.ts',
          content: personalActorTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/functions.ts',
          content: personalFunctionsTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/auth/checks.ts',
          content: cmsChecksTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/auth/permissions.ts',
          content: cmsPermissionsTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/permissions/context.ts',
          content: cmsPermissionQueryTemplate(),
          ownership: 'authored',
        },
        {
          path: 'nuxt.config.ts',
          content: nuxtConfigTemplate({
            permissionsQuery: 'permissions/context.getPermissionContext',
          }),
          ownership: 'authored',
        },
        {
          path: 'convex/schema.ts',
          content: cmsSchemaTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/domain/pages.ts',
          content: cmsPagesTemplate(),
          ownership: 'authored',
        },
        {
          path: 'shared/schemas/page.ts',
          content: sharedPageSchemaTemplate(),
          ownership: 'authored',
        },
        {
          path: 'pages/index.vue',
          content: cmsPublicPageTemplate(),
          ownership: 'authored',
        },
        {
          path: 'pages/studio.vue',
          content: cmsStudioPageTemplate(),
          ownership: 'authored',
        },
        {
          path: 'pages/[slug].vue',
          content: cmsSlugPageTemplate(),
          ownership: 'authored',
        },
      ]),
    }
  }

  return {
    label: 'app:workspace-mcp',
    description: 'Bootstrap a workspace + MCP Trellis app inside the current workspace',
    files: mergeTemplateSets(
      buildAuthTemplateSet(),
      buildWorkspacePermissionsTemplateSet('workspace-mcp'),
      buildMcpTemplateSet(),
    ).concat([
      {
        path: 'nuxt.config.ts',
        content: nuxtConfigTemplate({
          permissionsQuery: 'permissions/context.getPermissionContext',
          mcp: true,
        }),
        ownership: 'authored',
      },
      {
        path: 'convex/functions.ts',
        content: workspaceFunctionsAppTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/schema.ts',
        content: workspaceSchemaTemplate(true),
        ownership: 'authored',
      },
      {
        path: 'convex/operations/onboarding.ts',
        content: workspaceOnboardingTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/domain/todos.ts',
        content: workspaceTodosTemplate(),
        ownership: 'authored',
      },
      {
        path: 'convex/domain/mcpKeys.ts',
        content: mcpKeysTemplate(),
        ownership: 'authored',
      },
      {
        path: 'shared/schemas/todo.ts',
        content: sharedTodoSchemaTemplate('workspace'),
        ownership: 'authored',
      },
      {
        path: 'server/mcp/tools/list-todos.ts',
        content: mcpListTodosToolTemplate(),
        ownership: 'authored',
      },
      {
        path: 'server/mcp/index.ts',
        content: mcpEndpointTemplate('workspace-app'),
        ownership: 'authored',
      },
      {
        path: 'server/mcp/tools/create-todo.ts',
        content: mcpCreateTodoToolTemplate(),
        ownership: 'authored',
      },
      {
        path: 'pages/index.vue',
        content: workspacePageTemplate({ title: 'Workspace MCP Starter', mcp: true }),
        ownership: 'authored',
      },
    ]),
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function writeTemplateFiles(
  cwd: string,
  files: TemplateFile[],
  force: boolean,
): Promise<{ written: string[]; skipped: string[] }> {
  const written: string[] = []
  const skipped: string[] = []

  for (const file of files) {
    const destination = resolve(cwd, file.path)
    const exists = await pathExists(destination)
    if (exists && !force) {
      skipped.push(file.path)
      continue
    }

    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, file.content, 'utf8')
    written.push(file.path)
  }

  return { written, skipped }
}

export async function applyInitTemplateSet(
  cwd: string,
  templateSet: InitTemplateSet,
  force: boolean,
): Promise<{
  written: string[]
  skipped: string[]
  authored: string[]
  generated: string[]
}> {
  const { written, skipped } = await writeTemplateFiles(cwd, templateSet.files, force)
  await templateSet.afterWrite?.(cwd)

  return {
    written,
    skipped,
    authored: templateSet.files
      .filter((file) => file.ownership === 'authored')
      .map((file) => file.path),
    generated: templateSet.files
      .filter((file) => file.ownership === 'generated')
      .map((file) => file.path),
  }
}

function appPackageName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'trellis-app'
  )
}

function appPackageTemplate(options: {
  appName: string
  template: CanonicalAppTemplate
  mcp: boolean
}) {
  const dependencies = [
    ['@convex-dev/better-auth', '^0.11.4'],
    ['@lupinum/trellis', 'workspace:*'],
    ['better-auth', '^1.5.6'],
    ['convex', '^1.34.1'],
    ['nuxt', '^4.4.2'],
  ]

  if (options.mcp) {
    dependencies.splice(2, 0, ['@nuxtjs/mcp-toolkit', '^0.13.4'])
  }

  return `${JSON.stringify(
    {
      name: appPackageName(options.appName),
      private: true,
      type: 'module',
      scripts: {
        dev: 'nuxi dev --dotenv .env.local',
        build: 'nuxi build --dotenv .env.local',
        typecheck: 'nuxi typecheck --dotenv .env.local',
        test: 'vitest run',
        'convex:dev': 'convex dev',
        'convex:codegen': 'convex codegen',
      },
      dependencies: Object.fromEntries(dependencies),
      devDependencies: {
        typescript: '^5.9.3',
        vitest: '^4.1.2',
        'vue-tsc': '^3.2.6',
      },
    },
    null,
    2,
  )}\n`
}

function envExampleTemplate(options: { template: CanonicalAppTemplate; mcp: boolean }) {
  const lines = [
    'CONVEX_URL=https://your-app.convex.cloud',
    'CONVEX_SITE_URL=https://your-app.convex.site',
    'SITE_URL=http://localhost:3000',
    'BETTER_AUTH_SECRET=replace-me',
  ]

  if (options.mcp) {
    lines.push('CONVEX_TRUSTED_FORWARDING_KEY=replace-me')
    lines.push('TRELLIS_MCP_CONFIRMATION_KEY=replace-me')
  }

  return `${lines.join('\n')}\n`
}

function readmeTemplate(options: {
  appName: string
  template: CanonicalAppTemplate
  mcp: boolean
}) {
  return `
# ${options.appName}

Generated with \`trellis init ${options.appName} --template ${options.template}${options.mcp ? ' --mcp' : ''}\`.

## Quick start

\`\`\`bash
pnpm install
pnpm convex:dev
pnpm dev
\`\`\`

## Canonical shape

- \`convex/auth/\` for actor and guard logic
- \`convex/domain/\` for app modules
- \`convex/permissions/\` for permission projection
- \`convex/operations/\` for workflow-style actions
- \`shared/schemas/\` for shared value contracts
${options.mcp ? '- \\`server/mcp/\\` for MCP runtime and tools' : ''}
`.trimStart()
}

function gitignoreTemplate() {
  return `
.env.local
.nuxt
.output
node_modules
coverage
dist
`.trimStart()
}

function appScaffoldTemplateSet(options: {
  appName: string
  template: CanonicalAppTemplate
  mcp: boolean
}): InitTemplateSet {
  const files: TemplateFile[] = [
    {
      path: 'package.json',
      content: appPackageTemplate(options),
      ownership: 'generated',
    },
    {
      path: '.env.example',
      content: envExampleTemplate(options),
      ownership: 'generated',
    },
    {
      path: '.gitignore',
      content: gitignoreTemplate(),
      ownership: 'generated',
    },
    {
      path: 'README.md',
      content: readmeTemplate(options),
      ownership: 'generated',
    },
    {
      path: 'server/api/.gitkeep',
      content: '',
      ownership: 'generated',
    },
  ]

  if (!options.mcp) {
    files.push({
      path: 'server/mcp/.gitkeep',
      content: '',
      ownership: 'generated',
    })
  }

  if (options.template !== 'workspace') {
    files.push({
      path: 'convex/operations/.gitkeep',
      content: '',
      ownership: 'generated',
    })
  }

  return {
    label: `scaffold:${options.template}`,
    description: 'Scaffold app-root package and canonical empty lanes',
    files,
  }
}

function mcpEndpointTemplate(appName: string) {
  return `
export default defineMcpHandler({
  name: '${appPackageName(appName)}',
  browserRedirect: '/',
})
`.trimStart()
}

function addMcpKeysSchemaBlock() {
  return `

  mcpKeys: defineTable({
    hash: v.string(),
    name: v.string(),
    boundAuthId: v.string(),
    boundRole: v.union(
      v.literal('owner'),
      v.literal('admin'),
      v.literal('member'),
      v.literal('viewer'),
    ),
    boundWorkspaceId: v.id('workspaces'),
    status: v.union(v.literal('active'), v.literal('revoked')),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index('by_hash', ['hash'])
    .index('by_bound_workspace', ['boundWorkspaceId']),
`
}

async function rewriteFile(path: string, rewrite: (source: string) => string): Promise<void> {
  const source = await readFile(path, 'utf8')
  const next = rewrite(source)
  if (next === source) {
    throw new Error(`Unable to update ${basename(path)} for the requested scaffold.`)
  }
  await writeFile(path, next, 'utf8')
}

async function enableNuxtMcpConfig(cwd: string): Promise<void> {
  const path = resolve(cwd, 'nuxt.config.ts')
  await rewriteFile(path, (source) => {
    const appName = appPackageName(basename(cwd))
    const namedConfig = `mcp: { name: '${appName}', sessions: true }`

    if (/mcp:\s*\{/.test(source)) {
      return source.replace(/mcp:\s*\{[^}]+\}/, namedConfig)
    }

    if (source.includes("permissions: '")) {
      return source.replace(/(permissions:\s*'[^']+',\n)/, `$1    ${namedConfig},\n`)
    }

    const trellisStart = source.indexOf('trellis: {')
    if (trellisStart === -1) {
      return source
    }

    const trellisClose = source.indexOf('\n  },', trellisStart)
    if (trellisClose === -1) {
      return source
    }

    return `${source.slice(0, trellisClose)}\n    ${namedConfig},${source.slice(trellisClose)}`
  })
}

async function addMcpDependency(cwd: string): Promise<void> {
  const path = resolve(cwd, 'package.json')
  const source = await readFile(path, 'utf8')
  const parsed = JSON.parse(source) as {
    dependencies?: Record<string, string>
  }
  parsed.dependencies ??= {}
  parsed.dependencies['@nuxtjs/mcp-toolkit'] = '^0.13.4'
  await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
}

async function enableWorkspaceMcpSchema(cwd: string): Promise<void> {
  const path = resolve(cwd, 'convex/schema.ts')
  await rewriteFile(path, (source) => {
    if (source.includes('mcpKeys: defineTable')) return source
    return source.replace(/\n\}\)\s*$/m, `${addMcpKeysSchemaBlock()}\n})`)
  })
}

function uploadsDomainTemplate() {
  return `
import { requireAuth } from '@lupinum/trellis/auth'
import type { ActorAccessor } from '@lupinum/trellis/functions'
import type { GenericMutationCtx } from 'convex/server'

import type { DataModel } from '../_generated/dataModel'
import type { Actor } from '../auth/actor'
import { raw } from '../functions'

type Ctx = GenericMutationCtx<DataModel> & { actor: ActorAccessor<Actor> }

export const generateUploadUrl = raw.mutation({
  args: {},
  handler: async (ctx: Ctx) => {
    requireAuth(await ctx.actor())
    return await (
      ctx as unknown as { storage: { generateUploadUrl(): Promise<string> } }
    ).storage.generateUploadUrl()
  },
})
`.trimStart()
}

function uploadsPageTemplate() {
  return `
<script setup lang="ts">
import { api } from '#trellis/api'

const {
  upload,
  pending,
  progress,
  data: storageId,
  error,
  reset,
} = useConvexUpload(api.domain.files.generateUploadUrl, {
  allowedTypes: ['image/*', 'application/pdf'],
  maxSizeBytes: 5_000_000,
})

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  await upload(file)
}
</script>

<template>
  <main>
    <h1>Uploads Starter</h1>
    <input type="file" @change="onFile" />
    <p v-if="pending">Uploading: {{ progress }}%</p>
    <p v-if="storageId">Stored as {{ storageId }}</p>
    <p v-if="error">{{ error.message }}</p>
    <button type="button" @click="reset">Reset</button>
  </main>
</template>
`.trimStart()
}

function pascalCase(value: string): string {
  return value
    .replace(/[^a-z0-9]+/gi, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join('')
}

function kebabCase(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function operationTemplate(name: string, kind: 'safe' | 'destructive') {
  const opId = kebabCase(name)
  const exportName = pascalCase(name)

  if (kind === 'destructive') {
    return `
import { authRequired } from '@lupinum/trellis/auth'
import { defineOperation, previewOf } from '@lupinum/trellis/functions'
import { v } from 'convex/values'

import { mutation, query } from '../functions'

export const ${exportName}Op = defineOperation({
  id: '${opId}',
  name: '${exportName}',
  kind: 'destructive',
  args: {
    id: v.string(),
  },
  guard: authRequired,
  preview: async (_ctx, args) => ({
    display: {
      summary: \`Confirm ${opId} for \${args.id}\`,
    },
    confirm: {
      id: args.id,
    },
  }),
  handler: async (_ctx, args) => {
    throw new Error(\`Implement ${opId} for \${args.id}.\`)
  },
})

export const preview${exportName} = query(previewOf(${exportName}Op))
export const execute${exportName} = mutation(${exportName}Op)
`.trimStart()
  }

  return `
import { authRequired } from '@lupinum/trellis/auth'
import { defineOperation } from '@lupinum/trellis/functions'
import { v } from 'convex/values'

export const ${exportName}Op = defineOperation({
  name: '${exportName}',
  args: {
    id: v.string(),
  },
  guard: authRequired,
  handler: async (_ctx, args) => {
    throw new Error(\`Implement ${opId} for \${args.id}.\`)
  },
})
`.trimStart()
}

export function getCanonicalAppTemplateSet(options: {
  appName: string
  template: CanonicalAppTemplate
  mcp?: boolean
}): InitTemplateSet {
  const mcp = options.mcp === true
  const template = options.template === 'workspace' && mcp ? 'workspace-mcp' : options.template

  return {
    label: `init:${options.template}${mcp ? '+mcp' : ''}`,
    description: `Bootstrap a ${options.template}${mcp ? ' + MCP' : ''} Trellis app`,
    files: mergeTemplateSets(
      appScaffoldTemplateSet({
        appName: options.appName,
        template: options.template,
        mcp,
      }),
      buildAppTemplateSet(template),
    ),
    afterWrite: mcp
      ? async (cwd) => {
          await enableNuxtMcpConfig(cwd)
        }
      : undefined,
  }
}

export async function getAddTemplateSet(options: {
  feature: AddFeature
  cwd: string
  name?: string
  kind?: 'safe' | 'destructive'
  appName?: string
}): Promise<InitTemplateSet> {
  if (options.feature === 'mcp') {
    return {
      label: 'add:mcp',
      description: 'Add the canonical MCP runtime to a workspace app',
      files: mergeTemplateSets(buildMcpTemplateSet()).concat([
        {
          path: 'server/mcp/index.ts',
          content: mcpEndpointTemplate(options.appName ?? 'workspace-app'),
          ownership: 'authored',
        },
        {
          path: 'convex/domain/mcpKeys.ts',
          content: mcpKeysTemplate(),
          ownership: 'authored',
        },
        {
          path: 'server/mcp/tools/list-todos.ts',
          content: mcpListTodosToolTemplate(),
          ownership: 'authored',
        },
        {
          path: 'server/mcp/tools/create-todo.ts',
          content: mcpCreateTodoToolTemplate(),
          ownership: 'authored',
        },
      ]),
      afterWrite: async (cwd) => {
        await enableNuxtMcpConfig(cwd)
        await addMcpDependency(cwd)
        await enableWorkspaceMcpSchema(cwd)
      },
    }
  }

  if (options.feature === 'uploads') {
    return {
      label: 'add:uploads',
      description: 'Add a canonical upload URL seam and starter page',
      files: [
        {
          path: 'convex/domain/files.ts',
          content: uploadsDomainTemplate(),
          ownership: 'authored',
        },
        {
          path: 'pages/uploads.vue',
          content: uploadsPageTemplate(),
          ownership: 'authored',
        },
      ],
    }
  }

  if (options.feature === 'resource') {
    if (!options.name) {
      throw new Error('`trellis add resource <name>` requires a resource name.')
    }

    return await buildResourceTemplateSet(options.cwd, options.name)
  }

  if (!options.name) {
    throw new Error('`trellis add operation <name>` requires an operation name.')
  }

  return {
    label: `add:operation:${kebabCase(options.name)}`,
    description: 'Add a canonical operation scaffold',
    files: [
      {
        path: `convex/operations/${kebabCase(options.name)}.ts`,
        content: operationTemplate(options.name, options.kind ?? 'safe'),
        ownership: 'authored',
      },
    ],
  }
}
