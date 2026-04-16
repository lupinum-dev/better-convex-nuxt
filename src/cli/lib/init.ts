import { access, mkdir, writeFile } from 'node:fs/promises'
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
import { defineActor } from '@lupinum/trellis/auth'

const actor = defineActor.fromAuth()

export type Actor = typeof actor.type | null

export const getActor = actor.resolve
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

import { isAuthenticated } from './auth/checks'
import { getActor } from './auth/actor'
import { query } from './functions'

export const getPermissionContext = query(
  definePermissionContext({
    resolve: getActor,
    guards: {
      'profile.read': isAuthenticated,
      'todo.create': isAuthenticated,
    },
  }),
)
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
    role: user.role as Role,
    tenantId: user.workspaceId as Id<'workspaces'> | undefined,
  }
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
      const actor = await loadActorByAuthId(ctx, principal.userId)
      return actor?.tenantId ? { ...actor, tenantId: actor.tenantId } : null
    }
  }
}

export async function getPermissionActor(ctx: WorkspaceCtx): Promise<PermissionActor | null> {
  const auth = await getAuth(ctx)
  if (!auth) return null
  return await loadActorByAuthId(ctx, auth.subject)
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
import { definePrincipal } from '@lupinum/trellis/functions'
import { v } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel'

export type Role = Doc<'users'>['role']

export type WorkspacePrincipal =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string }
  | {
      kind: 'agent'
      userId: string
      role: Role
      tenantId?: Id<'workspaces'>
      provider?: 'mcp'
    }

export const workspacePrincipalValidator = v.union(
  v.object({
    kind: v.literal('anonymous'),
  }),
  v.object({
    kind: v.literal('user'),
    userId: v.string(),
  }),
  v.object({
    kind: v.literal('agent'),
    userId: v.string(),
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
    const forwarded = (args as { principal?: WorkspacePrincipal }).principal
    if (forwarded) return forwarded

    const auth = await getAuth(ctx)
    if (!auth) {
      return { kind: 'anonymous' }
    }

    return {
      kind: 'user',
      userId: auth.subject,
    }
  },
})
`.trimStart()
}

function workspaceFunctionsTemplate() {
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
import { defineGuard, definePermissionContext } from '@lupinum/trellis/auth'

import { getPermissionActor } from './auth/actor'
import { hasMinimumRole, hasWorkspace, isAuthenticated } from './auth/checks'
import { query } from './functions'

const canCreateTodo = defineGuard('todo.create', hasWorkspace.and(hasMinimumRole('member')))

export const getPermissionContext = query(
  definePermissionContext({
    resolve: getPermissionActor,
    guards: {
      'workspace.read': isAuthenticated,
      'workspace.members': hasWorkspace.and(hasMinimumRole('admin')),
      'todo.create': canCreateTodo,
    },
  }),
)
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
  const key = await serverConvexQuery(api.mcpKeys.validate, { hash }, { auth: 'none' })
  if (!key) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid MCP bearer token.' })
  }

  event.context.mcpAuth = key
})
`.trimStart()
}

function mcpRuntimeTemplate() {
  return `
import { defineMcpApp } from '@lupinum/trellis/mcp'
import { createServerConvexCaller } from '@lupinum/trellis/server'
import type { H3Event } from 'h3'

import type { Id } from '~/convex/_generated/dataModel'
import type { WorkspacePrincipal } from '~/convex/auth/principal'

type McpAuthContext = {
  userId?: string
  role?: 'owner' | 'admin' | 'member' | 'viewer'
  tenantId?: string
}

function getMcpPrincipal(event: H3Event): WorkspacePrincipal {
  const auth = event.context.mcpAuth as McpAuthContext | undefined
  if (!auth?.userId || !auth.role) {
    return { kind: 'anonymous' }
  }

  return {
    kind: 'agent',
    userId: auth.userId,
    role: auth.role,
    tenantId: auth.tenantId as Id<'workspaces'> | undefined,
    provider: 'mcp',
  }
}

function canWrite(role: NonNullable<McpAuthContext['role']>) {
  return role === 'owner' || role === 'admin' || role === 'member'
}

export const mcpRuntime = defineMcpApp<WorkspacePrincipal>({
  callConvex: async (event, principal) => createServerConvexCaller(event, { principal }),
  resolvePrincipal: async (event) => getMcpPrincipal(event),
  resolveCapabilities: async ({ principal }) => ({
    // Map projected tool names to booleans here.
    // Keep this coarse. Convex still owns business authorization.
    // Example:
    // listTodos: principal.kind === 'agent' && !!principal.tenantId,
    // createTodo: principal.kind === 'agent' && canWrite(principal.role),
  }),
  principalKey: (principal) =>
    principal.kind === 'agent' ? \`\${principal.userId}:\${principal.tenantId ?? 'none'}\` : principal.kind,
})

// Project root internal refs or bridge refs from tool files.
export const tool = mcpRuntime.tool
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
          path: 'convex/functions.ts',
          content: workspaceFunctionsTemplate(),
          ownership: 'authored',
        },
        {
          path: 'convex/workspaces.ts',
          content: workspacePermissionQueryTemplate(),
          ownership: 'authored',
        },
      ],
      afterWrite: async (_cwd) => {
        // Workspace model: userFields in defineAuth should include role: 'member'
      },
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
        {
          path: 'server/mcp/runtime.ts',
          content: mcpRuntimeTemplate(),
          ownership: 'authored',
        },
      ],
    }
  }

  throw new Error(`Unsupported init target "${target}".`)
}
