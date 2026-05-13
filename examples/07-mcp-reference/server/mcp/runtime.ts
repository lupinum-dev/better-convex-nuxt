import { subject } from '@lupinum/trellis/auth'
import type { ActingFor } from '@lupinum/trellis/backend'
import type { H3Event } from 'h3'

import { api } from '#trellis/api'
import { defineMcpApp } from '#trellis/mcp'
import { createServerConvexCaller, delegateToUser } from '#trellis/server'
import type { McpReferencePrincipal } from '~/convex/auth/caller'
import type { McpReferencePermissionKey } from '~/convex/features'
import { mcpManage as mcpManagePermission } from '~/convex/features/mcpKeys/permissions'
import {
  runbookBulkDelete,
  runbookCreate,
  runbookDelete,
  runbookPublish,
  runbookRead,
} from '~/convex/features/runbooks/permissions'

import { mcpRateLimitStore } from './rate-limit-store'

type McpAuthContext = {
  keyId?: string
  workspaceId?: string
  userId?: string
}

type RecordAccessSnapshot = Record<McpReferencePermissionKey, boolean>

function getMcpCaller(event: H3Event): McpReferencePrincipal {
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

async function getMcpDelegation(event: H3Event): Promise<ActingFor | null> {
  const auth = event.context.mcpAuth as McpAuthContext | undefined
  if (!auth?.userId) return null

  return await delegateToUser({
    userId: auth.userId,
    allow: true,
  })
}

type McpRuntimeContext = {
  workspaceId: string
}

export const mcpRuntime = defineMcpApp<
  McpReferencePrincipal,
  RecordAccessSnapshot,
  ActingFor,
  McpRuntimeContext
>({
  rateLimitStore: mcpRateLimitStore,
  callConvex: async (event, { caller, actingFor }) => {
    if (caller.kind !== 'agent') {
      return createServerConvexCaller(event, { auth: 'none' })
    }

    // Forward both who is calling and who they are acting for. Trellis binds
    // these on `subject`, not on ad hoc fields like `userId`.
    const trustedOptions = actingFor
      ? { auth: 'trusted' as const, caller, actingFor }
      : { auth: 'trusted' as const, caller }

    return createServerConvexCaller(event, trustedOptions)
  },
  resolveCaller: async (event) => getMcpCaller(event),
  resolveActingFor: async ({ event }) => getMcpDelegation(event),
  resolveAccess: async ({ caller, convex }) => {
    if (caller.kind !== 'agent') {
      // Keep anonymous and non-agent callers on an empty recordAccess baseline.
      return {
        [runbookRead.key]: false,
        [runbookCreate.key]: false,
        [runbookDelete.key]: false,
        [runbookPublish.key]: false,
        [runbookBulkDelete.key]: false,
        [mcpManagePermission.key]: false,
      }
    }

    const permissions = await convex.query(api.permissions.context.getAccessContext, {})

    // RecordAccess come from the delegated user context, not from the MCP key itself.
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
  runtime: ({ event }) => {
    const auth = event.context.mcpAuth as McpAuthContext | undefined

    return {
      workspaceId: auth?.workspaceId ?? 'global',
    }
  },
  callerKey: (caller) => (caller.kind === 'agent' ? subject.agent(caller.agentId) : caller.kind),
  scopeKey: ({ runtime }) => runtime.workspaceId,
})

export const tool = mcpRuntime.tool
export default mcpRuntime
