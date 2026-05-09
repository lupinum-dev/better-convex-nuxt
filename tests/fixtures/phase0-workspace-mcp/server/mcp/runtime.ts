import { defineMcpApp } from '../../../../../src/runtime/mcp/define-mcp-app'

export const { tool } = defineMcpApp({
  resolvePrincipal: async () => ({
    kind: 'agent' as const,
    subject: 'agent:phase0',
  }),
  callConvex: async () => ({
    query: async () => ({
      display: { summary: 'Delete project' },
      confirm: { id: 'project-1' },
    }),
    mutation: async () => ({ deleted: true }),
    action: async () => null,
  }),
})
