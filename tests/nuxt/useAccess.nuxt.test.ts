import { describe, expect, it, vi } from 'vitest'

import { useRouter } from '#imports'

import { setupConfiguredAuthBootstrap } from '../../src/runtime/auth/client/auth-bootstrap'
import { definePermission } from '../../src/runtime/auth/define-permission'
import { createConfiguredPermissionsComposables } from '../../src/runtime/composables/configured-permissions'
import { useAuthBootstrapDevtoolsState } from '../../src/runtime/devtools/state'
import { installMockAuthEngine } from '../support/auth/nuxt-auth-engine'
import { MockConvexClient, mockFnRef } from '../support/nuxt/mock-convex-client'
import { captureInNuxt } from '../support/nuxt/runtime-harness'
import { waitFor } from '../support/nuxt/wait-for'

const createTaskPermission = definePermission({
  key: 'task.create',
  check: true,
})

const workspaceMembersPermission = definePermission({
  key: 'workspace.members',
  check: true,
})

const workspaceAuditPermission = definePermission({
  key: 'workspace.audit',
  check: true,
})

const missingPermission = definePermission({
  key: 'does.not.exist',
  check: true,
})

const todoReadPermission = definePermission({
  key: 'todo.read',
  check: true,
})

describe('configured permissions composables (Nuxt runtime)', () => {
  it('waits for configured auth bootstrap before subscribing to the access context query', async () => {
    const convex = new MockConvexClient()
    const authQuery = mockFnRef<'query'>('auth:getAccessContext:bootstrap-gated')
    const ensureUser = mockFnRef<'mutation'>('auth:createUserIfNeeded')
    let resolveBootstrap: (() => void) | null = null
    const bootstrapSettled = new Promise<void>((resolve) => {
      resolveBootstrap = resolve
    })
    convex.setMutationHandler('auth:createUserIfNeeded', async () => {
      await bootstrapSettled
      return { ok: true }
    })

    const { useAccess } = createConfiguredPermissionsComposables(
      authQuery,
      'auth.getAccessContext.bootstrapGated',
    )

    const { result } = await captureInNuxt(
      () => {
        installMockAuthEngine({
          initialToken: 'active.jwt.token',
          initialUser: { displayName: 'User One', email: 'user@test.com' },
        })
        setupConfiguredAuthBootstrap(ensureUser, 'auth.createUserIfNeeded')

        return {
          permissions: useAccess(),
          bootstrap: useAuthBootstrapDevtoolsState(),
        }
      },
      { convex },
    )

    await waitFor(() => convex.calls.mutation.length === 1)
    expect(result.permissions.pending.value).toBe(true)
    expect(convex.calls.onUpdate.length).toBe(0)

    resolveBootstrap?.()

    await waitFor(() => result.bootstrap.value.ensured === true)
    await waitFor(() => convex.calls.onUpdate.length > 0)

    convex.emitQueryResultByPath('auth:getAccessContext:bootstrap-gated', {
      role: 'member',
      userId: 'u-1',
      workspaceId: 'tenant-1',
      can: {
        'task.create': true,
      },
    })

    await waitFor(() => result.permissions.ready.value === true)
    expect(result.permissions.can(createTaskPermission).value).toBe(true)
  })

  it('reads auth context and keeps can() reactive from ctx.can', async () => {
    const convex = new MockConvexClient()
    const authQuery = mockFnRef<'query'>('auth:getAccessContext:reactive')
    const { useAccess } = createConfiguredPermissionsComposables(
      authQuery,
      'auth.getAccessContext.reactive',
    )

    const { result } = await captureInNuxt(
      () => {
        installMockAuthEngine({
          initialToken: 'active.jwt.token',
          initialUser: { displayName: 'User One', email: 'user@test.com' },
        })

        const permissions = useAccess()
        return {
          ...permissions,
          canCreate: permissions.can(createTaskPermission),
          canManage: permissions.can(workspaceMembersPermission),
          canMissing: permissions.can(missingPermission),
        }
      },
      { convex },
    )

    expect(result.ready.value).toBe(false)
    expect(result.canCreate.value).toBe(false)

    await waitFor(() => convex.calls.onUpdate.length > 0)

    convex.emitQueryResultByPath('auth:getAccessContext:reactive', {
      role: 'member',
      plan: 'pro',
      userId: 'user-1',
      workspaceId: 'tenant-1',
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
    expect(result.workspaceId.value).toBe('tenant-1')
    expect(result.canCreate.value).toBe(true)
    expect(result.canManage.value).toBe(false)
    expect(result.canMissing.value).toBe(false)
  })

  it('waits for loading before redirecting unauthenticated users', async () => {
    const convex = new MockConvexClient()
    const authQuery = mockFnRef<'query'>('auth:getAccessContext:guard-unauth')
    const { useAuthGuard } = createConfiguredPermissionsComposables(
      authQuery,
      'auth.getAccessContext.guard-unauth',
    )

    const { result } = await captureInNuxt(
      () => {
        installMockAuthEngine({
          initialToken: null,
          initialUser: null,
        })

        const router = useRouter()
        const pushSpy = vi.spyOn(router, 'push').mockImplementation(async () => undefined as never)

        useAuthGuard({
          permission: workspaceMembersPermission,
          loginPath: '/auth/signin',
        })

        return { pushSpy }
      },
      { convex },
    )

    expect(result.pushSpy).not.toHaveBeenCalled()
    await waitFor(() => convex.calls.onUpdate.length > 0)
    convex.emitQueryResultByPath('auth:getAccessContext:guard-unauth', null)
    await waitFor(() => result.pushSpy.mock.calls.length > 0)
    expect(result.pushSpy).toHaveBeenCalledWith('/auth/signin')
  })

  it('redirects authenticated users who lack the requested recordAccess', async () => {
    const convex = new MockConvexClient()
    const authQuery = mockFnRef<'query'>('auth:getAccessContext:guard-forbidden')
    const { useAuthGuard } = createConfiguredPermissionsComposables(
      authQuery,
      'auth.getAccessContext.guard-forbidden',
    )

    const { result } = await captureInNuxt(
      () => {
        installMockAuthEngine({
          initialToken: 'active.jwt.token',
          initialUser: { displayName: 'User One', email: 'user@test.com' },
        })

        const router = useRouter()
        const pushSpy = vi.spyOn(router, 'push').mockImplementation(async () => undefined as never)

        useAuthGuard({
          permission: workspaceAuditPermission,
          redirectTo: '/forbidden',
        })

        return { pushSpy }
      },
      { convex },
    )

    await waitFor(() => convex.calls.onUpdate.length > 0)
    await waitFor(() => result.pushSpy.mock.calls.length > 0)
    result.pushSpy.mockClear()

    convex.emitQueryResultByPath('auth:getAccessContext:guard-forbidden', {
      role: 'member',
      userId: 'user-1',
      workspaceId: 'tenant-1',
      can: {
        'workspace.audit': false,
      },
    })

    await waitFor(() => result.pushSpy.mock.calls.length > 0)
    expect(result.pushSpy).toHaveBeenCalledWith('/forbidden')
  })

  it('fails closed when the requested recordAccess key is missing', async () => {
    const convex = new MockConvexClient()
    const authQuery = mockFnRef<'query'>('auth:getAccessContext:guard-missing-key')
    const { useAuthGuard } = createConfiguredPermissionsComposables(
      authQuery,
      'auth.getAccessContext.guard-missing-key',
    )

    const { result } = await captureInNuxt(
      () => {
        installMockAuthEngine({
          initialToken: 'active.jwt.token',
          initialUser: { displayName: 'User One', email: 'user@test.com' },
        })

        const router = useRouter()
        const pushSpy = vi.spyOn(router, 'push').mockImplementation(async () => undefined as never)

        useAuthGuard({
          permission: workspaceAuditPermission,
          redirectTo: '/forbidden',
        })

        return { pushSpy }
      },
      { convex },
    )

    await waitFor(() => convex.calls.onUpdate.length > 0)
    await waitFor(() => result.pushSpy.mock.calls.length > 0)
    result.pushSpy.mockClear()

    convex.emitQueryResultByPath('auth:getAccessContext:guard-missing-key', {
      role: 'member',
      userId: 'user-1',
      workspaceId: 'tenant-1',
      can: {
        'workspace.members': true,
      },
    })

    await waitFor(() => result.pushSpy.mock.calls.length > 0)
    expect(result.pushSpy).toHaveBeenCalledWith('/forbidden')
  })

  it('warns when auth is ready but access context stays null for more than 2 seconds', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const convex = new MockConvexClient()
      const authQuery = mockFnRef<'query'>('auth:getAccessContext:delayed-null')
      const { useAccess } = createConfiguredPermissionsComposables(
        authQuery,
        'auth.getAccessContext.delayedNull',
      )

      const { flush } = await captureInNuxt(
        () => {
          installMockAuthEngine({
            initialToken: 'active.jwt.token',
            initialUser: { displayName: 'User One', email: 'user@test.com' },
          })

          return useAccess()
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

  it('trusts the server-projected access context after auth is ready', async () => {
    const convex = new MockConvexClient()
    const authQuery = mockFnRef<'query'>('auth:getAccessContext:stale-auth-user')
    const { useAccess } = createConfiguredPermissionsComposables(
      authQuery,
      'auth.getAccessContext.staleAuthUser',
    )

    const { result } = await captureInNuxt(
      () => {
        installMockAuthEngine({
          initialToken: 'active.jwt.token',
          initialUser: { displayName: 'Current User', email: 'current@test.com' },
        })

        const permissions = useAccess()
        return {
          ...permissions,
          canRead: permissions.can(todoReadPermission),
        }
      },
      { convex },
    )

    await waitFor(() => convex.calls.onUpdate.length > 0)

    convex.emitQueryResultByPath('auth:getAccessContext:stale-auth-user', {
      role: 'owner',
      userId: 'user-previous',
      workspaceId: 'tenant-previous',
      can: {
        'todo.read': true,
      },
    })

    await waitFor(() => result.ready.value)
    expect(result.workspaceId.value).toBe('tenant-previous')
    expect(result.canRead.value).toBe(true)
  })
})
