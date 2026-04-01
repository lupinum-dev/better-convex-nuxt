import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export type InitTarget = 'auth' | 'permissions' | 'mcp'
export type PermissionModel = 'personal' | 'workspace' | 'workspace-mcp'

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

function authTsTemplate() {
  return `
import { betterAuth } from 'better-auth'

import { createConvexAuth } from './authBridge'

export const { authComponent, createAuth, createUserIfNeeded } = createConvexAuth(
  (_ctx, bridge) =>
    betterAuth({
      baseURL: bridge.siteUrl,
      database: bridge.database,
      emailAndPassword: {
        enabled: true,
      },
      plugins: bridge.plugins,
      trustedOrigins: bridge.trustedOrigins,
    }),
)
`.trimStart()
}

function authBridgeTemplate() {
  return `
import { createClient } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'

import { components, internal } from './_generated/api'
import { mutation } from './_generated/server'
import authConfig from './auth.config'

const siteUrl = process.env.SITE_URL || 'http://localhost:3000'
const trustedOrigins = [siteUrl, 'http://127.0.0.1:3000', 'http://localhost:3000']

function buildUserFields(
  input: { authId: string, email?: string | null, displayName?: string | null },
  now: number,
) {
  return {
    authId: input.authId,
    email: input.email ?? null,
    displayName: input.displayName ?? null,
    createdAt: now,
    updatedAt: now,
    // __BCN_DEFAULT_USER_FIELDS__
  }
}

function buildUpdatedUserFields(input: { email?: string | null, displayName?: string | null }) {
  return {
    email: input.email ?? null,
    displayName: input.displayName ?? null,
    updatedAt: Date.now(),
  }
}

export function createConvexAuth(buildAuth) {
  const authComponent = createClient(components.betterAuth, {
    authFunctions: internal.auth,
    triggers: {
      user: {
        onCreate: async (ctx, doc) => {
          const now = Date.now()
          await ctx.db.insert('users', buildUserFields({
            authId: doc._id,
            email: doc.email,
            displayName: doc.name,
          }, now))
        },
        onUpdate: async (ctx, doc) => {
          const user = await ctx.db
            .query('users')
            .withIndex('by_auth_id', q => q.eq('authId', doc._id))
            .first()

          if (!user) {
            return
          }

          await ctx.db.patch(user._id, buildUpdatedUserFields({
            email: doc.email,
            displayName: doc.name,
          }))
        },
        onDelete: async (ctx, doc) => {
          const user = await ctx.db
            .query('users')
            .withIndex('by_auth_id', q => q.eq('authId', doc._id))
            .first()

          if (user) {
            await ctx.db.delete(user._id)
          }
        },
      },
    },
  })

  const bridge = {
    siteUrl,
    trustedOrigins,
    database: null,
    plugins: [convex({ authConfig })],
  }

  const createAuth = (ctx) =>
    buildAuth(ctx, {
      ...bridge,
      database: authComponent.adapter(ctx),
    })

  const createUserIfNeeded = mutation({
    args: {},
    handler: async (ctx) => {
      const identity = await ctx.auth.getUserIdentity()
      if (!identity) {
        throw new Error('Not authenticated.')
      }

      const existing = await ctx.db
        .query('users')
        .withIndex('by_auth_id', q => q.eq('authId', identity.subject))
        .first()

      if (existing) {
        return existing._id
      }

      const now = Date.now()
      return await ctx.db.insert('users', buildUserFields({
        authId: identity.subject,
        email: identity.email,
        displayName: identity.name,
      }, now))
    },
  })

  return {
    authComponent,
    createAuth,
    createUserIfNeeded,
  }
}
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

import { vi } from 'vitest'

import { convexServerMock, createConvexTestModules } from 'better-convex-nuxt/testing'

export const modules = createConvexTestModules(import.meta.glob('./**/*.ts', {
  eager: false,
}))

vi.mock('./_generated/server', async () => await convexServerMock())
`.trimStart()
}

function personalActorTemplate() {
  return `
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import { getAuth } from 'better-convex-nuxt/auth'

import type { DataModel } from '../_generated/dataModel'

export type Actor =
  | { kind: 'user'; userId: string }
  | null

type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export async function getActor(ctx: Ctx): Promise<Actor> {
  const auth = await getAuth(ctx)
  if (!auth) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', q => q.eq('authId', auth.subject))
    .first()

  if (!user) return null

  return {
    kind: 'user',
    userId: user.authId,
  }
}
`.trimStart()
}

function personalChecksTemplate() {
  return `
import type { Actor } from './actor'

export const isAuthenticated = (actor: Actor) => actor !== null

export const isOwnerOf = (resource: { userId: string }) =>
  (actor: Actor) => !!actor && actor.kind === 'user' && actor.userId === resource.userId
`.trimStart()
}

function personalPermissionQueryTemplate() {
  return `
import { query } from './_generated/server'
import { getActor } from './auth/actor'

export const getPermissionContext = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    if (!actor) {
      return null
    }

    return {
      userId: actor.userId,
      can: {
        'profile.read': true,
        'todo.create': true,
      },
    }
  },
})
`.trimStart()
}

