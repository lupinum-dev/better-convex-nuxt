export type ConvexScopeComposableName = 'useConvexQuery' | 'useConvexPaginatedQuery'

export function assertConvexComposableScope(
  composable: ConvexScopeComposableName,
  isClient: boolean,
  scope: unknown,
  instance?: unknown,
): void {
  if (!isClient || scope || instance) {
    return
  }

  throw new Error(
    `[${composable}] Must be called inside <script setup> or a component lifecycle hook. ` +
      'For middleware/plugins, use useConvex() directly or serverConvexQuery() on the server.',
  )
}
