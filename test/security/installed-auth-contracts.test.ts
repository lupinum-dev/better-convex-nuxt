import { execFileSync } from 'node:child_process'
import { createPublicKey, verify as verifySignature } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { convexAdapter } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { parseSetCookieHeader } from 'better-auth/cookies'
import { twoFactor } from 'better-auth/plugins'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const projectRoot = join(import.meta.dirname, '../..')

const findPackage = (entrypoint: string, expectedName: string) => {
  let directory = dirname(require.resolve(entrypoint))
  while (directory !== dirname(directory)) {
    const manifestPath = join(directory, 'package.json')
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        name?: string
        version?: string
      }
      if (manifest.name === expectedName && manifest.version) {
        return { directory, version: manifest.version }
      }
    } catch {
      // Continue toward the filesystem root until the owning package is found.
    }
    directory = dirname(directory)
  }
  throw new Error(`Could not resolve the installed ${expectedName} package`)
}

const betterAuthPackage = findPackage('better-auth', 'better-auth')
const betterAuthCorePackage = findPackage('@better-auth/core/context', '@better-auth/core')
const convexBetterAuthPackage = findPackage(
  '@convex-dev/better-auth/package.json',
  '@convex-dev/better-auth',
)

const authConfig = {
  providers: [{ applicationID: 'convex', domain: 'http://localhost:3000' }],
}

