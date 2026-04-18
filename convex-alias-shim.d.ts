declare module '#trellis' {
  export * from './src/runtime/composables/index'
}

declare module '#trellis/api' {
  import type { api as convexApi } from './convex/_generated/api'

  export const api: typeof convexApi
}

declare module '#trellis/mcp' {
  export * from '@lupinum/trellis/mcp'
}

declare module '#trellis/server' {
  import type {
    createServerConvexCaller as createServerConvexCallerFn,
    serverConvexAction as serverConvexActionFn,
    serverConvexMutation as serverConvexMutationFn,
    serverConvexQuery as serverConvexQueryFn,
  } from './src/runtime/server/index'

  export const createServerConvexCaller: typeof createServerConvexCallerFn
  export const serverConvexQuery: typeof serverConvexQueryFn
  export const serverConvexMutation: typeof serverConvexMutationFn
  export const serverConvexAction: typeof serverConvexActionFn
}
