/**
 * Typed MCP tool factory with permission checks and org scoping baked in.
 *
 * Auth-required tools are hidden from anonymous `tools/list` responses by
 * default so the playground can demonstrate public vs authenticated discovery
 * over the real MCP route.
 */
import { createConvexTools } from 'better-convex-nuxt/mcp'

import { checkPermission } from '../../../convex/permissions.config'

const { defineConvexTool: baseDefineConvexTool } = createConvexTools({
  checkPermission,
  tenant: {
    orgField: 'organizationId',
    resolveOrgId: (actor) => {
      const auth = actor as { orgId?: string }
      return auth.orgId ?? null
    },
  },
})

export const defineConvexTool: typeof baseDefineConvexTool = ((options: Parameters<
  typeof baseDefineConvexTool
>[0]) => {
  const enabled = options.auth === 'required'
    ? async (event: Parameters<NonNullable<typeof options.enabled>>[0]) => {
        const baseVisible = await options.enabled?.(event)
        return baseVisible !== false && Boolean(event.context.mcpAuth)
      }
    : options.enabled

  return baseDefineConvexTool({
    ...options,
    enabled,
  } as Parameters<typeof baseDefineConvexTool>[0])
}) as typeof baseDefineConvexTool
