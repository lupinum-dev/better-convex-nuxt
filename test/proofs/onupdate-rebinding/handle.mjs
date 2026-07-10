/**
 * vNext §5.8 proof 11 — PROTOTYPE ConvexClientHandle (onUpdate rebinding).
 *
 * This is a disposable prototype standing in for the future per-Nuxt-app
 * client owner + stable public handle (vNext §5.4). It proves the mechanics
 * the design rests on; it is NOT the library surface and refactors no source.
 *
 * Semantics modeled from vNext §5.4:
 *  - `onUpdate` returns a STABLE unsubscribe function that removes whichever
 *    underlying subscription is current (survives A->B rebinding).
 *  - The owner, on A->B replacement, unsubscribes every active listener from A
 *    BEFORE publishing B, then re-subscribes each on B (rebind). No consumer
 *    re-subscription; exactly one underlying subscription per listener.
 *  - Disposal detaches every listener from the current client.
 */

export function createPrototypeHandle(initialClient) {
  let current = initialClient
  /** @type {Set<{query:any,args:any,callback:Function,onError?:Function,underlying:null|Function,active:boolean}>} */
  const listeners = new Set()

  function subscribeOne(entry) {
    entry.underlying = current.onUpdate(entry.query, entry.args, entry.callback, entry.onError)
  }

  const handle = {
    // ---- public ConvexClientHandle surface (query|mutation|action|onUpdate) ----
    query: (...a) => current.query(...a),
    mutation: (...a) => current.mutation(...a),
    action: (...a) => current.action(...a),

    onUpdate(query, args, callback, onError) {
      const entry = { query, args, callback, onError, underlying: null, active: true }
      listeners.add(entry)
      subscribeOne(entry)
      // STABLE unsubscribe: closes over the registry entry, not the raw
      // per-client unsubscribe, so it detaches whichever client is current.
      const unsubscribe = () => {
        if (!entry.active) return
        entry.active = false
        listeners.delete(entry)
        entry.underlying?.()
        entry.underlying = null
      }
      return unsubscribe
    },

    // ---- owner-only lifecycle (not part of the consumer handle) ----
    /** Rebind every active listener A->B: detach from A, then attach to B. */
    __rebind(newClient) {
      for (const entry of listeners) {
        entry.underlying?.()
        entry.underlying = null
      }
      current = newClient
      for (const entry of listeners) {
        subscribeOne(entry)
      }
    },
    /** Dispose: detach every active listener from the current client. */
    __dispose() {
      for (const entry of listeners) {
        entry.active = false
        entry.underlying?.()
        entry.underlying = null
      }
      listeners.clear()
    },
    __activeCount() {
      return listeners.size
    },
    __current() {
      return current
    },
  }
  return handle
}
