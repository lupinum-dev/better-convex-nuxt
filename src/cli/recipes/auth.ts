export type RecipeTemplate = {
  path: string
  content: string
}

export type AuthRecipeKind = 'starter' | 'block'

export interface AuthRecipe {
  id: string
  label: string
  kind: AuthRecipeKind
  description: string
  example: string
  docsPath: string
  templates: RecipeTemplate[]
}

export interface AuthStarterOption {
  starter: 'personal' | 'workspace' | 'workspace-mcp'
  recipeId: string
  label: string
  description: string
  example: string
  docsPath: string
}

const authConfigTemplate = `
import { getAuthConfigProvider } from '@convex-dev/better-auth/auth-config'
import type { AuthConfig } from 'convex/server'

export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig
`.trimStart()

const httpTemplate = `
import { httpRouter } from 'convex/server'

import { authComponent, createAuth } from './auth'

const http = httpRouter()

authComponent.registerRoutes(http, createAuth)

export default http
`.trimStart()

const convexConfigTemplate = `
import { defineApp } from 'convex/server'
import betterAuth from '@convex-dev/better-auth/convex.config'

const app = defineApp()

app.use(betterAuth, { name: 'betterAuth' })

export default app
`.trimStart()

const testSetupTemplate = `
/// <reference types="vite/client" />

import { vi } from 'vitest'

import { convexServerMock, createConvexTestModules } from 'better-convex-nuxt/testing'

export const modules = createConvexTestModules(import.meta.glob('./**/*.ts', {
  eager: false,
}))

vi.mock('./_generated/server', async () => await convexServerMock())
`.trimStart()

const personalActorTemplate = `
import type {
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server'

import { getAuth } from 'better-convex-nuxt/auth'

import type { DataModel } from '../_generated/dataModel'

export type Actor =
  | { kind: 'user'; userId: string }
  | null

type Ctx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>

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

const personalChecksTemplate = `
import type { Actor } from './actor'

export const isAuthenticated = (actor: Actor) => actor !== null

export const isOwnerOf = (resource: { userId: string }) =>
  (actor: Actor) => !!actor && actor.kind === 'user' && actor.userId === resource.userId
`.trimStart()

const personalScopeTemplate = `
import { deny, requireRecord } from 'better-convex-nuxt/auth'

export { requireRecord }

