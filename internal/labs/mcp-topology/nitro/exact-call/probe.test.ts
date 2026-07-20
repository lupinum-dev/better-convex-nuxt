import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { convexToJson, type Value } from 'convex/values'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  ensureLocalConvex,
  type EnsureLocalConvexResult,
} from '../../../../../test/helpers/local-convex'
import { canonicalConvexJson, digestConvexValue } from './canonical-convex'
import {
  signServiceCallProof,
  type ServiceCallOperation,
  type ServiceCallProofV1,
} from './service-call-proof'

const root = fileURLToPath(new URL('../../../../../', import.meta.url))
const sourceFixture = fileURLToPath(new URL('./fixture', import.meta.url))
const canonicalSource = fileURLToPath(new URL('./canonical-convex.ts', import.meta.url))
const proofSource = fileURLToPath(new URL('./service-call-proof.ts', import.meta.url))

const PROOF_ISSUER = 'better-convex-nitro-lab'
const PROOF_AUDIENCE = 'convex-lab-deployment'
const SERVICE_ID = 'nitro-mcp-gateway'
const MCP_ISSUER = 'https://auth.example.test/'
const MCP_RESOURCE = 'https://app.example.test/mcp'
const ACTIVE_KEY_ID = 'active-2026-07'
const RETAINED_KEY_ID = 'retained-2026-06'
const RETIRED_KEY_ID = 'retired-2026-05'

const seed = makeFunctionReference<'mutation', Record<string, never>, { seeded: boolean }>(
  'fixture:seed',
)
const setMemberStatus = makeFunctionReference<
  'mutation',
  { status: 'active' | 'removed'; subject: string },
  { status: 'active' | 'removed'; subject: string }
>('fixture:setMemberStatus')
const inspect = makeFunctionReference<
  'query',
  Record<string, never>,
  {
    note: { revision: number; title: string } | null
    renameReceipts: number
    reportReceipts: number
  }
>('fixture:inspect')
const canonicalDigest = makeFunctionReference<
  'action',
  { value: Value },
  { digest: string; json: string }
>('fixture:canonicalDigest')

let fixtureDirectory = ''
let local: EnsureLocalConvexResult | undefined
let convex: ConvexHttpClient
let activePrivateKey: CryptoKey
let retainedPrivateKey: CryptoKey
let retiredPrivateKey: CryptoKey
let callSequence = 0
const savedEnvironment = new Map<string, string | undefined>()
const managedEnvironmentNames = [
  'CONVEX_DEPLOYMENT',
  'CONVEX_E2E_AUTO_START',
  'CONVEX_SITE_URL',
  'CONVEX_URL',
  'NUXT_PUBLIC_CONVEX_SITE_URL',
  'NUXT_PUBLIC_CONVEX_URL',
] as const

function useAnonymousLocalEnvironment(): void {
  for (const name of managedEnvironmentNames) {
    savedEnvironment.set(name, process.env[name])
    Reflect.deleteProperty(process.env, name)
  }
  process.env.CONVEX_E2E_AUTO_START = 'true'
}

function restoreEnvironment(): void {
  for (const [name, value] of savedEnvironment) {
    if (value === undefined) Reflect.deleteProperty(process.env, name)
    else process.env[name] = value
  }
}

function nextCallId(): string {
  callSequence += 1
  return `call_${String(callSequence).padStart(20, '0')}`
}

async function verifierJwk(key: CryptoKey): Promise<JsonWebKey> {
  return {
    ...(await crypto.subtle.exportKey('jwk', key)),
    alg: 'EdDSA',
    key_ops: ['verify'],
    use: 'sig',
  }
}

async function materializeFixture(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'better-convex-vnext-exact-call-'))
  await cp(sourceFixture, directory, { recursive: true })
  await cp(canonicalSource, path.join(directory, 'convex', 'canonical_convex.ts'))
  const proof = (await readFile(proofSource, 'utf8')).replace(
    "from './canonical-convex'",
    "from './canonical_convex'",
  )
  await writeFile(path.join(directory, 'convex', 'service_call_proof.ts'), proof, 'utf8')
  await symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir')
  return directory
}

