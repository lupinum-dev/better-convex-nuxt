import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('mcp-agent source guards', () => {
  it('does not keep an unauthenticated demo service actor minting path', () => {
    const source = readFileSync(new URL('./serviceActors.ts', import.meta.url), 'utf8')

    expect(source).not.toContain('createForDemo')
    expect(source).toContain('requireServiceCredentialManager')
  })

  it('does not keep an unauthenticated demo approval path', () => {
    const source = readFileSync(new URL('./approvals.ts', import.meta.url), 'utf8')

    expect(source).not.toContain('createApprovedForDemo')
    expect(source).not.toContain('operation: v.string()')
    expect(source).not.toContain('resourceId: v.string()')
    expect(source).toContain('requireOrganizationAdmin')
    expect(source).toContain("approval.operation !== 'projects.delete'")
    expect(source).toContain("status: 'approved'")
    expect(source).toContain("status: 'rejected'")
  })

  it('does not keep a caller-supplied fake agent usage action', () => {
    expect(existsSync(new URL('./agents.ts', import.meta.url))).toBe(false)
  })

  it('does not keep a Convex fallback MCP server secret', () => {
    const source = readFileSync(new URL('./access.ts', import.meta.url), 'utf8')

    expect(source).not.toContain("?? 'mcp-agent-local-server-secret'")
    expect(source).not.toContain('const localMcpServerSecret')
    expect(source).toContain('process.env.MCP_SERVER_SECRET')
  })

  it('redacts sensitive browser verifier debug values', () => {
    const source = readFileSync(
      new URL('../scripts/verify-browser-happy-path.mjs', import.meta.url),
      'utf8',
    )

    expect(source).toContain('redactDebugValue')
    expect(source).toContain('[redacted]')
    expect(source).toContain('service-actor-secret')
    expect(source).not.toContain('value: element instanceof HTMLInputElement ? element.value')
  })

  it('clears the one-time service actor secret before changing organization context', () => {
    const source = readFileSync(
      new URL('../app/composables/useMcpDemoWorkspace.ts', import.meta.url),
      'utf8',
    )
    const organizationWatcher = source.slice(source.indexOf('watch(selectedOrganizationId'))

    expect(organizationWatcher.indexOf("serviceActorSecret.value = ''")).toBeGreaterThanOrEqual(0)
    expect(organizationWatcher.indexOf("serviceActorSecret.value = ''")).toBeLessThan(
      organizationWatcher.indexOf('refreshProjects()'),
    )
  })
})
