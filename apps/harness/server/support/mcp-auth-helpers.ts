import { createHash } from 'node:crypto'
import { createError, getRequestHeader, type H3Event } from 'h3'

import { defineMcpTool, defineTool } from '#trellis/mcp'

import { serverConvexQuery } from '../../../../src/runtime/server/utils/convex'
import { api } from '../../convex/_generated/api'

export interface HarnessMcpAuth {
  keyId: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  userId: string
  tenantId?: string
}

function normalizeHarnessMcpAuth(value: unknown): HarnessMcpAuth | null {
  if (!value || typeof value !== 'object') return null

  const auth = value as {
    keyId?: unknown
    role?: unknown
    userId?: unknown
    tenantId?: unknown
  }

  if (
    typeof auth.keyId !== 'string' ||
    (auth.role !== 'owner' &&
      auth.role !== 'admin' &&
      auth.role !== 'member' &&
      auth.role !== 'viewer') ||
    typeof auth.userId !== 'string'
  ) {
    return null
  }

  return {
    keyId: auth.keyId,
    role: auth.role,
    userId: auth.userId,
    ...(typeof auth.tenantId === 'string' ? { tenantId: auth.tenantId } : {}),
  }
}

export async function resolveHarnessMcpAuth(event: H3Event): Promise<HarnessMcpAuth | null> {
  const cached = normalizeHarnessMcpAuth(event.context.__trellisMcpAuth ?? event.context.mcpAuth)
  if (cached) {
    return cached
  }

  const header = getRequestHeader(event, 'authorization')
  if (!header?.startsWith('Bearer ')) return null

  const token = header.slice(7)
  if (!token.startsWith('mcp_')) return null
  const keyHash = createHash('sha256').update(token).digest('hex')

  const resolved = await serverConvexQuery(
    event,
    api.mcpKeys.validate,
    { keyHash },
    { auth: 'none' },
  )
  if (!resolved) return null

  const auth: HarnessMcpAuth = {
    keyId: String(resolved.id),
    role: resolved.role,
    userId: resolved.userId,
    ...(resolved.tenantId ? { tenantId: resolved.tenantId } : {}),
  }

  event.context.mcpAuth = auth
  event.context.__trellisMcpAuth = auth
  return auth
}

export async function requireHarnessMcpAuth(event: H3Event): Promise<HarnessMcpAuth> {
  const auth = await resolveHarnessMcpAuth(event)
  if (!auth) {
    throw createError({ statusCode: 403, message: 'Authentication required.' })
  }
  return auth
}

export function defineHarnessTool(options: Parameters<typeof defineTool>[0]) {
  return defineTool({
    ...options,
    resolveAuth: resolveHarnessMcpAuth,
  })
}

export function defineHarnessMcpTool(options: Parameters<typeof defineMcpTool>[0]) {
  return defineMcpTool(options)
}
