import { defineMcpRuntime } from '#trellis/mcp'
import { createServerConvexCaller } from '#trellis/server'
import type { H3Event } from 'h3'

import type { Id } from '~/convex/_generated/dataModel'
import type { Role, TeamTodoPrincipal } from '~/convex/auth/principal'

type McpAuthContext = {
  role?: Role
  userId?: string
  tenantId?: string
}

function getMcpPrincipal(event: H3Event): TeamTodoPrincipal {
  const auth = event.context.mcpAuth as McpAuthContext | undefined
  if (!auth?.role || !auth.userId) {
    return { kind: 'anonymous' }
  }

  return {
    kind: 'agent',
    userId: auth.userId,
    role: auth.role,
    tenantId: auth.tenantId as Id<'workspaces'> | undefined,
    provider: 'mcp',
  }
}

function canWrite(role: Role) {
  return role === 'owner' || role === 'admin' || role === 'member'
}

export const mcpRuntime = defineMcpRuntime({
  callConvex: async (event) => createServerConvexCaller(event),
  resolvePrincipal: async (event) => getMcpPrincipal(event),
  resolveCapabilities: async ({ principal }) => ({
    listTodos: principal.kind === 'agent' && !!principal.tenantId,
    createTodo: principal.kind === 'agent' && canWrite(principal.role),
    completeTodo: principal.kind === 'agent' && canWrite(principal.role),
    deleteTodo: principal.kind === 'agent' && canWrite(principal.role),
  }),
  principalKey: (principal) =>
    principal.kind === 'agent' ? `${principal.userId}:${principal.tenantId ?? 'none'}` : principal.kind,
})

export const projectTool = mcpRuntime.projectTool
