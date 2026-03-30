import { describe, expect, it, vi } from 'vitest'

import {
  createRequireActor,
  createResolveActor,
  createTryResolveActor,
} from '../../src/runtime/actor/resolve-actor'

const mockCtx = {
  auth: {
    getUserIdentity: vi.fn(),
  },
  db: {
    query: vi.fn(),
  },
}

describe('actor resolvers', () => {
  it('resolves actor from auth callback', async () => {
    const tryResolveActor = createTryResolveActor({
      resolveFromAuth: async () => ({
        userId: 'user_1',
        role: 'member',
        tenantId: 'tenant_1',
      }),
    })

    await expect(tryResolveActor(mockCtx as never, {})).resolves.toEqual({
      userId: 'user_1',
      role: 'member',
      tenantId: 'tenant_1',
    })
  })

  it('resolves actor from injected service auth when key is valid', async () => {
    const tryResolveActor = createTryResolveActor({
      resolveFromAuth: async () => null,
      serviceKey: async (key) => key === 'secret',
    })

    await expect(
      tryResolveActor(mockCtx as never, {
        _serviceKey: 'secret',
        _serviceActor: {
          userId: 'svc_user',
          role: 'admin',
          tenantId: 'tenant_service',
        },
      }),
    ).resolves.toEqual({
      userId: 'svc_user',
      role: 'admin',
      tenantId: 'tenant_service',
    })
  })

  it('returns null for invalid service auth', async () => {
    const tryResolveActor = createTryResolveActor({
      resolveFromAuth: async () => null,
      serviceKey: 'CONVEX_SERVICE_KEY',
    })

    process.env.CONVEX_SERVICE_KEY = 'expected'

    await expect(
      tryResolveActor(mockCtx as never, {
        _serviceKey: 'wrong',
        _serviceActor: { userId: 'svc_user', role: 'admin' },
      }),
    ).resolves.toBeNull()
  })

  it('resolveActor throws when no actor can be resolved', async () => {
    const resolveActor = createResolveActor({
      resolveFromAuth: async () => null,
    })

    await expect(resolveActor(mockCtx as never, {})).rejects.toThrow('Authentication required.')
  })

  it('requireActor throws when tenant is missing', async () => {
    const requireActor = createRequireActor({
      resolveFromAuth: async () => ({
        userId: 'user_1',
        role: 'member',
      }),
    })

    await expect(requireActor(mockCtx as never, {})).rejects.toThrow(
      'Tenant membership required.',
    )
  })
})
