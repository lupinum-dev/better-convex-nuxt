import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const initTemplateDirCandidates = [
  resolve(dirname(fileURLToPath(import.meta.url)), '../templates/init'),
  resolve(dirname(fileURLToPath(import.meta.url)), './templates/init'),
]
function resolveInitTemplateDir(): string {
  const initTemplateDir = initTemplateDirCandidates.find((path) => existsSync(path))
  if (!initTemplateDir) {
    throw new Error(
      `Missing CLI template directory. Checked: ${initTemplateDirCandidates.join(', ')}`,
    )
  }

  return initTemplateDir
}
const initTemplateDir = resolveInitTemplateDir()
const staticTemplateCache = new Map<string, string>()

function readStaticTemplate(name: string): string {
  const cached = staticTemplateCache.get(name)
  if (cached) return cached

  const content = readFileSync(resolve(initTemplateDir, `${name}.tpl`), 'utf8')
  staticTemplateCache.set(name, content)
  return content
}

export function authTsTemplate() {
  return readStaticTemplate('authTsTemplate')
}

export function authConfigTemplate() {
  return readStaticTemplate('authConfigTemplate')
}

export function httpTemplate() {
  return readStaticTemplate('httpTemplate')
}

export function convexConfigTemplate() {
  return readStaticTemplate('convexConfigTemplate')
}

export function testSetupTemplate() {
  return readStaticTemplate('testSetupTemplate')
}

export function personalActorTemplate() {
  return readStaticTemplate('personalActorTemplate')
}

export function personalChecksTemplate() {
  return readStaticTemplate('personalChecksTemplate')
}

export function personalFunctionsTemplate() {
  return readStaticTemplate('personalFunctionsTemplate')
}

export function workspaceActorTemplate() {
  return readStaticTemplate('workspaceActorTemplate')
}

export function workspacePrincipalTemplate() {
  return readStaticTemplate('workspacePrincipalTemplate')
}

export function workspaceFunctionsTemplate() {
  return readStaticTemplate('workspaceFunctionsTemplate')
}

export function workspaceChecksTemplate() {
  return readStaticTemplate('workspaceChecksTemplate')
}

export function workspacePermissionQueryTemplate() {
  return `
import { definePermissionContext } from '@lupinum/trellis/auth'

import { getPermissionActor } from '../auth/actor'
import { permissions } from '../features'
import { query } from '../functions'

export const getPermissionContext = query.protected(
  definePermissionContext({
    resolve: getPermissionActor,
    permissions,
  }),
)
`.trimStart()
}

export function mcpMiddlewareTemplate() {
  return readStaticTemplate('mcpMiddlewareTemplate')
}

export function mcpRuntimeTemplate() {
  return readStaticTemplate('mcpRuntimeTemplate')
}

export function workspaceFunctionsAppTemplate() {
  return `
import type { TableNames } from './_generated/dataModel'
import { mutation as generatedMutation, query as generatedQuery } from './_generated/server'
import { defineTrellis } from '@lupinum/trellis/backend'

import { getActorFromPrincipal } from './auth/actor'
import { principal } from './auth/principal'
import { globalTables, tenantTables } from './features'

const isolatedTables = [...tenantTables] as TableNames[]
const explicitlyGlobalTables = [...globalTables] as TableNames[]

export const { mutation, query } = defineTrellis(
  { query: generatedQuery, mutation: generatedMutation },
  {
    principal,
    actor: getActorFromPrincipal,
    tenantIsolation: {
      tables: isolatedTables,
      globalTables: explicitlyGlobalTables,
    },
  },
)
`.trimStart()
}

