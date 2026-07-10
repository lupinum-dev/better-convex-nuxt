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
 * `synchronizeIdentity` is the SERIAL identity-operation queue candidate
 * confirmation — never the deduplicated background `refresh()` (decision 4). It
 * runs only after a successful, token-bearing Better Auth result.
 */

/** True when a Better Auth result envelope carries a truthy `error`. */
export function readBetterAuthResultError(result: unknown): unknown {
  if (!result || typeof result !== 'object') return null
  return (result as { error?: unknown }).error ?? null
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
 * Post-result synchronization predicate (vNext §8). Sync ONLY after a successful
 * Better Auth client result whose `data.token` is a non-empty string:
 *
 * - no sync after a thrown operation (the caller never reaches here);
 * - no sync when the returned object has a truthy `error`;
 * - social/redirect initiation returns no session token — no sync;
 * - successful account creation without a session (`token: null`) — no sync.
 */
export function shouldSynchronizeAfterAuthResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false
  const response = result as {
    error?: unknown
    data?: { token?: unknown } | null
  }
  return (
    !response.error && typeof response.data?.token === 'string' && response.data.token.length > 0
  )
}

export function createIntegratedAuthNamespace<T extends object>(
  namespace: T,
  synchronizeIdentity: () => Promise<void>,
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
            // Apply with the ORIGINAL target as `this` so plugin methods that
            // read their receiver keep working after wrapping.
            const result = await Reflect.apply(value, currentTarget, args)
            const error = readBetterAuthResultError(result)
            if (!error && shouldSynchronizeAfterAuthResult(result)) {
              await synchronizeIdentity()
            }
            return result
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
