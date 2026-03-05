export type ConvexScopeComposableName = 'useConvexQuery' | 'useConvexPaginatedQuery'

export function assertConvexComposableScope(
  composable: ConvexScopeComposableName,
  isClient: boolean,
  scope: unknown,
): void {
  if (!isClient || scope) {
    return
  }

  throw new Error(
    `[${composable}] Must be called within component setup/effect scope. ` +
      'For middleware/plugins use useConvexCall (client) or serverConvexQuery (server).',
  )
}
