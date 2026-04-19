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
  role?: 'owner' | 'admin' | 'member' | 'viewer'
  tenantId?: string
  userId?: string
}

async function getMcpPrincipal(event: H3Event): Promise<InternalHarnessPrincipal> {
  const auth = (await resolveHarnessMcpAuth(event)) as McpAuthContext | null
  if (!auth?.userId || !auth.role) {
    return { kind: 'anonymous' }
  }

  return {
    kind: 'agent',
    userId: auth.userId,
    role: auth.role,
    ...(auth.tenantId ? { tenantId: auth.tenantId } : {}),
    provider: 'mcp',
  }
}

export const mcpRuntime = defineMcpApp<
  InternalHarnessPrincipal,
  Record<InternalHarnessPermissionKey, boolean>
>({
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
    ) as never,
  resolvePrincipal: async (event) => await getMcpPrincipal(event),
  resolveCapabilities: async ({ principal }) => ({
    [postDeletePermission.key]:
      principal.kind === 'agent' && ['owner', 'admin', 'member'].includes(principal.role),
  }),
  principalKey: (principal) =>
    principal.kind === 'agent' ? `agent:${principal.userId}:${principal.role}` : principal.kind,
  observability: trellisObservability,
})

export const tool = mcpRuntime.tool
export default mcpRuntime
