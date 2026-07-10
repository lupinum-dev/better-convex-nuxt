// `<srcDir>/convex-auth.ts` convention definition (vNext §8). The module
// discovers this file automatically (no `convex.auth.client` needed), prepends
// the Convex token-sync client plugin, and generates the typed registry so
// `useConvexAuth().client` is typed with `inferAdditionalFields<AppAuth>()`.
import { inferAdditionalFields } from 'better-auth/client/plugins'
import { defineConvexAuthClient } from 'better-convex-nuxt/auth-client'

import type { AppAuth } from './convex/auth'

export default defineConvexAuthClient({
  plugins: [inferAdditionalFields<AppAuth>()],
})
