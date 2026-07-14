// Proof 7 runner — EXCHANGE REDIRECT SAFETY (vNext.md §5.8 proof 7 / §9).
// A mock upstream returns 301/302/307/308 to a recorder endpoint. The recorder
// (both cross-origin and same-origin) records ANY request it receives. We assert
// it receives ZERO — the credential is never sent to the redirect target — and
// that control-character credentials are rejected before any network access.
import http from 'node:http'

import { exchangeConvexToken, normalizeSiteUrl } from './prototype-exchange.mjs'

const SENTINEL_COOKIE = 'better-auth.session_token=SUPERSECRET_SESSION_abc123; Path=/'

// Ports (server-security range 4650-4659).
const UPSTREAM_PORT = 4655 // legit token origin; also hosts a same-origin /recorder
const RECORDER_PORT = 4656 // cross-origin redirect target

const counters = {
  tokenEndpointHits: 0, // hits on /api/auth/convex/token (expected — legit first hop)
  crossOriginRecorderHits: 0, // MUST stay 0
  sameOriginRecorderHits: 0, // MUST stay 0
  crossOriginRecorderSawCredential: 0,
  sameOriginRecorderSawCredential: 0,
}

let redirectMode = { status: 302, target: 'cross' } // mutated per case

function credentialPresent(req) {
  return Boolean(req.headers['cookie'] || req.headers['authorization'])
}

const upstream = http.createServer((req, res) => {
  const path = (req.url || '').split('?')[0]
  if (path === '/api/auth/convex/token') {
    counters.tokenEndpointHits++
    const location =
      redirectMode.target === 'cross'
        ? `http://127.0.0.1:${RECORDER_PORT}/recorder`
        : `http://127.0.0.1:${UPSTREAM_PORT}/recorder`
    res.writeHead(redirectMode.status, { Location: location })
    res.end('redirecting')
    return
  }
  if (path === '/recorder') {
    // Same-origin redirect target. Reaching here means the credential followed
    // the redirect on the same origin — a leak.
    counters.sameOriginRecorderHits++
    if (credentialPresent(req)) counters.sameOriginRecorderSawCredential++
    res.writeHead(200).end('same-origin recorder hit')
    return
  }
  res.writeHead(404).end('nf')
})

const recorder = http.createServer((req, res) => {
  counters.crossOriginRecorderHits++
  if (credentialPresent(req)) counters.crossOriginRecorderSawCredential++
  res.writeHead(200).end('cross-origin recorder hit')
})

function listen(server, port) {
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r()))
}

const assertions = []
function assert(name, pass, detail) {
  assertions.push({ name, pass, detail })
}

