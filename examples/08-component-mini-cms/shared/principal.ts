import { v } from 'convex/values'

export type MiniCmsPrincipal =
  | { kind: 'anonymous'; subject: 'system:anonymous' }
  | { kind: 'user'; userId: string; subject: `user:${string}` }
  | { kind: 'agent'; agentId: string; subject: `agent:${string}`; provider: 'mcp' }

export const miniCmsPrincipalValidator = v.union(
  v.object({
    kind: v.literal('anonymous'),
    subject: v.literal('system:anonymous'),
  }),
  v.object({
    kind: v.literal('user'),
    userId: v.string(),
    subject: v.string(),
  }),
  v.object({
    kind: v.literal('agent'),
    agentId: v.string(),
    subject: v.string(),
    provider: v.literal('mcp'),
  }),
)
