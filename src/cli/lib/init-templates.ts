import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const initTemplateDir = resolve(dirname(fileURLToPath(import.meta.url)), '../templates/init')
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

export function personalPermissionQueryTemplate() {
  return readStaticTemplate('personalPermissionQueryTemplate')
}

export function personalPermissionsTemplate() {
  return readStaticTemplate('personalPermissionsTemplate')
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
  return readStaticTemplate('workspacePermissionQueryTemplate')
}

export function workspacePermissionsTemplate() {
  return readStaticTemplate('workspacePermissionsTemplate')
}

export function mcpMiddlewareTemplate() {
  return readStaticTemplate('mcpMiddlewareTemplate')
}

export function mcpRuntimeTemplate() {
  return readStaticTemplate('mcpRuntimeTemplate')
}

export function personalSchemaTemplate() {
  return readStaticTemplate('personalSchemaTemplate')
}

export function personalTodosTemplate() {
  return readStaticTemplate('personalTodosTemplate')
}

export function personalPageTemplate() {
  return readStaticTemplate('personalPageTemplate')
}

export function workspaceFunctionsAppTemplate() {
  return readStaticTemplate('workspaceFunctionsAppTemplate')
}

export function workspaceOnboardingTemplate() {
  return readStaticTemplate('workspaceOnboardingTemplate')
}

export function workspaceTodosTemplate() {
  return readStaticTemplate('workspaceTodosTemplate')
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

export function uploadsPageTemplate() {
  return readStaticTemplate('uploadsPageTemplate')
}

export function nuxtConfigTemplate(options: {
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

export function sharedTodoSchemaTemplate(kind: 'personal' | 'workspace') {
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
  title: todoTitleSchema.describe('${kind === 'personal' ? 'Private todo title' : 'Workspace todo title'}'),
})
`.trimStart()
}

export function todoContractTemplate(kind: 'personal' | 'workspace') {
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

export function workspaceSchemaTemplate(includeMcpKeys: boolean) {
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
${includeMcpKeys ? readStaticTemplate('mcpKeysSchemaBlock') : ''}
})
`.trimStart()
}

export function workspacePageTemplate(options: { title: string; mcp: boolean }) {
  return `
<script setup lang="ts">
import { api } from '#trellis/api'
import { createTodoInputSchema } from '~/shared/schemas/todo'

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
  const parsed = createTodoInputSchema.safeParse({ title: title.value })
  if (!parsed.success) return

  await createTodo(parsed.data)
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
