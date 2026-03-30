export type RecipeTemplate = {
  path: string
  content: string
}

export const authTemplates = {
  actor: `
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server'

import { resolveUserActor, verifyKey } from 'better-convex-nuxt/auth'
import type { UserActor } from 'better-convex-nuxt/auth'

import type { DataModel } from '../_generated/dataModel'

export type Role = 'owner' | 'admin' | 'member' | 'viewer'

export type Actor =
  | UserActor<Role>
  | { kind: 'service'; serviceId: string; role: Role; tenantId: string }
  | null

type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>

export async function getActor(ctx: Ctx): Promise<Actor> {
  return resolveUserActor<Role>(ctx)
}

export function getServiceActor(
  key: string,
  actor: { serviceId: string; role: Role; tenantId: string },
): Actor {
  const expected = process.env.CONVEX_SERVICE_KEY ?? ''
  if (!verifyKey(key, expected)) return null
  return { kind: 'service', ...actor }
}
`.trimStart(),
  checks: `
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
`.trimStart(),
  scope: `
import { deny, ensureFound, requirePrincipal } from 'better-convex-nuxt/auth'

import type { Actor } from './actor'

export { ensureFound }

export function ensureTenant(
  actor: Actor,
  resource: { workspaceId: string },
): void {
  requirePrincipal(actor)
  if (actor.tenantId !== resource.workspaceId) {
    throw deny('Resource not found.')
  }
}

export function loadResource<T extends { workspaceId: string }>(
  actor: Actor,
  doc: T | null | undefined,
  label = 'Resource',
): T {
  ensureFound(doc, label)
  ensureTenant(actor, doc)
  return doc
}
`.trimStart(),
  resource: `
export function withCan<T extends Record<string, unknown>, C extends Record<string, boolean>>(
  doc: T,
  checks: C,
): T & { _can: C } {
  return {
    ...doc,
    _can: checks,
  }
}
`.trimStart(),
  composable: `
import { createAuth } from 'better-convex-nuxt/composables'

import { api } from '~/convex/_generated/api'

export const { usePermissions, useAuthGuard } = createAuth({
  query: api.auth.getPermissionContext,
})
`.trimStart(),
  visibility: `
import { defineVisibility } from 'better-convex-nuxt/auth'

import type { Actor } from './actor'

export const workspaceVisibility = defineVisibility(
  async (actor: Actor, db) => {
    if (!actor) return []

    return db.query('items')
      .withIndex('by_workspace', q => q.eq('workspaceId', actor.tenantId))
  },
)
`.trimStart(),
  redaction: `
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
`.trimStart(),
  enrollment: `
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
`.trimStart(),
  prerequisites: `
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
`.trimStart(),
  serviceAuth: `
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
`.trimStart(),
  idempotency: `
import { deny } from 'better-convex-nuxt/auth'

export async function ensureNotProcessed(db: any, eventId: string): Promise<void> {
  const existing = await db.query('processedEvents')
    .withIndex('by_event_id', (q: any) => q.eq('eventId', eventId))
    .first()

  if (existing) throw deny('Event already processed.')
}
`.trimStart(),
  plans: `
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
`.trimStart(),
  limits: `
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
`.trimStart(),
  pageAccess: `
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
`.trimStart(),
  shareTokens: `
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
`.trimStart(),
  agency: `
import { deny, getIdentity } from 'better-convex-nuxt/auth'

export async function getAgencyActor(ctx: any) {
  const identity = await getIdentity(ctx)
  if (!identity) return null

  const user = await ctx.db.query('users')
    .withIndex('by_auth_id', (q: any) => q.eq('authId', identity.subject))
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
`.trimStart(),
  audit: `
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
`.trimStart(),
} as const

export const authRecipeRegistry: Record<string, RecipeTemplate[]> = {
  auth: [
    { path: 'convex/auth/actor.ts', content: authTemplates.actor },
    { path: 'convex/auth/checks.ts', content: authTemplates.checks },
    { path: 'convex/auth/scope.ts', content: authTemplates.scope },
    { path: 'convex/auth/resource.ts', content: authTemplates.resource },
    { path: 'composables/usePermissions.ts', content: authTemplates.composable },
  ],
  'auth:crm': [
    { path: 'convex/auth/visibility.ts', content: authTemplates.visibility },
    { path: 'convex/auth/redaction.ts', content: authTemplates.redaction },
  ],
  'auth:lms': [
    { path: 'convex/auth/enrollment.ts', content: authTemplates.enrollment },
    { path: 'convex/auth/prerequisites.ts', content: authTemplates.prerequisites },
  ],
  'auth:ecommerce': [
    { path: 'convex/auth/service-auth.ts', content: authTemplates.serviceAuth },
    { path: 'convex/auth/idempotency.ts', content: authTemplates.idempotency },
  ],
  'auth:freemium': [
    { path: 'convex/auth/plans.ts', content: authTemplates.plans },
    { path: 'convex/auth/limits.ts', content: authTemplates.limits },
  ],
  'auth:collaboration': [
    { path: 'convex/auth/page-access.ts', content: authTemplates.pageAccess },
    { path: 'convex/auth/share-tokens.ts', content: authTemplates.shareTokens },
  ],
  'auth:agency': [
    { path: 'convex/auth/agency.ts', content: authTemplates.agency },
  ],
  'auth:visibility': [
    { path: 'convex/auth/visibility.ts', content: authTemplates.visibility },
  ],
  'auth:share-tokens': [
    { path: 'convex/auth/share-tokens.ts', content: authTemplates.shareTokens },
  ],
  'auth:service-auth': [
    { path: 'convex/auth/service-auth.ts', content: authTemplates.serviceAuth },
  ],
  'auth:usage-limits': [
    { path: 'convex/auth/limits.ts', content: authTemplates.limits },
  ],
  'auth:audit': [
    { path: 'convex/auth/audit.ts', content: authTemplates.audit },
  ],
}