export function workspaceTodosTemplate() {
  return `
import { createTodo, listTodos } from '../../../shared/features/todos/contract'

import { mutation, query } from '../../functions'
import { todoCreate, workspaceRead } from './permissions'

export const list = query.protected({
  args: listTodos.args,
  guard: workspaceRead,
  handler: async (ctx) => {
    const actor = await ctx.actor()
    if (!actor?.tenantId) throw new Error('Current actor is not assigned to a workspace.')

    return await ctx.db
      .query('todos')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', actor.tenantId))
      .order('desc')
      .collect()
  },
})

export const create = mutation.protected({
  args: createTodo.args,
  guard: todoCreate,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    if (!actor?.tenantId) throw new Error('Current actor is not assigned to a workspace.')

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

export function sharedPageSchemaTemplate() {
  return readStaticTemplate('sharedPageSchemaTemplate')
}

export function pageContractTemplate() {
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

export function cmsChecksTemplate() {
  return readStaticTemplate('cmsChecksTemplate')
}

export function cmsPermissionQueryTemplate() {
  return readStaticTemplate('cmsPermissionQueryTemplate')
}

export function cmsPermissionsTemplate() {
  return readStaticTemplate('cmsPermissionsTemplate')
}

export function cmsSchemaTemplate() {
  return readStaticTemplate('cmsSchemaTemplate')
}

export function cmsPagesTemplate() {
  return readStaticTemplate('cmsPagesTemplate')
}

export function cmsPagesSchemaTemplate() {
  return `
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const pagesTables = {
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
}
`.trimStart()
}

export function cmsPagesFeatureTemplate() {
  return `
import { defineFeature } from '@lupinum/trellis/feature'

import { pagePermissions } from './permissions'
import { pagesTables } from './schema'

export const pagesFeature = defineFeature({
  name: 'pages',
  schema: pagesTables,
  permissions: pagePermissions,
})
`.trimStart()
}

export function cmsPagesIndexTemplate() {
  return `
export { pagesFeature } from './feature'
export { pageCreate, pagePermissions, pagePublish, studioRead } from './permissions'
export { pagesTables } from './schema'
`.trimStart()
}

export function cmsUsersSchemaTemplate() {
  return `
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const userTables = {
  users: defineTable({
    authId: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    role: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_auth_id', ['authId']),
}
`.trimStart()
}

export function cmsUsersFeatureTemplate() {
  return `
import { defineFeature } from '@lupinum/trellis/feature'

import { userTables } from './schema'

export const usersFeature = defineFeature({
  name: 'users',
  schema: userTables,
  globalTables: ['users'],
})
`.trimStart()
}

export function cmsUsersIndexTemplate() {
  return `
export { usersFeature } from './feature'
export { userTables } from './schema'
`.trimStart()
}

export function cmsFeaturesIndexTemplate() {
  return `
import { composeFeatures } from '@lupinum/trellis/feature'

import { pagesFeature } from './pages/feature'
import { usersFeature } from './users/feature'

const manifest = composeFeatures([usersFeature, pagesFeature])

export const schema = manifest.schema
export const permissions = manifest.permissions
export const tenantTables = manifest.tenantTables
export const globalTables = manifest.globalTables
`.trimStart()
}

export function cmsPublicPageTemplate() {
  return readStaticTemplate('cmsPublicPageTemplate')
}

export function cmsStudioPageTemplate() {
  return readStaticTemplate('cmsStudioPageTemplate')
}

export function cmsSlugPageTemplate() {
  return readStaticTemplate('cmsSlugPageTemplate')
}

export function mcpKeysTemplate() {
  return readStaticTemplate('mcpKeysTemplate')
}

export function mcpListTodosToolTemplate() {
  return readStaticTemplate('mcpListTodosToolTemplate')
}

export function mcpCreateTodoToolTemplate() {
  return readStaticTemplate('mcpCreateTodoToolTemplate')
}

export function uploadsDomainTemplate() {
  return readStaticTemplate('uploadsDomainTemplate')
}

export function uploadsContractTemplate() {
  return readStaticTemplate('uploadsContractTemplate')
}

export function uploadsPageTemplate() {
  return readStaticTemplate('uploadsPageTemplate')
}

export function nuxtConfigTemplate(options: {
  authEnabled?: boolean
  permissionsQuery?: string
  mcp?: boolean
  mcpName?: string
}) {
  return `
export default defineNuxtConfig({
  modules: ['@lupinum/trellis'],
  trellis: {
    url: process.env.CONVEX_URL,
    auth: ${options.authEnabled === false ? 'false' : 'true'},${
      options.permissionsQuery
        ? `
    permissions: '${options.permissionsQuery}',`
        : ''
    }
${options.mcp ? `    mcp: { name: '${options.mcpName ?? 'starter-app'}', sessions: true },` : ''}
  },
})
`.trimStart()
}

export function sharedTodoSchemaTemplate(kind: 'public' | 'personal' | 'workspace') {
  return `
import * as z from 'zod'

const todoTitleSchema = z
  .string()
  .trim()
  .min(1, 'Title is required')
  .max(160, 'Keep it under 160 characters')

export const createTodoInputSchema = z.object({
  title: todoTitleSchema,
})

export const createTodoFormSchema = createTodoInputSchema.extend({
  title: todoTitleSchema.describe('${kind === 'public' ? 'Public todo title' : kind === 'personal' ? 'Private todo title' : 'Workspace todo title'}'),
})
`.trimStart()
}

export function todoContractTemplate(kind: 'public' | 'personal' | 'workspace') {
  return `
import { defineArgs } from '@lupinum/trellis/args'
import { v } from 'convex/values'

export const createTodo = defineArgs({
  description: '${kind === 'public' ? 'Create a public todo' : kind === 'personal' ? 'Create a personal todo' : 'Create a workspace todo'}',
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

export function workspaceSchemaTemplate(includeMcpKeys: boolean) {
  return `
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import { todosTables } from './features/todos'
import { userTables } from './features/users'
import { workspaceTables } from './features/workspaces'

export default defineSchema({
  ...workspaceTables,
  ...userTables,
  ...todosTables,
${includeMcpKeys ? readStaticTemplate('mcpKeysSchemaBlock') : ''}
})
`.trimStart()
}

export function workspaceFeaturesIndexTemplate() {
  return `
import { composeFeatures } from '@lupinum/trellis/feature'

import { todosFeature } from './todos/feature'
import { usersFeature } from './users/feature'
import { workspacesFeature } from './workspaces/feature'

const manifest = composeFeatures([workspacesFeature, usersFeature, todosFeature])

export const schema = manifest.schema
export const permissions = manifest.permissions
export const tenantTables = manifest.tenantTables
export const globalTables = manifest.globalTables
`.trimStart()
}

export function workspaceTodosSchemaTemplate() {
  return `
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const todosTables = {
  todos: defineTable({
    workspaceId: v.id('workspaces'),
    title: v.string(),
    completed: v.boolean(),
    createdAt: v.number(),
  }).index('by_workspace', ['workspaceId']),
}
`.trimStart()
}

export function workspaceTodosPermissionsTemplate() {
  return `
import { definePermission } from '@lupinum/trellis/auth'

import { hasMinimumRole, hasWorkspace } from '../../auth/guards'

export const workspaceRead = definePermission({
  key: 'workspace.read',
  check: hasWorkspace,
})

export const todoCreate = definePermission({
  key: 'todo.create',
  check: hasWorkspace.and(hasMinimumRole('member')),
})

export const todoPermissions = [workspaceRead, todoCreate] as const
`.trimStart()
}

export function workspaceTodosFeatureTemplate() {
  return `
import { defineFeature } from '@lupinum/trellis/feature'

import { todoPermissions } from './permissions'
import { todosTables } from './schema'

export const todosFeature = defineFeature({
  name: 'todos',
  schema: todosTables,
  permissions: todoPermissions,
})
`.trimStart()
}

export function workspaceTodosIndexTemplate() {
  return `
export { todosFeature } from './feature'
export { todoCreate, todoPermissions, workspaceRead } from './permissions'
export { todosTables } from './schema'
`.trimStart()
}

export function workspaceUsersSchemaTemplate() {
  return `
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const userTables = {
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
}
`.trimStart()
}

export function workspaceUsersFeatureTemplate() {
  return `
import { defineFeature } from '@lupinum/trellis/feature'

import { userTables } from './schema'

export const usersFeature = defineFeature({
  name: 'users',
  schema: userTables,
  globalTables: ['users'],
})
`.trimStart()
}

export function workspaceUsersIndexTemplate() {
  return `
export { usersFeature } from './feature'
export { userTables } from './schema'
`.trimStart()
}

export function workspaceWorkspacesContractTemplate() {
  return `
import { defineArgs } from '@lupinum/trellis/args'
import { v } from 'convex/values'

export const createWorkspace = defineArgs({
  description: 'Create a new workspace for the signed-in user.',
  args: {
    name: v.string(),
  },
})
`.trimStart()
}

export function workspaceWorkspacesSchemaTemplate() {
  return `
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const workspaceTables = {
  workspaces: defineTable({
    name: v.string(),
    createdAt: v.number(),
  }),
}
`.trimStart()
}

export function workspaceWorkspacesDomainTemplate() {
  return `
import { authRequired } from '@lupinum/trellis/auth'

import { createWorkspace } from '../../../shared/features/workspaces/contract'
import { mutation } from '../../functions'

export const createWorkspaceMutation = mutation.protected({
  guard: authRequired,
  args: createWorkspace.args,
  handler: async (ctx, args) => {
    const principal = await ctx.principal()
    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', principal.userId))
      .first()

    if (!user) {
      throw new Error('Current user row not found.')
    }

    const now = Date.now()
    const workspaceId = await ctx.db.insert('workspaces', {
      name: args.name,
      createdAt: now,
    })

    await ctx.db.patch(user._id, {
      role: 'owner',
      workspaceId,
      updatedAt: now,
    })

    return workspaceId
  },
})
`.trimStart()
}

export function workspaceWorkspacesFeatureTemplate() {
  return `
import { defineFeature } from '@lupinum/trellis/feature'

import { workspaceTables } from './schema'

export const workspacesFeature = defineFeature({
  name: 'workspaces',
  schema: workspaceTables,
  globalTables: ['workspaces'],
})
`.trimStart()
}

export function workspaceWorkspacesIndexTemplate() {
  return `
export { workspacesFeature } from './feature'
export { workspaceTables } from './schema'
`.trimStart()
}

export function appShellTemplate() {
  return `
<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
`.trimStart()
}

export function routeShellTemplate(options: { importPath: string; componentName: string }) {
  return `
<script setup lang="ts">
import ${options.componentName} from '${options.importPath}'
</script>

<template>
  <${options.componentName} />
</template>
`.trimStart()
}

export function workspacePageTemplate(options: { title: string; mcp: boolean }) {
  return `
<script setup lang="ts">
import { api } from '#trellis/api'
import { todoCreate } from '~~/convex/features/todos'
import { createTodo } from '~~/shared/features/todos/contract'

const { isAuthenticated, isPending, signOut, user } = useConvexAuth()
const { signIn, pending: signInPending, error: signInError } = useConvexSignIn()
const { signUp, pending: signUpPending, error: signUpError } = useConvexSignUp()
const { allows, ready, tenantId, role } = usePermissions()

const email = ref('owner@example.com')
const password = ref('password1234')
const workspaceName = ref('My workspace')
const title = ref('')

const todoArgs = computed(() => (ready.value ? {} : undefined))
const { data: todos } = await useConvexQuery(api.features.todos.domain.list, todoArgs)

const createWorkspace = useConvexMutation(api.features.workspaces.domain.createWorkspaceMutation)
const createTodoMutation = useConvexMutation(api.features.todos.domain.create)
const canCreate = allows(todoCreate)

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
  const parsed = createTodo.zod.safeParse({ title: title.value })
  if (!parsed.success) return

  await createTodoMutation(parsed.data)
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
        <button :disabled="createTodoMutation.pending.value || !canCreate" @click="handleCreateTodo">Add</button>
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

export function mcpEndpointTemplate(appName: string) {
  return `
export default defineMcpHandler({
  name: '${
    appName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'trellis-app'
  }',
  browserRedirect: '/',
})
`.trimStart()
}
