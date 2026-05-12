export default defineNuxtConfig({
  modules: ['@lupinum/trellis', '@nuxtjs/mcp-toolkit'],
  mcp: { name: 'trellis-starter-workspace-mcp', sessions: true },
  trellis: {
    url: process.env.CONVEX_URL,
    auth: true,
    permissions: 'permissions/context.getPermissionContext',
  },
})