export function loadOwnedResource<T extends { userId: string }>(
  actor: { userId: string },
  doc: T | null | undefined,
  label = 'Resource',
): T {
  requireRecord(doc, label)
  if (doc.userId !== actor.userId) {
    throw deny(\`\${label} not found.\`)
  }
  return doc
}
`.trimStart()

const personalComposableTemplate = `
import { createAuth } from 'better-convex-nuxt/composables'

import { api } from '~/convex/_generated/api'

export const { usePermissions, useAuthGuard } = createAuth({
  query: api.users.getPermissionContext,
})
`.trimStart()

const personalAuthBridgeTemplate = `
import { createClient, type AuthFunctions, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth } from 'better-auth'

import { components, internal } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import { mutation } from './_generated/server'
import authConfig from './auth.config'

const siteUrl = process.env.SITE_URL || 'http://localhost:3000'
const authFunctions: AuthFunctions = internal.auth

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, doc) => {
        const now = Date.now()
        await ctx.db.insert('users', {
          authId: doc._id,
          email: doc.email,
          displayName: doc.name,
          createdAt: now,
          updatedAt: now,
        })
      },
      onUpdate: async (ctx, next) => {
        const user = await ctx.db
          .query('users')
          .withIndex('by_auth_id', q => q.eq('authId', next._id))
          .first()

        if (!user) return

        await ctx.db.patch(user._id, {
          email: next.email,
          displayName: next.name,
          updatedAt: Date.now(),
        })
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

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi()

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      convex({
        authConfig,
      }),
    ],
    trustedOrigins: [siteUrl, 'http://127.0.0.1:3000', 'http://localhost:3000'],
  })

export const createUserIfNeeded = mutation({
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
    return await ctx.db.insert('users', {
      authId: identity.subject,
      email: identity.email,
      displayName: identity.name,
      createdAt: now,
      updatedAt: now,
    })
  },
})
`.trimStart()

const workspaceActorTemplate = `
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import { getAuth } from 'better-convex-nuxt/auth'

import type { DataModel } from '../_generated/dataModel'

export type Role = 'owner' | 'admin' | 'member' | 'viewer'

export type Actor =
  | { kind: 'user'; userId: string; role: Role; tenantId: string }
  | null

type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export async function getActor(ctx: Ctx): Promise<Actor> {
  const auth = await getAuth(ctx)
  if (!auth) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', q => q.eq('authId', auth.subject))
    .first()

  if (!user?.workspaceId) return null

  return {
    kind: 'user',
    userId: user.authId,
    role: user.role,
    tenantId: user.workspaceId,
  }
}
`.trimStart()

const workspaceMcpActorTemplate = `
import type { AuthIdentity } from 'better-convex-nuxt/auth'
import { getAuth, getTrustedCaller } from 'better-convex-nuxt/auth'
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import type { DataModel } from '../_generated/dataModel'

export type Role = 'owner' | 'admin' | 'member' | 'viewer'

export type Actor =
  | { kind: 'user'; userId: string; role: Role; tenantId: string }
  | { kind: 'service'; serviceId: string; userId: string; role: Role; tenantId: string }
  | null

type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export async function getActor(ctx: Ctx, args?: unknown): Promise<Actor> {
  const trusted = getTrustedCaller(args)
  if (trusted) {
    if (!trusted.tenantId) return null
    return {
      kind: 'service',
      serviceId: 'service',
      userId: trusted.userId,
      role: trusted.role as Role,
      tenantId: trusted.tenantId,
    }
  }

  return await resolveActor(ctx, await getAuth(ctx))
}

export async function resolveActor(ctx: Ctx, auth: AuthIdentity | null): Promise<Actor> {
  if (!auth) return null

  const user = await ctx.db
    .query('users')
    .withIndex('by_auth_id', q => q.eq('authId', auth.subject))
    .first()

  if (!user?.workspaceId) return null

  return {
    kind: 'user',
    userId: user.authId,
    role: user.role,
    tenantId: user.workspaceId,
  }
}
`.trimStart()

const workspaceChecksTemplate = `
import { and, or } from 'better-convex-nuxt/auth'

import type { Actor } from './actor'

export const isAuthenticated = (actor: Actor) => actor !== null
export const hasRole = (...roles: string[]) => (actor: Actor) => !!actor && roles.includes(actor.role)
export const isOwnerOf = (resource: { ownerId: string }) =>
  (actor: Actor) => !!actor && actor.kind === 'user' && resource.ownerId === actor.userId

export const canReadWorkspace = hasRole('owner', 'admin', 'member', 'viewer')
export const canManageWorkspace = hasRole('owner', 'admin')

export const canUpdateOwned = (resource: { ownerId: string }) =>
  or(hasRole('owner', 'admin'), and(hasRole('member'), isOwnerOf(resource)))
`.trimStart()

const workspaceScopeTemplate = `
import { deny, requireAuth, requireRecord } from 'better-convex-nuxt/auth'

import type { Actor } from './actor'

export { requireRecord }

export function ensureTenant(
  actor: Actor,
  resource: { workspaceId: string },
): void {
  requireAuth(actor)
  if (actor.tenantId !== resource.workspaceId) {
    throw deny('Resource not found.')
  }
}

export function loadResource<T extends { workspaceId: string }>(
  actor: Actor,
  doc: T | null | undefined,
  label = 'Resource',
): T {
  requireRecord(doc, label)
  ensureTenant(actor, doc)
  return doc
}
`.trimStart()

const resourceTemplate = `
export function withCan<T extends Record<string, unknown>, C extends Record<string, boolean>>(
  doc: T,
  checks: C,
): T & { _can: C } {
  return {
    ...doc,
    _can: checks,
  }
}
`.trimStart()

const workspaceComposableTemplate = `
import { createAuth } from 'better-convex-nuxt/composables'

import { api } from '~/convex/_generated/api'

export const { usePermissions, useAuthGuard } = createAuth({
  query: api.workspaces.getPermissionContext,
})
`.trimStart()

const workspaceAuthBridgeTemplate = `
import { createClient, type AuthFunctions, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth } from 'better-auth'

import { components, internal } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import { mutation } from './_generated/server'
import authConfig from './auth.config'

const siteUrl = process.env.SITE_URL || 'http://localhost:3000'
const authFunctions: AuthFunctions = internal.auth

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, doc) => {
        const now = Date.now()
        await ctx.db.insert('users', {
          authId: doc._id,
          email: doc.email,
          displayName: doc.name,
          role: 'member',
          createdAt: now,
          updatedAt: now,
        })
      },
      onUpdate: async (ctx, next) => {
        const user = await ctx.db
          .query('users')
          .withIndex('by_auth_id', q => q.eq('authId', next._id))
          .first()

        if (!user) return

        await ctx.db.patch(user._id, {
          email: next.email,
          displayName: next.name,
          updatedAt: Date.now(),
        })
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

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi()

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      convex({
        authConfig,
      }),
    ],
    trustedOrigins: [siteUrl, 'http://127.0.0.1:3000', 'http://localhost:3000'],
  })

export const createUserIfNeeded = mutation({
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
    return await ctx.db.insert('users', {
      authId: identity.subject,
      email: identity.email,
      displayName: identity.name,
      role: 'member',
      createdAt: now,
      updatedAt: now,
    })
  },
})
`.trimStart()

const visibilityTemplate = `
import { defineVisibility } from 'better-convex-nuxt/auth'

import type { Actor } from './actor'

export const workspaceVisibility = defineVisibility(
  async (actor: Actor, db) => {
    if (!actor) return []

    return db.query('items')
      .withIndex('by_workspace', q => q.eq('workspaceId', actor.tenantId))
  },
)
`.trimStart()

const redactionTemplate = `
import type { Actor } from './actor'

type RedactionRule = {
  fields: string[]
  visibleTo: (actor: Actor) => boolean
}

export function redact<T extends Record<string, unknown>>(
  actor: Actor,
  doc: T,
  rules: RedactionRule[],
): T {
  const result = { ...doc }
  for (const rule of rules) {
    if (rule.visibleTo(actor)) continue
    for (const field of rule.fields) {
      delete result[field]
    }
  }
  return result
}
`.trimStart()

const enrollmentTemplate = `
import { deny } from 'better-convex-nuxt/auth'

import type { Actor } from './actor'

export async function requireEnrollment(
  db: any,
  actor: Actor,
  courseId: string,
) {
  if (!actor || actor.kind !== 'user') throw deny('Not authenticated.')

  const enrollment = await db.query('enrollments')
    .withIndex('by_user_course', (q: any) => q.eq('userId', actor.userId).eq('courseId', courseId))
    .first()

  if (!enrollment || enrollment.status !== 'active') {
    throw deny('Not enrolled in this course.')
  }

  return enrollment
}
`.trimStart()

const prerequisitesTemplate = `
import { deny } from 'better-convex-nuxt/auth'

export async function ensurePrerequisites(db: any, userId: string, lesson: { prerequisiteIds?: string[] }) {
  for (const prerequisiteId of lesson.prerequisiteIds ?? []) {
    const progress = await db.query('lessonProgress')
      .withIndex('by_user_lesson', (q: any) => q.eq('userId', userId).eq('lessonId', prerequisiteId))
      .first()

    if (!progress?.completedAt) {
      throw deny('Complete previous lessons first.')
    }
  }
}
`.trimStart()

const serviceAuthTemplate = `
import { deny, verifyKey } from 'better-convex-nuxt/auth'

import type { Actor } from './actor'

export function resolveServiceActor(
  key: string,
  serviceId: string,
  tenantId: string,
): Actor {
  const expected = process.env.CONVEX_SERVICE_KEY ?? ''
  if (!verifyKey(key, expected)) throw deny('Invalid service key.')

  return {
    kind: 'service',
    serviceId,
    role: 'admin',
    tenantId,
  }
}
`.trimStart()

const idempotencyTemplate = `
import { deny } from 'better-convex-nuxt/auth'

export async function ensureNotProcessed(db: any, eventId: string): Promise<void> {
  const existing = await db.query('processedEvents')
    .withIndex('by_event_id', (q: any) => q.eq('eventId', eventId))
    .first()

  if (existing) throw deny('Event already processed.')
}
`.trimStart()

const plansTemplate = `
import type { Actor } from './actor'

const planFeatures: Record<string, string[]> = {
  free: ['projects'],
  pro: ['projects', 'exports', 'api'],
  enterprise: ['*'],
}

export const hasPlan = (...plans: string[]) =>
  (actor: Actor) => !!actor && plans.includes(actor.plan ?? 'free')

export const hasFeature = (feature: string) =>
  (actor: Actor) => {
    if (!actor) return false
    const features = planFeatures[actor.plan ?? 'free'] ?? []
    return features.includes(feature) || features.includes('*')
  }
`.trimStart()

const limitsTemplate = `
import { deny } from 'better-convex-nuxt/auth'

import type { Actor } from './actor'

export async function ensureWithinLimit(
  db: any,
  actor: Actor,
  table: string,
  max: number,
): Promise<void> {
  if (!actor) throw deny('Not authenticated.')

  const rows = await db.query(table)
    .withIndex('by_workspace', (q: any) => q.eq('workspaceId', actor.tenantId))
    .collect()

  if (rows.length >= max) {
    throw deny(\`Plan limit reached for \${table}.\`)
  }
}
`.trimStart()

const pageAccessTemplate = `
import { deny } from 'better-convex-nuxt/auth'

import type { Actor } from './actor'

export type AccessLevel = 'view' | 'comment' | 'edit'

const hierarchy: Record<AccessLevel, number> = { view: 0, comment: 1, edit: 2 }

export async function requirePageAccess(
  db: any,
  actor: Actor,
  pageId: string,
  minLevel: AccessLevel,
): Promise<AccessLevel> {
  if (!actor || actor.kind !== 'user') throw deny('Not authenticated.')

  const share = await db.query('pageShares')
    .withIndex('by_user_page', (q: any) => q.eq('userId', actor.userId).eq('pageId', pageId))
    .first()

  const level = (share?.level ?? null) as AccessLevel | null
  if (!level) throw deny('No access to this page.')
  if (hierarchy[level] < hierarchy[minLevel]) {
    throw deny(\`Requires \${minLevel} access.\`)
  }
  return level
}
`.trimStart()

const shareTokensTemplate = `
import { deny } from 'better-convex-nuxt/auth'

import type { AccessLevel } from './page-access'

export async function resolveShareToken(db: any, token: string) {
  const record = await db.query('shareTokens')
    .withIndex('by_token', (q: any) => q.eq('token', token))
    .first()

  if (!record) throw deny('Invalid share link.')
  if (record.expiresAt && record.expiresAt < Date.now()) throw deny('Link expired.')
  if (record.revokedAt) throw deny('Link revoked.')

  return {
    kind: 'share_token' as const,
    tokenId: record._id,
    pageId: record.pageId,
    level: record.level as AccessLevel,
  }
}
`.trimStart()

const agencyTemplate = `
import { deny, getAuth } from 'better-convex-nuxt/auth'

export async function getAgencyActor(ctx: any) {
  const auth = await getAuth(ctx)
  if (!auth) return null

  const user = await ctx.db.query('users')
    .withIndex('by_auth_id', (q: any) => q.eq('authId', auth.subject))
    .first()

  if (!user) return null

  return {
    kind: 'user' as const,
    userId: user.authId,
    role: 'agency_user',
    tenantId: '',
  }
}

export async function requireWorkspaceMembership(db: any, userId: string, workspaceId: string) {
  const membership = await db.query('memberships')
    .withIndex('by_user_workspace', (q: any) => q.eq('userId', userId).eq('workspaceId', workspaceId))
    .first()

  if (!membership) throw deny('No access to this workspace.')
  return membership
}
`.trimStart()

const auditTemplate = `
export async function writeAuditEvent(
  db: any,
  event: {
    workspaceId: string
    actorId: string
    entityType: string
    entityId: string
    action: string
    description: string
  },
): Promise<void> {
  await db.insert('auditEvents', {
    ...event,
    createdAt: Date.now(),
  })
}
`.trimStart()

function createRecipe(path: string, content: string): RecipeTemplate {
  return { path, content }
}

export const authStarterOptions: AuthStarterOption[] = [
  {
    starter: 'personal',
    recipeId: 'auth:personal',
    label: 'Personal Auth',
    description: 'Single-user auth with a plain getActor(ctx) flow.',
    example: '02-auth-todo',
    docsPath: '/docs/permissions/choose-your-auth-starter',
  },
  {
    starter: 'workspace',
    recipeId: 'auth:workspace',
    label: 'Workspace Auth',
    description: 'Tenant-scoped auth with ensureTenant() and loadResource().',
    example: '03-team-todo',
    docsPath: '/docs/permissions/choose-your-auth-starter',
  },
  {
    starter: 'workspace-mcp',
    recipeId: 'auth:workspace-mcp',
    label: 'Workspace + MCP',
    description:
      'Tenant-scoped auth plus explicit trusted-caller support for MCP and service calls.',
    example: '11-mcp-reference',
    docsPath: '/docs/permissions/choose-your-auth-starter',
  },
]

const authRecipes: AuthRecipe[] = [
  {
    id: 'auth:personal',
    label: 'Personal Auth Starter',
    kind: 'starter',
    description:
      'Scaffold personal auth with Better Auth bridge files and a plain getActor(ctx) flow.',
    example: '02-auth-todo',
    docsPath: '/docs/permissions/choose-your-auth-starter',
    templates: [
      createRecipe('convex/auth.ts', personalAuthBridgeTemplate),
      createRecipe('convex/auth.config.ts', authConfigTemplate),
      createRecipe('convex/http.ts', httpTemplate),
      createRecipe('convex/convex.config.ts', convexConfigTemplate),
      createRecipe('convex/auth/actor.ts', personalActorTemplate),
      createRecipe('convex/auth/checks.ts', personalChecksTemplate),
      createRecipe('convex/auth/scope.ts', personalScopeTemplate),
      createRecipe('convex/test.setup.ts', testSetupTemplate),
      createRecipe('composables/usePermissions.ts', personalComposableTemplate),
    ],
  },
  {
    id: 'auth:workspace',
    label: 'Workspace Auth Starter',
    kind: 'starter',
    description: 'Scaffold tenant-scoped auth with Better Auth bridge files and tenant guards.',
    example: '03-team-todo',
    docsPath: '/docs/permissions/choose-your-auth-starter',
    templates: [
      createRecipe('convex/auth.ts', workspaceAuthBridgeTemplate),
      createRecipe('convex/auth.config.ts', authConfigTemplate),
      createRecipe('convex/http.ts', httpTemplate),
      createRecipe('convex/convex.config.ts', convexConfigTemplate),
      createRecipe('convex/auth/actor.ts', workspaceActorTemplate),
      createRecipe('convex/auth/checks.ts', workspaceChecksTemplate),
      createRecipe('convex/auth/scope.ts', workspaceScopeTemplate),
      createRecipe('convex/auth/resource.ts', resourceTemplate),
      createRecipe('convex/test.setup.ts', testSetupTemplate),
      createRecipe('composables/usePermissions.ts', workspaceComposableTemplate),
    ],
  },
  {
    id: 'auth:workspace-mcp',
    label: 'Workspace MCP Starter',
    kind: 'starter',
    description:
      'Scaffold tenant-scoped auth with explicit trusted-caller support for MCP and service flows.',
    example: '11-mcp-reference',
    docsPath: '/docs/permissions/choose-your-auth-starter',
    templates: [
      createRecipe('convex/auth.ts', workspaceAuthBridgeTemplate),
      createRecipe('convex/auth.config.ts', authConfigTemplate),
      createRecipe('convex/http.ts', httpTemplate),
      createRecipe('convex/convex.config.ts', convexConfigTemplate),
      createRecipe('convex/auth/actor.ts', workspaceMcpActorTemplate),
      createRecipe('convex/auth/checks.ts', workspaceChecksTemplate),
      createRecipe('convex/auth/scope.ts', workspaceScopeTemplate),
      createRecipe('convex/auth/resource.ts', resourceTemplate),
      createRecipe('convex/test.setup.ts', testSetupTemplate),
      createRecipe('composables/usePermissions.ts', workspaceComposableTemplate),
    ],
  },
  {
    id: 'auth:crm',
    label: 'CRM Block',
    kind: 'block',
    description: 'Add visibility and redaction helpers for CRM-style auth.',
    example: '05-crm-pipeline',
    docsPath: '/docs/permissions/saas-examples',
    templates: [
      createRecipe('convex/auth/visibility.ts', visibilityTemplate),
      createRecipe('convex/auth/redaction.ts', redactionTemplate),
    ],
  },
  {
    id: 'auth:lms',
    label: 'LMS Block',
    kind: 'block',
    description: 'Add enrollment and prerequisite helpers for LMS-style auth.',
    example: '06-course-lms',
    docsPath: '/docs/permissions/saas-examples',
    templates: [
      createRecipe('convex/auth/enrollment.ts', enrollmentTemplate),
      createRecipe('convex/auth/prerequisites.ts', prerequisitesTemplate),
    ],
  },
  {
    id: 'auth:ecommerce',
    label: 'E-commerce Block',
    kind: 'block',
    description: 'Add service auth and idempotency helpers for back-office workflows.',
    example: '07-ecommerce-ops',
    docsPath: '/docs/permissions/saas-examples',
    templates: [
      createRecipe('convex/auth/service-auth.ts', serviceAuthTemplate),
      createRecipe('convex/auth/idempotency.ts', idempotencyTemplate),
    ],
  },
  {
    id: 'auth:freemium',
    label: 'Freemium Block',
    kind: 'block',
    description: 'Add plan and usage-limit helpers for freemium workspaces.',
    example: '08-freemium-workspace',
    docsPath: '/docs/permissions/saas-examples',
    templates: [
      createRecipe('convex/auth/plans.ts', plansTemplate),
      createRecipe('convex/auth/limits.ts', limitsTemplate),
    ],
  },
  {
    id: 'auth:collaboration',
    label: 'Collaboration Block',
    kind: 'block',
    description: 'Add page-access and token helpers for shared-document workflows.',
    example: '09-doc-sharing',
    docsPath: '/docs/permissions/saas-examples',
    templates: [
      createRecipe('convex/auth/page-access.ts', pageAccessTemplate),
      createRecipe('convex/auth/share-tokens.ts', shareTokensTemplate),
    ],
  },
  {
    id: 'auth:agency',
    label: 'Agency Block',
    kind: 'block',
    description: 'Add membership helpers for controlled cross-tenant agency access.',
    example: '10-agency-portal',
    docsPath: '/docs/permissions/saas-examples',
    templates: [createRecipe('convex/auth/agency.ts', agencyTemplate)],
  },
  {
    id: 'auth:visibility',
    label: 'Visibility Block',
    kind: 'block',
    description: 'Add a reusable visibility filter helper.',
    example: '05-crm-pipeline',
    docsPath: '/docs/permissions/saas-examples',
    templates: [createRecipe('convex/auth/visibility.ts', visibilityTemplate)],
  },
  {
    id: 'auth:share-tokens',
    label: 'Share Token Block',
    kind: 'block',
    description: 'Add token-resolution helpers for share-link access.',
    example: '09-doc-sharing',
    docsPath: '/docs/permissions/saas-examples',
    templates: [createRecipe('convex/auth/share-tokens.ts', shareTokensTemplate)],
  },
  {
    id: 'auth:service-auth',
    label: 'Service Auth Block',
    kind: 'block',
    description: 'Add a service-auth helper for explicit machine callers.',
    example: '07-ecommerce-ops',
    docsPath: '/docs/permissions/saas-examples',
    templates: [createRecipe('convex/auth/service-auth.ts', serviceAuthTemplate)],
  },
  {
    id: 'auth:usage-limits',
    label: 'Usage Limits Block',
    kind: 'block',
    description: 'Add a usage-limit helper for plan-gated workspaces.',
    example: '08-freemium-workspace',
    docsPath: '/docs/permissions/saas-examples',
    templates: [createRecipe('convex/auth/limits.ts', limitsTemplate)],
  },
  {
    id: 'auth:audit',
    label: 'Audit Block',
    kind: 'block',
    description: 'Add a tiny audit writer helper.',
    example: '04-project-board-admin',
    docsPath: '/docs/permissions/saas-examples',
    templates: [createRecipe('convex/auth/audit.ts', auditTemplate)],
  },
]

export const authRecipeRegistry: Record<string, AuthRecipe> = Object.fromEntries(
  authRecipes.map((recipe) => [recipe.id, recipe]),
)

export const authStarterIds = authRecipes
  .filter((recipe) => recipe.kind === 'starter')
  .map((recipe) => recipe.id)

export const authBlockIds = authRecipes
  .filter((recipe) => recipe.kind === 'block')
  .map((recipe) => recipe.id)

export function getAuthRecipe(recipeId: string): AuthRecipe | undefined {
  return authRecipeRegistry[recipeId]
}

export function resolveStarterRecipeId(starter: string): string | undefined {
  return authStarterOptions.find((option) => option.starter === starter)?.recipeId
}
