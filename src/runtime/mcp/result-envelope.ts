import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

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

function jsonText(value: unknown): string {
  return JSON.stringify(value)
}

interface DataWithSummary {
  data: unknown
  summary: string
}

function isDataWithSummary(value: unknown): value is DataWithSummary {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return 'data' in record && 'summary' in record && typeof record.summary === 'string'
}

/**
 * Wrap a successful handler return value into a structured CallToolResult.
 *
 * If the value is `{ data, summary }`, the summary becomes the text content
 * and data goes into structuredContent. Otherwise, the value is used as data
 * and JSON-stringified for the text fallback.
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
    content: [{ type: 'text', text: jsonText(value) }],
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
