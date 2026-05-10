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

export function personalFunctionsTemplate() {
  return readStaticTemplate('personalFunctionsTemplate')
}

export function mcpMiddlewareTemplate() {
  return readStaticTemplate('mcpMiddlewareTemplate')
}

export function mcpRuntimeTemplate() {
  return readStaticTemplate('mcpRuntimeTemplate')
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
