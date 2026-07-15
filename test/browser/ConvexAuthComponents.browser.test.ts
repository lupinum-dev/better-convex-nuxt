import { afterEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { ref } from 'vue'

import ConvexAuthenticated from '../../src/runtime/components/ConvexAuthenticated.vue'
import ConvexAuthError from '../../src/runtime/components/ConvexAuthError.vue'
import ConvexAuthLoading from '../../src/runtime/components/ConvexAuthLoading.vue'
import ConvexUnauthenticated from '../../src/runtime/components/ConvexUnauthenticated.vue'

const { useConvexAuthMock } = vi.hoisted(() => ({ useConvexAuthMock: vi.fn() }))

vi.mock('../../src/runtime/composables/useConvexAuth', () => ({
  useConvexAuth: useConvexAuthMock,
}))

afterEach(() => {
  useConvexAuthMock.mockReset()
})

const cases = [
  {
    name: 'authenticated',
    component: ConvexAuthenticated,
    text: 'Authenticated content',
    hidden: { status: 'anonymous', authenticated: false, pending: false, error: null },
    shown: { status: 'authenticated', authenticated: true, pending: false, error: null },
  },
  {
    name: 'unauthenticated',
    component: ConvexUnauthenticated,
    text: 'Unauthenticated content',
    hidden: { status: 'authenticated', authenticated: true, pending: false, error: null },
    shown: { status: 'anonymous', authenticated: false, pending: false, error: null },
  },
  {
    name: 'loading',
    component: ConvexAuthLoading,
    text: 'Loading content',
    hidden: { status: 'anonymous', authenticated: false, pending: false, error: null },
    shown: { status: 'loading', authenticated: false, pending: true, error: null },
  },
  {
    name: 'error',
    component: ConvexAuthError,
    text: 'Error content',
    hidden: { status: 'anonymous', authenticated: false, pending: false, error: null },
    shown: { status: 'error', authenticated: false, pending: false, error: 'Unauthorized' },
  },
] as const

test.each(cases)(
  '$name component follows auth state',
  async ({ component, text, hidden, shown }) => {
    const status = ref<string>(hidden.status)
    const isAuthenticated = ref(hidden.authenticated)
    const isPending = ref<boolean>(hidden.pending)
    const authError = ref<string | null>(hidden.error)

    useConvexAuthMock.mockReturnValue({
      status,
      token: ref(null),
      user: ref(null),
      isAuthenticated,
      isPending,
      authError,
      signOut: vi.fn(),
      refresh: vi.fn(),
    })

    render(component, { slots: { default: `<div>${text}</div>` } })
    await expect.element(page.getByText(text)).not.toBeInTheDocument()

    status.value = shown.status
    isAuthenticated.value = shown.authenticated
    isPending.value = shown.pending
    authError.value = shown.error

    await expect.element(page.getByText(text)).toBeInTheDocument()
  },
)
