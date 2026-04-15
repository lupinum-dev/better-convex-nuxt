import { getHeader, type H3Event } from 'h3'

import type { MiniCmsPrincipal } from '~/shared/principal'

export type CapabilitySnapshot = {
  listPublishedPages: boolean
  listDraftPages: boolean
  createPage: boolean
  saveDraft: boolean
  publishPage: boolean
}

function readBearerToken(event: H3Event): string | null {
  const auth = getHeader(event, 'authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return auth.slice('Bearer '.length).trim() || null
}

export function getMcpPrincipal(event: H3Event): MiniCmsPrincipal {
  const runtimeConfig = useRuntimeConfig(event)
  const token = readBearerToken(event)

  if (!token || token !== runtimeConfig.demoMcpToken) {
    return { kind: 'anonymous' }
  }

  return {
    kind: 'mcp',
    mcpKeyId: 'demo-key',
  }
}

export function getCapabilitiesForPrincipal(principal: MiniCmsPrincipal): CapabilitySnapshot {
  return {
    listPublishedPages: true,
    listDraftPages: principal.kind === 'mcp',
    createPage: principal.kind === 'mcp',
    saveDraft: principal.kind === 'mcp',
    publishPage: principal.kind === 'mcp',
  }
}
