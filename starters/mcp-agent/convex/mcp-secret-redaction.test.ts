import { describe, expect, it, vi } from 'vitest'

import {
  createCreateProjectTool,
  createListProjectsTool,
  hashBearerSecret,
  parseBearerToken,
} from '../server/utils/mcpProjectTools'

describe('mcp-agent secret redaction', () => {
  it('requires exactly one bearer credential part', () => {
    expect(parseBearerToken('Bearer agent-secret-token')).toBe('agent-secret-token')
    expect(() => parseBearerToken(undefined)).toThrow('Bearer token required')
    expect(() => parseBearerToken('not-a-bearer')).toThrow('Bearer token required')
    expect(() => parseBearerToken('Bearer')).toThrow('Bearer token required')
    expect(() => parseBearerToken('Bearer agent-secret-token extra')).toThrow(
      'Bearer token required',
    )
  })

  it('does not expose bearer secrets or stored credential hashes in tool responses', async () => {
    const rawSecret = 'agent-secret-token'
    const credentialHash = hashBearerSecret(rawSecret)
    const client = {
      query: vi.fn(async () => [
        {
          _id: 'project-1',
          organizationId: 'org-1',
          name: 'Launch',
          createdBy: { kind: 'serviceActor', serviceActorId: 'actor-1' },
          createdAt: 1,
        },
      ]),
      mutation: vi.fn(),
    }

    const listProjects = createListProjectsTool({
      getClient: () => client as never,
    })
    const response = await listProjects.handler({ organizationId: 'org-1' }, {
      requestInfo: { headers: { authorization: `Bearer ${rawSecret}` } },
    } as never)
    const serialized = JSON.stringify(response)

    expect(serialized).not.toContain(rawSecret)
    expect(serialized).not.toContain(credentialHash)
    expect(serialized).not.toContain('secretHash')
    expect(serialized).not.toContain('_id')
    expect(client.query).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        credentialHash,
        organizationId: 'org-1',
      }),
    )
  })

  it('maps write tool calls to the same Convex project mutation', async () => {
    const credentialHash = hashBearerSecret('agent-secret-token')
    const client = {
      query: vi.fn(),
      mutation: vi.fn(async () => 'project-1'),
    }

    const createProject = createCreateProjectTool({
      getClient: () => client as never,
    })
    const response = await createProject.handler({ organizationId: 'org-1', name: 'Launch' }, {
      requestInfo: { headers: { authorization: 'Bearer agent-secret-token' } },
    } as never)

    expect(response).toEqual({
      content: [{ type: 'text', text: 'Created project project-1' }],
    })
    expect(client.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        credentialHash,
        organizationId: 'org-1',
        name: 'Launch',
      }),
    )
  })
})
