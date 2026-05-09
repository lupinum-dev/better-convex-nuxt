/**
 * Owns MCP tool result post-processing.
 *
 * Result envelope policy lives here and in `result-envelope.ts`; app wiring
 * code should not duplicate `executed` or preview envelope semantics.
 */
export function markDestructiveExecuted(
  result: unknown,
  wrapRaw: (value: unknown) => unknown = (value) => value,
): unknown {
  if (!result || typeof result !== 'object' || !('structuredContent' in result)) {
    const wrapped = wrapRaw(result)
    if (wrapped && typeof wrapped === 'object' && 'structuredContent' in wrapped) {
      return markDestructiveExecuted(wrapped)
    }
    return wrapped
  }

  const toolResult = result as {
    structuredContent?: unknown
  }
  const structuredContent = toolResult.structuredContent
  if (!structuredContent || typeof structuredContent !== 'object') {
    return result
  }

  const envelope = structuredContent as Record<string, unknown>
  if (envelope.ok !== true || 'preview' in envelope || envelope.executed === true) {
    return result
  }

  return {
    ...(result as Record<string, unknown>),
    structuredContent: {
      ...envelope,
      executed: true,
    },
  }
}
