import type { Delegation } from '@lupinum/trellis/functions'
import type { H3Event } from 'h3'

import { api } from '#trellis/api'
import { subject } from '#trellis/auth'
import { defineMcpApp } from '#trellis/mcp'
import { createServerConvexCaller } from '#trellis/server'
import type { McpReferencePrincipal } from '~/convex/auth/principal'
import type { McpReferencePermissionKey } from '~/convex/features'
import { mcpManage as mcpManagePermission } from '~/convex/features/mcpKeys/permissions'
import {
  runbookBulkDelete,
  runbookCreate,
  runbookDelete,
  runbookPublish,
  runbookRead,
} from '~/convex/features/runbooks/permissions'

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

  // The MCP key identifies the real caller. Do not collapse it into the user.
  return {
    kind: 'agent',
    agentId: auth.keyId,
    subject: subject.agent(auth.keyId),
    provider: 'mcp',
  }
}

function getMcpDelegation(event: H3Event): Delegation | null {
  const auth = event.context.mcpAuth as McpAuthContext | undefined
  if (!auth?.userId) return null

  return {
    subject: subject.user(auth.userId),
  }
}

export const mcpRuntime = defineMcpApp<McpReferencePrincipal, CapabilitySnapshot, Delegation>({
  callConvex: async (event, { principal, delegation }) => {
    if (principal.kind !== 'agent') {
      return createServerConvexCaller(event, { auth: 'none' })
    }

    // Forward both who is calling and who they are acting for. Trellis binds
    // these on `subject`, not on ad hoc fields like `userId`.
    const trustedOptions = delegation
      ? { auth: 'trusted' as const, principal, delegation }
      : { auth: 'trusted' as const, principal }

    return createServerConvexCaller(event, trustedOptions)
  },
  resolvePrincipal: async (event) => getMcpPrincipal(event),
  resolveDelegation: async ({ event }) => getMcpDelegation(event),
  resolveCapabilities: async ({ principal, convex }) => {
    if (principal.kind !== 'agent') {
      // Keep anonymous and non-agent callers on an empty capability baseline.
      return {
        [runbookRead.key]: false,
        [runbookCreate.key]: false,
        [runbookDelete.key]: false,
        [runbookPublish.key]: false,
        [runbookBulkDelete.key]: false,
        [mcpManagePermission.key]: false,
      }
    }

    const permissions = await convex.query(api.permissions.context.getPermissionContext, {})

    // Capabilities come from the delegated user context, not from the MCP key itself.
    return (
      permissions?.can ?? {
        [runbookRead.key]: false,
        [runbookCreate.key]: false,
        [runbookDelete.key]: false,
        [runbookPublish.key]: false,
        [runbookBulkDelete.key]: false,
        [mcpManagePermission.key]: false,
      }
    )
  },
  principalKey: (principal) =>
    principal.kind === 'agent' ? subject.agent(principal.agentId) : principal.kind,
})

export const tool = mcpRuntime.tool
export default mcpRuntime
