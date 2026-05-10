import type { Delegation } from '@lupinum/trellis/backend'
import { defineMcpApp } from '@lupinum/trellis/mcp'
import { createServerConvexCaller } from '@lupinum/trellis/server'
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
    agentId: auth.userId,
    userId: auth.userId,
    subject: `agent:${auth.userId}`,
    role: auth.role,
    ...(auth.tenantId ? { tenantId: auth.tenantId } : {}),
    provider: 'mcp',
  }
}

function toForwardedHarnessPrincipal(principal: InternalHarnessPrincipal) {
  if (principal.kind !== 'agent') {
    return principal
  }

  return {
    kind: 'agent' as const,
    agentId: principal.agentId,
    userId: principal.userId ?? principal.agentId,
    subject: principal.subject,
    role: principal.role,
    ...(principal.tenantId ? { tenantId: principal.tenantId } : {}),
    provider: 'mcp' as const,
  }
}

export const mcpRuntime = defineMcpApp<
  InternalHarnessPrincipal,
  Record<InternalHarnessPermissionKey, boolean>,
  Delegation
>({
  callConvex: async (event, { principal, delegation }) =>
    createServerConvexCaller(
      event,
      principal.kind === 'agent'
        ? {
            auth: 'trusted',
            principal: toForwardedHarnessPrincipal(principal),
            ...(delegation ? { delegation } : {}),
          }
        : { auth: 'none' },
    ) as never,
  resolvePrincipal: async (event) => await getMcpPrincipal(event),
  resolveDelegation: async ({ event }) => {
    const auth = (await resolveHarnessMcpAuth(event)) as McpAuthContext | null
    if (!auth?.userId) return null

    return {
      subject: `user:${auth.userId}`,
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
