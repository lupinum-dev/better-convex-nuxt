export const trellisObservability = {
  enabled: true,
  level: 'verbose' as const,
  service: 'internal-harness',
  capture: {
    backend: true,
    mcp: true,
    browser: true,
  },
}
