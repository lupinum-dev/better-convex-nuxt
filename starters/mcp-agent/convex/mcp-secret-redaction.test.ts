import { describe, expect, it, vi } from 'vitest'

import { createMcpHandlers, hashBearerSecret } from '../server/mcp/tools'

describe('mcp-agent secret redaction', () => {
  it('does not expose bearer secrets or stored credential hashes in tool responses', async () => {
    const rawSecret = 'agent-secret-token'
    const credentialHash = hashBearerSecret(rawSecret)
    const client = {
      query: vi.fn(async () => [
        {
          _id: 'project-1',
          organizationId: 'org-1',
          name: 'Launch',
          createdByServiceActorId: 'actor-1',
          createdAt: 1,
        },
      ]),
      mutation: vi.fn(),
    }

    const handlers = createMcpHandlers(client as never, credentialHash)
    const response = await handlers.callTool('projects.list', { organizationId: 'org-1' })
    const serialized = JSON.stringify(response)

    expect(serialized).not.toContain(rawSecret)
    expect(serialized).not.toContain(credentialHash)
    expect(serialized).not.toContain('secretHash')
    expect(client.query).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        credentialHash,
        organizationId: 'org-1',
      }),
    )
  })
})
