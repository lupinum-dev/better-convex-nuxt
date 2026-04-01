// @vitest-environment happy-dom
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'

import {
  clearAuthProxyStats,
  getAuthProxyStats,
  recordAuthProxyRequest,
} from '../../src/runtime/devtools/auth-proxy-registry'
import {
  isPathInsideDirectory,
  resolveDevtoolsFilePath,
} from '../../src/runtime/devtools/path-utils'
import {
  cloneDevtoolsPayload,
  createUiDevtoolsTransport,
} from '../../src/runtime/devtools/transport'

type StorageMap = Map<string, unknown>
const backingStore: StorageMap = new Map()

vi.mock('nitropack/runtime', () => ({
  useStorage: () => ({
    async getItem<T>(key: string): Promise<T | null> {
      return (backingStore.get(key) as T | undefined) ?? null
    },
    async setItem(key: string, value: unknown) {
      backingStore.set(key, value)
    },
  }),
}))

function installMockWindow() {
  const listeners = new Map<string, Set<(event: MessageEvent) => void>>()
  const parentMessages: Array<{ data: unknown; origin: string }> = []

  const windowMock = {
    location: { origin: 'https://example.test' },
    parent: {
      postMessage(data: unknown, origin: string) {
        parentMessages.push({ data, origin })
      },
    },
    addEventListener(type: string, listener: (event: MessageEvent) => void) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set())
      }
      listeners.get(type)!.add(listener)
    },
    removeEventListener(type: string, listener: (event: MessageEvent) => void) {
      listeners.get(type)?.delete(listener)
    },
    dispatchMessage(event: MessageEvent) {
      for (const listener of listeners.get('message') || []) {
        listener(event)
      }
    },
  }

  vi.stubGlobal('window', windowMock)
  return { parentMessages, windowMock }
}

describe('devtools auth proxy registry', () => {
  beforeEach(() => {
    backingStore.clear()
  })

  it('records and aggregates request stats using Nitro storage', async () => {
    await recordAuthProxyRequest({
      id: '1',
      path: '/convex/token',
      method: 'GET',
      timestamp: Date.now(),
      duration: 40,
      status: 200,
      success: true,
    })
    await recordAuthProxyRequest({
      id: '2',
      path: '/get-session',
      method: 'GET',
      timestamp: Date.now(),
      duration: 80,
      status: 500,
      success: false,
      error: 'boom',
    })

    const stats = await getAuthProxyStats()
    expect(stats.totalRequests).toBe(2)
    expect(stats.successCount).toBe(1)
    expect(stats.errorCount).toBe(1)
    expect(stats.avgDuration).toBe(40)
    expect(stats.recentRequests.map((r) => r.id)).toEqual(['2', '1'])
  })

  it('clears stored stats', async () => {
    await recordAuthProxyRequest({
      id: '1',
      path: '/convex/token',
      method: 'GET',
      timestamp: Date.now(),
      success: true,
    })
    await clearAuthProxyStats()

    const stats = await getAuthProxyStats()
    expect(stats.totalRequests).toBe(0)
    expect(stats.recentRequests).toEqual([])
  })
})

describe('devtools path utils', () => {
  it('allows files inside output directory', () => {
    const root = '/tmp/devtools-dist'
    const file = resolveDevtoolsFilePath(root, '/assets/app.js')
    expect(isPathInsideDirectory(root, file)).toBe(true)
  })

  it('rejects sibling prefix paths', () => {
    const root = '/tmp/out'
    const file = '/tmp/out-secrets/keys.txt'
    expect(isPathInsideDirectory(root, file)).toBe(false)
  })

  it('rejects traversal paths after resolution', () => {
    const root = '/tmp/devtools-dist'
    const traversed = join(root, '../secrets.txt')
    expect(isPathInsideDirectory(root, traversed)).toBe(false)
  })
})

