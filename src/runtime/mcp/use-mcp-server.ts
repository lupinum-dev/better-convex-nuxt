import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { useEvent } from 'nitropack/runtime'

interface RegistrationHandle {
  remove: () => void
}

interface RegistrationMaps {
  tools: Map<string, RegistrationHandle>
  prompts: Map<string, RegistrationHandle>
  resources: Map<string, RegistrationHandle>
}

export interface McpServerHelper {
  registerTool: McpServer['registerTool']
  registerPrompt: McpServer['registerPrompt']
  registerResource: McpServer['registerResource']
  removeTool(name: string): boolean
  removePrompt(name: string): boolean
  removeResource(name: string): boolean
  server: McpServer
}

const registrations = new WeakMap<McpServer, RegistrationMaps>()

function getRegistrations(server: McpServer): RegistrationMaps {
  const existing = registrations.get(server)
  if (existing) {
    return existing
  }

  const created: RegistrationMaps = {
    tools: new Map(),
    prompts: new Map(),
    resources: new Map(),
  }
  registrations.set(server, created)
  return created
}

function removeByName(map: Map<string, RegistrationHandle>, name: string): boolean {
  const handle = map.get(name)
  if (!handle) {
    return false
  }

  handle.remove()
  map.delete(name)
  return true
}

function wrapRegister<
  TMethod extends 'registerTool' | 'registerPrompt' | 'registerResource',
>(
  server: McpServer,
  method: TMethod,
  map: Map<string, RegistrationHandle>,
): McpServer[TMethod] {
  const register = server[method].bind(server) as McpServer[TMethod]

  return ((...args: Parameters<McpServer[TMethod]>) => {
    const handle = register(...args) as ReturnType<McpServer[TMethod]>
    map.set(args[0], handle as RegistrationHandle)
    return handle
  }) as McpServer[TMethod]
}

export function useMcpServer(): McpServerHelper {
  const event = useEvent()
  const server = event.context._mcpServer as McpServer | undefined

  if (!server) {
    throw new Error(
      'No MCP server instance available. Ensure this is called within an MCP tool/resource/prompt handler and `nitro.experimental.asyncContext` is true.',
    )
  }

  const reg = getRegistrations(server)

  return {
    registerTool: wrapRegister(server, 'registerTool', reg.tools),
    registerPrompt: wrapRegister(server, 'registerPrompt', reg.prompts),
    registerResource: wrapRegister(server, 'registerResource', reg.resources),
    removeTool: name => removeByName(reg.tools, name),
    removePrompt: name => removeByName(reg.prompts, name),
    removeResource: name => removeByName(reg.resources, name),
    server,
  }
}