describe('exact installed auth package contracts', () => {
  it('locks this evidence to the audited package versions and Convex routes', () => {
    expect({
      betterAuth: betterAuthPackage.version,
      betterAuthCore: betterAuthCorePackage.version,
      convexBetterAuth: convexBetterAuthPackage.version,
    }).toEqual({
      betterAuth: '1.6.23',
      betterAuthCore: '1.6.23',
      convexBetterAuth: '0.12.5',
    })

    const plugin = convex({ authConfig })
    expect(plugin.id).toBe('convex')
    expect(plugin.version).toBe('0.12.5')
    expect(plugin.endpoints.getToken.path).toBe('/convex/token')
    expect(plugin.endpoints.getToken.options.method).toBe('GET')
    expect(plugin.endpoints.getJwks.path).toBe('/convex/jwks')
    expect(plugin.endpoints.rotateKeys.path).toBe('/convex/rotate-keys')
  })

  it('reproduces the Better Auth cold-start request-state race in a fresh process', () => {
    const experiment = `
      import { defineRequestState, runWithRequestState } from '@better-auth/core/context'

      const state = defineRequestState(() => 'initialized')
      let release
      const barrier = new Promise((resolve) => { release = resolve })
      const attempts = [0, 1].map(() =>
        runWithRequestState(new WeakMap(), async () => {
          await barrier
          return state.get()
        }),
      )
      release()
      const results = await Promise.allSettled(attempts)
      process.stdout.write(JSON.stringify(results.map((result) => result.status)))
    `

    const statuses = JSON.parse(
      execFileSync(process.execPath, ['--input-type=module', '--eval', experiment], {
        cwd: projectRoot,
        encoding: 'utf8',
      }),
    ) as string[]

    expect(statuses.filter((status) => status === 'fulfilled')).toHaveLength(1)
    expect(statuses.filter((status) => status === 'rejected')).toHaveLength(1)
  })

  it('demonstrates that the non-transactional increment fallback loses a concurrent MFA failure', async () => {
    let record = {
      _id: 'two-factor-row',
      secret: 'encrypted-secret',
      backupCodes: '[]',
      userId: 'user-id',
      verified: true,
      failedVerificationCount: 0,
    }
    let readCount = 0
    let releaseReads!: () => void
    const bothReadsStarted = new Promise<void>((resolve) => {
      releaseReads = resolve
    })

    const context = {
      async runQuery() {
        const snapshot = { ...record }
        readCount += 1
        if (readCount === 2) releaseReads()
        await bothReadsStarted
        return { page: [snapshot], isDone: true, continueCursor: null }
      },
      async runMutation(_handle: unknown, args: { input: { update: Partial<typeof record> } }) {
        record = { ...record, ...args.input.update }
        return { count: 1, isDone: true, continueCursor: null }
      },
    }
    const adapter = convexAdapter(
      context as never,
      { adapter: { findMany: {}, updateMany: {} } } as never,
    )({ plugins: [twoFactor()] })

    expect(adapter.options?.adapterConfig.transaction).toBe(false)

    const increments = await Promise.all([
      adapter.incrementOne({
        model: 'twoFactor',
        where: [{ field: 'id', value: record._id }],
        increment: { failedVerificationCount: 1 },
      }),
      adapter.incrementOne({
        model: 'twoFactor',
        where: [{ field: 'id', value: record._id }],
        increment: { failedVerificationCount: 1 },
      }),
    ])

    expect(
      increments.map(
        (result) =>
          (result as { failedVerificationCount?: number } | null)?.failedVerificationCount,
      ),
    ).toEqual([1, 1])
    expect(readCount).toBe(2)
    expect(record.failedVerificationCount).toBe(1)
  })

  it('proves the packaged Convex component schema rejects Better Auth 1.6.23 MFA fields', async () => {
    const pluginSchemaFields = twoFactor().schema?.twoFactor?.fields
    expect(pluginSchemaFields).toHaveProperty('failedVerificationCount')
    expect(pluginSchemaFields).toHaveProperty('lockedUntil')

    let createInput: Record<string, unknown> | undefined
    const adapter = convexAdapter(
      {
        async runMutation(_handle: unknown, args: { input: { data: Record<string, unknown> } }) {
          createInput = args.input.data
          return { ...args.input.data, _id: 'two-factor-row' }
        },
      } as never,
      { adapter: { create: {} } } as never,
    )({ plugins: [twoFactor()] })

    await adapter.create({
      model: 'twoFactor',
      data: {
        secret: 'encrypted-secret',
        backupCodes: '[]',
        userId: 'user-id',
      },
    })
    expect(createInput).toHaveProperty('failedVerificationCount', 0)

    // The component schema is not exported, so inspect its installed executable
    // schema object rather than relying on source text or line numbers.
    const schemaUrl = pathToFileURL(
      join(convexBetterAuthPackage.directory, 'dist/component/schema.js'),
    ).href
    const packagedSchema = (await import(/* @vite-ignore */ schemaUrl)) as {
      default: {
        tables: {
          twoFactor: { validator: { fields: Record<string, unknown> } }
        }
      }
    }
    const packagedFields = packagedSchema.default.tables.twoFactor.validator.fields

    expect(packagedFields).not.toHaveProperty('failedVerificationCount')
    expect(packagedFields).not.toHaveProperty('lockedUntil')
    expect(Object.keys(createInput ?? {}).filter((field) => !(field in packagedFields))).toContain(
      'failedVerificationCount',
    )
  })

  it('proves active-session listing has no matching compound index', async () => {
    const internalAdapterSource = readFileSync(
      join(betterAuthPackage.directory, 'dist/db/internal-adapter.mjs'),
      'utf8',
    )
    const listSessionsStart = internalAdapterSource.indexOf('listSessions: async')
    const listSessionsEnd = internalAdapterSource.indexOf('listUsers: async', listSessionsStart)
    const listSessionsSource = internalAdapterSource.slice(listSessionsStart, listSessionsEnd)

    expect(listSessionsStart).toBeGreaterThan(-1)
    expect(listSessionsEnd).toBeGreaterThan(listSessionsStart)
    expect(listSessionsSource.indexOf('field: "userId"')).toBeLessThan(
      listSessionsSource.indexOf('field: "expiresAt"'),
    )

    const schemaUrl = pathToFileURL(
      join(convexBetterAuthPackage.directory, 'dist/component/schema.js'),
    ).href
    const packagedSchema = (await import(/* @vite-ignore */ schemaUrl)) as {
      default: {
        tables: {
          session: { indexes: Array<{ fields: string[] }> }
        }
      }
    }
    const sessionIndexes = packagedSchema.default.tables.session.indexes.map(
      (index) => index.fields,
    )

    expect(sessionIndexes).toContainEqual(['expiresAt', 'userId'])
    expect(sessionIndexes).not.toContainEqual(['userId', 'expiresAt'])
  })
})

type AuthMemoryRow = Record<string, unknown>
type AuthMemoryDatabase = Record<string, AuthMemoryRow[]>

