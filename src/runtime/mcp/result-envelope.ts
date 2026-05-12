import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { TrellisDenialExplanation } from '../observability/index.js'
import type { SerializableValue, ValidateSerializable } from '../types/type-utils.js'
import type { ConvexErrorCategory, ConvexErrorIssue } from '../utils/types.js'
import type { PreviewResult } from './types.js'

export type NormalizedToolError = {
  category: ConvexErrorCategory
  message: string
  issues?: ConvexErrorIssue[]
  explanation?: TrellisDenialExplanation
  details?: Record<string, unknown>
  code?: string
}

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

const STRUCTURED_OUTPUT_OMITTED_TEXT = '[structured output omitted from model text channel]'

// ============================================================================
// withSummary — branded helper to avoid duck-typing collisions
// ============================================================================

// Module-scoped symbol — only code with a direct reference can match
const TOOL_SUMMARY: unique symbol = Symbol('convex-tool-summary')

interface DataWithSummary<T = SerializableValue> {
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
export function withSummary<T>(
  data: ValidateSerializable<T>,
  summary: string,
): DataWithSummary<ValidateSerializable<T>> {
  return { data, summary, [TOOL_SUMMARY]: true }
}

/**
 * Explicitly frame untrusted model-visible text.
 *
 * Use this when tool output should expose user-authored text to the model. The
 * wrapper keeps the original structured data intact while making the text
 * channel obviously non-instructional.
 */
export function withUntrustedText<T>(
  data: ValidateSerializable<T>,
  text: string,
): DataWithSummary<ValidateSerializable<T>> {
  return withSummary(
    data,
    ['[untrusted user content follows]', text, '[end untrusted user content]'].join('\n'),
  )
}

/**
 * Wrap a successful handler return value into a structured CallToolResult.
 *
 * If the value was created with `withSummary()`, the summary becomes the text
 * content and data goes into structuredContent. Otherwise, the value is used
 * as structured data only and the model text channel receives a generic
 * placeholder. Handlers must opt in to model-visible text with `withSummary()`
 * or `withUntrustedText()`.
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

  const text =
    value === null || value === undefined || typeof value !== 'object'
      ? safeJsonText(value)
      : STRUCTURED_OUTPUT_OMITTED_TEXT

  return {
    content: [{ type: 'text', text }],
    structuredContent: {
      ok: true,
      data: value,
    },
  }
}

/**
 * Wrap an error into a structured CallToolResult with categorized envelope.
 */
export function wrapError(error: NormalizedToolError): CallToolResult
export function wrapError(
  category: ConvexErrorCategory,
  message: string,
  issues?: ConvexErrorIssue[],
  explanation?: TrellisDenialExplanation,
  details?: Record<string, unknown>,
  code?: string,
): CallToolResult
export function wrapError(
  categoryOrError: ConvexErrorCategory | NormalizedToolError,
  messageInput?: string,
  issuesInput?: ConvexErrorIssue[],
  explanationInput?: TrellisDenialExplanation,
  detailsInput?: Record<string, unknown>,
  codeInput?: string,
): CallToolResult {
  const normalized =
    typeof categoryOrError === 'string'
      ? {
          category: categoryOrError,
          message: messageInput ?? 'Unknown error',
          issues: issuesInput,
          explanation: explanationInput,
          details: detailsInput,
          code: codeInput,
        }
      : categoryOrError
  const { category, message, issues, explanation, details, code } = normalized
  const suggestedAction =
    details && typeof details.suggestedAction === 'string'
      ? details.suggestedAction
      : explanation?.suggestedAction
  return {
    content: [{ type: 'text', text: message }],
    structuredContent: {
      ok: false,
      error: {
        category,
        ...(code ? { code } : {}),
        message,
        retryable: isRetryable(category),
        ...(issues?.length ? { issues } : {}),
        ...(details ? { details } : {}),
        ...(suggestedAction ? { suggestedAction } : {}),
        ...(explanation ? { explanation } : {}),
      },
    },
    isError: true,
  }
}

/**
 * Wrap a preview result into a structured CallToolResult awaiting confirmation.
 */
export function wrapPreview(preview: PreviewResult): CallToolResult {
  const awaitingConfirmation = preview.confirmation !== undefined
  return {
    content: [{ type: 'text', text: preview.summary }],
    structuredContent: {
      ok: true,
      preview,
      awaitingConfirmation,
      requiresConfirmation: awaitingConfirmation,
      executed: false,
    },
  }
}
