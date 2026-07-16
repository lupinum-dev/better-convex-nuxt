import { serverConvex } from 'better-convex-nuxt/server'
import type { FunctionReference } from 'convex/server'

const queryRef = { _path: 'notes:list' } as unknown as FunctionReference<
  'query',
  'public',
  Record<string, never>,
  { count: number }
>

export default defineEventHandler(async (event) => {
  const caller = serverConvex(event)
  const result = await caller.query(queryRef, {})
  return { count: result.count }
})
