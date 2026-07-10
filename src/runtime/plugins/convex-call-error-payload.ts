import { definePayloadPlugin, definePayloadReducer, definePayloadReviver } from '#app'

import { ConvexCallError, isSerializedConvexCallError } from '../errors'

/**
 * Universal Nuxt payload plugin for {@link ConvexCallError} (vNext §7, internal
 * §9.3). Registered with `mode: 'all'` and an explicit negative `order` (-50) by
 * `src/module.ts`, so the reviver exists before Nuxt parses the SSR payload.
 *
 * The framework-free `/errors` entry stays unaware of Nuxt; this Nuxt-aware
 * plugin is the only place the two meet. The reducer emits the public
 * `toJSON()` shape (never `cause`); the reviver reconstructs a real
 * `ConvexCallError` — instance identity survives hydration — WITHOUT a `cause`,
 * and only after strict structural validation, so an arbitrary object carrying
 * `name: 'ConvexCallError'` is never revived.
 */
export default definePayloadPlugin(() => {
  definePayloadReducer('ConvexCallError', (value) => {
    if (!(value instanceof ConvexCallError)) return
    return value.toJSON()
  })

  definePayloadReviver('ConvexCallError', (value) => {
    if (!isSerializedConvexCallError(value)) return
    return new ConvexCallError({
      kind: value.kind,
      message: value.message,
      code: value.code,
      status: value.status,
      data: value.data,
    })
  })
})
