/// <reference path="./registry.base.d.ts" />
// §5.8 proof-1 criterion (b): with the typed empty fallback registered (no
// plugins), the SAME narrowing exposes only the base client — apiKey is absent.
import type { InferRegisteredConvexAuthClient } from 'better-convex-nuxt/auth-client'

type IsAny<T> = 0 extends 1 & T ? true : false
type Expect<T extends true> = T

declare const client: InferRegisteredConvexAuthClient | null

// The empty fallback must not degrade to `any` — it is a real base client type.
type _notAny = Expect<
  IsAny<NonNullable<InferRegisteredConvexAuthClient>> extends true ? false : true
>

export function assertBaseClient() {
  if (!client) return

  // Base client still exposes core Better Auth surface (proves it is not `any`
  // and not empty): signIn exists.
  const _signIn = client.signIn
  void _signIn

  // apiKey is NOT part of the base client after the same narrowing.
  // @ts-expect-error base client has no apiKey namespace.
  client.apiKey.create({ name: 'x' })
}
