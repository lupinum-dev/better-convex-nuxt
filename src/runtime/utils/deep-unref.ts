import { isRef } from 'vue'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Deeply unwrap Vue refs contained inside plain objects/arrays.
 * Non-plain objects (Date, Map, class instances, etc.) are treated as opaque.
 */
export function deepUnref<T>(value: T): T {
  const unwrapped = isRef(value) ? value.value : value

  if (Array.isArray(unwrapped)) {
    return unwrapped.map(item => deepUnref(item)) as T
  }

  if (isPlainObject(unwrapped)) {
    const output: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(unwrapped)) {
      output[key] = deepUnref(entry)
    }
    return output as T
  }

  return unwrapped as T
}
