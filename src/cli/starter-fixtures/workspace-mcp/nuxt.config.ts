export default defineNuxtConfig({
  modules: ['@lupinum/trellis'],
  trellis: {
    url: process.env.CONVEX_URL,
    auth: true,
    permissions: 'permissions/context.getPermissionContext',
    mcp: { name: 'trellis-starter-workspace-mcp', sessions: true },
  },
})
