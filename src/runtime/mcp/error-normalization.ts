/**
 * Owns MCP-facing error normalization.
 *
 * This module must not parse stack-shaped strings itself. Convex/server error
 * parsing lives in `../utils/call-result.ts`; MCP code only consumes the
 * normalized shape from `toConvexError`.
 */
import { toConvexError } from '../utils/call-result.js'
import type { ConvexErrorCategory, ConvexErrorIssue } from '../utils/types.js'

export type NormalizedMcpError = {
  category: ConvexErrorCategory
  message: string
  issues?: ConvexErrorIssue[]
  details?: Record<string, unknown>
  code?: string
}

export function normalizeMcpError(error: unknown): NormalizedMcpError {
  const convexError = toConvexError(error)
  return {
    category: convexError.category,
    message: convexError.message,
    ...(convexError.issues ? { issues: convexError.issues } : {}),
    ...(convexError.details ? { details: convexError.details } : {}),
    ...(convexError.code ? { code: convexError.code } : {}),
  }
}
