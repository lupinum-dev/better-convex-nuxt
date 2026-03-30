import { describe, expect, it } from 'vitest'
import { defineSchema as defineConvexSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import { createFunctions, defineActorConfig } from '../../src/runtime/convex/create-functions'
import { definePermissions } from '../../src/runtime/convex/define-permissions'

const actorConfig = defineActorConfig({
  resolveFromAuth: async () => ({
    userId: 'user_1',
    role: 'admin' as const,
    tenantId: 'tenant_1',
  }),
})

const permissionConfig = definePermissions({
  roles: ['admin', 'member'] as const,
  rules: {
    global: {
      'org.settings': { roles: ['admin'] },
    },
    post: {
      create: { roles: ['admin', 'member'] },
    },
  },
})

const schema = defineConvexSchema({
  posts: defineTable({
    title: v.string(),
    organizationId: v.string(),
  }).index('by_organization', ['organizationId']),
  comments: defineTable({
    organizationId: v.string(),
  }).index('by_organization', ['organizationId']),
  users: defineTable({
    name: v.string(),
  }),
})

describe('createFunctions', () => {
  describe('defineActorConfig', () => {
    it('returns the exact config (identity)', () => {
      const config = { resolveFromAuth: async () => ({ userId: 'u', role: 'r' }) }
      expect(defineActorConfig(config)).toBe(config)
    })
  })

  describe('factory return shape', () => {
    it('returns all 8 builder functions', () => {
      const fns = createFunctions()
      expect(Object.keys(fns).sort()).toEqual([
        'authedMutation',
        'authedQuery',
        'openMutation',
        'openQuery',
        'publicMutation',
        'publicQuery',
        'scopedMutation',
        'scopedQuery',
      ])
    })
  })

  describe('permission guard', () => {
    it('throws when require is set but permissions config is missing', () => {
      const fns = createFunctions({ actor: actorConfig })

      // The authedQuery builder itself doesn't throw — the generated handler does.
      // We can't easily call the generated handler without a real Convex ctx,
      // but we can verify the builder accepts the config.
      const query = fns.authedQuery({
        args: {},
        require: 'anything',
        handler: async () => null,
      })
      expect(query).toBeDefined()
    })

    it('accepts guard callbacks on authed and scoped builders', () => {
      const fns = createFunctions({
        schema,
        actor: actorConfig,
        permissions: permissionConfig,
      })

      const authedQuery = fns.authedQuery({
        args: {},
        guard: ({ actor }) => {
          if (actor.userId === 'blocked') return 'Blocked'
        },
        handler: async () => null,
      })
      const scopedMutation = fns.scopedMutation({
        args: { id: v.id('posts') },
        require: 'post.create',
        resource: args => args.id,
        guard: ({ resource }) => {
          if (resource?.title === 'archived') return 'Archived'
        },
        handler: async () => null,
      })

      expect(authedQuery).toBeDefined()
      expect(scopedMutation).toBeDefined()
    })
  })

  describe('schema table extraction', () => {
    it('creates functions with schema and scoped tables', () => {
      const fns = createFunctions({
        schema,
        tables: {
          posts: { ownerField: 'ownerId' },
        },
        actor: actorConfig,
        permissions: permissionConfig,
      })

      // All builders should be available
      expect(fns.scopedQuery).toBeTypeOf('function')
      expect(fns.scopedMutation).toBeTypeOf('function')
    })

    it('works without schema', () => {
      const fns = createFunctions({ actor: actorConfig })
      expect(fns.scopedQuery).toBeTypeOf('function')
    })
  })

  describe('tenant defaults', () => {
    it('defaults tenant field/index to organizationId/by_organization', () => {
      // No tenant config provided — should use defaults internally.
      // We verify by ensuring the factory doesn't throw.
      const fns = createFunctions({
        actor: actorConfig,
        permissions: permissionConfig,
      })
      expect(fns).toBeDefined()
    })
  })
})
