import {
  createBetterConvex,
  type BetterConvexAuthAdapter,
  type BetterConvexAuthSnapshot,
} from 'better-convex-vue'
import { createApp, defineComponent, h, onUnmounted, ref } from 'vue'

import { readMockStats, rejectCurrentCredential } from './mock-convex-browser'

type AuthStatus = BetterConvexAuthSnapshot['status']

let authSnapshot: BetterConvexAuthSnapshot = {
  status: 'loading',
  identityKey: null,
  sessionGeneration: 0,
  error: null,
}
let credential: string | null = null
const authListeners = new Set<() => void>()
const adapter: BetterConvexAuthAdapter = {
  snapshot: () => authSnapshot,
  subscribe(listener) {
    authListeners.add(listener)
    return () => authListeners.delete(listener)
  },
  fetchToken: async () => credential,
}

const plugin = createBetterConvex({
  convexUrl: 'https://authenticated-consumer.invalid',
  auth: adapter,
})
const renderedSnapshot = ref('loading')

function safeSnapshot() {
  return plugin.attachment().identity.snapshot()
}

function renderSnapshot(): void {
  renderedSnapshot.value = JSON.stringify(safeSnapshot())
}

const AuthenticatedConsumer = defineComponent({
  setup() {
    const stop = plugin.attachment().identity.subscribe(renderSnapshot)
    onUnmounted(stop)
    renderSnapshot()
    return () =>
      h(
        'main',
        {
          'data-consumer': 'better-convex-vue-authenticated',
        },
        renderedSnapshot.value,
      )
  },
})

const app = createApp(AuthenticatedConsumer)
app.use(plugin)
app.mount('#app')

async function transition(
  status: AuthStatus,
  identityKey: string | null,
  sessionGeneration: number,
  token: string | null = null,
): Promise<ReturnType<typeof safeSnapshot>> {
  credential = token
  authSnapshot = {
    status,
    identityKey,
    sessionGeneration,
    error: status === 'error' ? new Error(token ?? 'Provider authentication failed') : null,
  }
  for (const listener of [...authListeners]) listener()
  await plugin.ready()
  renderSnapshot()
  return safeSnapshot()
}

Object.assign(window, {
  __betterConvexAuthProof: {
    snapshot: safeSnapshot,
    attachmentKeys: () => Object.keys(plugin.attachment()).sort(),
    clientKeys: () => Object.keys(plugin.attachment().client).sort(),
    stats: readMockStats,
    transition,
    async refresh() {
      await plugin.refreshAuth()
      renderSnapshot()
      return safeSnapshot()
    },
    rejectCurrent() {
      rejectCurrentCredential()
      renderSnapshot()
      return safeSnapshot()
    },
    unmount() {
      app.unmount()
      return { listeners: authListeners.size, ...readMockStats() }
    },
  },
})

declare global {
  interface Window {
    __betterConvexAuthProof: Record<string, (...args: never[]) => unknown>
  }
}
