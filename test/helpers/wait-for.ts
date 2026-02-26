export async function waitFor(
  predicate: () => boolean,
  options: { timeoutMs?: number, stepMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 2000
  const stepMs = options.stepMs ?? 10
  const started = Date.now()

  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms`)
    }
    await new Promise(resolve => setTimeout(resolve, stepMs))
  }
}

