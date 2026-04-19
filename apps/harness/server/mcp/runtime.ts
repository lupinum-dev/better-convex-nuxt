import { defineMcpApp } from '@lupinum/trellis/mcp'
import { createServerConvexCaller } from '@lupinum/trellis/server'
import type { Delegation } from '@lupinum/trellis/functions'
import type { H3Event } from 'h3'

import {
  postDeletePermission,
  type InternalHarnessPermissionKey,
} from '../../convex/auth/permissions'
import type { InternalHarnessPrincipal } from '../../convex/auth/principal'
import { trellisObservability } from '../../observability.config'
import { resolveHarnessMcpAuth } from '../support/mcp-auth-helpers'

type McpAuthContext = {
  keyId?: string
  role?: 'owner' | 'admin' | 'member' | 'viewer'
  tenantId?: string
  userId?: string
}

async function getMcpPrincipal(event: H3Event): Promise<InternalHarnessPrincipal> {
  const auth = (await resolveHarnessMcpAuth(event)) as McpAuthContext | null
  if (!auth?.keyId || !auth.userId || !auth.role) {
    return { kind: 'anonymous', subject: 'system:anonymous' }
  }

  return {
    kind: 'agent',
    agentId: auth.keyId,
    subject: `agent:${auth.keyId}`,
    role: auth.role,
    ...(auth.tenantId ? { tenantId: auth.tenantId } : {}),
    provider: 'mcp',
  }
}

export const mcpRuntime = defineMcpApp<
  InternalHarnessPrincipal,
  Delegation,
  Record<InternalHarnessPermissionKey, boolean>
>({
  callConvex: async (event, { principal, delegation }) =>
    createServerConvexCaller(
      event,
      principal.kind === 'agent'
        ? {
            auth: 'trusted',
            principal,
            delegation,
          }
        : { auth: 'none' },
    ) as never,
  resolvePrincipal: async (event) => await getMcpPrincipal(event),
  resolveDelegation: async ({ event }) => {
    const auth = (await resolveHarnessMcpAuth(event)) as McpAuthContext | null
    if (!auth?.userId) return null

    return {
      subject: `user:${auth.userId}`,
      reason: 'user-approved MCP session',
    }
  },
  resolveCapabilities: async ({ principal }) => ({
    [postDeletePermission.key]:
      principal.kind === 'agent' && ['owner', 'admin', 'member'].includes(principal.role),
  }),
  principalKey: (principal) =>
    principal.kind === 'agent' ? `agent:${principal.agentId}:${principal.role}` : principal.kind,
  observability: trellisObservability,
})

export const tool = mcpRuntime.tool
export default mcpRuntime
