import { BaseConvexClient } from 'convex/browser'
import { afterEach, describe, expect, it } from 'vitest'

class TestWebSocket {
  static sent: string[] = []

  onopen: (() => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  onerror: ((event: { message: string }) => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null

  constructor() {
    queueMicrotask(() => this.onopen?.())
  }

  send(message: string) {
    TestWebSocket.sent.push(message)
  }

  close() {
    this.onclose?.({ code: 1000, reason: '' })
  }
}

describe('pinned Convex client provider contract', () => {
  let client: BaseConvexClient | undefined

  afterEach(async () => {
    await client?.close()
    client = undefined
    TestWebSocket.sent = []
  })

  it('deduplicates identical subscriptions on the wire until the last listener leaves', async () => {
    client = new BaseConvexClient('https://provider-contract.convex.cloud', () => {}, {
      logger: false,
      unsavedChangesWarning: false,
      webSocketConstructor: TestWebSocket as unknown as typeof WebSocket,
    })
    await new Promise<void>((resolve) => queueMicrotask(resolve))

    const baseline = TestWebSocket.sent.length
    const first = client.subscribe('tasks:list', { status: 'open' })
    expect(TestWebSocket.sent).toHaveLength(baseline + 1)

    const second = client.subscribe('tasks:list', { status: 'open' })
    expect(second.queryToken).toBe(first.queryToken)
    expect(TestWebSocket.sent).toHaveLength(baseline + 1)

    first.unsubscribe()
    expect(TestWebSocket.sent).toHaveLength(baseline + 1)

    second.unsubscribe()
    expect(TestWebSocket.sent).toHaveLength(baseline + 2)
  })
})
