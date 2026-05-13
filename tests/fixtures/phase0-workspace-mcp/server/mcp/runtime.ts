import { operationPreview } from '../../../../../src/runtime/functions/define-operation'
import { defineMcpApp } from '../../../../../src/runtime/mcp/define-mcp-app'

export const convexCalls: Array<{
  operation: 'query' | 'mutation' | 'action'
  args: unknown
  options: unknown
}> = []

export const mcpRuntime = defineMcpApp({
  resolveCaller: async () => ({
    kind: 'agent' as const,
    subject: 'agent:phase0',
  }),
  scopeKey: () => 'global',
  resolveAccess: async () => ({
    'projects.create': true,
    'projects.delete': true,
  }),
  callConvex: async () => ({
    query: async (_ref, args, options) => {
      convexCalls.push({ operation: 'query', args, options })
      return operationPreview({ summary: 'Delete project', confirm: { id: 'project-1' } })
    },
    mutation: async (_ref, args, options) => {
      convexCalls.push({ operation: 'mutation', args, options })
      return { deleted: true }
    },
    action: async (_ref, args, options) => {
      convexCalls.push({ operation: 'action', args, options })
      return null
    },
  }),
})

export const { tool } = mcpRuntime
export default mcpRuntime
