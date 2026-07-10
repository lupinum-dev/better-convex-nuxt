// Proof 5 worker: runs the REAL ConvexHttpClient (convex 1.38.0) against the
// mock, optionally through the prototype boundary wrapper, and prints results.
// The parent (proof5-run.mjs) captures this process's full stdout+stderr and
// scans for the sentinel.
import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'

import { startMockConvexServer } from './mock-convex-server.mjs'
import {
  normalizeServerConvexBoundaryError,
  createClassifiedConvexFetch,
  serializeNuxtPayload,
  ConvexCallError,
} from './prototype-boundary.mjs'

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? 'true']
  }),
)

const SENTINEL = args.sentinel
const scenario = args.scenario // leak-body | convex-error | loglines
const wrapped = args.wrapped === 'true'
const loggerFalse = args.logger === 'false'
const port = Number(args.port)

async function main() {
  const server = await startMockConvexServer({ port, scenario, sentinel: SENTINEL })
  const address = `http://127.0.0.1:${port}`

  // logger:false is the vNext-mandated config; the leak-control run omits it
  // (default logger) to prove the logLines channel is real.
  const opts = loggerFalse ? { fetch: createClassifiedConvexFetch(), logger: false } : {}
  const client = new ConvexHttpClient(address, opts)

  const ops = [
    ['query', () => client.query(anyApi.proof.thing, {})],
    ['mutation', () => client.mutation(anyApi.proof.thing, {})],
    ['action', () => client.action(anyApi.proof.thing, {})],
  ]

  for (const [op, run] of ops) {
    try {
      const value = await run()
      // Success path (loglines scenario). Print public-safe value only.
      console.log(
        `RESULT op=${op} outcome=success valueType=${value === null ? 'null' : typeof value}`,
      )
    } catch (raw) {
      if (!wrapped) {
        // Leak-control: emit the RAW error the way unsanitized code would
        // (this is exactly what we must PREVENT downstream).
        console.log(`RESULT op=${op} outcome=raw message=${raw.message}`)
        continue
      }
      const pub = normalizeServerConvexBoundaryError(raw)
      const inspected = (await import('node:util')).inspect(pub)
      const json = JSON.stringify(pub.toJSON())
      const payload = serializeNuxtPayload(pub)
      console.log(
        `RESULT op=${op} outcome=wrapped kind=${pub.kind} ` +
          `message=<<${pub.message}>> code=${pub.code ?? ''} ` +
          `dataCode=${pub.data?.code ?? ''} dataReason=${pub.data?.reason ?? ''}`,
      )
      console.log(`INSPECT op=${op} ${inspected}`)
      console.log(`TOJSON op=${op} ${json}`)
      console.log(`PAYLOAD op=${op} ${payload}`)
      console.log(`SPREAD op=${op} ${JSON.stringify({ ...pub })}`)
      // Default console rendering of the error object (uses custom inspect).
      console.log('CONSOLE op=' + op, pub)
      // Contract completeness: raw cause IS retained (non-enumerable) so
      // callers can still debug it out-of-band, but it never serialized above.
      console.log(`CAUSE_RETAINED op=${op} ${pub.cause instanceof Error}`)
      // Structured contract check for the legit ConvexError path.
      if (scenario === 'convex-error') {
        console.log(
          `CONTRACT op=${op} isConvexCallError=${pub instanceof ConvexCallError} ` +
            `serverKind=${pub.kind === 'server'} hasData=${pub.data != null}`,
        )
      }
    }
  }

  server.close()
}

main().catch((e) => {
  console.error('CHILD_FATAL', e && e.stack ? e.stack : e)
  process.exit(1)
})