function workspaceActorTemplate({ withServiceCaller }: { withServiceCaller: boolean }) {
  return `
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import { getAuth } from 'better-convex-nuxt/auth'
${withServiceCaller ? "import { getTrustedCaller } from 'better-convex-nuxt/trusted-caller'\n" : ''}
import type { DataModel } from '../_generated/dataModel'

export type Role = 'owner' | 'admin' | 'member' | 'viewer'

export type Actor =
  | { kind: 'user'; userId: string; role: Role; tenantId: string }
  | null

type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export async function getActor(ctx: Ctx, args?: Record<string, unknown>): Promise<Actor> {
${
  withServiceCaller
    ? `  const trustedCaller = getTrustedCaller(args)
  if (trustedCaller) {
    const membership = await ctx.db
      .query('users')
      .withIndex('by_auth_id', q => q.eq('authId', trustedCaller.userId))
      .first()

    if (!membership?.workspaceId) return null

    return {
      kind: 'user',
      userId: membership.authId,
      role: membership.role,
      tenantId: membership.workspaceId,
    }
  }

`
    : ''
}  const auth = await getAuth(ctx)
  if (!auth) return null

  const membership = await ctx.db
    .query('users')
    .withIndex('by_auth_id', q => q.eq('authId', auth.subject))
    .first()

  if (!membership?.workspaceId) return null

  return {
    kind: 'user',
    userId: membership.authId,
    role: membership.role,
    tenantId: membership.workspaceId,
  }
}
`.trimStart()
}

function workspaceChecksTemplate() {
  return `
import { and } from 'better-convex-nuxt/auth'

import type { Actor, Role } from './actor'

export const isAuthenticated = (actor: Actor) => actor !== null

export const hasMinimumRole = (minimum: Role) =>
  (actor: Actor) => {
    if (!actor) return false

    const ranks: Record<Role, number> = {
      owner: 4,
      admin: 3,
      member: 2,
      viewer: 1,
    }

    return ranks[actor.role] >= ranks[minimum]
  }

export const isWorkspaceMember = (tenantId: string) =>
  (actor: Actor) => !!actor && actor.tenantId === tenantId

export const canManageWorkspace = and(isAuthenticated, hasMinimumRole('admin'))
`.trimStart()
}

function workspaceResourceTemplate() {
  return `
import { deny, requireRecord } from 'better-convex-nuxt/auth'

export { requireRecord }

export function ensureTenant<T extends { workspaceId: string }>(
  actor: { tenantId: string },
  resource: T,
  label = 'Resource',
): T {
  if (resource.workspaceId !== actor.tenantId) {
    throw deny(\`\${label} not found.\`)
  }
  return resource
}
`.trimStart()
}

function workspacePermissionQueryTemplate() {
  return `
import { query } from './_generated/server'
import { getActor } from './auth/actor'

export const getPermissionContext = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx)
    if (!actor) {
      return null
    }

    return {
      userId: actor.userId,
      tenantId: actor.tenantId,
      role: actor.role,
      can: {
        'workspace.read': true,
        'workspace.members': actor.role === 'owner' || actor.role === 'admin',
        'todo.create': actor.role !== 'viewer',
      },
    }
  },
})
`.trimStart()
}

function mcpMiddlewareTemplate() {
  return `
import { createHash } from 'node:crypto'

import { defineEventHandler, getHeader, createError } from 'h3'

import { api } from '~/convex/_generated/api'

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
  const key = await serverConvexQuery(api.mcpKeys.validate, { hash })
  if (!key) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid MCP bearer token.' })
  }

  event.context.mcpAuth = key
})
`.trimStart()
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

async function updateAuthBridgeDefaults(cwd: string, fields: string): Promise<void> {
  const authBridgePath = resolve(cwd, 'convex/authBridge.ts')
  if (!(await pathExists(authBridgePath))) {
    return
  }

  const source = await readFile(authBridgePath, 'utf8')
  const nextSource = source.replace('// __BCN_DEFAULT_USER_FIELDS__', fields)
  if (nextSource !== source) {
    await writeFile(authBridgePath, nextSource, 'utf8')
  }
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

export function getInitTemplateSet(target: InitTarget, model?: PermissionModel): InitTemplateSet {
  if (target === 'auth') {
    return {
      label: 'auth',
      description: 'Scaffold Better Auth + Convex bridge files',
      files: [
        { path: 'convex/auth.ts', content: authTsTemplate(), ownership: 'authored' },
        { path: 'convex/authBridge.ts', content: authBridgeTemplate(), ownership: 'generated' },
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

  if (target === 'permissions') {
    if (!model) {
      throw new Error(
        'Missing permissions model. Use --model personal, workspace, or workspace-mcp.',
      )
    }

    if (model === 'personal') {
      return {
        label: 'permissions:personal',
        description: 'Scaffold app-owned personal actor and permission context files',
        files: [
          { path: 'convex/auth/actor.ts', content: personalActorTemplate(), ownership: 'authored' },
          {
            path: 'convex/auth/checks.ts',
            content: personalChecksTemplate(),
            ownership: 'authored',
          },
          {
            path: 'convex/users.ts',
            content: personalPermissionQueryTemplate(),
            ownership: 'authored',
          },
        ],
      }
    }

    return {
      label: `permissions:${model}`,
      description: 'Scaffold workspace permission policy files',
      files: [
        {
          path: 'convex/auth/actor.ts',
          content: workspaceActorTemplate({ withServiceCaller: model === 'workspace-mcp' }),
          ownership: 'authored',
        },
        {
          path: 'convex/auth/checks.ts',
          content: workspaceChecksTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/auth/resource.ts',
          content: workspaceResourceTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/workspaces.ts',
          content: workspacePermissionQueryTemplate(),
          ownership: 'authored',
        },
      ],
      afterWrite: async (cwd) => await updateAuthBridgeDefaults(cwd, "role: 'member',"),
    }
  }

  if (target === 'mcp') {
    return {
      label: 'mcp',
      description: 'Scaffold MCP middleware glue',
      files: [
        {
          path: 'server/middleware/mcp-auth.ts',
          content: mcpMiddlewareTemplate(),
          ownership: 'authored',
        },
      ],
    }
  }

  throw new Error(`Unsupported init target "${target}".`)
}
