import type { H3Event } from 'h3'

import { api } from '#trellis/api'
import { defineMcpRuntime } from '#trellis/mcp'
import { createServerConvexCaller } from '#trellis/server'
import type { TeamTodoPrincipal } from '~/convex/auth/principal'

import { teamWorkspacePermissionKeys } from '../../shared/permissions'

type McpAuthContext = {
  userId?: string
}

function getMcpPrincipal(event: H3Event): TeamTodoPrincipal {
  const auth = event.context.mcpAuth as McpAuthContext | undefined
  if (!auth?.userId) {
    return { kind: 'anonymous' }
  }

  return {
    kind: 'agent',
    userId: auth.userId,
    provider: 'mcp',
  }
}

export const mcpRuntime = defineMcpRuntime({
  callConvex: async (event, principal) => createServerConvexCaller(event, { principal }),
  resolvePrincipal: async (event) => getMcpPrincipal(event),
  resolveCapabilities: async ({ principal, convex }) => {
    if (principal.kind !== 'agent') {
      return {
        listTodos: false,
        createTodo: false,
        completeTodo: false,
        deleteTodo: false,
      }
    }

    const permissions = await convex.query(api.workspaces.getPermissionContext, {})

    return {
      listTodos: permissions?.can[teamWorkspacePermissionKeys.todoRead] === true,
      createTodo: permissions?.can[teamWorkspacePermissionKeys.todoCreate] === true,
      completeTodo: permissions?.can[teamWorkspacePermissionKeys.todoCreate] === true,
      deleteTodo: permissions?.can[teamWorkspacePermissionKeys.todoCreate] === true,
    }
  },
  principalKey: (principal) =>
    principal.kind === 'agent'
      ? `agent:${principal.agentId ?? principal.userId}`
      : principal.kind,
})

export const projectTool = mcpRuntime.projectTool
