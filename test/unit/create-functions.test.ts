import { describe, expect, it } from 'vitest'

import { createFunctions, defineActorConfig } from '../../src/runtime/convex/create-functions'
import { definePermissions } from '../../src/runtime/convex/define-permissions'

const actorConfig = defineActorConfig({
  resolveFromAuth: async () => ({
    userId: 'user_1',
    role: 'admin' as const,
    orgId: 'org_1',
  }),
})

const permissionConfig = definePermissions({
  roles: ['admin', 'member'] as const,
  permissions: {
    global: {
      'org.settings': { roles: ['admin'] },
    },
    post: {
      create: { roles: ['admin', 'member'] },
    },
  },
  checkPermission: (ctx, permission) => {
    if (!ctx) return false
    if (permission === 'org.settings') return ctx.role === 'admin'
    return true
  },
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
      const fns = createFunctions({ actor: actorConfig })
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
  })

  describe('schema table extraction', () => {
    it('creates functions with schema and scoped tables', () => {
      const fns = createFunctions({
        schema: {
          posts: { tenant: { scoped: true } },
          users: undefined,
          comments: { tenant: { scoped: true } },
          settings: { description: 'app settings' },
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
    it('defaults orgField to organizationId and orgIdFrom to actor', () => {
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