const createPluginOrderInstance = (order: 'convex-first' | 'two-factor-first') => {
  const database: AuthMemoryDatabase = Object.fromEntries(
    [
      'user',
      'session',
      'account',
      'verification',
      'twoFactor',
      'jwks',
      'oauthApplication',
      'oauthAccessToken',
      'oauthConsent',
    ].map((table) => [table, []]),
  )
  const databaseAdapter = (options: Parameters<ReturnType<typeof memoryAdapter>>[0]) => {
    const adapter = memoryAdapter(database as never)(options)
    return {
      ...adapter,
      options: { ...adapter.options, isRunMutationCtx: true },
    }
  }
  const convexPlugin = convex({ authConfig })
  const twoFactorPlugin = twoFactor({ skipVerificationOnEnable: true })

  return {
    auth: betterAuth({
      baseURL: 'http://localhost:3000',
      secret: 'phase-5-contract-test-secret-long-enough-for-better-auth',
      database: databaseAdapter,
      emailAndPassword: { enabled: true },
      rateLimit: { enabled: false },
      plugins:
        order === 'convex-first'
          ? [convexPlugin, twoFactorPlugin]
          : [twoFactorPlugin, convexPlugin],
    }),
    database,
  }
}

const runPreMfaSignIn = async (order: 'convex-first' | 'two-factor-first') => {
  const { auth, database } = createPluginOrderInstance(order)
  const email = `${order}@example.test`
  const password = 'phase-5-password'

  await auth.api.signUpEmail({ body: { name: 'Phase 5', email, password } })
  const initialSignIn = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  })
  const sessionToken = parseSetCookieHeader(initialSignIn.headers.get('set-cookie') ?? '').get(
    'better-auth.session_token',
  )?.value
  expect(sessionToken).toBeTruthy()

  await auth.api.enableTwoFactor({
    body: { password },
    headers: new Headers({ cookie: `better-auth.session_token=${sessionToken}` }),
  })

  const response = await auth.handler(
    new Request('http://localhost:3000/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, password }),
    }),
  )
  const body = (await response.json()) as { twoFactorRedirect?: boolean }
  const cookies = parseSetCookieHeader(response.headers.get('set-cookie') ?? '')

  expect(response.status).toBe(200)
  expect(body.twoFactorRedirect).toBe(true)
  expect(cookies.get('better-auth.session_token')?.value).toBe('')

  return { cookies, database }
}

describe('Better Auth and Convex plugin order', () => {
  it('mints a still-valid Convex JWT before MFA when the Convex plugin runs first', async () => {
    const previousSiteUrl = process.env.CONVEX_SITE_URL
    process.env.CONVEX_SITE_URL = 'http://localhost:3000'
    try {
      const unsafe = await runPreMfaSignIn('convex-first')
      const safe = await runPreMfaSignIn('two-factor-first')
      const leakedToken = unsafe.cookies.get('better-auth.convex_jwt')?.value

      expect(leakedToken).toBeTruthy()
      expect(safe.cookies.has('better-auth.convex_jwt')).toBe(false)

      const [encodedHeader, encodedPayload, encodedSignature] = leakedToken!.split('.')
      const header = JSON.parse(Buffer.from(encodedHeader!, 'base64url').toString('utf8')) as {
        alg: string
        kid: string
      }
      const payload = JSON.parse(Buffer.from(encodedPayload!, 'base64url').toString('utf8')) as {
        sessionId: string
      }
      const keyRow = unsafe.database.jwks?.find((row) => row.id === header.kid)
      expect(keyRow).toBeDefined()
      const publicKey = createPublicKey({
        key: JSON.parse(String(keyRow!.publicKey)),
        format: 'jwk',
      })

      expect(
        verifySignature(
          null,
          Buffer.from(`${encodedHeader}.${encodedPayload}`),
          publicKey,
          Buffer.from(encodedSignature!, 'base64url'),
        ),
      ).toBe(true)
      expect(unsafe.database.session?.some((session) => session.id === payload.sessionId)).toBe(
        false,
      )
    } finally {
      if (previousSiteUrl === undefined) delete process.env.CONVEX_SITE_URL
      else process.env.CONVEX_SITE_URL = previousSiteUrl
    }
  })
})

const createEmailSignupInstance = (
  options: { autoSignIn?: false; requireEmailVerification?: boolean } = {},
) => {
  const database: AuthMemoryDatabase = Object.fromEntries(
    ['user', 'session', 'account', 'verification'].map((table) => [table, []]),
  )
  return {
    auth: betterAuth({
      baseURL: 'http://localhost:3000',
      secret: 'phase-5-signup-enumeration-test-secret-0123456789',
      database: memoryAdapter(database as never),
      emailAndPassword: {
        enabled: true,
        minPasswordLength: 15,
        ...(options.autoSignIn === false ? { autoSignIn: false } : {}),
        ...(options.requireEmailVerification ? { requireEmailVerification: true } : {}),
      },
      rateLimit: { enabled: false },
    }),
    database,
  }
}

