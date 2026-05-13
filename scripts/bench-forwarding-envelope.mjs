import { performance } from 'node:perf_hooks'

import { createJiti } from 'jiti'

const jiti = createJiti(import.meta.url)
const { createIdentityForwardingEnvelope, verifyIdentityForwardingEnvelope } = await jiti.import(
  '../src/runtime/identity-forwarding/envelope.ts',
)

const iterations = Number.parseInt(process.env.TRELLIS_FORWARDING_BENCH_ITERATIONS ?? '20000', 10)
const warmup = Math.min(1000, Math.floor(iterations / 4))
const now = Date.UTC(2026, 4, 9, 12, 0, 0)
const key = 'phase-0-forwarding-key-with-enough-entropy'
const args = {
  title: 'Roadmap',
  nested: {
    beta: 'b',
    alpha: 'a',
  },
  items: [1, null, { z: 1, a: true }],
}

const envelope = createIdentityForwardingEnvelope({
  key,
  keyId: '2026-05-a',
  iss: 'nuxt://app',
  aud: 'convex://deployment',
  jti: 'bench-call-1',
  sub: 'user:123',
  caller: { subject: 'user:123', kind: 'user' },
  transport: 'mcp',
  purpose: 'mutation',
  functionRef: 'features.projects.create',
  args,
  now,
  ttlMs: 30_000,
})

function verify() {
  verifyIdentityForwardingEnvelope(envelope, {
    keys: { '2026-05-a': key },
    expectedIssuer: 'nuxt://app',
    expectedAudience: 'convex://deployment',
    functionRef: 'features.projects.create',
    args,
    now: now + 1_000,
  })
}

for (let i = 0; i < warmup; i += 1) verify()

const samples = []
for (let i = 0; i < iterations; i += 1) {
  const start = performance.now()
  verify()
  samples.push(performance.now() - start)
}

samples.sort((left, right) => left - right)
const p50 = samples[Math.floor(samples.length * 0.5)] ?? 0
const p95 = samples[Math.floor(samples.length * 0.95)] ?? 0
const p99 = samples[Math.floor(samples.length * 0.99)] ?? 0
const max = samples.at(-1) ?? 0

const result = {
  benchmark: 'identity-forwarding-envelope.verify',
  iterations,
  algorithm: 'HS256 phase0 spike',
  p50Ms: Number(p50.toFixed(4)),
  p95Ms: Number(p95.toFixed(4)),
  p99Ms: Number(p99.toFixed(4)),
  maxMs: Number(max.toFixed(4)),
}

console.log(JSON.stringify(result, null, 2))
