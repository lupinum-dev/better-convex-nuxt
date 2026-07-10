/**
 * The per-Nuxt-app serial identity-operation queue (vNext §5.3, internal §6.5;
 * proof `test/proofs/auth-races/proof6-serial-signin.mjs`).
 *
 * Integrated sign-in, sign-up, and sign-out share ONE queue and execute in
 * invocation order. The chain is kept alive regardless of an individual
 * operation's outcome so one rejection never wedges later operations. A caller
 * awaits only its own operation's settlement.
 */
export interface SerialQueue {
  enqueue<T>(operation: () => Promise<T>): Promise<T>
  /** Resolves when the queue has drained to the tail captured at call time. */
  idle(): Promise<void>
}

export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve()

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = tail.then(operation, operation)
    // Keep the chain alive regardless of this operation's outcome.
    tail = run.then(
      () => {},
      () => {},
    )
    return run
  }

  function idle(): Promise<void> {
    return tail.then(
      () => {},
      () => {},
    )
  }

  return { enqueue, idle }
}
