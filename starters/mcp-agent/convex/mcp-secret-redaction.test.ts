import { describe, expect, it, vi } from 'vitest'

import {
  createCreateProjectTool,
  createListProjectsTool,
  hashBearerSecret,
} from '../server/utils/mcpProjectTools'

const serverSecret = 'mcp-agent-local-test-server-secret-1234'

function toolArgs(client: { query: ReturnType<typeof vi.fn>; mutation: ReturnType<typeof vi.fn> }) {
  return {
    getClient: () => client as never,
    getServerSecret: () => serverSecret,
  }
}

describe('mcp-agent secret redaction', () => {
  it('accepts bearer credentials from normal HTTP header shapes', async () => {
    const client = {
      query: vi.fn(async () => []),
      mutation: vi.fn(),
    }
    const listProjects = createListProjectsTool(toolArgs(client))

    await listProjects.handler({}, {
      requestInfo: { headers: new Headers({ authorization: 'bearer   agent-secret-token' }) },
    } as never)
    await listProjects.handler({}, {
      requestInfo: { headers: { Authorization: 'Bearer agent-secret-token' } },
    } as never)

    expect(client.query).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ bearerToken: 'agent-secret-token', serverSecret }),
    )
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ bearerToken: 'agent-secret-token', serverSecret }),
    )
  })

  it('rejects missing, malformed, and ambiguous bearer credentials before Convex', async () => {
    const client = {
      query: vi.fn(),
      mutation: vi.fn(),
    }
    const listProjects = createListProjectsTool(toolArgs(client))

    await expect(
      listProjects.handler({}, { requestInfo: { headers: {} } } as never),
    ).rejects.toThrow('Bearer token required')
    await expect(
      listProjects.handler({}, {
        requestInfo: { headers: { authorization: 'not-a-bearer' } },
      } as never),
    ).rejects.toThrow('Bearer token required')
    await expect(
      listProjects.handler({}, {
        requestInfo: { headers: { authorization: 'Bearer agent-secret-token extra' } },
      } as never),
    ).rejects.toThrow('Bearer token required')
    await expect(
      listProjects.handler({}, {
        requestInfo: { headers: { authorization: ['Bearer first-token', 'Bearer second-token'] } },
      } as never),
    ).rejects.toThrow('Bearer token required')
    expect(client.query).not.toHaveBeenCalled()
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

    const listProjects = createListProjectsTool(toolArgs(client))
    const response = await listProjects.handler({}, {
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
        bearerToken: rawSecret,
        serverSecret,
      }),
    )
    expect(JSON.stringify(client.query.mock.calls)).not.toContain(credentialHash)
  })

  it('maps write tool calls to the same Convex project mutation', async () => {
    const client = {
      query: vi.fn(),
      mutation: vi.fn(async () => 'project-1'),
    }

    const createProject = createCreateProjectTool(toolArgs(client))
    const response = await createProject.handler({ name: 'Launch' }, {
      requestInfo: { headers: { authorization: 'Bearer agent-secret-token' } },
    } as never)

    expect(response).toEqual({
      content: [{ type: 'text', text: 'Created project project-1' }],
    })
    expect(client.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        bearerToken: 'agent-secret-token',
        name: 'Launch',
        serverSecret,
      }),
    )
  })

  it('logs missing bearer credentials at the MCP boundary before hitting Convex', async () => {
    const client = {
      query: vi.fn(),
      mutation: vi.fn(),
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const listProjects = createListProjectsTool(toolArgs(client))

    await expect(
      listProjects.handler({}, {
        requestInfo: { headers: {} },
      } as never),
    ).rejects.toThrow('Bearer token required')

    expect(client.query).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('[mcp-agent] MCP tool request denied at boundary', {
      reason: 'missing_bearer',
      toolName: 'projects.list',
    })

    warn.mockRestore()
  })

  it('logs invalid tool input at the MCP boundary before hitting Convex', async () => {
    const client = {
      query: vi.fn(),
      mutation: vi.fn(),
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const createProject = createCreateProjectTool(toolArgs(client))

    await expect(
      createProject.handler({ name: '   ' }, {
        requestInfo: { headers: { authorization: 'Bearer agent-secret-token' } },
      } as never),
    ).rejects.toThrow('Project name is required')

    expect(client.mutation).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('[mcp-agent] MCP tool request denied at boundary', {
      reason: 'invalid_input',
      toolName: 'projects.create',
      detail: 'Project name is required',
    })

    warn.mockRestore()
  })
})
