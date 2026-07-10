// Mock Convex HTTP endpoint reproducing the exact response shapes
// ConvexHttpClient (convex 1.38.0) hits for query/mutation/action.
// Verified against node_modules/convex/dist/esm/browser/http_client.js:
//   - non-OK & status !== 560 (STATUS_CODE_UDF_FAILED) -> throw new Error(await response.text())
//   - status 560 with {status:"error", errorData, errorMessage} -> reconstruct ConvexError(.data)
//   - status 200 {status:"success", value, logLines} -> default logger prints logLines to console
import http from 'node:http'

export function startMockConvexServer({ port, scenario, sentinel }) {
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const path = req.url || ''
      if (!/^\/api\/(?:query|mutation|action)$/.test(path)) {
        res.writeHead(404).end('not found')
        return
      }
      if (scenario === 'leak-body') {
        // Non-UDF-failure non-OK: raw body becomes Error.message verbatim.
        res.writeHead(500, { 'content-type': 'text/plain' })
        res.end(
          `Internal upstream failure: connection string ` +
            `postgres://svc:${sentinel}@10.0.0.4/prod leaked from backend trace`,
        )
        return
      }
      if (scenario === 'convex-error') {
        // Legitimate application ConvexError path (HTTP 560 = STATUS_CODE_UDF_FAILED).
        res.writeHead(560, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            status: 'error',
            errorMessage: 'Not allowed',
            // errorData is convex-encoded JSON; plain string fields map 1:1.
            errorData: { code: 'UNAUTHORIZED', reason: 'insufficient role' },
            logLines: [],
          }),
        )
        return
      }
      if (scenario === 'loglines') {
        // Success path whose logLines carry a secret; default logger re-emits
        // them to console. logger:false must suppress this channel entirely.
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            status: 'success',
            value: null,
            logLines: [`[LOG] backend printed api_key=${sentinel} during handler`],
          }),
        )
        return
      }
      res.writeHead(500).end('unconfigured scenario')
    })
  })
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}