describe('devtools transport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('falls back to postMessage when BroadcastChannel is unavailable', () => {
    installMockWindow()
    vi.stubGlobal('BroadcastChannel', undefined)

    const transport = createUiDevtoolsTransport('convex-devtools')
    expect(transport.kind).toBe('post-message')
    transport.close()
  })

  it('falls back to postMessage when BroadcastChannel constructor throws', () => {
    installMockWindow()
    vi.stubGlobal('BroadcastChannel', function ThrowingBroadcastChannel() {
      throw new Error('blocked')
    })

    const transport = createUiDevtoolsTransport('convex-devtools')
    expect(transport.kind).toBe('post-message')
    transport.close()
  })

  it('wraps and unwraps messages with postMessage fallback', () => {
    const { parentMessages, windowMock } = installMockWindow()
    vi.stubGlobal('BroadcastChannel', undefined)

    const transport = createUiDevtoolsTransport('convex-devtools')
    const listener = vi.fn()
    transport.addEventListener('message', listener)

    transport.postMessage({ type: 'PING' })
    expect(parentMessages).toHaveLength(1)

    const outboundEnvelope = parentMessages[0]!.data
    windowMock.dispatchMessage({
      data: outboundEnvelope,
      origin: 'https://example.test',
      source: null,
    } as MessageEvent)

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { type: 'PING' },
      }),
    )

    transport.close()
  })
})

describe('cloneDevtoolsPayload', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('uses structuredClone when available', () => {
    const structuredCloneMock = vi.fn((value: unknown) => ({ copied: value }))
    vi.stubGlobal('structuredClone', structuredCloneMock)

    const result = cloneDevtoolsPayload({ a: 1 })
    expect(structuredCloneMock).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ copied: { a: 1 } })
  })

  it('falls back to JSON clone when structuredClone throws', () => {
    vi.stubGlobal(
      'structuredClone',
      vi.fn(() => {
        throw new Error('fail')
      }),
    )

    const input = { nested: { a: 1 } }
    const result = cloneDevtoolsPayload(input)
    expect(result).toEqual(input)
    expect(result).not.toBe(input)
    expect(result.nested).not.toBe(input.nested)
  })
})

type MessageListener = (event: { data: unknown }) => void

interface FakeTransport {
  kind: 'broadcast-channel' | 'post-message'
  postMessage: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  emit: (data: unknown) => void
}

let fakeTransport: FakeTransport

function createFakeTransport(): FakeTransport {
  const listeners = new Set<MessageListener>()
  return {
    kind: 'broadcast-channel',
    postMessage: vi.fn(),
    addEventListener: vi.fn((_type: string, listener: MessageListener) => {
      listeners.add(listener)
    }),
    removeEventListener: vi.fn((_type: string, listener: MessageListener) => {
      listeners.delete(listener)
    }),
    close: vi.fn(),
    emit(data: unknown) {
      for (const listener of listeners) {
        listener({ data })
      }
    },
  }
}

describe('devtools useBridge instance binding', () => {
  beforeEach(() => {
    vi.resetModules()
    fakeTransport = createFakeTransport()
    vi.doMock('../../src/runtime/devtools/transport', () => ({
      createUiDevtoolsTransport: vi.fn(() => fakeTransport),
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('ignores responses from non-bound instances after READY binding', async () => {
    const bridgeModule = await import('../../src/runtime/devtools/ui/composables/useBridge')

    const app = createApp(
      defineComponent({
        setup() {
          bridgeModule.useBridge()
          return () => h('div')
        },
      }),
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    app.mount(root)

    expect(fakeTransport.postMessage).toHaveBeenCalledWith({ type: 'CONVEX_DEVTOOLS_INIT' })

    fakeTransport.emit({ type: 'CONVEX_DEVTOOLS_READY', instanceId: 'tab-a' })

    const requestPromise = bridgeModule.callBridge('getQueries')
    const requestMessage = fakeTransport.postMessage.mock.calls.find(
      ([msg]) =>
        msg &&
        typeof msg === 'object' &&
        (msg as { type?: string }).type === 'CONVEX_DEVTOOLS_REQUEST',
    )?.[0] as
      | {
          type: string
          id: number
          instanceId: string | null
        }
      | undefined

    expect(requestMessage).toBeDefined()
    expect(requestMessage?.instanceId).toBe('tab-a')

    fakeTransport.emit({
      type: 'CONVEX_DEVTOOLS_RESPONSE',
      id: requestMessage!.id,
      instanceId: 'tab-b',
      result: ['wrong'],
    })

    let settled = false
    void requestPromise.finally(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    fakeTransport.emit({
      type: 'CONVEX_DEVTOOLS_RESPONSE',
      id: requestMessage!.id,
      instanceId: 'tab-a',
      result: ['ok'],
    })

    await expect(requestPromise).resolves.toEqual(['ok'])

    app.unmount()
    expect(fakeTransport.close).toHaveBeenCalled()
  })
})