async function makeClaims(
  args: Value,
  input: {
    callId?: string
    expiresAt?: number
    functionName: string
    issuedAt?: number
    keyId?: string
    mcp?: Partial<ServiceCallProofV1['mcp']>
    operation: ServiceCallOperation
    overrides?: Partial<Omit<ServiceCallProofV1, 'argsDigest' | 'mcp'>>
  },
): Promise<ServiceCallProofV1> {
  const issuedAt = input.issuedAt ?? Math.floor(Date.now() / 1_000)
  return {
    argsDigest: await digestConvexValue(args),
    audience: PROOF_AUDIENCE,
    callId: input.callId ?? nextCallId(),
    expiresAt: input.expiresAt ?? issuedAt + 15,
    functionName: input.functionName,
    issuedAt,
    issuer: PROOF_ISSUER,
    keyId: input.keyId ?? ACTIVE_KEY_ID,
    operation: input.operation,
    serviceId: SERVICE_ID,
    version: 1,
    ...input.overrides,
    mcp: {
      authorizationReference: { id: 'consent-alice', kind: 'oauth-consent' },
      clientId: 'client-a',
      issuer: MCP_ISSUER,
      resource: MCP_RESOURCE,
      scopes: ['notes:read', 'notes:write'],
      subject: 'alice',
      ...input.mcp,
    },
  }
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

async function signRaw(
  payload: unknown,
  privateKey: CryptoKey,
  header: Record<string, unknown>,
): Promise<string> {
  const input = `${encodeJson(header)}.${encodeJson(payload)}`
  const signature = await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(input))
  return `${input}.${Buffer.from(signature).toString('base64url')}`
}

