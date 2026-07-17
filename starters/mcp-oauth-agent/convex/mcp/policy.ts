export const MCP_SCOPES = Object.freeze(['mcp:read', 'mcp:write'] as const)
export type McpScope = (typeof MCP_SCOPES)[number]
export type McpRole = 'owner' | 'admin' | 'member' | 'viewer'

export interface OAuthPrincipal {
  readonly clientId: string
  readonly resource: string
  readonly scopes: ReadonlySet<string>
  readonly sessionId: string
  readonly subject: string
}

export interface SerializableOAuthPrincipal {
  clientId: string
  resource: string
  scopes: string[]
  sessionId: string
  subject: string
}

export interface LiveAuthorizationState {
  approval: null | {
    clientId: string
    expiresAt: number
    operation: 'projects.delete'
    organizationId: string
    projectId: string
    status: 'pending' | 'approved' | 'rejected' | 'used'
    userId: string
  }
  client: null | {
    clientId: string
    disabled: boolean
    grantTypes: readonly string[]
    public: boolean
    requirePKCE: boolean
    responseTypes: readonly string[]
    scopes: readonly string[]
    tokenEndpointAuthMethod: string
  }
  clientResource: null | { clientId: string; resourceId: string }
  consent: null | {
    clientId: string
    resources: readonly string[]
    scopes: readonly string[]
    userId: string
  }
  delegation: null | {
    clientId: string
    expiresAt: number
    organizationId: string
    scopes: readonly string[]
    status: 'active' | 'revoked'
    userId: string
  }
  membership: null | {
    organizationId: string
    role: McpRole
    status: 'active' | 'removed'
    userId: string
  }
  project: null | {
    id: string
    organizationId: string
    status: 'active' | 'deleted'
  }
  resource: null | {
    allowedScopes: readonly string[]
    disabled: boolean
    identifier: string
    signingAlgorithm: string
  }
  session: null | { expiresAt: number; id: string; userId: string }
  user: null | { active: boolean; authId: string; id: string }
}

export interface LiveAuthorizationRequirement {
  approvalId?: string
  minimumRole: McpRole
  organizationId: string
  projectId?: string
  scope: McpScope
}

export type McpAuthorizationCode =
  | 'MCP_ACCESS_REVOKED'
  | 'MCP_APPROVAL_REQUIRED'
  | 'MCP_RESOURCE_NOT_FOUND'
  | 'MCP_SCOPE_REQUIRED'

export class McpAuthorizationError extends Error {
  readonly code: McpAuthorizationCode

  constructor(code: McpAuthorizationCode) {
    super(code)
    this.name = 'McpAuthorizationError'
    this.code = code
  }
}

const ROLE_RANK: Record<McpRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
}

function includes(values: readonly string[], value: string): boolean {
  return values.includes(value)
}

/**
 * Recompute effective access from one transactional snapshot. Token scope is a
 * ceiling; every persisted grant in this chain must still be active.
 */
export function assertLiveMcpAuthorization(
  state: LiveAuthorizationState,
  principal: OAuthPrincipal,
  requirement: LiveAuthorizationRequirement,
  now = Date.now(),
): { role: McpRole; userId: string } {
  if (
    !state.session ||
    state.session.id !== principal.sessionId ||
    state.session.userId !== principal.subject ||
    state.session.expiresAt <= now ||
    !state.user ||
    !state.user.active ||
    state.user.authId !== principal.subject ||
    !state.client ||
    state.client.disabled ||
    state.client.clientId !== principal.clientId ||
    !state.client.public ||
    state.client.tokenEndpointAuthMethod !== 'none' ||
    !state.client.requirePKCE ||
    state.client.grantTypes.length !== 1 ||
    state.client.grantTypes[0] !== 'authorization_code' ||
    state.client.responseTypes.length !== 1 ||
    state.client.responseTypes[0] !== 'code' ||
    !state.resource ||
    state.resource.disabled ||
    state.resource.identifier !== principal.resource ||
    state.resource.signingAlgorithm !== 'RS256' ||
    !state.clientResource ||
    state.clientResource.clientId !== principal.clientId ||
    state.clientResource.resourceId !== principal.resource ||
    !state.consent ||
    state.consent.clientId !== principal.clientId ||
    state.consent.userId !== principal.subject ||
    !includes(state.consent.resources, principal.resource)
  ) {
    throw new McpAuthorizationError('MCP_ACCESS_REVOKED')
  }

  const scope = requirement.scope
  if (
    !principal.scopes.has(scope) ||
    !includes(state.client.scopes, scope) ||
    !includes(state.resource.allowedScopes, scope) ||
    !includes(state.consent.scopes, scope)
  ) {
    throw new McpAuthorizationError('MCP_SCOPE_REQUIRED')
  }

  if (
    !state.membership ||
    state.membership.status !== 'active' ||
    state.membership.organizationId !== requirement.organizationId ||
    state.membership.userId !== state.user.id ||
    ROLE_RANK[state.membership.role] < ROLE_RANK[requirement.minimumRole] ||
    !state.delegation ||
    state.delegation.status !== 'active' ||
    state.delegation.expiresAt <= now ||
    state.delegation.organizationId !== requirement.organizationId ||
    state.delegation.userId !== state.user.id ||
    state.delegation.clientId !== principal.clientId
  ) {
    throw new McpAuthorizationError('MCP_ACCESS_REVOKED')
  }
  if (!includes(state.delegation.scopes, scope)) {
    throw new McpAuthorizationError('MCP_SCOPE_REQUIRED')
  }

  if (requirement.projectId !== undefined) {
    if (
      !state.project ||
      state.project.id !== requirement.projectId ||
      state.project.organizationId !== requirement.organizationId ||
      state.project.status !== 'active'
    ) {
      throw new McpAuthorizationError('MCP_RESOURCE_NOT_FOUND')
    }
  }

  if (requirement.approvalId !== undefined) {
    if (
      !state.approval ||
      state.approval.status !== 'approved' ||
      state.approval.expiresAt <= now ||
      state.approval.operation !== 'projects.delete' ||
      state.approval.organizationId !== requirement.organizationId ||
      state.approval.projectId !== requirement.projectId ||
      state.approval.userId !== state.user.id ||
      state.approval.clientId !== principal.clientId
    ) {
      throw new McpAuthorizationError('MCP_APPROVAL_REQUIRED')
    }
  }

  return { role: state.membership.role, userId: state.user.id }
}

export function serializePrincipal(principal: OAuthPrincipal): SerializableOAuthPrincipal {
  return {
    clientId: principal.clientId,
    resource: principal.resource,
    scopes: [...principal.scopes],
    sessionId: principal.sessionId,
    subject: principal.subject,
  }
}

export function deserializePrincipal(principal: SerializableOAuthPrincipal): OAuthPrincipal {
  return { ...principal, scopes: new Set(principal.scopes) }
}
