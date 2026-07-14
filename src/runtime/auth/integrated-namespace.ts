/**
 * Receiver-preserving integrated sign-in/sign-up wrapper (vNext §8 "Atomic
 * sign-in/sign-up").
 *
 * Wraps the WHOLE `signIn`/`signUp` namespace (not just `.email`). Every callable
 * is applied with its containing object as `this`, so a Better Auth plugin method
 * that reads its receiver keeps working. Functions and nested namespace proxies
 * are cached, so `auth.signIn.email === auth.signIn.email`. Only callables and
 * PLAIN namespace objects are wrapped; arrays, class instances, and store
 * atoms / subscription-bearing values pass through unchanged. Wrapped functions
 * intentionally do not preserve arbitrary own properties of the source function.
 *
 * `createSessionSynchronizationBarrier` captures the canonical public Better
 * Auth session revision before invoking an action. It never fetches a Convex
 * token itself. The wrapper waits only after a successful, token-bearing result
 * and cancels the unused barrier on every other outcome.
 */

export interface SessionSynchronizationBarrier {
  /** Wait for this exact Better Auth session token, or `null` for no session. */
  wait(sessionToken: string | null): Promise<void>
  cancel(): void
}

/**
 * A plain namespace object worth recursing into: `signIn`, `signUp`, and their
 * nested method groups are plain objects (or null-prototype objects). Arrays,
 * class instances (non-`Object`/non-null prototype), and callables are excluded;
 * callables are handled separately, everything else passes through untouched.
 */
export function isPlainNamespaceObject(value: unknown): value is Record<PropertyKey, unknown> {
  if (typeof value !== 'object' || value === null) return false
  if (Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Post-result barrier predicate (vNext §8). Wait ONLY after a successful Better
 * Auth client result whose `data.token` is a non-empty string:
 *
 * - no wait after a thrown operation (the caller never reaches here);
 * - no wait when the returned object has a truthy `error`;
 * - social/redirect initiation returns no session token — no wait;
 * - successful account creation without a session (`token: null`) — no wait.
 */
export function getSessionSynchronizationToken(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null
  const response = result as {
    error?: unknown
    data?: { token?: unknown } | null
  }
  const token = response.data?.token
  return !response.error && typeof token === 'string' && token.length > 0 ? token : null
}

export function createIntegratedAuthNamespace<T extends object>(
  namespace: T,
  createSessionSynchronizationBarrier: () => SessionSynchronizationBarrier,
  execute: (operation: () => Promise<unknown>) => Promise<unknown> = (operation) => operation(),
): T {
  const proxyCache = new WeakMap<object, object>()
  const propertyCache = new WeakMap<object, Map<PropertyKey, unknown>>()

  const wrapObject = <Value extends object>(target: Value): Value => {
    const cached = proxyCache.get(target)
    if (cached) return cached as Value

    const proxy = new Proxy(target, {
      get(currentTarget, property, receiver) {
        const cachedProperties = propertyCache.get(currentTarget) ?? new Map<PropertyKey, unknown>()
        propertyCache.set(currentTarget, cachedProperties)
        if (cachedProperties.has(property)) return cachedProperties.get(property)

        const value = Reflect.get(currentTarget, property, receiver)
        if (typeof value === 'function') {
          const wrapped = async (...args: unknown[]) => {
            return await execute(async () => {
              const barrier = createSessionSynchronizationBarrier()
              // Apply with the ORIGINAL target as `this` so plugin methods that
              // read their receiver keep working after wrapping.
              try {
                const result = await Reflect.apply(value, currentTarget, args)
                const sessionToken = getSessionSynchronizationToken(result)
                if (sessionToken) {
                  await barrier.wait(sessionToken)
                } else {
                  barrier.cancel()
                }
                return result
              } catch (error) {
                barrier.cancel()
                throw error
              }
            })
          }
          cachedProperties.set(property, wrapped)
          return wrapped
        }
        if (isPlainNamespaceObject(value)) {
          const wrapped = wrapObject(value)
          cachedProperties.set(property, wrapped)
          return wrapped
        }
        return value
      },
    })
    proxyCache.set(target, proxy)
    return proxy
  }

  return wrapObject(namespace)
}
