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

  it('builds the latest decision trace from captured observations', () => {
    const store = new ConvexDevtoolsStore()

    store.appendObservation({
      name: 'caller.resolved',
      status: 'success',
      ts: '2026-04-19T00:00:00.000Z',
      transport: 'browser',
      correlationId: 'corr_1',
      principalKind: 'user',
    })
    store.appendObservation({
      name: 'guard.denied',
      status: 'deny',
      ts: '2026-04-19T00:00:01.000Z',
      transport: 'browser',
      correlationId: 'corr_1',
      principalKind: 'user',
      actorKind: 'member',
      workspaceId: 'ws_1',
      handler: 'tasks.remove',
      reasonCode: 'guard.denied',
      details: {
        explanation: {
          reasonCode: 'guard.denied',
          decision: 'guard',
          message: 'Members cannot remove tasks.',
          policy: 'task.delete',
          workspaceId: 'ws_1',
          suggestedAction: 'contact_admin',
        },
      },
    })

    const snapshot = store.getSnapshot()

    expect(snapshot.observations).toHaveLength(2)
    expect(snapshot.decisionTrace).toEqual(
      expect.objectContaining({
        correlationId: 'corr_1',
        handler: 'tasks.remove',
        principalKind: 'user',
        actorKind: 'member',
        workspaceId: 'ws_1',
        lastEventName: 'guard.denied',
        lastEventStatus: 'deny',
        denialExplanation: expect.objectContaining({
          decision: 'guard',
          message: 'Members cannot remove tasks.',
        }),
      }),
    )
    expect(snapshot.decisionTrace?.events).toHaveLength(2)
  })
})
