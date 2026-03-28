import type { CallToolResult } from '@nuxtjs/mcp-toolkit/server'

import type { ConvexErrorCategory, ConvexErrorIssue } from '../utils/types'
import type { PreviewResult } from './types'

const RETRYABLE_CATEGORIES: ReadonlySet<ConvexErrorCategory> = new Set([
  'auth',
  'validation',
  'rate_limit',
  'scope_exceeded',
  'confirmation_required',
  'cooldown',
  'network',
  'server',
  'conflict',
])

function isRetryable(category: ConvexErrorCategory): boolean {
  return RETRYABLE_CATEGORIES.has(category)
}

function safeJsonText(value: unknown): string {
  if (value === undefined) return 'undefined'
  const json = JSON.stringify(value)
  // JSON.stringify returns undefined for functions/symbols — flag as non-serializable
  if (json === undefined) return `[non-serializable ${typeof value}]`
  return json
}

// ============================================================================
// withSummary — branded helper to avoid duck-typing collisions
// ============================================================================

// Module-scoped symbol — only code with a direct reference can match
const TOOL_SUMMARY: unique symbol = Symbol('convex-tool-summary')

interface DataWithSummary<T = unknown> {
  data: T
  summary: string
  [TOOL_SUMMARY]: true
}

function isDataWithSummary(value: unknown): value is DataWithSummary {
  if (!value || typeof value !== 'object') return false
  return TOOL_SUMMARY in (value as Record<symbol, unknown>)
}

/**
 * Mark a handler return value with an explicit text summary for MCP agents.
 *
 * Without this, `wrapSuccess` JSON-stringifies the data for the text fallback.
 * With `withSummary`, the summary becomes the text content and data goes into
 * `structuredContent`.
 *
 * @example
 * ```ts
 * handler: async (args) => {
 *   const post = await serverConvexMutation(api.posts.create, args)
 *   return withSummary(post, `Created post "${post.title}"`)
 * }
 * ```
 */
export function withSummary<T>(data: T, summary: string): DataWithSummary<T> {
  return { data, summary, [TOOL_SUMMARY]: true }
}

/**
 * Wrap a successful handler return value into a structured CallToolResult.
 *
 * If the value was created with `withSummary()`, the summary becomes the text
 * content and data goes into structuredContent. Otherwise, the value is used
 * as data and JSON-stringified for the text fallback.
 */
export function wrapSuccess(value: unknown): CallToolResult {
  if (isDataWithSummary(value)) {
    return {
      content: [{ type: 'text', text: value.summary }],
      structuredContent: {
        ok: true,
        data: value.data,
      },
    }
  }

  return {
    content: [{ type: 'text', text: safeJsonText(value) }],
    structuredContent: {
      ok: true,
      data: value,
    },
  }
}

/**
 * Wrap an error into a structured CallToolResult with categorized envelope.
 */
export function wrapError(
  category: ConvexErrorCategory,
  message: string,
  issues?: ConvexErrorIssue[],
): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    structuredContent: {
      ok: false,
      error: {
        category,
        message,
        retryable: isRetryable(category),
        ...(issues?.length ? { issues } : {}),
      },
    },
    isError: true,
  }
}

/**
 * Wrap a preview result into a structured CallToolResult awaiting confirmation.
 */
export function wrapPreview(preview: PreviewResult): CallToolResult {
  return {
    content: [{ type: 'text', text: preview.summary }],
    structuredContent: {
      ok: true,
      preview,
      awaitingConfirmation: true,
    },
  }
}
