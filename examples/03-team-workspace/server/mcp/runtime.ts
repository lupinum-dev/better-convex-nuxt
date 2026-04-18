import type { H3Event } from 'h3'

import { api } from '#trellis/api'
import { defineMcpApp } from '#trellis/mcp'
import { createServerConvexCaller } from '#trellis/server'
import type { TeamTodoPrincipal } from '~/convex/auth/principal'

import { teamWorkspacePermissionKeys } from '../../shared/permissions'

type McpAuthContext = {
  userId?: string
}

type CapabilitySnapshot = {
  listTodos: boolean
  createTodo: boolean
  completeTodo: boolean
  deleteTodo: boolean
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

export const mcpRuntime = defineMcpApp<TeamTodoPrincipal, CapabilitySnapshot>({
  callConvex: async (event, principal) =>
    createServerConvexCaller(
      event,
      principal.kind === 'agent'
        ? {
            auth: 'trusted',
            actor: { userId: principal.userId },
            principal,
          }
        : { auth: 'none' },
    ),
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

    const permissions = await convex.query(api.permissions.context.getPermissionContext, {})

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

export const tool = mcpRuntime.tool
