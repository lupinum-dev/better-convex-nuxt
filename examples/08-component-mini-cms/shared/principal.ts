import { v } from 'convex/values'

export type MiniCmsPrincipal =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string }
  | { kind: 'mcp'; mcpKeyId: string }

export const miniCmsPrincipalValidator = v.union(
  v.object({
    kind: v.literal('anonymous'),
  }),
  v.object({
    kind: v.literal('user'),
    userId: v.string(),
  }),
  v.object({
    kind: v.literal('mcp'),
    mcpKeyId: v.string(),
  }),
)
