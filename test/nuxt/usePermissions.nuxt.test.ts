import { describe, expect, it, vi } from 'vitest'

import { useRouter } from '#imports'

import { createConfiguredPermissionsComposables } from '../../src/runtime/composables/configured-permissions'
import { installMockAuthEngine } from '../support/auth/nuxt-auth-engine'
import { MockConvexClient, mockFnRef } from '../support/nuxt/mock-convex-client'
import { captureInNuxt } from '../support/nuxt/runtime-harness'
import { waitFor } from '../support/nuxt/wait-for'

describe('configured permissions composables (Nuxt runtime)', () => {
  it('reads auth context and keeps can() reactive from ctx.can', async () => {
    const convex = new MockConvexClient()
    const authQuery = mockFnRef<'query'>('auth:getPermissionContext:reactive')
    const { usePermissions } = createConfiguredPermissionsComposables(
      authQuery,
      'auth.getPermissionContext.reactive',
    )

    const { result } = await captureInNuxt(
      () => {
        const permissions = usePermissions()
        return {
          ...permissions,
          canCreate: permissions.can('task.create'),
          canManage: permissions.can('workspace.members'),
          canMissing: permissions.can('does.not.exist'),
        }
      },
      { convex },
    )

    expect(result.ready.value).toBe(false)
    expect(result.canCreate.value).toBe(false)

    await waitFor(() => convex.calls.onUpdate.length > 0)

    convex.emitQueryResultByPath('auth:getPermissionContext:reactive', {
      role: 'member',
      plan: 'pro',
      userId: 'user-1',
      tenantId: 'tenant-1',
      can: {
        'task.create': true,
        'workspace.members': false,
      },
    })

    await waitFor(() => result.pending.value === false)

    expect(result.ready.value).toBe(true)
    expect(result.role.value).toBe('member')
    expect(result.plan.value).toBe('pro')
    expect(result.userId.value).toBe('user-1')
    expect(result.tenantId.value).toBe('tenant-1')
    expect(result.canCreate.value).toBe(true)
    expect(result.canManage.value).toBe(false)
    expect(result.canMissing.value).toBe(false)
  })

  it('waits for loading before redirecting unauthenticated users', async () => {
    const convex = new MockConvexClient()
    const authQuery = mockFnRef<'query'>('auth:getPermissionContext:guard-unauth')
    const { useAuthGuard } = createConfiguredPermissionsComposables(
      authQuery,
      'auth.getPermissionContext.guard-unauth',
    )

    const { result } = await captureInNuxt(
      () => {
        const router = useRouter()
        const pushSpy = vi.spyOn(router, 'push').mockImplementation(async () => undefined as never)

        useAuthGuard({
          can: 'workspace.members',
          loginPath: '/auth/signin',
        })

        return { pushSpy }
      },
      { convex },
    )

    expect(result.pushSpy).not.toHaveBeenCalled()
    await waitFor(() => convex.calls.onUpdate.length > 0)
    convex.emitQueryResultByPath('auth:getPermissionContext:guard-unauth', null)
    await waitFor(() => result.pushSpy.mock.calls.length > 0)
    expect(result.pushSpy).toHaveBeenCalledWith('/auth/signin')
  })

  it('redirects authenticated users who lack the requested capability', async () => {
    const convex = new MockConvexClient()
    const authQuery = mockFnRef<'query'>('auth:getPermissionContext:guard-forbidden')
    const { useAuthGuard } = createConfiguredPermissionsComposables(
      authQuery,
      'auth.getPermissionContext.guard-forbidden',
    )

    const { result } = await captureInNuxt(
      () => {
        const router = useRouter()
        const pushSpy = vi.spyOn(router, 'push').mockImplementation(async () => undefined as never)

        useAuthGuard({
          can: 'workspace.audit',
          redirectTo: '/forbidden',
        })

        return { pushSpy }
      },
      { convex },
    )

    await waitFor(() => convex.calls.onUpdate.length > 0)
    await waitFor(() => result.pushSpy.mock.calls.length > 0)
    result.pushSpy.mockClear()

    convex.emitQueryResultByPath('auth:getPermissionContext:guard-forbidden', {
      role: 'member',
      userId: 'user-1',
      tenantId: 'tenant-1',
      can: {
        'workspace.audit': false,
      },
    })

    await waitFor(() => result.pushSpy.mock.calls.length > 0)
    expect(result.pushSpy).toHaveBeenCalledWith('/forbidden')
  })

  it('fails closed when the requested capability key is missing', async () => {
    const convex = new MockConvexClient()
    const authQuery = mockFnRef<'query'>('auth:getPermissionContext:guard-missing-key')
    const { useAuthGuard } = createConfiguredPermissionsComposables(
      authQuery,
      'auth.getPermissionContext.guard-missing-key',
    )

    const { result } = await captureInNuxt(
      () => {
        const router = useRouter()
        const pushSpy = vi.spyOn(router, 'push').mockImplementation(async () => undefined as never)

        useAuthGuard({
          can: 'workspace.audit',
          redirectTo: '/forbidden',
        })

        return { pushSpy }
      },
      { convex },
    )

    await waitFor(() => convex.calls.onUpdate.length > 0)
    await waitFor(() => result.pushSpy.mock.calls.length > 0)
    result.pushSpy.mockClear()

    convex.emitQueryResultByPath('auth:getPermissionContext:guard-missing-key', {
      role: 'member',
      userId: 'user-1',
      tenantId: 'tenant-1',
      can: {
        'workspace.members': true,
      },
    })

    await waitFor(() => result.pushSpy.mock.calls.length > 0)
    expect(result.pushSpy).toHaveBeenCalledWith('/forbidden')
  })

  it('warns when auth is ready but permission context stays null for more than 2 seconds', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const convex = new MockConvexClient()
      const authQuery = mockFnRef<'query'>('auth:getPermissionContext:delayed-null')
      const { usePermissions } = createConfiguredPermissionsComposables(
        authQuery,
        'auth.getPermissionContext.delayedNull',
      )

      const { flush } = await captureInNuxt(
        () => {
          installMockAuthEngine({
            initialToken: 'active.jwt.token',
            initialUser: { id: 'u-1', name: 'User One', email: 'user@test.com' },
          })

          return usePermissions()
        },
        { convex },
      )

      await flush()
      expect(convex.calls.onUpdate.length).toBeGreaterThan(0)
      await waitFor(() => warnSpy.mock.calls.length > 0, { timeoutMs: 3_500 })

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('stayed null for more than 2 seconds after auth became ready'),
      )
    } finally {
      warnSpy.mockRestore()
    }
  }, 10_000)
})
