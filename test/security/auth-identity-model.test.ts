import type { ConvexClient } from 'convex/browser'
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import {
  LOADING_IDENTITY,
  toAuthenticatedIdentity,
  type AuthIdentity,
} from '../../src/runtime/auth/auth-identity'
import {
  createConvexAuthCoordinator,
  type AuthClientWithConvex,
  type ConvexAuthCoordinator,
  type ConvexAuthCoordinatorState,
} from '../../src/runtime/auth/client-engine'
import type { AuthIdentityPort } from '../../src/runtime/auth/identity-port'

type Subject = 'anonymous' | 'A' | 'B'
type TokenResponse = { data?: { token: string | null } | null; error?: unknown }

interface Deferred<Value> {
  promise: Promise<Value>
  resolve: (value: Value) => void
}

interface AuthConfiguration {
  client: number
  onChange: (authenticated: boolean) => void
  token: string | null | undefined
}

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function jwt(subject: Exclude<Subject, 'anonymous'>, serial: number): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode({
    sub: subject,
    serial,
    exp: Math.floor(Date.now() / 1_000) + 3_600,
  })}.sig`
}

function tokenSubject(token: string | null | undefined): Subject | 'pending' {
  if (token === undefined) return 'pending'
  if (token === null) return 'anonymous'
  const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as {
    sub: Subject
  }
  return payload.sub
}

async function flushMicrotasks(turns = 12): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

async function waitUntil(
  predicate: () => boolean,
  failureMessage: string,
  turns = 100,
): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    if (predicate()) return
    await Promise.resolve()
  }
  throw new Error(failureMessage)
}

/** Small deterministic PRNG. The seed is included in every model failure. */
function randomFor(seed: number): () => number {
  let state = seed | 0
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 0x1_0000_0000
  }
}

function shuffle<Value>(values: readonly Value[], random: () => number): Value[] {
  const shuffled = [...values]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!]
  }
  return shuffled
}

function responseFor(subject: Exclude<Subject, 'anonymous'>, serial: number): TokenResponse {
  return { data: { token: jwt(subject, serial) }, error: null }
}

interface Harness {
  coordinator: ConvexAuthCoordinator
  state: ConvexAuthCoordinatorState
  configurations: AuthConfiguration[]
  enqueueResponse(response: TokenResponse | Promise<TokenResponse>): void
  subject(): Subject
  snapshot(): ReturnType<AuthIdentityPort['snapshot']>
  dispose(): void
}

async function createHarness(initial: Subject): Promise<Harness> {
  const state: ConvexAuthCoordinatorState = {
    identity: ref<AuthIdentity>(
      initial === 'anonymous'
        ? LOADING_IDENTITY
        : toAuthenticatedIdentity(jwt(initial, 0), { id: initial }),
    ),
    pending: ref(initial === 'anonymous'),
    authError: ref<string | null>(null),
  }
  const responses: Array<TokenResponse | Promise<TokenResponse>> = []
  if (initial === 'anonymous') responses.push({ data: null, error: null })

  const authClient = {
    convex: {
      token: async (): Promise<TokenResponse> => {
        const response = responses.shift()
        if (!response) throw new Error('model exhausted its token-exchange script')
        return await response
      },
    },
    signIn: {},
    signUp: {},
    signOut: async () => ({ data: { success: true }, error: null }),
  } as unknown as AuthClientWithConvex

  const configurations: AuthConfiguration[] = []
  let clientOrdinal = 0
  const makeClient = (): ConvexClient => {
    const client = (clientOrdinal += 1)
    return {
      setAuth(
        fetchToken: (options: { forceRefreshToken: boolean }) => Promise<string | null>,
        onChange: (authenticated: boolean) => void,
      ) {
        const configuration: AuthConfiguration = {
          client,
          onChange,
          token: undefined,
        }
        configurations.push(configuration)
        void fetchToken({ forceRefreshToken: false }).then((token) => {
          configuration.token = token
        })
      },
      query: async () => ({}),
      mutation: async () => ({}),
      action: async () => ({}),
      onUpdate: () => () => {},
      connectionState: () => ({}),
      subscribeToConnectionState: () => () => {},
      close: async () => {},
    } as unknown as ConvexClient
  }

  const coordinator = createConvexAuthCoordinator({ authClient, state })
  let observedGeneration = coordinator.port.snapshot().identityGeneration
  coordinator.port.subscribe(() => {
    const snapshot = coordinator.port.snapshot()
    if (snapshot.identityGeneration === observedGeneration) return
    observedGeneration = snapshot.identityGeneration
    void coordinator.port
      .initializePrimary(makeClient())
      .catch((error) => coordinator.port.failPrimary(snapshot.identityGeneration, error))
  })
  coordinator.attachPrimary(makeClient())

  if (initial === 'anonymous') {
    await coordinator.ready({ timeoutMs: 0 })
  } else {
    await waitUntil(
      () => configurations[0]?.token !== undefined,
      'initial hydrated configuration did not fetch its token',
    )
    configurations[0]!.onChange(true)
    await coordinator.ready({ timeoutMs: 0 })
  }

  return {
    coordinator,
    state,
    configurations,
    enqueueResponse(response) {
      responses.push(response)
    },
    subject() {
      const user = coordinator.user.value as { id?: unknown } | null
      return user?.id === 'A' || user?.id === 'B' ? user.id : 'anonymous'
    },
    snapshot: () => coordinator.port.snapshot(),
    dispose: () => coordinator.dispose(),
  }
}

function assertAtomicPublicIdentity(
  harness: Harness,
  seed: number,
  trace: readonly string[],
): void {
  const tokenPresent = harness.coordinator.token.value !== null
  const userPresent = harness.coordinator.user.value !== null
  if (tokenPresent !== userPresent) {
    throw new Error(
      `token/user split state (seed=${seed}; trace=${trace.join(' -> ')}; token=${tokenPresent}; user=${userPresent})`,
    )
  }
}

describe('seeded auth identity model', () => {
  it('latest session revision wins under shuffled exchanges and stale confirmations', async () => {
    const subjects = ['anonymous', 'A', 'B'] as const

    for (let seed = 1; seed <= 48; seed += 1) {
      const random = randomFor(seed)
      const initial = subjects[seed % subjects.length]!
      const commands: Subject[] = [
        subjects[(seed + 1) % subjects.length]!,
        subjects[(seed + 2) % subjects.length]!,
        subjects[Math.floor(random() * subjects.length)]!,
        subjects[Math.floor(random() * subjects.length)]!,
      ]
      const trace = [`initial:${initial}`, `commands:${commands.join(',')}`]
      const harness = await createHarness(initial)
      const exchanges: Array<{
        command: Exclude<Subject, 'anonymous'>
        deferred: Deferred<TokenResponse>
        ordinal: number
      }> = []
      const operations: Promise<void>[] = []
      let expectedSubject = initial
      let expectedGeneration = 0

      try {
        for (const [ordinal, command] of commands.entries()) {
          const epochBefore = harness.snapshot().authEpoch
          if (command === 'anonymous') {
            operations.push(harness.coordinator.reconcileSession(null))
            if (expectedSubject !== 'anonymous') expectedGeneration += 1
            expectedSubject = 'anonymous'
          } else {
            const exchange = deferred<TokenResponse>()
            harness.enqueueResponse(exchange.promise)
            exchanges.push({ command, deferred: exchange, ordinal })
            operations.push(
              harness.coordinator.reconcileSession(`session:${command}:${seed}:${ordinal}`),
            )
          }
          await flushMicrotasks()
          trace.push(`observe:${ordinal}:${command}`)
          expect(harness.snapshot().authEpoch, `seed=${seed}; ${trace.join(' -> ')}`).toBe(
            epochBefore + 1,
          )
          assertAtomicPublicIdentity(harness, seed, trace)
        }

        const latest = commands.at(-1)!
        for (const exchange of shuffle(exchanges, random)) {
          exchange.deferred.resolve(responseFor(exchange.command, seed * 10 + exchange.ordinal))
          trace.push(`exchange:${exchange.ordinal}:${exchange.command}`)
          await flushMicrotasks()
          assertAtomicPublicIdentity(harness, seed, trace)
        }

        if (latest !== 'anonymous') {
          await waitUntil(
            () =>
              harness.configurations.some(
                (configuration) => tokenSubject(configuration.token) === latest,
              ),
            `latest configuration was not installed (seed=${seed}; trace=${trace.join(' -> ')})`,
          )

          // A callback captured by any previous auth configuration is an
          // adversarially queued stale event. Neither true nor false may mutate
          // the newer revision.
          const latestConfiguration = [...harness.configurations]
            .reverse()
            .find((configuration) => tokenSubject(configuration.token) === latest)!
          const stale = harness.configurations.filter(
            (configuration) => configuration !== latestConfiguration,
          )
          if (stale.length > 0) {
            const staleConfiguration = stale[Math.floor(random() * stale.length)]!
            const staleVerdict = random() >= 0.5
            staleConfiguration.onChange(staleVerdict)
            trace.push(`stale-confirm:${staleConfiguration.client}:${staleVerdict}`)
            await flushMicrotasks()
          }

          latestConfiguration.onChange(true)
          trace.push(`confirm:${latestConfiguration.client}:${latest}`)
          if (expectedSubject !== latest) expectedGeneration += 1
          expectedSubject = latest
          await flushMicrotasks()
        }

        await Promise.all(operations)
        expect(harness.subject(), `seed=${seed}; ${trace.join(' -> ')}`).toBe(expectedSubject)
        expect(harness.snapshot().identityGeneration, `seed=${seed}; ${trace.join(' -> ')}`).toBe(
          expectedGeneration,
        )
        expect(harness.snapshot().authEpoch, `seed=${seed}; ${trace.join(' -> ')}`).toBe(
          commands.length,
        )
        assertAtomicPublicIdentity(harness, seed, trace)

        const finalState = {
          subject: harness.subject(),
          token: harness.coordinator.token.value,
          snapshot: harness.snapshot(),
        }
        harness.dispose()
        for (const configuration of shuffle(harness.configurations, random)) {
          configuration.onChange(random() >= 0.5)
        }
        await flushMicrotasks()
        expect(
          {
            subject: harness.subject(),
            token: harness.coordinator.token.value,
            snapshot: harness.snapshot(),
          },
          `post-disposal mutation (seed=${seed}; trace=${trace.join(' -> ')})`,
        ).toEqual(finalState)
      } finally {
        harness.dispose()
        await Promise.allSettled(operations)
      }
    }
  })

  it('settles a crossed B generation when a newer revision returns to A', async () => {
    const harness = await createHarness('A')
    const toBResponse = responseFor('B', 1)
    const toAResponse = responseFor('A', 2)
    harness.enqueueResponse(toBResponse)
    harness.enqueueResponse(toAResponse)
    let toBSettled = false
    let toASettled = false

    const toB = harness.coordinator.reconcileSession('session:B:1').finally(() => {
      toBSettled = true
    })

    try {
      await waitUntil(
        () =>
          harness.configurations.some((configuration) => tokenSubject(configuration.token) === 'B'),
        'B replacement configuration was not installed',
      )
      const bConfiguration = harness.configurations.find(
        (configuration) => tokenSubject(configuration.token) === 'B',
      )!

      // Do not confirm B. A newer canonical session revision returns to the
      // last published subject A after the B generation boundary was crossed.
      const toA = harness.coordinator.reconcileSession('session:A:2').finally(() => {
        toASettled = true
      })
      await waitUntil(
        () =>
          harness.configurations.some(
            (configuration) =>
              configuration !== harness.configurations[0] &&
              tokenSubject(configuration.token) === 'A',
          ),
        'superseding A configuration was not installed',
      )
      const aConfiguration = [...harness.configurations]
        .reverse()
        .find(
          (configuration) =>
            configuration !== harness.configurations[0] &&
            tokenSubject(configuration.token) === 'A',
        )!
      aConfiguration.onChange(true)
      await flushMicrotasks()
      await toA

      // Superseding the B install must release both the B install promise and
      // its generation deferred immediately. A timeout-based eventual release
      // is not sufficient because the superseding configuration canceled that
      // deadline and the caller would otherwise hang forever.
      expect(toASettled).toBe(true)
      expect(toBSettled).toBe(true)
      await toB
      expect(harness.subject()).toBe('A')
      expect(harness.snapshot()).toMatchObject({
        identityKey: 'user:A',
        identityGeneration: 2,
      })

      const final = {
        subject: harness.subject(),
        token: harness.coordinator.token.value,
        snapshot: harness.snapshot(),
      }
      bConfiguration.onChange(true)
      bConfiguration.onChange(false)
      await flushMicrotasks()
      expect({
        subject: harness.subject(),
        token: harness.coordinator.token.value,
        snapshot: harness.snapshot(),
      }).toEqual(final)
    } finally {
      harness.dispose()
      await Promise.allSettled([toB])
    }
  })
})
