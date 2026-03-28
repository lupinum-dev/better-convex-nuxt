import type { ConvexErrorCategory } from '../utils/types'

/**
 * Strip internal noise from error messages so MCP agents see clean output.
 * Removes helper prefixes like `[serverConvexMutation]`, request IDs, and stack traces.
 */
export function cleanErrorMessage(message: string): string {
  let cleaned = message
    // Strip "[serverConvexMutation] Request failed for x:y via url." prefix
    .replace(/^\[server\w+\]\s*(?:Request failed for \S+ via \S+\.\s*)?/, '')
    // Strip "[Request ID: ...]" markers
    .replace(/\[Request ID: [^\]]+\]\s*/g, '')
    // Strip stack traces (lines starting with whitespace + "at ")
    .replace(/\n\s+at .+/g, '')
    .trim()

  // Pull the meaningful error from "Server Error\nUncaught Error: Actual message"
  const uncaughtMatch = cleaned.match(/(?:Uncaught )?Error:\s*(.+)/)
  if (uncaughtMatch) {
    cleaned = uncaughtMatch[1]!.trim()
  }

  return cleaned || message
}

/**
 * Last-resort category inference from the cleaned error message.
 * Only used when `categorizeError` couldn't determine a category from code/status.
 */
export function inferCategoryFromMessage(message: string): ConvexErrorCategory | undefined {
  const lower = message.toLowerCase()
  if (lower.includes('unauthorized') || lower.includes('unauthenticated') || lower.includes('forbidden')) return 'auth'
  if (lower.includes('not found')) return 'not_found'
  if (lower.includes('rate limit') || lower.includes('too many')) return 'rate_limit'
  if (lower.includes('validation') || lower.includes('invalid arg')) return 'validation'
  return undefined
}
