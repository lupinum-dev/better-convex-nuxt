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
import { defineAuth } from 'better-convex-nuxt/auth'

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
import { defineActor } from 'better-convex-nuxt/auth'

const actor = defineActor.fromAuth()

export type Actor = typeof actor.type | null

export const getActor = actor.resolve
`.trimStart()
}

function personalChecksTemplate() {
  return `
import { defineGuard } from 'better-convex-nuxt/auth'

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
import { createFunctions, defineHandler } from 'better-convex-nuxt/functions'

import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'

export const { query: appQuery, mutation: appMutation } = createFunctions(query, mutation, {
  trustedCaller: false,
  actor: getActor,
})

export const app = defineHandler(appQuery, appMutation)

export { query, mutation }
`.trimStart()
}

function personalPermissionQueryTemplate() {
  return `
import { definePermissionContext } from 'better-convex-nuxt/auth'

import { isAuthenticated } from './auth/checks'
import { getActor } from './auth/actor'
import { appQuery } from './functions'

export const getPermissionContext = appQuery(
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
import { defineActor, type DefaultActor } from 'better-convex-nuxt/auth'

export type Role = 'owner' | 'admin' | 'member' | 'viewer'

type WorkspaceActor = DefaultActor & {
  role: Role
  tenantId: string
}

const actor = defineActor
  .fromAuth()
  .extend({
    fields: async (_ctx, user) => ({
      role: (user.role ?? 'member') as Role,
      tenantId: user.workspaceId as string | undefined,
    }),
  })
  .filter((value): value is WorkspaceActor => !!value.tenantId)

export type Actor = typeof actor.type | null

export const getActor = actor.resolve
`.trimStart()
}

function workspaceFunctionsTemplate({ trustedCaller }: { trustedCaller: boolean }) {
  return `
import { createFunctions, defineHandler } from 'better-convex-nuxt/functions'

import { mutation, query } from './_generated/server'
import { getActor } from './auth/actor'

export const { query: appQuery, mutation: appMutation } = createFunctions(query, mutation, {
  trustedCaller: ${trustedCaller ? 'true' : 'false'},
  actor: getActor,
  // Add tenantIsolation only for tables that actually store the tenant field.
  // Example:
  // tenantIsolation: {
  //   tables: ['todos'],
  // },
})

export const app = defineHandler(appQuery, appMutation)

export { query, mutation }
`.trimStart()
}

function workspaceChecksTemplate() {
  return `
import { defineGuard } from 'better-convex-nuxt/auth'

import type { Actor, Role } from './actor'

export const isAuthenticated = defineGuard<Actor>('authenticated', (actor) => actor !== null)

export const hasMinimumRole = (minimum: Role) =>
  defineGuard<Actor>(\`role>=\${minimum}\`, (actor) => {
    if (!actor) return false

    const ranks: Record<Role, number> = {
      owner: 4,
      admin: 3,
      member: 2,
      viewer: 1,
    }

    return ranks[actor.role] >= ranks[minimum]
  })

export const isWorkspaceMember = (tenantId: string) =>
  defineGuard<Actor>(\`workspace:\${tenantId}\`, (actor) => !!actor && actor.tenantId === tenantId)

export const canManageWorkspace = defineGuard<Actor>(
  'manage-workspace',
  hasMinimumRole('admin'),
)
`.trimStart()
}

function workspacePermissionQueryTemplate() {
  return `
import { defineGuard, definePermissionContext } from 'better-convex-nuxt/auth'

import { getActor } from './auth/actor'
import { hasMinimumRole, isAuthenticated } from './auth/checks'
import { appQuery } from './functions'

const canCreateTodo = defineGuard('todo.create', hasMinimumRole('member'))

export const getPermissionContext = appQuery(
  definePermissionContext({
    resolve: getActor,
    guards: {
      'workspace.read': isAuthenticated,
      'workspace.members': hasMinimumRole('admin'),
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
  const key = await serverConvexQuery(api.mcpKeys.validate, { hash }, { auth: 'none' })
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
          content: workspaceFunctionsTemplate({ trustedCaller: model === 'workspace-mcp' }),
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
      ],
    }
  }

  throw new Error(`Unsupported init target "${target}".`)
}
