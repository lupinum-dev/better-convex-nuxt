import { describe, expect, it } from 'vitest'

import { ConvexDevtoolsStore } from '../../src/runtime/devtools/store'

describe('ConvexDevtoolsStore', () => {
  it('caps timeline events to the latest 500 entries', () => {
    const store = new ConvexDevtoolsStore()

    for (let index = 0; index < 550; index += 1) {
      store.appendEvent({
        kind: 'query',
        phase: 'update',
        operationId: `op-${index}`,
        name: `query:${index}`,
        meta: { index },
      })
    }

    const snapshot = store.getSnapshot()
    expect(snapshot.events).toHaveLength(500)
    expect(snapshot.events[0]).toEqual(
      expect.objectContaining({
        operationId: 'op-50',
        name: 'query:50',
      }),
    )
    expect(snapshot.events.at(-1)).toEqual(
      expect.objectContaining({
        operationId: 'op-549',
        name: 'query:549',
      }),
    )
  })

  it('clones event payloads in snapshots', () => {
    const store = new ConvexDevtoolsStore()
    const payload = { nested: { ok: true } }

    store.appendEvent({
      kind: 'mutation',
      phase: 'success',
      operationId: 'mutation-1',
      name: 'notes:create',
      payload,
    })

    payload.nested.ok = false

    expect(store.getSnapshot().events[0]).toEqual(
      expect.objectContaining({
        payload: { nested: { ok: true } },
      }),
    )
  })
})
