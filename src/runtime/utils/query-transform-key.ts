const transformedAsyncDataKeyIds = new WeakMap<(input: unknown) => unknown, string>()

export function getTransformedAsyncDataKeyId(transform: (input: unknown) => unknown): string {
  const existing = transformedAsyncDataKeyIds.get(transform)
  if (existing) return existing

  // Derive a stable key from the function's source text so server and client
  // produce the same suffix regardless of component initialization order.
  const source = transform.toString()
  let hash = 0
  for (let i = 0; i < source.length; i++) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0
  }

  const id = hash.toString(36)
  transformedAsyncDataKeyIds.set(transform, id)
  return id
}

export function getTransformedAsyncDataKeySuffix(
  transform?: ((input: unknown) => unknown) | null,
): string {
  return transform ? `:transformed:${getTransformedAsyncDataKeyId(transform)}` : ''
}
