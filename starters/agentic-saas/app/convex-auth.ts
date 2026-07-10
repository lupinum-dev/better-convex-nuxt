// `<srcDir>/convex-auth.ts` convention definition (vNext §8). `better-convex-nuxt`
// discovers this file, prepends the Convex token-sync client plugin, and types
// `useConvexAuth().client` with the Organization plugin methods used on the
// agent approval queue page.
import { organizationClient } from 'better-auth/client/plugins'
import { defineConvexAuthClient } from 'better-convex-nuxt/auth-client'

export default defineConvexAuthClient({
  plugins: [organizationClient()],
})
