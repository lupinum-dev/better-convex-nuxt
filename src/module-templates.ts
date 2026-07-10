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

export function getTypeAugmentationTemplateContents(authPageMetaTypeImport: string): string {
  const authPageMetaImportSpecifier = JSON.stringify(authPageMetaTypeImport)

  return `
import type { ConvexAuthPageMeta } from ${authPageMetaImportSpecifier}

// The public \`$convex\` and \`$auth\` Nuxt-app property augmentations are deleted
// (vNext §5.4): consumers use the \`useConvex()\` handle and the auth composables,
// never a raw replaceable client. Only the route-protection page meta and the
// auth-refresh hook remain part of the generated public surface.
declare module '#app' {
  interface RuntimeNuxtHooks {
    'better-convex:auth:refresh': () => void | Promise<void>
  }

  interface PageMeta {
    /**
     * Opt-in route protection powered by better-convex-nuxt.
     * true = require auth (default redirect), object = custom redirect.
     */
    convexAuth?: ConvexAuthPageMeta
  }
}

export {}
`
}
