import { describe, expect, it, vi } from 'vitest'

import { useRouter } from '#imports'

import { createPermissions } from '../../src/runtime/composables/usePermissions'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'
import { captureInNuxt } from '../helpers/nuxt-runtime-harness'
import { waitFor } from '../helpers/wait-for'

type Permission = 'post.edit' | 'org.members'

describe('usePermissions (Nuxt runtime)', () => {
  it('derives auth context and keeps can() reactive across permission updates', async () => {
    const convex = new MockConvexClient()
    const permissionQuery = mockFnRef<'query'>('auth:getPermissionContext:reactive')

    const { usePermissions } = createPermissions<Permission>({
      query: permissionQuery,
      checkPermission: (ctx, permission, resource) => {
        if (!ctx) return false
        if (ctx.role === 'admin') return true
        if (permission === 'post.edit') {
          return resource?.ownerId === ctx.userId
        }
        return false
      },
    })

    const { result } = await captureInNuxt(
      () => {
        const permissions = usePermissions()
        return {
          ...permissions,
          canEditOwn: permissions.can('post.edit', { ownerId: 'user-1' }),
          canEditOther: permissions.can('post.edit', { ownerId: 'user-2' }),
        }
      },
      { convex },
    )

    expect(result.isAuthenticated.value).toBe(false)
    expect(result.role.value).toBeNull()

    await waitFor(() => convex.calls.onUpdate.length > 0)

    convex.emitQueryResultByPath('auth:getPermissionContext:reactive', {
      role: 'member',
      userId: 'user-1',
      orgId: 'org-1',
    })

    await waitFor(() => result.isLoading.value === false)

    expect(result.isAuthenticated.value).toBe(true)
    expect(result.role.value).toBe('member')
    expect(result.orgId.value).toBe('org-1')
    expect(result.canEditOwn.value).toBe(true)
    expect(result.canEditOther.value).toBe(false)

    convex.emitQueryResultByPath('auth:getPermissionContext:reactive', {
      role: 'admin',
      userId: 'user-1',
      orgId: 'org-1',
    })

    await waitFor(() => result.canEditOther.value === true)
    expect(result.canEditOwn.value).toBe(true)
    expect(result.canEditOther.value).toBe(true)
  })

  it('waits for loading before redirecting unauthenticated users', async () => {
    const convex = new MockConvexClient()
    const permissionQuery = mockFnRef<'query'>('auth:getPermissionContext:guard-unauth')

    const { usePermissionGuard } = createPermissions<Permission>({
      query: permissionQuery,
      checkPermission: (ctx, permission) => {
        if (!ctx) return false
        return permission === 'org.members' && ctx.role === 'admin'
      },
    })

    const { result } = await captureInNuxt(
      () => {
        const router = useRouter()
        const pushSpy = vi.spyOn(router, 'push').mockImplementation(async () => undefined as never)

        usePermissionGuard({
          permission: 'org.members',
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
    expect(result.pushSpy).toHaveBeenCalledTimes(1)
    expect(result.pushSpy).toHaveBeenCalledWith('/auth/signin')
  })

  it('does not redirect when authenticated user is authorized', async () => {
    const convex = new MockConvexClient()
    const permissionQuery = mockFnRef<'query'>('auth:getPermissionContext:guard-authorized')

    const { usePermissionGuard, usePermissions } = createPermissions<Permission>({
      query: permissionQuery,
      checkPermission: (ctx, permission) => {
        if (!ctx) return false
        return permission === 'org.members' && ctx.role === 'admin'
      },
    })

    const { result, flush } = await captureInNuxt(
      () => {
        const router = useRouter()
        const pushSpy = vi.spyOn(router, 'push').mockImplementation(async () => undefined as never)
        const permissions = usePermissions()

        usePermissionGuard({
          permission: 'org.members',
          redirectTo: '/forbidden',
          loginPath: '/auth/signin',
        })

        return { pushSpy, permissions }
      },
      { convex },
    )

    await waitFor(() => convex.calls.onUpdate.length > 0)

    convex.emitQueryResultByPath('auth:getPermissionContext:guard-authorized', {
      role: 'admin',
      userId: 'user-1',
      orgId: 'org-1',
    })

    await waitFor(() => result.permissions.isAuthenticated.value === true)
    await waitFor(() => result.permissions.role.value === 'admin')
    await flush()
    await flush()
    result.pushSpy.mockClear()

    convex.emitQueryResultByPath('auth:getPermissionContext:guard-authorized', {
      role: 'admin',
      userId: 'user-1',
      orgId: 'org-1',
    })
    await flush()
    await flush()
    expect(result.pushSpy).not.toHaveBeenCalled()
  })

  it('prevents redirect loops while a guard redirect is still pending', async () => {
    const convex = new MockConvexClient()
    const permissionQuery = mockFnRef<'query'>('auth:getPermissionContext:guard-unauthorized')

    const { usePermissionGuard } = createPermissions<Permission>({
      query: permissionQuery,
      checkPermission: (ctx, permission) => {
        if (!ctx) return false
        return permission === 'org.members' && ctx.role === 'admin'
      },
    })

    let resolvePush: ((value?: unknown) => void) | null = null

    const { result } = await captureInNuxt(
      () => {
        const router = useRouter()
        const pushSpy = vi.spyOn(router, 'push').mockImplementation(() => {
          return new Promise((resolve) => {
            resolvePush = resolve
          }) as never
        })

        usePermissionGuard({
          permission: 'org.members',
          redirectTo: '/forbidden',
        })

        return { pushSpy }
      },
      { convex },
    )

    await waitFor(() => convex.calls.onUpdate.length > 0)
    convex.emitQueryResultByPath('auth:getPermissionContext:guard-unauthorized', null)
    await waitFor(() => result.pushSpy.mock.calls.length === 1)

    const firstRedirectTarget = result.pushSpy.mock.calls[0]?.[0]
    expect(['/auth/signin', '/forbidden']).toContain(firstRedirectTarget)

    convex.emitQueryResultByPath('auth:getPermissionContext:guard-unauthorized', {
      role: 'member',
      userId: 'user-1',
    })

    convex.emitQueryResultByPath('auth:getPermissionContext:guard-unauthorized', {
      role: 'member',
      userId: 'user-1',
      orgId: 'org-1',
    })

    await waitFor(() => result.pushSpy.mock.calls.length === 1)
    expect(result.pushSpy).toHaveBeenCalledTimes(1)

    const releasePendingRedirect = resolvePush as unknown as (() => void) | null
    releasePendingRedirect?.()
  })
})
