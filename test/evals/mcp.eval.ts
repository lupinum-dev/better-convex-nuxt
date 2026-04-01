import { createMCPClient } from '@ai-sdk/mcp'
import { createScorer, evalite } from 'evalite'

interface BootstrapResponse {
  organizationId: string
  resources: {
    noteId: string
    taskId: string
    postId: string
    commentId: string
  }
  keys: Record<
    'admin' | 'member' | 'viewer' | 'noOrg' | 'revoked',
    { id: string; key: string }
  >
}

type ActorKind = 'anonymous' | 'admin' | 'member' | 'viewer' | 'noOrg'

interface ExpectedVisibility {
  present: string[]
  absent: string[]
}

interface VisibilityCase {
  actor: ActorKind
  expected: ExpectedVisibility
}

interface RouteCase {
  actor: ActorKind
  prompt: string
  expectedTool: string
  expectedArgs: Record<string, unknown>
}

interface ConfirmationCase {
  actor: Extract<ActorKind, 'anonymous' | 'member'>
  toolName: 'delete-note' | 'delete-post'
  resource: 'noteId' | 'postId'
}

interface RouteOutput {
  availableTools: string[]
  chosenTool: string | null
  chosenArgs: Record<string, unknown> | null
  result: unknown
  error?: string
}

interface ConfirmationOutput {
  preview: unknown
  confirmed: unknown
  error?: string
}

async function resolveBaseUrl(): Promise<string> {
  const candidates = [
    process.env.MCP_EVAL_BASE_URL,
    'http://localhost:3001',
    'http://localhost:3000',
  ].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    try {
      const probeUrl = new URL('/', candidate.endsWith('/') ? candidate : `${candidate}/`)
      const response = await fetch(probeUrl, { method: 'GET' })
      if (response.ok || response.status < 500) {
        return probeUrl.origin
      }
    } catch {
      continue
    }
  }

  throw new Error(
    'Could not reach a running playground server for MCP evals. Start the playground first or set MCP_EVAL_BASE_URL.',
  )
}

const baseUrl = await resolveBaseUrl()
const baseOrigin = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
const mcpUrl = new URL('/mcp', baseOrigin).toString()
const bootstrapUrl = new URL('/api/test-mcp-bootstrap', baseOrigin).toString()

let evalLock: Promise<void> = Promise.resolve()

async function withEvalLock<T>(run: () => Promise<T>): Promise<T> {
  const previous = evalLock
  let release!: () => void
  evalLock = new Promise<void>((resolve) => {
    release = resolve
  })

  await previous

  try {
    return await run()
  } finally {
    release()
  }
}

function getAuthKey(actor: ActorKind, bootstrap: BootstrapResponse): string | undefined {
  switch (actor) {
    case 'admin':
      return bootstrap.keys.admin.key
    case 'member':
      return bootstrap.keys.member.key
    case 'viewer':
      return bootstrap.keys.viewer.key
    case 'noOrg':
      return bootstrap.keys.noOrg.key
    case 'anonymous':
    default:
      return undefined
  }
}

async function resetMcpState(): Promise<BootstrapResponse> {
  const response = await fetch(bootstrapUrl, { method: 'POST' })
  if (!response.ok) {
    throw new Error(`Bootstrap reset failed with ${response.status} ${response.statusText}`)
  }
  return await response.json() as BootstrapResponse
}

async function createClient(actor: ActorKind, bootstrap: BootstrapResponse) {
  const key = getAuthKey(actor, bootstrap)

  return await createMCPClient({
    transport: {
      type: 'http',
      url: mcpUrl,
      headers: key
        ? {
            Authorization: `Bearer ${key}`,
          }
        : undefined,
    },
  })
}

function extractQuotedValues(prompt: string): string[] {
  return Array.from(prompt.matchAll(/"([^"]+)"/g)).map(match => match[1] ?? '')
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function deepSubsetMatch(actual: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== 'object') {
    return Object.is(actual, expected)
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      return false
    }
    return expected.every((value, index) => deepSubsetMatch(actual[index], value))
  }

  if (!actual || typeof actual !== 'object') {
    return false
  }

  return Object.entries(expected).every(([key, value]) =>
    deepSubsetMatch((actual as Record<string, unknown>)[key], value),
  )
}

