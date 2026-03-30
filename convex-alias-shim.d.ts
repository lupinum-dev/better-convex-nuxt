declare module '#convex/mcp' {
  import type { defineTool as defineToolFn } from './src/runtime/mcp/define-convex-tool'

  export const defineTool: typeof defineToolFn
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
