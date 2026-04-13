import { defineMcpRuntime } from '#trellis/mcp'
import { serverConvexAction, serverConvexMutation, serverConvexQuery } from '#trellis/server'
import type { H3Event } from 'h3'

import type { Id } from '~/convex/_generated/dataModel'
import type { McpReferencePrincipal, Role } from '~/convex/auth/principal'

type McpAuthContext = {
  role?: Role
  userId?: string
  tenantId?: string
}

function getMcpPrincipal(event: H3Event): McpReferencePrincipal {
  const auth = event.context.mcpAuth as McpAuthContext | undefined
  if (!auth?.role || !auth.userId) {
    return { kind: 'anonymous' }
  }

  return {
    kind: 'mcp',
    userId: auth.userId,
    role: auth.role,
    tenantId: auth.tenantId as Id<'workspaces'> | undefined,
  }
}

function canWrite(role: Role) {
  return role === 'owner' || role === 'admin' || role === 'member'
}

export const mcpRuntime = defineMcpRuntime({
  callConvex: async (event) => ({
    query: async (fn, args) => await serverConvexQuery(event, fn, args, { auth: 'none' }),
    mutation: async (fn, args) => await serverConvexMutation(event, fn, args, { auth: 'none' }),
    action: async (fn, args) => await serverConvexAction(event, fn, args, { auth: 'none' }),
  }),
  resolvePrincipal: async (event) => getMcpPrincipal(event),
  resolveCapabilities: async ({ principal }) => ({
    readWorkspaceRunbooks: principal.kind === 'mcp' && !!principal.tenantId,
    writeWorkspaceRunbooks: principal.kind === 'mcp' && canWrite(principal.role),
    deleteWorkspaceRunbooks:
      principal.kind === 'mcp' && (principal.role === 'owner' || principal.role === 'admin'),
  }),
  principalKey: (principal) =>
    principal.kind === 'mcp' ? `${principal.userId}:${principal.tenantId ?? 'none'}` : principal.kind,
})

export const projectTool = mcpRuntime.projectTool
