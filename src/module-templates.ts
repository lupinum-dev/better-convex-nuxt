export function getMissingConvexApiTemplateContents(): string {
  return `
type MissingConvexGeneratedApi = {
  /**
   * The generated Convex API was not found.
   * Run \`npx convex dev\` or \`npx convex codegen\` to create \`convex/_generated/api\`.
   */
  readonly __betterConvexNuxtError: 'Missing generated Convex API. Run npx convex dev or npx convex codegen.'
}

function createMissingConvexApiProxy(path: string[]): MissingConvexGeneratedApi {
  return new Proxy({} as MissingConvexGeneratedApi, {
    get(_target, prop) {
      if (typeof prop === 'symbol') return undefined
      if (prop === '__betterConvexNuxtError') {
        return 'Missing generated Convex API. Run npx convex dev or npx convex codegen.'
      }
      const accessPath = [...path, String(prop)].join('.')
      throw new Error(
        '[better-convex-nuxt] #convex/api points to a placeholder because convex/_generated/api was not found. ' +
          'Run \`npx convex dev\` or \`npx convex codegen\` to generate your Convex API. ' +
          'Attempted to access ' + accessPath + '.',
      )
    },
  })
}

export const api = createMissingConvexApiProxy([])
export const internal = createMissingConvexApiProxy(['internal'])
export const components = createMissingConvexApiProxy(['components'])
`
}

export function getTypeAugmentationTemplateContents(): string {
  return `
import type { ConvexClient } from 'convex/browser'
import type { createAuthClient } from 'better-auth/vue'
import type { RouteLocationRaw } from 'vue-router'

type AuthClient = ReturnType<typeof createAuthClient>

declare module '#app' {
  interface NuxtApp {
    $convex?: ConvexClient
    $auth?: AuthClient
  }

  interface RuntimeNuxtHooks {
    'better-convex:auth:refresh': () => void | Promise<void>
  }

  interface PageMeta {
    /**
     * Skip Convex auth check for this page.
     * Useful for marketing pages that don't need authentication.
     */
    skipConvexAuth?: boolean
    /**
     * Opt-in route protection powered by better-convex-nuxt.
     * true = require auth (default redirect), object = custom redirect.
     */
    convexAuth?: boolean | { redirectTo?: RouteLocationRaw }
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $convex?: ConvexClient
    $auth?: AuthClient
  }
}

export {}
`
}
