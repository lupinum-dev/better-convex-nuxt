import { ConvexCallError, isSerializedConvexCallError } from '../proof-lib/convex-call-error'

// vNext §7 payload plugin: reduce on the server to the public toJSON() shape
// (no cause), revive on the client back into a real ConvexCallError instance.
export default definePayloadPlugin(() => {
  definePayloadReducer('ConvexCallError', (value: unknown) => {
    if (!(value instanceof ConvexCallError)) return
    return value.toJSON()
  })

  definePayloadReviver('ConvexCallError', (value: unknown) => {
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