async function invokeEncoded(
  pathName: string,
  body: string,
  proof: string,
): Promise<{ body: string; json: unknown; response: Response }> {
  if (!local) throw new Error('Exact-call fixture is not ready')
  const response = await fetch(new URL(pathName, local.env.CONVEX_SITE_URL!), {
    body,
    headers: {
      authorization: `ServiceCall ${proof}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  })
  const responseBody = await response.text()
  return { body: responseBody, json: JSON.parse(responseBody), response }
}

async function invoke(
  pathName: string,
  args: Value,
  input: {
    claims?: ServiceCallProofV1
    privateKey?: CryptoKey
    proof?: string
  } = {},
): Promise<{ body: string; json: unknown; response: Response }> {
  const body = JSON.stringify(convexToJson(args))
  const proof =
    input.proof ??
    (input.claims
      ? await signServiceCallProof(input.claims, input.privateKey ?? activePrivateKey)
      : '')
  return invokeEncoded(pathName, body, proof)
}

beforeAll(async () => {
  useAnonymousLocalEnvironment()
  const [active, retained, retired] = await Promise.all([
    crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']),
    crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']),
    crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']),
  ])
  activePrivateKey = active.privateKey
  retainedPrivateKey = retained.privateKey
  retiredPrivateKey = retired.privateKey
  const publicKeys = {
    [ACTIVE_KEY_ID]: await verifierJwk(active.publicKey),
    [RETAINED_KEY_ID]: await verifierJwk(retained.publicKey),
  }

  fixtureDirectory = await materializeFixture()
  local = await ensureLocalConvex({
    cwd: fixtureDirectory,
    deploymentEnv: {
      BCN_VNEXT_EXACT_CALL_PUBLIC_KEYS: JSON.stringify(publicKeys),
    },
    timeoutMs: 60_000,
  })
  convex = new ConvexHttpClient(local.env.CONVEX_URL!)
  expect(await convex.mutation(seed, {})).toEqual({ seeded: true })
})

afterAll(async () => {
  try {
    await local?.release()
  } finally {
    restoreEnvironment()
    if (fixtureDirectory) await rm(fixtureDirectory, { force: true, recursive: true })
  }
})

describe('vNext Nitro exact-call deployed proof', () => {
  it('executes the same canonical Convex vectors in Node and the Convex action runtime', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(sourceFixture, 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>
    }
    expect(manifest.dependencies).toEqual({ convex: '1.42.2' })
    const deployedSource = (
      await Promise.all(
        ['application.ts', 'application_action.ts', 'exact_call.ts', 'fixture.ts', 'http.ts'].map(
          (file) => readFile(path.join(sourceFixture, 'convex', file), 'utf8'),
        ),
      )
    ).join('\n')
    expect(deployedSource).not.toContain("from 'node:")
    expect(deployedSource).not.toContain('makeFunctionReference')
    expect(deployedSource).not.toContain('console.')

    const bytes = new Uint8Array([0, 1, 254, 255]).buffer
    const values: Value[] = [
      null,
      true,
      42.5,
      0,
      -0,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      1_234_567_890_123_456_789n,
      'héllo 😀',
      bytes,
      [1, 'x', false, 3n, bytes],
      { list: [{ b: 2, a: 1 }], z: 1, a: { y: 2, x: 3 } },
    ]
    for (const value of values) {
      await expect(convex.action(canonicalDigest, { value })).resolves.toEqual({
        digest: await digestConvexValue(value),
        json: canonicalConvexJson(value),
      })
    }
  })

  it('uses explicit query, mutation, and action wrappers with live authority and application replay', async () => {
    const queryArgs = { query: 'alp', workspaceId: 'workspace-a' }
    const queryClaims = await makeClaims(queryArgs, {
      functionName: 'application:searchNotes',
      operation: 'query',
    })
    const query = await invoke('/exact-call/query/search-notes', queryArgs, { claims: queryClaims })
    expect(query.response.status).toBe(200)
    expect(query.json).toEqual({
      ok: true,
      value: [{ id: 'note-a', revision: 1, title: 'Alpha' }],
    })

    const renameArgs = { noteId: 'note-a', requestKey: 'rename-1', title: 'Renamed' }
    const renameClaims = await makeClaims(renameArgs, {
      functionName: 'application:renameNote',
      operation: 'mutation',
    })
    const mutationCalls = await Promise.all(
      Array.from({ length: 8 }, () =>
        invoke('/exact-call/mutation/rename-note', renameArgs, { claims: renameClaims }),
      ),
    )
    for (const result of mutationCalls) {
      expect(result.response.status).toBe(200)
      expect(result.json).toEqual({
        ok: true,
        value: { noteId: 'note-a', requestKey: 'rename-1', revision: 2, title: 'Renamed' },
      })
    }

    const reportArgs = { requestKey: 'report-1', workspaceId: 'workspace-a' }
    const reportClaims = await makeClaims(reportArgs, {
      functionName: 'application_action:generateReport',
      operation: 'action',
    })
    const actionCalls = await Promise.all(
      Array.from({ length: 8 }, () =>
        invoke('/exact-call/action/generate-report', reportArgs, { claims: reportClaims }),
      ),
    )
    for (const result of actionCalls) {
      expect(result.response.status).toBe(200)
      expect(result.json).toEqual({
        ok: true,
        value: {
          noteCount: 1,
          reportId: 'workspace-a:report-1',
          requestKey: 'report-1',
          workspaceId: 'workspace-a',
        },
      })
    }

    expect(await convex.query(inspect, {})).toEqual({
      note: { revision: 2, title: 'Renamed' },
      renameReceipts: 1,
      reportReceipts: 1,
    })

    const beforeRevocation = await makeClaims(queryArgs, {
      functionName: 'application:searchNotes',
      operation: 'query',
    })
    await convex.mutation(setMemberStatus, { status: 'removed', subject: 'alice' })
    const revoked = await invoke('/exact-call/query/search-notes', queryArgs, {
      claims: beforeRevocation,
    })
    expect(revoked.response.status).toBe(200)
    expect(revoked.json).toEqual({ code: 'ACCESS_DENIED', ok: false })
    await convex.mutation(setMemberStatus, { status: 'active', subject: 'alice' })

    const allBodies = [query, ...mutationCalls, ...actionCalls, revoked]
      .map((value) => value.body)
      .join('\n')
    for (const forbidden of [
      'consent-alice',
      'client-a',
      MCP_ISSUER,
      MCP_RESOURCE,
      queryClaims.callId,
      renameClaims.callId,
      reportClaims.callId,
    ]) {
      expect(allBodies).not.toContain(forbidden)
    }
  })

  it('rejects every call-context substitution, retired key, and reserved proof collision', async () => {
    const args = { query: 'alpha', workspaceId: 'workspace-a' }
    const valid = await makeClaims(args, {
      functionName: 'application:searchNotes',
      operation: 'query',
    })
    const substitutions: ServiceCallProofV1[] = [
      await makeClaims(args, {
        functionName: 'application:searchNotes',
        operation: 'query',
        overrides: { issuer: `${PROOF_ISSUER}-other` },
      }),
      await makeClaims(args, {
        functionName: 'application:searchNotes',
        operation: 'query',
        overrides: { audience: `${PROOF_AUDIENCE}-other` },
      }),
      await makeClaims(args, {
        functionName: 'application:searchNotes',
        operation: 'query',
        overrides: { serviceId: `${SERVICE_ID}-other` },
      }),
      await makeClaims(args, {
        functionName: 'application:searchNotes',
        operation: 'mutation',
      }),
      await makeClaims(args, { functionName: 'application:renameNote', operation: 'query' }),
      await makeClaims(args, {
        functionName: 'application:searchNotes',
        mcp: { issuer: 'https://other.example.test/' },
        operation: 'query',
      }),
      await makeClaims(args, {
        functionName: 'application:searchNotes',
        mcp: { resource: 'https://other.example.test/mcp' },
        operation: 'query',
      }),
      await makeClaims(args, {
        functionName: 'application:searchNotes',
        mcp: { scopes: ['notes:other'] },
        operation: 'query',
      }),
      await makeClaims(args, {
        expiresAt: Math.floor(Date.now() / 1_000),
        functionName: 'application:searchNotes',
        issuedAt: Math.floor(Date.now() / 1_000) - 15,
        operation: 'query',
      }),
      await makeClaims(args, {
        expiresAt: Math.floor(Date.now() / 1_000) + 2,
        functionName: 'application:searchNotes',
        issuedAt: Math.floor(Date.now() / 1_000) + 1,
        operation: 'query',
      }),
    ]
    for (const claims of substitutions) {
      const result = await invoke('/exact-call/query/search-notes', args, { claims })
      expect(result.response.status).toBe(401)
      expect(result.json).toEqual({ code: 'EXACT_CALL_REJECTED' })
    }

    const changedArgs = { ...args, query: 'changed-after-signing' }
    const changed = await invoke('/exact-call/query/search-notes', changedArgs, { claims: valid })
    expect(changed.response.status).toBe(401)
    expect(changed.json).toEqual({ code: 'EXACT_CALL_REJECTED' })

    const validProof = await signServiceCallProof(valid, activePrivateKey)
    for (const alternateEncoding of [
      '{"workspaceId":"workspace-a","query":"alpha"}',
      '{"__proto__":{"query":"changed"},"query":"alpha","workspaceId":"workspace-a"}',
    ]) {
      const alternate = await invokeEncoded(
        '/exact-call/query/search-notes',
        alternateEncoding,
        validProof,
      )
      expect(alternate.response.status).toBe(400)
      expect(alternate.json).toEqual({ code: 'EXACT_CALL_BODY_INVALID' })
      expect(alternate.body).not.toContain(validProof)
    }

    const retainedClaims = await makeClaims(args, {
      functionName: 'application:searchNotes',
      keyId: RETAINED_KEY_ID,
      operation: 'query',
    })
    const retained = await invoke('/exact-call/query/search-notes', args, {
      claims: retainedClaims,
      privateKey: retainedPrivateKey,
    })
    expect(retained.response.status).toBe(200)

    const retiredClaims = await makeClaims(args, {
      functionName: 'application:searchNotes',
      keyId: RETIRED_KEY_ID,
      operation: 'query',
    })
    const retired = await invoke('/exact-call/query/search-notes', args, {
      claims: retiredClaims,
      privateKey: retiredPrivateKey,
    })
    expect(retired.response.status).toBe(401)
    expect(retired.json).toEqual({ code: 'EXACT_CALL_REJECTED' })

    const unknownClaimProof = await signRaw({ ...valid, unexpected: true }, activePrivateKey, {
      alg: 'EdDSA',
      kid: ACTIVE_KEY_ID,
      typ: 'bcn-service-call+jws',
    })
    const unknownClaim = await invoke('/exact-call/query/search-notes', args, {
      proof: unknownClaimProof,
    })
    expect(unknownClaim.response.status).toBe(401)
    expect(unknownClaim.json).toEqual({ code: 'EXACT_CALL_REJECTED' })

    const wrongAlgorithmProof = await signRaw(valid, activePrivateKey, {
      alg: 'HS256',
      kid: ACTIVE_KEY_ID,
      typ: 'bcn-service-call+jws',
    })
    const wrongAlgorithm = await invoke('/exact-call/query/search-notes', args, {
      proof: wrongAlgorithmProof,
    })
    expect(wrongAlgorithm.response.status).toBe(401)
    expect(wrongAlgorithm.json).toEqual({ code: 'EXACT_CALL_REJECTED' })

    const injectedArgs = { ...args, proof: await signServiceCallProof(valid, activePrivateKey) }
    const injectedClaims = await makeClaims(injectedArgs, {
      functionName: 'application:searchNotes',
      operation: 'query',
    })
    const collision = await invoke('/exact-call/query/search-notes', injectedArgs, {
      claims: injectedClaims,
    })
    expect(collision.response.status).toBe(400)
    expect(collision.json).toEqual({ code: 'EXACT_CALL_ARGUMENTS_INVALID' })
    expect(collision.body).not.toContain(injectedArgs.proof)

    const wrongExplicitRoute = await invoke('/exact-call/mutation/rename-note', args, {
      claims: valid,
    })
    expect(wrongExplicitRoute.response.status).toBe(400)
    expect(wrongExplicitRoute.json).toEqual({ code: 'EXACT_CALL_ARGUMENTS_INVALID' })
  })
})
