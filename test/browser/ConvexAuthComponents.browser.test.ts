import { render } from 'vitest-browser-vue'
import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { ref } from 'vue'

const { useConvexAuthMock } = vi.hoisted(() => ({
  useConvexAuthMock: vi.fn(),
}))

vi.mock('../../src/runtime/composables/useConvexAuth', () => ({
  useConvexAuth: useConvexAuthMock,
}))

import ConvexAuthenticated from '../../src/runtime/components/ConvexAuthenticated.vue'
import ConvexUnauthenticated from '../../src/runtime/components/ConvexUnauthenticated.vue'
import ConvexAuthLoading from '../../src/runtime/components/ConvexAuthLoading.vue'
import ConvexAuthError from '../../src/runtime/components/ConvexAuthError.vue'

afterEach(() => {
  useConvexAuthMock.mockReset()
})

test('<ConvexAuthenticated> renders slot only when authenticated and not pending', async () => {
  useConvexAuthMock.mockReturnValue({
    token: ref('jwt'),
    user: ref({ id: 'u1' }),
    isAuthenticated: ref(true),
    isPending: ref(false),
    authError: ref(null),
    signOut: vi.fn(),
    refreshAuth: vi.fn(),
  })

  render(ConvexAuthenticated, {
    slots: { default: '<div>Secret Dashboard</div>' },
  })

  await expect.element(page.getByText('Secret Dashboard')).toBeInTheDocument()
})

test('<ConvexUnauthenticated> renders slot only when unauthenticated and not pending', async () => {
  useConvexAuthMock.mockReturnValue({
    token: ref(null),
    user: ref(null),
    isAuthenticated: ref(false),
    isPending: ref(false),
    authError: ref(null),
    signOut: vi.fn(),
    refreshAuth: vi.fn(),
  })

  render(ConvexUnauthenticated, {
    slots: { default: '<div>Please Sign In</div>' },
  })

  await expect.element(page.getByText('Please Sign In')).toBeInTheDocument()
})

test('<ConvexAuthLoading> renders slot while pending', async () => {
  useConvexAuthMock.mockReturnValue({
    token: ref(null),
    user: ref(null),
    isAuthenticated: ref(false),
    isPending: ref(true),
    authError: ref(null),
    signOut: vi.fn(),
    refreshAuth: vi.fn(),
  })

  render(ConvexAuthLoading, {
    slots: { default: '<div>Checking authentication...</div>' },
  })

  await expect.element(page.getByText('Checking authentication...')).toBeInTheDocument()
})

test('<ConvexAuthError> renders slot when auth is not pending and has explicit auth error', async () => {
  useConvexAuthMock.mockReturnValue({
    token: ref(null),
    user: ref(null),
    isAuthenticated: ref(false),
    isPending: ref(false),
    authError: ref('Unauthorized'),
    signOut: vi.fn(),
    refreshAuth: vi.fn(),
  })

  render(ConvexAuthError, {
    slots: { default: '<div>Auth Error</div>' },
  })

  await expect.element(page.getByText('Auth Error')).toBeInTheDocument()
})
