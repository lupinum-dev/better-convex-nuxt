/**
 * PROOF FIXTURE SUPPORT (vNext Phase 0 — LIVE ISOLATION group).
 *
 * A version-correct WebSocket spy for observing the Convex sync wire protocol
 * (Convex 1.38.0) against the LIVE local deployment. Convex sends/receives
 * JSON text frames (see convex/dist/.../sync/web_socket_manager.js:
 * `ws.onmessage = ... JSON.parse(message.data)` and `ws.send(JSON.stringify(...))`).
 *
 * We subclass the Node 24 global WebSocket so the real transport is used
 * unchanged; we only tap `.send()` (outgoing client messages) and add a
 * passive 'message' listener (incoming server messages) alongside Convex's own
 * `.onmessage` setter. This lets us COUNT protocol effects — outgoing
 * `ModifyQuerySet` (Add/Remove modifications) and incoming `Transition` —
 * exactly as internal §7.1 requires ("observe protocol effects through a
 * version-correct fake webSocketConstructor, not spies on internals").
 */

/** @typedef {{ out: any[], in: any[], constructCount: number, constructedAt: number|null, opened: boolean, openedAt: number|null, closed: boolean }} WireRecord */

/** @returns {WireRecord} */
export function newWireRecord() {
  return {
    out: [],
    in: [],
    constructCount: 0,
    constructedAt: null,
    opened: false,
    openedAt: null,
    closed: false,
  }
}

/**
 * Build a WebSocket constructor bound to `record`. Pass as
 * `new ConvexClient(url, { webSocketConstructor: makeSpyWebSocket(record) })`.
 */
export function makeSpyWebSocket(record) {
  return class SpyWebSocket extends WebSocket {
    constructor(url, protocols) {
      super(url, protocols)
      record.constructCount += 1
      if (record.constructedAt === null) record.constructedAt = Date.now()
      this.addEventListener('open', () => {
        record.opened = true
        if (record.openedAt === null) record.openedAt = Date.now()
      })
      this.addEventListener('message', (ev) => {
        try {
          record.in.push(JSON.parse(ev.data))
        } catch {
          /* non-JSON frame — ignore */
        }
      })
      this.addEventListener('close', () => {
        record.closed = true
      })
    }

    send(data) {
      try {
        record.out.push(JSON.parse(data))
      } catch {
        /* non-JSON frame — ignore */
      }
      return super.send(data)
    }
  }
}

/** Count outgoing ModifyQuerySet messages and their Add/Remove modifications. */
export function countModifyQuerySet(record) {
  let messages = 0
  let add = 0
  let remove = 0
  for (const m of record.out) {
    if (m && m.type === 'ModifyQuerySet') {
      messages += 1
      for (const mod of m.modifications ?? []) {
        if (mod.type === 'Add') add += 1
        else if (mod.type === 'Remove') remove += 1
      }
    }
  }
  return { messages, add, remove }
}

/** Count outgoing Authenticate messages (auth token pushes to the server). */
export function countAuthenticate(record) {
  return record.out.filter((m) => m && m.type === 'Authenticate').length
}

/** Count incoming Transition messages (server query-result deliveries). */
export function countTransitions(record) {
  return record.in.filter((m) => m && m.type === 'Transition').length
}

/** Resolve the CONVEX_URL from env or the playground .env.local fallback. */
export function convexUrl() {
  return process.env.CONVEX_URL ?? 'http://127.0.0.1:3210'
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Poll until predicate() is truthy or timeout; returns true if satisfied. */
export async function waitUntil(predicate, { timeoutMs = 8000, stepMs = 25 } = {}) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true
    await sleep(stepMs)
  }
  return predicate()
}
