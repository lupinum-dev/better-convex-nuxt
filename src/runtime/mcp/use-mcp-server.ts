import type {
  McpServer,
  ReadResourceCallback,
  ReadResourceTemplateCallback,
  RegisteredResource,
  RegisteredResourceTemplate,
  ResourceMetadata,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js'
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

function replaceRegistration<T extends RegistrationHandle>(
  map: Map<string, RegistrationHandle>,
  name: string,
  handle: T,
): T {
  removeByName(map, name)
  map.set(name, handle)
  return handle
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
    registerTool: ((name, config, cb) => {
      const handle = server.registerTool(name, config, cb)
      return replaceRegistration(reg.tools, name, handle)
    }) as McpServer['registerTool'],
    registerPrompt: ((name, config, cb) => {
      const handle = server.registerPrompt(name, config, cb)
      return replaceRegistration(reg.prompts, name, handle)
    }) as McpServer['registerPrompt'],
    registerResource: ((
      name: string,
      uriOrTemplate: string | ResourceTemplate,
      config: ResourceMetadata,
      readCallback: ReadResourceCallback | ReadResourceTemplateCallback,
    ) => {
      const handle =
        typeof uriOrTemplate === 'string'
          ? server.registerResource(
              name,
              uriOrTemplate,
              config,
              readCallback as ReadResourceCallback,
            )
          : server.registerResource(
              name,
              uriOrTemplate,
              config,
              readCallback as ReadResourceTemplateCallback,
            )

      return replaceRegistration(
        reg.resources,
        name,
        handle as RegisteredResource | RegisteredResourceTemplate,
      )
    }) as {
      (
        name: string,
        uriOrTemplate: string,
        config: ResourceMetadata,
        readCallback: ReadResourceCallback,
      ): RegisteredResource
      (
        name: string,
        uriOrTemplate: ResourceTemplate,
        config: ResourceMetadata,
        readCallback: ReadResourceTemplateCallback,
      ): RegisteredResourceTemplate
    },
    removeTool: (name) => removeByName(reg.tools, name),
    removePrompt: (name) => removeByName(reg.prompts, name),
    removeResource: (name) => removeByName(reg.resources, name),
    server,
  }
}
