export const trellisObservability = {
  enabled: true,
  level: 'verbose' as const,
  service: 'kanban-workspace',
  capture: {
    backend: true,
    mcp: true,
    browser: true,
  },
}
