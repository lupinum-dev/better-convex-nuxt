import { getHeader, type H3Event } from 'h3'

import { subject } from '@lupinum/trellis/auth'
import {
  createPagePermission,
  listDraftPagesPermission,
  listPublishedPagesPermission,
  publishPagePermission,
  saveDraftPermission,
  type MiniCmsPermissionKey,
} from '../../convex/features/pages/permissions'
import type { MiniCmsPrincipal } from '../../shared/principal'

export type CapabilitySnapshot = Record<MiniCmsPermissionKey, boolean>

function readBearerToken(event: H3Event): string | null {
  const auth = getHeader(event, 'authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return auth.slice('Bearer '.length).trim() || null
}

export function getMcpPrincipal(event: H3Event): MiniCmsPrincipal {
  const runtimeConfig = useRuntimeConfig(event)
  const token = readBearerToken(event)

  if (!token || token !== runtimeConfig.demoMcpToken) {
    return { kind: 'anonymous', subject: subject.anonymous() }
  }

  return {
    kind: 'agent',
    agentId: 'demo-key',
    subject: subject.agent('demo-key'),
    provider: 'mcp',
  }
}

export function getCapabilitiesForPrincipal(principal: MiniCmsPrincipal): CapabilitySnapshot {
  return {
    [listPublishedPagesPermission.key]: true,
    [listDraftPagesPermission.key]: principal.kind === 'agent',
    [createPagePermission.key]: principal.kind === 'agent',
    [saveDraftPermission.key]: principal.kind === 'agent',
    [publishPagePermission.key]: principal.kind === 'agent',
  }
}