function pickToolCall(
  prompt: string,
  availableTools: string[],
  bootstrap: BootstrapResponse,
): { toolName: string; args: Record<string, unknown> } {
  const lowerPrompt = prompt.toLowerCase()
  const quoted = extractQuotedValues(prompt)
  const available = new Set(availableTools)

  const requireTool = (toolName: string, args: Record<string, unknown>) => {
    if (!available.has(toolName)) {
      throw new Error(
        `Tool "${toolName}" was not available. Visible tools: ${availableTools.join(', ')}`,
      )
    }

    return { toolName, args }
  }

  if ((lowerPrompt.includes('search') || lowerPrompt.includes('find')) && lowerPrompt.includes('note')) {
    return requireTool('search-notes', {
      query: normalizeText(quoted[0] ?? 'roadmap'),
    })
  }

  if (lowerPrompt.includes('list') && lowerPrompt.includes('note')) {
    return requireTool('list-notes', {})
  }

  if ((lowerPrompt.includes('create') || lowerPrompt.includes('save') || lowerPrompt.includes('add'))
    && lowerPrompt.includes('note')) {
    return requireTool('create-note', {
      title: normalizeText(quoted[0] ?? 'Untitled note'),
      content: normalizeText(quoted[1] ?? 'Created by MCP eval'),
    })
  }

  if ((lowerPrompt.includes('publish') || lowerPrompt.includes('create') || lowerPrompt.includes('write'))
    && lowerPrompt.includes('post')) {
    return requireTool('create-post', {
      title: normalizeText(quoted[0] ?? 'Untitled post'),
      content: normalizeText(quoted[1] ?? 'Created by MCP eval'),
    })
  }

  if (lowerPrompt.includes('comment') || lowerPrompt.includes('reply')) {
    return requireTool('create-comment', {
      postId: bootstrap.resources.postId,
      content: normalizeText(quoted[0] ?? 'Created by MCP eval'),
    })
  }

  throw new Error(`No tool routing rule matched prompt: ${prompt}`)
}

function readStructuredContent(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== 'object') {
    return null
  }

  const structured = (result as { structuredContent?: unknown }).structuredContent
  if (!structured || typeof structured !== 'object') {
    return null
  }

  return structured as Record<string, unknown>
}

const visibilityScorer = createScorer<VisibilityCase, string[], ExpectedVisibility>({
  name: 'tool-visibility',
  description: 'Expected tools are visible and forbidden tools are hidden.',
  scorer: ({ output, expected }) => {
    if (!expected) {
      return { score: 0, metadata: { reason: 'Missing expected visibility data' } }
    }

    const missing = expected.present.filter(name => !output.includes(name))
    const leaked = expected.absent.filter(name => output.includes(name))

    if (missing.length === 0 && leaked.length === 0) {
      return 1
    }

    return {
      score: 0,
      metadata: { missing, leaked, visible: output },
    }
  },
})

const routingScorer = createScorer<RouteCase, RouteOutput, RouteCase>({
  name: 'tool-routing',
  description: 'The selected tool, extracted arguments, and MCP result all match expectations.',
  scorer: ({ output, expected }) => {
    if (!expected) {
      return { score: 0, metadata: { reason: 'Missing expected routing data' } }
    }

    const structured = readStructuredContent(output.result)
    const structuredOk = structured?.ok === true
    const toolMatches = output.chosenTool === expected.expectedTool
    const argsMatch = deepSubsetMatch(output.chosenArgs, expected.expectedArgs)

    if (!output.error && toolMatches && argsMatch && structuredOk) {
      return 1
    }

    return {
      score: 0,
      metadata: {
        error: output.error,
        chosenTool: output.chosenTool,
        chosenArgs: output.chosenArgs,
        expectedTool: expected.expectedTool,
        expectedArgs: expected.expectedArgs,
        structured,
      },
    }
  },
})

