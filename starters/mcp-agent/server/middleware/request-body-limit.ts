import { cacheRequestBodyWithLimit } from '../utils/requestBodyLimit'

const maxMcpRequestBodyBytes = 64 * 1024

export default defineEventHandler(async (event) => {
  if (event.method !== 'POST') return

  const path = event.path.split('?', 1)[0]
  if (path !== '/mcp' && path !== '/mcp/' && path !== '/api/demo/mcp-projects') return

  await cacheRequestBodyWithLimit(event, maxMcpRequestBodyBytes)
})
