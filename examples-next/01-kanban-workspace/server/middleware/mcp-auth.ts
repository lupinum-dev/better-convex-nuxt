import { defineEventHandler, getHeader } from 'h3'

export default defineEventHandler((event) => {
  if (!event.path.startsWith('/mcp')) return

  const userId = getHeader(event, 'x-kanban-mcp-user')
  if (!userId) return

  const agentId = getHeader(event, 'x-kanban-mcp-agent') ?? undefined
  event.context.mcpAuth = {
    userId,
    ...(agentId ? { agentId } : {}),
  }
})
