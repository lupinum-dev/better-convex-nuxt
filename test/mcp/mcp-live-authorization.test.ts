import { describe, expect, it } from 'vitest'

import {
  assertLiveMcpAuthorization,
  type McpAuthorizationError,
  type LiveAuthorizationState,
  type OAuthPrincipal,
} from '../../starters/mcp-oauth-agent/convex/mcp/policy'

const now = 1_800_000_000_000
const principal: OAuthPrincipal = {
  clientId: 'client-1',
  resource: 'https://app.example.test/mcp',
  scopes: new Set(['mcp:read', 'mcp:write']),
  sessionId: 'session-1',
  subject: 'auth-user-1',
}

function activeState(): LiveAuthorizationState {
  return {
    approval: {
      clientId: 'client-1',
      expiresAt: now + 60_000,
      operation: 'projects.delete',
      organizationId: 'org-1',
      projectId: 'project-1',
      status: 'approved',
      userId: 'user-1',
    },
    client: {
      clientId: 'client-1',
      disabled: false,
      grantTypes: ['authorization_code'],
      public: true,
      requirePKCE: true,
      responseTypes: ['code'],
      scopes: ['mcp:read', 'mcp:write'],
      tokenEndpointAuthMethod: 'none',
    },
    clientResource: {
      clientId: 'client-1',
      resourceId: 'https://app.example.test/mcp',
    },
    consent: {
      clientId: 'client-1',
      resources: ['https://app.example.test/mcp'],
      scopes: ['mcp:read', 'mcp:write'],
      userId: 'auth-user-1',
    },
    delegation: {
      clientId: 'client-1',
      expiresAt: now + 60_000,
      organizationId: 'org-1',
      scopes: ['mcp:read', 'mcp:write'],
      status: 'active',
      userId: 'user-1',
    },
    membership: {
      organizationId: 'org-1',
      role: 'admin',
      status: 'active',
      userId: 'user-1',
    },
    project: { id: 'project-1', organizationId: 'org-1', status: 'active' },
    resource: {
      allowedScopes: ['mcp:read', 'mcp:write'],
      disabled: false,
      identifier: 'https://app.example.test/mcp',
      signingAlgorithm: 'RS256',
    },
    session: { expiresAt: now + 60_000, id: 'session-1', userId: 'auth-user-1' },
    user: { active: true, authId: 'auth-user-1', id: 'user-1' },
  }
}

function requireWrite(state: LiveAuthorizationState = activeState()) {
  return assertLiveMcpAuthorization(
    state,
    principal,
    {
      approvalId: 'approval-1',
      minimumRole: 'admin',
      organizationId: 'org-1',
      projectId: 'project-1',
      scope: 'mcp:write',
    },
    now,
  )
}

function expectCode(run: () => unknown, code: McpAuthorizationError['code']) {
  expect(run).toThrowError(
    expect.objectContaining({ code, name: 'McpAuthorizationError' }) as McpAuthorizationError,
  )
}

describe('live transactional MCP authorization', () => {
  it('authorizes only when every live grant and approval is current', () => {
    expect(requireWrite()).toEqual({ role: 'admin', userId: 'user-1' })
  })

  it.each<readonly [string, (state: LiveAuthorizationState) => void]>([
    ['session deletion', (s) => void (s.session = null)],
    ['client disable', (s) => void (s.client!.disabled = true)],
    ['client deletion', (s) => void (s.client = null)],
    ['consent deletion', (s) => void (s.consent = null)],
    ['membership removal', (s) => void (s.membership!.status = 'removed')],
    ['delegation revocation', (s) => void (s.delegation!.status = 'revoked')],
    ['delegation expiry', (s) => void (s.delegation!.expiresAt = now)],
    ['tenant change', (s) => void (s.delegation!.organizationId = 'org-2')],
    ['client-resource unlink', (s) => void (s.clientResource = null)],
    ['resource disable', (s) => void (s.resource!.disabled = true)],
  ] as const)('revokes immediately after %s', (_name, mutate) => {
    const state = activeState()
    mutate(state)
    expectCode(() => requireWrite(state), 'MCP_ACCESS_REVOKED')
  })

  it('treats token, client, resource, consent, and delegation scopes as ceilings', () => {
    for (const remove of [
      (state: LiveAuthorizationState) => (state.client!.scopes = ['mcp:read']),
      (state: LiveAuthorizationState) => (state.resource!.allowedScopes = ['mcp:read']),
      (state: LiveAuthorizationState) => (state.consent!.scopes = ['mcp:read']),
      (state: LiveAuthorizationState) => (state.delegation!.scopes = ['mcp:read']),
    ]) {
      const state = activeState()
      remove(state)
      expectCode(() => requireWrite(state), 'MCP_SCOPE_REQUIRED')
    }
    expectCode(
      () =>
        assertLiveMcpAuthorization(
          activeState(),
          { ...principal, scopes: new Set(['mcp:read']) },
          {
            minimumRole: 'member',
            organizationId: 'org-1',
            scope: 'mcp:write',
          },
          now,
        ),
      'MCP_SCOPE_REQUIRED',
    )
  })

  it('enforces current role, ownership, and a bound single-use approval', () => {
    const viewer = activeState()
    viewer.membership!.role = 'viewer'
    expectCode(() => requireWrite(viewer), 'MCP_ACCESS_REVOKED')

    const wrongTenant = activeState()
    wrongTenant.project!.organizationId = 'org-2'
    expectCode(() => requireWrite(wrongTenant), 'MCP_RESOURCE_NOT_FOUND')

    for (const mutate of [
      (state: LiveAuthorizationState) => (state.approval = null),
      (state: LiveAuthorizationState) => (state.approval!.status = 'used'),
      (state: LiveAuthorizationState) => (state.approval!.expiresAt = now),
      (state: LiveAuthorizationState) => (state.approval!.clientId = 'other-client'),
      (state: LiveAuthorizationState) => (state.approval!.userId = 'other-user'),
      (state: LiveAuthorizationState) => (state.approval!.projectId = 'other-project'),
    ]) {
      const state = activeState()
      mutate(state)
      expectCode(() => requireWrite(state), 'MCP_APPROVAL_REQUIRED')
    }
  })
})
