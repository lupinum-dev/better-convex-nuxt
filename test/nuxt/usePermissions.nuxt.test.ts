import { describe, expect, it, vi } from 'vitest'

import { useRouter, useState } from '#imports'

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
        // The permission context query is auth:'auto'; it only subscribes for an
        // authenticated session (module auth is enabled by default in the harness).
        useState<boolean>('convex:pending', () => false)
        useState<string | null>('convex:token', () => 'signed.in.jwt')
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

    await waitFor(() => result.pending.value === false)

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
    const permissionQuery = mockFnRef<'query'>('auth:getPermissionContext:redirect-unauth')

    const { usePermissionRedirect } = createPermissions<Permission>({
      query: permissionQuery,
      checkPermission: (ctx, permission) => {
        if (!ctx) return false
        return permission === 'org.members' && ctx.role === 'admin'
      },
    })

    const { result } = await captureInNuxt(
      () => {
        const router = useRouter()
        const authPending = useState<boolean>('convex:pending')
        const token = useState<string | null>('convex:token')
        const pushSpy = vi.spyOn(router, 'push').mockImplementation(async () => undefined as never)
        authPending.value = true

        usePermissionRedirect({
          permission: 'org.members',
          loginPath: '/auth/signin',
        })

        return { authPending, pushSpy, token }
      },
      { convex },
    )

    expect(result.pushSpy).not.toHaveBeenCalled()

    result.authPending.value = false
    result.token.value = 'test-token'
    await waitFor(() => convex.calls.onUpdate.length > 0)

    convex.emitQueryResultByPath('auth:getPermissionContext:redirect-unauth', null)

    await waitFor(() => result.pushSpy.mock.calls.length > 0)
    expect(result.pushSpy).toHaveBeenCalledTimes(1)
    expect(result.pushSpy).toHaveBeenCalledWith('/auth/signin')
  })

  it('does not redirect when authenticated user is authorized', async () => {
    const convex = new MockConvexClient()
    const permissionQuery = mockFnRef<'query'>('auth:getPermissionContext:redirect-authorized')

    const { usePermissionRedirect, usePermissions } = createPermissions<Permission>({
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

        usePermissionRedirect({
          permission: 'org.members',
          redirectTo: '/forbidden',
          loginPath: '/auth/signin',
        })

        return { pushSpy, permissions }
      },
      { convex },
    )

    await waitFor(() => convex.calls.onUpdate.length > 0)

    convex.emitQueryResultByPath('auth:getPermissionContext:redirect-authorized', {
      role: 'admin',
      userId: 'user-1',
      orgId: 'org-1',
    })

    await waitFor(() => result.permissions.isAuthenticated.value === true)
    await waitFor(() => result.permissions.role.value === 'admin')
    await flush()
    await flush()
    result.pushSpy.mockClear()

    convex.emitQueryResultByPath('auth:getPermissionContext:redirect-authorized', {
      role: 'admin',
      userId: 'user-1',
      orgId: 'org-1',
    })
    await flush()
    await flush()
    expect(result.pushSpy).not.toHaveBeenCalled()
  })

  it('prevents redirect loops while a redirect is still pending', async () => {
    const convex = new MockConvexClient()
    const permissionQuery = mockFnRef<'query'>('auth:getPermissionContext:redirect-unauthorized')

    const { usePermissionRedirect } = createPermissions<Permission>({
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

        usePermissionRedirect({
          permission: 'org.members',
          redirectTo: '/forbidden',
        })

        return { pushSpy }
      },
      { convex },
    )

    await waitFor(() => convex.calls.onUpdate.length > 0)
    convex.emitQueryResultByPath('auth:getPermissionContext:redirect-unauthorized', null)
    await waitFor(() => result.pushSpy.mock.calls.length === 1)

    const firstRedirectTarget = result.pushSpy.mock.calls[0]?.[0]
    expect(['/auth/signin', '/forbidden']).toContain(firstRedirectTarget)

    convex.emitQueryResultByPath('auth:getPermissionContext:redirect-unauthorized', {
      role: 'member',
      userId: 'user-1',
    })

    convex.emitQueryResultByPath('auth:getPermissionContext:redirect-unauthorized', {
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
