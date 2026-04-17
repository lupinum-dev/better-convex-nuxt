export const trellisObservability = {
  enabled: true,
  adapter: 'console' as const,
  level: 'verbose' as const,
  capture: {
    backend: true,
    mcp: true,
    browser: true,
  },
}
