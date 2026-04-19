import type { H3Event } from 'h3'

import { api } from '#trellis/api'
import type { Delegation } from '@lupinum/trellis/functions'
import { defineMcpApp } from '#trellis/mcp'
import { createServerConvexCaller } from '#trellis/server'
import {
  mcpManage,
  runbookBulkDelete,
  runbookCreate,
  runbookDelete,
  runbookPublish,
  runbookRead,
  type McpReferencePermissionKey,
} from '~/convex/auth/permissions'
import type { McpReferencePrincipal } from '~/convex/auth/principal'

type McpAuthContext = {
  keyId?: string
  userId?: string
}

type CapabilitySnapshot = Record<McpReferencePermissionKey, boolean>

function getMcpPrincipal(event: H3Event): McpReferencePrincipal {
  const auth = event.context.mcpAuth as McpAuthContext | undefined
  if (!auth?.keyId || !auth.userId) {
    return { kind: 'anonymous', subject: 'system:anonymous' }
  }

  return {
    kind: 'agent',
    agentId: auth.keyId,
    subject: `agent:${auth.keyId}`,
    provider: 'mcp',
  }
}

function getMcpDelegation(event: H3Event): Delegation | null {
  const auth = event.context.mcpAuth as McpAuthContext | undefined
  if (!auth?.userId) return null

  return {
    subject: `user:${auth.userId}`,
    reason: 'user-approved MCP session',
  }
}

export const mcpRuntime = defineMcpApp<McpReferencePrincipal, Delegation, CapabilitySnapshot>({
  callConvex: async (event, { principal, delegation }) => {
    if (principal.kind !== 'agent') {
      return createServerConvexCaller(event, { auth: 'none' })
    }

    const trustedOptions = delegation
      ? { auth: 'trusted' as const, principal, delegation }
      : { auth: 'trusted' as const, principal }

    return createServerConvexCaller(event, trustedOptions)
  },
  resolvePrincipal: async (event) => getMcpPrincipal(event),
  resolveDelegation: async ({ event }) => getMcpDelegation(event),
  resolveCapabilities: async ({ principal, convex }) => {
    if (principal.kind !== 'agent') {
      return {
        [runbookRead.key]: false,
        [runbookCreate.key]: false,
        [runbookDelete.key]: false,
        [runbookPublish.key]: false,
        [runbookBulkDelete.key]: false,
        [mcpManage.key]: false,
      }
    }

    const permissions = await convex.query(api.permissions.context.getPermissionContext, {})

    return (
      permissions?.can ?? {
        [runbookRead.key]: false,
        [runbookCreate.key]: false,
        [runbookDelete.key]: false,
        [runbookPublish.key]: false,
        [runbookBulkDelete.key]: false,
        [mcpManage.key]: false,
      }
    )
  },
  principalKey: (principal) =>
    principal.kind === 'agent' ? `agent:${principal.agentId}` : principal.kind,
})

export const tool = mcpRuntime.tool
export default mcpRuntime
