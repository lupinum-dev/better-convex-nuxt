import { normalizeAuthOrigin } from '../../shared/auth-origin'
import { normalizeConvexSiteUrl } from '../../utils/site-url'

export const MCP_RESOURCE_PATH = '/mcp'
export const MCP_CONVEX_ACTION_PATH = '/mcp'
export const MCP_PROTECTED_RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource/mcp'
export const MCP_BETA_SCOPES = Object.freeze(['mcp:read', 'mcp:write'] as const)

export interface McpTopology {
  readonly actionUrl: string
  readonly issuer: string
  readonly metadataUrl: string
  readonly resource: string
}

/**
 * Build the one supported MCP topology from trusted application configuration.
 * This function never receives request data.
 */
export function buildMcpTopology(publicOrigin: string, convexSiteUrl: string): McpTopology {
  const origin = normalizeAuthOrigin(publicOrigin, 'auth.publicOrigin')
  const siteUrl = normalizeConvexSiteUrl(convexSiteUrl)
  return Object.freeze({
    actionUrl: `${siteUrl}${MCP_CONVEX_ACTION_PATH}`,
    issuer: `${origin}/api/auth`,
    metadataUrl: `${origin}${MCP_PROTECTED_RESOURCE_METADATA_PATH}`,
    resource: `${origin}${MCP_RESOURCE_PATH}`,
  })
}

export function buildMcpProtectedResourceMetadata(
  topology: Pick<McpTopology, 'issuer' | 'resource'>,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    resource: topology.resource,
    authorization_servers: [topology.issuer],
    scopes_supported: [...MCP_BETA_SCOPES],
    bearer_methods_supported: ['header'],
  })
}

/** Build the exact RFC 9728 resource challenge without token-derived data. */
export function buildMcpBearerChallenge(
  topology: Pick<McpTopology, 'metadataUrl'>,
  requiredScope?: (typeof MCP_BETA_SCOPES)[number],
): string {
  const scope = requiredScope === undefined ? '' : `, scope="${requiredScope}"`
  return `Bearer resource_metadata="${topology.metadataUrl}"${scope}`
}
