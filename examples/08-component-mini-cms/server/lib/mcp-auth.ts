import { subject } from '@lupinum/trellis/auth'
import { getHeader, type H3Event } from 'h3'

import {
  createPagePermission,
  listDraftPagesPermission,
  listPublishedPagesPermission,
  publishPagePermission,
  saveDraftPermission,
  type MiniCmsPermissionKey,
} from '../../convex/features/pages/permissions'
import type { MiniCmsPrincipal } from '../../shared/caller'

export type RecordAccessSnapshot = Record<MiniCmsPermissionKey, boolean>

function readBearerToken(event: H3Event): string | null {
  const auth = getHeader(event, 'authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return auth.slice('Bearer '.length).trim() || null
}

export function getMcpCaller(event: H3Event): MiniCmsPrincipal {
  const runtimeConfig = useRuntimeConfig(event)
  const token = readBearerToken(event)
  const configuredToken =
    typeof runtimeConfig.demoMcpToken === 'string' ? runtimeConfig.demoMcpToken.trim() : ''

  if (!configuredToken || !token || token !== configuredToken) {
    return { kind: 'anonymous', subject: subject.anonymous() }
  }

  return {
    kind: 'agent',
    agentId: 'demo-key',
    subject: subject.agent('demo-key'),
    provider: 'mcp',
  }
}

export function getCapabilitiesForPrincipal(caller: MiniCmsPrincipal): RecordAccessSnapshot {
  return {
    [listPublishedPagesPermission.key]: true,
    [listDraftPagesPermission.key]: caller.kind === 'agent',
    [createPagePermission.key]: caller.kind === 'agent',
    [saveDraftPermission.key]: caller.kind === 'agent',
    [publishPagePermission.key]: caller.kind === 'agent',
  }
}