async function main() {
  await listen(upstream, UPSTREAM_PORT)
  await listen(recorder, RECORDER_PORT)

  const siteUrl = `http://127.0.0.1:${UPSTREAM_PORT}` // loopback -> http allowed

  // --- Redirect matrix: {301,302,307,308} x {cross-origin, same-origin} ---
  const codes = [301, 302, 307, 308]
  const targets = ['cross', 'same']
  for (const status of codes) {
    for (const target of targets) {
      redirectMode = { status, target }
      const before = { ...counters }
      const result = await exchangeConvexToken({
        siteUrl,
        credential: { type: 'cookie', value: SENTINEL_COOKIE },
        timeoutMs: 3000,
      })
      const tokenHit = counters.tokenEndpointHits - before.tokenEndpointHits
      const crossHit = counters.crossOriginRecorderHits - before.crossOriginRecorderHits
      const sameHit = counters.sameOriginRecorderHits - before.sameOriginRecorderHits
      const recorderHit = target === 'cross' ? crossHit : sameHit
      assert(
        `redirect ${status} -> ${target}-origin: token is null and exchange did not throw`,
        result.token === null && result.error != null && result.error.kind === 'transport',
        `token=${result.token} errorKind=${result.error?.kind}`,
      )
      assert(
        `redirect ${status} -> ${target}-origin: legit first hop WAS made (token endpoint hit once)`,
        tokenHit === 1,
        `tokenEndpointHits(delta)=${tokenHit} (expect 1)`,
      )
      assert(
        `redirect ${status} -> ${target}-origin: redirect target received ZERO requests (credential not sent)`,
        recorderHit === 0,
        `recorderHits(delta)=${recorderHit} (expect 0)`,
      )
    }
  }

  // Absolute credential-leak tally across the entire matrix.
  assert(
    'MATRIX: cross-origin recorder saw the credential ZERO times across all redirect codes',
    counters.crossOriginRecorderSawCredential === 0 && counters.crossOriginRecorderHits === 0,
    `sawCredential=${counters.crossOriginRecorderSawCredential} hits=${counters.crossOriginRecorderHits}`,
  )
  assert(
    'MATRIX: same-origin recorder saw the credential ZERO times across all redirect codes',
    counters.sameOriginRecorderSawCredential === 0 && counters.sameOriginRecorderHits === 0,
    `sawCredential=${counters.sameOriginRecorderSawCredential} hits=${counters.sameOriginRecorderHits}`,
  )

  // --- Control-character rejection BEFORE any network access ---
  const preNetHits = counters.tokenEndpointHits
  for (const [label, value] of [
    ['CRLF', 'session=abc' + String.fromCharCode(13, 10) + 'Host: evil.example'],
    ['bare-LF', 'session=abc' + String.fromCharCode(10) + 'def'],
    ['bare-CR', 'session=abc' + String.fromCharCode(13) + 'def'],
    ['NUL', 'session=abc' + String.fromCharCode(0) + 'def'],
    ['DEL', 'session=abc' + String.fromCharCode(127) + 'def'],
    ['TAB', 'session=abc' + String.fromCharCode(9) + 'def'],
  ]) {
    const before = counters.tokenEndpointHits
    const result = await exchangeConvexToken({
      siteUrl,
      credential: { type: 'cookie', value },
      timeoutMs: 3000,
    })
    const madeRequest = counters.tokenEndpointHits - before
    assert(
      `control-char/${label}: rejected as validation error with NO network request`,
      result.token === null &&
        result.error?.kind === 'validation' &&
        /control characters/.test(result.error.message) &&
        madeRequest === 0,
      `errorKind=${result.error?.kind} networkReqs=${madeRequest}`,
    )
  }
  assert(
    'control-char: token endpoint hit count UNCHANGED across all control-char attempts',
    counters.tokenEndpointHits === preNetHits,
    `hitsBefore=${preNetHits} hitsAfter=${counters.tokenEndpointHits} (expect equal)`,
  )

  // --- Empty credential rejected before network ---
  {
    const before = counters.tokenEndpointHits
    const result = await exchangeConvexToken({ siteUrl, credential: { type: 'cookie', value: '' } })
    assert(
      'empty credential: validation error, no network request',
      result.token === null &&
        result.error?.kind === 'validation' &&
        counters.tokenEndpointHits === before,
      `errorKind=${result.error?.kind}`,
    )
  }

  // --- normalizeSiteUrl loopback/host rules table ---
  const urlCases = [
    // [input, shouldAccept, note]
    ['https://example.convex.site', true, 'https non-loopback accepted'],
    ['http://localhost:3000', true, 'http localhost accepted'],
    ['http://app.localhost:3000', true, 'http *.localhost accepted'],
    ['http://127.0.0.1:3210', true, 'http 127.0.0.1 accepted'],
    ['http://127.5.6.7', true, 'http 127.0.0.0/8 accepted'],
    ['http://[::1]:3000', true, 'http [::1] accepted'],
    ['http://example.convex.site', false, 'http non-loopback REJECTED'],
    ['http://192.168.1.10', false, 'http private non-loopback REJECTED'],
    ['http://128.0.0.1', false, 'http 128.x (outside /8) REJECTED'],
    ['https://user:pass@example.convex.site', false, 'embedded credentials REJECTED'],
    ['https://example.convex.site/api/auth', false, 'non-root path REJECTED'],
    ['https://example.convex.site/?x=1', false, 'query string REJECTED'],
    ['https://example.convex.site/#frag', false, 'fragment REJECTED'],
    ['ftp://example.convex.site', false, 'non-http(s) scheme REJECTED'],
  ]
  for (const [input, shouldAccept, note] of urlCases) {
    let accepted = true
    let out = ''
    try {
      out = normalizeSiteUrl(input)
    } catch {
      accepted = false
    }
    assert(
      `normalizeSiteUrl: ${note}`,
      accepted === shouldAccept,
      `input=${input} accepted=${accepted} expected=${shouldAccept} origin=${out}`,
    )
  }

  // --- Report ---
  let allPass = true
  console.log(`\n=== PROOF 7: EXCHANGE REDIRECT SAFETY ===\n`)
  for (const { name, pass, detail } of assertions) {
    if (!pass) allPass = false
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`)
  }
  console.log(
    `\ntotal token-endpoint (legit first-hop) requests made: ${counters.tokenEndpointHits}`,
  )
  console.log(`cross-origin redirect-target requests: ${counters.crossOriginRecorderHits}`)
  console.log(`same-origin redirect-target requests:  ${counters.sameOriginRecorderHits}`)
  console.log(`\nPROOF 7 VERDICT: ${allPass ? 'PASS' : 'FAIL'}`)

  upstream.close()
  recorder.close()
  process.exit(allPass ? 0 : 1)
}

main().catch((e) => {
  console.error('PROOF7_FATAL', e)
  process.exit(1)
})
