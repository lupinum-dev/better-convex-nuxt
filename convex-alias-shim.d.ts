declare module '#convex/mcp' {
  export * from 'better-convex-nuxt/mcp'
}

declare module '#convex/server' {
  import type {
    serverConvexAction as serverConvexActionFn,
    serverConvexMutation as serverConvexMutationFn,
    serverConvexQuery as serverConvexQueryFn,
  } from './src/runtime/server/index'

  export const serverConvexQuery: typeof serverConvexQueryFn
  export const serverConvexMutation: typeof serverConvexMutationFn
  export const serverConvexAction: typeof serverConvexActionFn
}