const confirmationScorer = createScorer<ConfirmationCase, ConfirmationOutput, ConfirmationCase>({
  name: 'confirmation-flow',
  description: 'Destructive tools return a preview first and succeed after confirmation.',
  scorer: ({ output }) => {
    const preview = readStructuredContent(output.preview)
    const confirmed = readStructuredContent(output.confirmed)

    const previewOk = preview?.ok === true && preview?.awaitingConfirmation === true
    const confirmedOk = confirmed?.ok === true
    const confirmedDeleted = deepSubsetMatch(confirmed?.data, { deleted: true })

    if (!output.error && previewOk && confirmedOk && confirmedDeleted) {
      return 1
    }

    return {
      score: 0,
      metadata: {
        error: output.error,
        preview,
        confirmed,
      },
    }
  },
})

evalite('MCP Tool Visibility', {
  data: [
    {
      input: {
        actor: 'anonymous',
        expected: {
          present: ['list-notes', 'create-note', 'search-notes'],
          absent: ['add-task', 'list-posts', 'create-post'],
        },
      },
      expected: {
        present: ['list-notes', 'create-note', 'search-notes'],
        absent: ['add-task', 'list-posts', 'create-post'],
      },
    },
    {
      input: {
        actor: 'member',
        expected: {
          present: ['add-task', 'list-posts', 'create-post'],
          absent: [],
        },
      },
      expected: {
        present: ['add-task', 'list-posts', 'create-post'],
        absent: [],
      },
    },
    {
      input: {
        actor: 'viewer',
        expected: {
          present: ['list-posts', 'create-comment'],
          absent: ['create-post'],
        },
      },
      expected: {
        present: ['list-posts', 'create-comment'],
        absent: ['create-post'],
      },
    },
    {
      input: {
        actor: 'noOrg',
        expected: {
          present: ['add-task'],
          absent: ['list-posts', 'create-post', 'create-comment'],
        },
      },
      expected: {
        present: ['add-task'],
        absent: ['list-posts', 'create-post', 'create-comment'],
      },
    },
  ],
  task: async ({ actor }) => {
    return await withEvalLock(async () => {
      const bootstrap = await resetMcpState()
      const client = await createClient(actor, bootstrap)
      const result = await client.listTools()
      return result.tools.map(tool => tool.name)
    })
  },
  scorers: [visibilityScorer],
  columns: ({ output }) => [
    { label: 'Visible Tools', value: output.join(', ') },
    { label: 'Visibility OK', value: String(output.length > 0) },
  ],
})