const rawEmailSignup = async (
  auth: ReturnType<typeof createEmailSignupInstance>['auth'],
  password = 'phase-5-password',
) => {
  const response = await auth.handler(
    new Request('http://localhost:3000/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({
        name: 'Enumeration Test',
        email: 'enumeration@example.test',
        password,
      }),
    }),
  )
  return {
    status: response.status,
    body: (await response.json()) as {
      code?: string
      token?: string | null
      user?: { email?: string; emailVerified?: boolean; image?: string | null; name?: string }
    },
    setCookie: response.headers.get('set-cookie'),
  }
}

const rawEmailSignIn = async (
  auth: ReturnType<typeof createEmailSignupInstance>['auth'],
  password: string,
  callbackURL?: string,
) => {
  return await auth.handler(
    new Request('http://localhost:3000/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({
        email: 'enumeration@example.test',
        password,
        ...(callbackURL === undefined ? {} : { callbackURL }),
      }),
    }),
  )
}

describe('email signup enumeration policy', () => {
  it('proves email sign-in reflects a scheme-relative callback URL', async () => {
    const { auth } = createEmailSignupInstance({ autoSignIn: false })
    const password = 'callback-phase-5-password'
    await rawEmailSignup(auth, password)

    const response = await rawEmailSignIn(auth, password, '//evil.example/path')
    const body = (await response.json()) as { redirect?: boolean; url?: string }

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBe('//evil.example/path')
    expect(body).toMatchObject({ redirect: true, url: '//evil.example/path' })
  })

  it('proves autoSignIn false is only a partial duplicate-signup mitigation on the pinned release', async () => {
    const { auth: defaultAuth } = createEmailSignupInstance()
    expect((await rawEmailSignup(defaultAuth)).status).toBe(200)
    const defaultDuplicate = await rawEmailSignup(defaultAuth)
    expect(defaultDuplicate.status).toBe(422)
    expect(defaultDuplicate.body.code).toBe('USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL')

    const { auth: hardenedAuth } = createEmailSignupInstance({ autoSignIn: false })
    const created = await rawEmailSignup(hardenedAuth)
    const duplicate = await rawEmailSignup(hardenedAuth)

    expect(created.status).toBe(200)
    expect(duplicate.status).toBe(200)
    expect(created.setCookie).toBeNull()
    expect(duplicate.setCookie).toBeNull()
    expect(Object.keys(created.body).sort()).toEqual(Object.keys(duplicate.body).sort())
    expect(created.body.user?.image).toBeUndefined()
    expect(duplicate.body.user?.image).toBeNull()
    expect({
      email: created.body.user?.email,
      emailVerified: created.body.user?.emailVerified,
      name: created.body.user?.name,
    }).toEqual({
      email: duplicate.body.user?.email,
      emailVerified: duplicate.body.user?.emailVerified,
      name: duplicate.body.user?.name,
    })
    expect(created.body.token).toBeNull()
    expect(duplicate.body.token).toBeNull()

    const attackerPassword = 'attacker-phase-5-password'
    const { auth: existingAccount } = createEmailSignupInstance({ autoSignIn: false })
    await rawEmailSignup(existingAccount, 'original-phase-5-password')
    await rawEmailSignup(existingAccount, attackerPassword)
    const existingProbe = await rawEmailSignIn(existingAccount, attackerPassword)

    const { auth: newlyCreatedAccount } = createEmailSignupInstance({ autoSignIn: false })
    await rawEmailSignup(newlyCreatedAccount, attackerPassword)
    const newProbe = await rawEmailSignIn(newlyCreatedAccount, attackerPassword)

    expect(existingProbe.status).toBe(401)
    expect(newProbe.status).toBe(200)

    const verifiedExisting = createEmailSignupInstance({
      autoSignIn: false,
      requireEmailVerification: true,
    })
    await rawEmailSignup(verifiedExisting.auth, 'original-phase-5-password')
    const verifiedUser = verifiedExisting.database.user?.[0]
    expect(verifiedUser).toBeDefined()
    verifiedUser!.emailVerified = true
    await rawEmailSignup(verifiedExisting.auth, attackerPassword)

    const unverifiedCreated = createEmailSignupInstance({
      autoSignIn: false,
      requireEmailVerification: true,
    })
    await rawEmailSignup(unverifiedCreated.auth, attackerPassword)

    expect((await rawEmailSignIn(verifiedExisting.auth, attackerPassword)).status).toBe(401)
    expect((await rawEmailSignIn(unverifiedCreated.auth, attackerPassword)).status).toBe(403)
  })
})
