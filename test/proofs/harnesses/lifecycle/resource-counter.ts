/**
 * Shared effect-counting helper for the lifecycle fixtures (internal §17.2:
 * "count effects, not only visible outcomes"). Every fixture in this
 * directory asserts on `created`/`disposed` counts and the derived `live`
 * count, never only on a final visible value.
 */
export interface ResourceCounter {
  created: number
  disposed: number
  /** created - disposed; must return to 0 after every explicit disposal in a correct fixture. */
  live: () => number
  create: () => { id: number; dispose: () => void }
}

export function createResourceCounter(): ResourceCounter {
  let created = 0
  let disposed = 0
  let nextId = 1

  const counter: ResourceCounter = {
    get created() {
      return created
    },
    get disposed() {
      return disposed
    },
    live: () => created - disposed,
    create: () => {
      created += 1
      const id = nextId++
      let alreadyDisposed = false
      return {
        id,
        dispose: () => {
          if (alreadyDisposed) return // dispose must be idempotent, like a real unsubscribe
          alreadyDisposed = true
          disposed += 1
        },
      }
    },
  }

  return counter
}
