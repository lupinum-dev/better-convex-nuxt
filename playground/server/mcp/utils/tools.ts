/**
 * Typed MCP tool factory with permission system and tenant scoping baked in.
 *
 * All tools that need auth/permissions import `defineConvexTool` from here
 * instead of from the module directly. This gives typed `require` autocomplete
 * and org-scoped tools via `scoped: true`.
 */
import { createConvexTools } from 'better-convex-nuxt/mcp'

import { checkPermission } from '../../../convex/permissions.config'

export const { defineConvexTool } = createConvexTools({
  checkPermission,
  tenant: {
    orgField: 'organizationId',
    resolveOrgId: (mcpAuth) => {
      // The MCP auth identity carries orgId when the API key is team-scoped.
      // This is set by the auth resolver from the key's metadata.
      const auth = mcpAuth as { orgId?: string }
      return auth.orgId ?? null
    },
  },
})
