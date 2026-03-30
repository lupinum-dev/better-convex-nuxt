import { defineSchema as defineConvexSchema, defineTable } from 'convex/server'
import type { FunctionReference } from 'convex/server'
import { v } from 'convex/values'

import {
  createFunctions,
  defineActorConfig,
  definePermissions,
  type Actor,
  type InferPermission,
  type InferRole,
  type PermissionContext,
} from '../../src/runtime/convex'
import { createPermissions } from '../../src/runtime/composables/usePermissions'
import { createConvexTools } from '../../src/runtime/mcp/define-convex-tool'
import { defineArgs } from '../../src/runtime/schema'

type Assert<T extends true> = T
type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false

const permissionConfig = definePermissions({
  roles: ['owner', 'admin', 'member'] as const,
  permissions: {
    global: {
      'org.settings': { roles: ['owner'] },
    },
    post: {
      create: { roles: ['owner', 'admin', 'member'] },
      update: { own: ['member'], any: ['owner', 'admin'] },
    },
    'settings.billing': {
      view: { roles: ['owner', 'admin'] },
    },
  },
})

type Role = InferRole<typeof permissionConfig>
type Permission = InferPermission<typeof permissionConfig>

type _roleInference = Assert<IsEqual<Role, 'owner' | 'admin' | 'member'>>
type _permissionInference = Assert<
  IsEqual<
    Permission,
    'org.settings' | 'post.create' | 'post.update' | 'settings.billing.view'
  >
>

const actorConfig = defineActorConfig({
  resolveFromAuth: async (): Promise<Actor<Role> | null> => ({
    userId: 'user_1',
    role: 'owner' as const,
    tenantId: 'tenant_1',
  }),
})

const convexSchema = defineConvexSchema({
  posts: defineTable({
    title: v.string(),
    ownerId: v.string(),
    organizationId: v.string(),
  }).index('by_organization', ['organizationId']),
  comments: defineTable({
    postId: v.id('posts'),
    organizationId: v.string(),
  }).index('by_organization', ['organizationId']),
})

const { scopedMutation } = createFunctions({
  schema: convexSchema,
  tables: {
    posts: { ownerField: 'ownerId' },
  },
  permissions: permissionConfig,
  actor: actorConfig,
  tenant: {
    field: 'organizationId',
    index: 'by_organization',
  },
})

scopedMutation({
  args: { id: v.id('posts') },
  require: 'post.create',
  resource: (args) => ({ table: 'posts', id: args.id }),
  handler: async ({ actor, db }) => {
    const role: Role = actor.role
    void role

    db.query('posts')
    db.query('notes')
    await db.insert('posts', {})
    await db.insert('notes', {})
    return null
  },
})

scopedMutation({
  args: { id: v.id('posts') },
  // @ts-expect-error Invalid permission should be rejected.
  require: 'post.delete',
  handler: async () => null,
})

scopedMutation({
  args: { id: v.id('posts') },
  require: 'post.update',
  // @ts-expect-error Explicit resource tables should autocomplete known schema keys only.
  resource: (args) => ({ table: 'missing', id: args.id }),
  handler: async () => null,
})

const permissionQuery =
  {} as FunctionReference<'query', 'public', Record<string, never>, PermissionContext<Role>>

const _permissionComposables = createPermissions({
  query: permissionQuery,
  checkPermission: permissionConfig.checkPermission,
})

type UsePermissionsApi = ReturnType<typeof _permissionComposables.usePermissions>
type GuardOptions = Parameters<typeof _permissionComposables.usePermissionGuard>[0]
type _roleFromComposable = Assert<IsEqual<UsePermissionsApi['role']['value'], Role | null>>
type _guardPermission = Assert<IsEqual<GuardOptions['permission'], Permission>>

const { defineTool } = createConvexTools({
  checkPermission: permissionConfig.checkPermission,
})

const toolSchema = defineArgs({
  args: { title: v.string() },
})

defineTool({
  schema: toolSchema,
  require: 'post.create',
  auth: 'required',
  handler: async (args, ctx) => {
    const maybeRole: Role | undefined = ctx.actor?.role
    void maybeRole
    const allowed = ctx.can('post.update', { ownerId: 'user_1' })
    void allowed
    return args.title
  },
})

defineTool({
  schema: toolSchema,
  auth: 'required',
  // @ts-expect-error Tool permissions should reject typos.
  require: 'post.publish',
  handler: async () => null,
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

// Empty permissions config → InferPermission resolves to never
const _emptyPermConfig = definePermissions({
  roles: ['admin'] as const,
  permissions: {
    global: {},
  },
})

type EmptyPermission = InferPermission<typeof _emptyPermConfig>
type _emptyPermissionIsNever = Assert<IsEqual<EmptyPermission, never>>

// Ownership-based permission rule (own/any) still infers correctly
const _ownershipConfig = definePermissions({
  roles: ['owner', 'editor', 'viewer'] as const,
  permissions: {
    global: {},
    doc: {
      read: { roles: ['owner', 'editor', 'viewer'] as const },
      write: { own: ['editor'] as const, any: ['owner'] as const },
      delete: { roles: ['owner'] as const },
    },
  },
})

type OwnershipPermission = InferPermission<typeof _ownershipConfig>
type _ownershipPermInference = Assert<
  IsEqual<OwnershipPermission, 'doc.read' | 'doc.write' | 'doc.delete'>
>

type OwnershipRole = InferRole<typeof _ownershipConfig>
type _ownershipRoleInference = Assert<
  IsEqual<OwnershipRole, 'owner' | 'editor' | 'viewer'>
>
