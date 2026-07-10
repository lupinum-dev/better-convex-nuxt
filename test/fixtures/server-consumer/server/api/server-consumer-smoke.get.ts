/**
 * Packed `/server` subpath release gate (vNext §9; internal §16.2).
 *
 * Imports ONLY `better-convex-nuxt/server` (the real published subpath
 * resolved from the packed tarball's `node_modules`), never the in-app
 * `#convex/server` alias used by ordinary consumer code. `nuxi typecheck`
 * type-checks this file against the packed tarball's declaration files,
 * proving type resolution for the entry, and the `@ts-expect-error` block
 * below proves the deleted server trio (`serverConvexQuery`/
 * `serverConvexMutation`/`serverConvexAction`) no longer typechecks from this
 * entry (vNext §9 mandatory test "old trio imports fail typecheck").
 *
 * The negative-space contracts below are deliberately four separate import
 * statements from the same specifier (one per name, each needing its own
 * `@ts-expect-error`), so `import/no-duplicates` is disabled for this block.
 */

/* eslint-disable import/no-duplicates -- see file-header comment above */
import { serverConvex } from 'better-convex-nuxt/server'
// @ts-expect-error serverConvexQuery no longer exists on ./server (vNext §9)
import { serverConvexQuery } from 'better-convex-nuxt/server'
// @ts-expect-error serverConvexMutation no longer exists on ./server (vNext §9)
import { serverConvexMutation } from 'better-convex-nuxt/server'
// @ts-expect-error serverConvexAction no longer exists on ./server (vNext §9)
import { serverConvexAction } from 'better-convex-nuxt/server'
import type { FunctionReference } from 'convex/server'
/* eslint-enable import/no-duplicates */

void serverConvexQuery
void serverConvexMutation
void serverConvexAction

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
