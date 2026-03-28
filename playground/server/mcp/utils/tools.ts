/**
 * Typed MCP tool factory with permission system baked in.
 *
 * All tools that need auth/permissions import `defineConvexTool` from here
 * instead of from the module directly. This gives typed `require` autocomplete.
 */
import { createConvexTools } from 'better-convex-nuxt/mcp'

import { checkPermission } from '../../../convex/permissions.config'

export const { defineConvexTool } = createConvexTools({
  checkPermission,
})