evalite('MCP Tool Routing', {
  data: [
    {
      input: {
        actor: 'anonymous',
        prompt: 'Create a note titled "Roadmap" with content "Review MCP parity".',
        expectedTool: 'create-note',
        expectedArgs: {
          title: 'Roadmap',
          content: 'Review MCP parity',
        },
      },
      expected: {
        actor: 'anonymous',
        prompt: 'Create a note titled "Roadmap" with content "Review MCP parity".',
        expectedTool: 'create-note',
        expectedArgs: {
          title: 'Roadmap',
          content: 'Review MCP parity',
        },
      },
    },
    {
      input: {
        actor: 'anonymous',
        prompt: 'List the current notes.',
        expectedTool: 'list-notes',
        expectedArgs: {},
      },
      expected: {
        actor: 'anonymous',
        prompt: 'List the current notes.',
        expectedTool: 'list-notes',
        expectedArgs: {},
      },
    },
    {
      input: {
        actor: 'anonymous',
        prompt: 'Search notes for "roadmap".',
        expectedTool: 'search-notes',
        expectedArgs: {
          query: 'roadmap',
        },
      },
      expected: {
        actor: 'anonymous',
        prompt: 'Search notes for "roadmap".',
        expectedTool: 'search-notes',
        expectedArgs: {
          query: 'roadmap',
        },
      },
    },
    {
      input: {
        actor: 'member',
        prompt: 'Publish a post titled "Launch Plan" with content "Ship the MCP refresh".',
        expectedTool: 'create-post',
        expectedArgs: {
          title: 'Launch Plan',
          content: 'Ship the MCP refresh',
        },
      },
      expected: {
        actor: 'member',
        prompt: 'Publish a post titled "Launch Plan" with content "Ship the MCP refresh".',
        expectedTool: 'create-post',
        expectedArgs: {
          title: 'Launch Plan',
          content: 'Ship the MCP refresh',
        },
      },
    },
    {
      input: {
        actor: 'viewer',
        prompt: 'Add comment "Looks good to me" to the seeded post.',
        expectedTool: 'create-comment',
        expectedArgs: {
          content: 'Looks good to me',
        },
      },
      expected: {
        actor: 'viewer',
        prompt: 'Add comment "Looks good to me" to the seeded post.',
        expectedTool: 'create-comment',
        expectedArgs: {
          content: 'Looks good to me',
        },
      },
    },
  ],
  task: async ({ actor, prompt }) => {
    return await withEvalLock(async () => {
      const bootstrap = await resetMcpState()
      const client = await createClient(actor, bootstrap)

      try {
        const tools = await client.tools()
        const availableTools = Object.keys(tools)
        const selection = pickToolCall(prompt, availableTools, bootstrap)
        const selectedTool = tools[selection.toolName]

        if (!selectedTool?.execute) {
          return {
            availableTools,
            chosenTool: selection.toolName,
            chosenArgs: selection.args,
            result: null,
            error: `Tool "${selection.toolName}" did not expose an execute function.`,
          } satisfies RouteOutput
        }

        const result = await selectedTool.execute(selection.args, {
          toolCallId: 'eval-route-call',
          messages: [],
        })
        return {
          availableTools,
          chosenTool: selection.toolName,
          chosenArgs: selection.args,
          result,
        } satisfies RouteOutput
      } catch (error) {
        return {
          availableTools: [],
          chosenTool: null,
          chosenArgs: null,
          result: null,
          error: error instanceof Error ? error.message : String(error),
        } satisfies RouteOutput
      }
    })
  },
  scorers: [routingScorer],
  columns: ({ output }) => [
    { label: 'Chosen Tool', value: output.chosenTool ?? 'none' },
    { label: 'Result OK', value: String(readStructuredContent(output.result)?.ok === true) },
  ],
})

evalite('MCP Destructive Confirmation', {
  data: [
    {
      input: {
        actor: 'anonymous',
        toolName: 'delete-note',
        resource: 'noteId',
      },
      expected: {
        actor: 'anonymous',
        toolName: 'delete-note',
        resource: 'noteId',
      },
    },
    {
      input: {
        actor: 'member',
        toolName: 'delete-post',
        resource: 'postId',
      },
      expected: {
        actor: 'member',
        toolName: 'delete-post',
        resource: 'postId',
      },
    },
  ],
  task: async ({ actor, toolName, resource }) => {
    return await withEvalLock(async () => {
      const bootstrap = await resetMcpState()
      const client = await createClient(actor, bootstrap)

      try {
        const tools = await client.tools()
        const tool = tools[toolName]
        const id = bootstrap.resources[resource]

        if (!tool?.execute) {
          return {
            preview: null,
            confirmed: null,
            error: `Tool "${toolName}" did not expose an execute function.`,
          } satisfies ConfirmationOutput
        }

        const preview = await tool.execute({ id }, {
          toolCallId: 'eval-preview-call',
          messages: [],
        })
        const confirmed = await tool.execute({ id, _confirmed: true }, {
          toolCallId: 'eval-confirmed-call',
          messages: [],
        })

        return {
          preview,
          confirmed,
        } satisfies ConfirmationOutput
      } catch (error) {
        return {
          preview: null,
          confirmed: null,
          error: error instanceof Error ? error.message : String(error),
        } satisfies ConfirmationOutput
      }
    })
  },
  scorers: [confirmationScorer],
  columns: ({ output }) => [
    {
      label: 'Preview Awaiting Confirmation',
      value: String(readStructuredContent(output.preview)?.awaitingConfirmation === true),
    },
    {
      label: 'Confirmed OK',
      value: String(readStructuredContent(output.confirmed)?.ok === true),
    },
  ],
})
