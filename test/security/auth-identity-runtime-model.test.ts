import type { ConvexClient } from 'convex/browser'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { LOADING_IDENTITY, type AuthIdentity } from '../../src/runtime/auth/auth-identity'
import {
  createConvexAuthCoordinator,
  type AuthClientWithConvex,
  type ConvexAuthCoordinator,
  type ConvexAuthCoordinatorState,
} from '../../src/runtime/auth/client-engine'
import {
  createConvexClientOwner,
  type ConvexClientOwner,
  type OwnedConvexClient,
} from '../../src/runtime/client-core/client-owner'
import { IDENTITY_CHANGED } from '../../src/runtime/client-core/identity-changed-error'
import { MockConvexClient, mockFnRef } from '../helpers/mock-convex-client'

type Subject = 'A' | 'B'

interface SignInInput {
  subject: Subject
  lifetimeMs: number
}

interface ModelTrace {
  seed: number
  hmrCycle: number
  events: string[]
}

interface ModelHarness {
  authClient: AuthClientWithConvex
  clients: RuntimeModelClient[]
  coordinator: ConvexAuthCoordinator
  owner: ConvexClientOwner
  state: ConvexAuthCoordinatorState
  setClock(value: number): void
  server: {
    subject: Subject | null
    expiresAtMs: number
    signInCalls: number
    signOutCalls: number
    tokenCalls: number
  }
}

const STREAM = mockFnRef<'query'>('model:stream')
const READ = mockFnRef<'query'>('model:read')
const WRITE = mockFnRef<'mutation'>('model:write')
const RUN = mockFnRef<'action'>('model:run')
const HANG = {
  query: mockFnRef<'query'>('model:hang-query'),
  mutation: mockFnRef<'mutation'>('model:hang-mutation'),
  action: mockFnRef<'action'>('model:hang-action'),
} as const

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

function traceLabel(trace: ModelTrace): string {
  return `seed=${trace.seed}; hmr=${trace.hmrCycle}; trace=${trace.events.join(' -> ')}`
}

async function flushMicrotasks(turns = 12): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

async function waitUntil(
  predicate: () => boolean,
  trace: ModelTrace,
  failureMessage: string,
  turns = 200,
): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    if (predicate()) return
    await Promise.resolve()
  }
  throw new Error(`${failureMessage} (${traceLabel(trace)})`)
}

function jwt(subject: Subject, expiresAtMs: number): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode({
    sub: subject,
    exp: Math.floor(expiresAtMs / 1_000),
  })}.sig`
}

function tokenSubject(token: string | null): Subject | 'anonymous' {
  if (!token) return 'anonymous'
  const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as {
    sub: Subject
  }
  return payload.sub
}

class RuntimeModelClient extends MockConvexClient {
  subject: Subject | 'anonymous' = 'anonymous'
  closeCalls = 0
  closed = false
  readonly authCallbacks: Array<(authenticated: boolean) => void> = []

  constructor(readonly ordinal: number) {
    super()
    this.setQueryHandler('model:read', () => this.subject)
    this.setMutationHandler('model:write', () => this.subject)
    this.setActionHandler('model:run', () => this.subject)
    this.setQueryHandler('model:hang-query', () => new Promise<never>(() => {}))
    this.setMutationHandler('model:hang-mutation', () => new Promise<never>(() => {}))
    this.setActionHandler('model:hang-action', () => new Promise<never>(() => {}))
  }

  setAuth(
    fetchToken: (options: { forceRefreshToken: boolean }) => Promise<string | null>,
    onChange: (authenticated: boolean) => void,
  ): void {
    this.authCallbacks.push(onChange)
    void fetchToken({ forceRefreshToken: false }).then((token) => {
      if (this.closed) return
      this.subject = tokenSubject(token)
      onChange(token !== null)
    })
  }

  close = async (): Promise<void> => {
    this.closeCalls += 1
    this.closed = true
  }
}

function createHarness(initialClockMs: number): ModelHarness {
  let clockMs = initialClockMs
  const server = {
    subject: null as Subject | null,
    expiresAtMs: initialClockMs + 3_600_000,
    signInCalls: 0,
    signOutCalls: 0,
    tokenCalls: 0,
  }

  const signIn = {
    email: async (input: SignInInput) => {
      server.signInCalls += 1
      server.subject = input.subject
      server.expiresAtMs = clockMs + input.lifetimeMs
      return { data: { token: `session:${input.subject}` }, error: null }
    },
  }
  const authClient = {
    convex: {
      token: async () => {
        server.tokenCalls += 1
        if (!server.subject) return { data: null, error: null }
        return {
          data: { token: jwt(server.subject, server.expiresAtMs) },
          error: null,
        }
      },
    },
    signIn,
    signUp: signIn,
    signOut: async () => {
      server.signOutCalls += 1
      server.subject = null
      return { data: { success: true }, error: null }
    },
  } as unknown as AuthClientWithConvex

  const state: ConvexAuthCoordinatorState = {
    identity: ref<AuthIdentity>(LOADING_IDENTITY),
    pending: ref(true),
    authError: ref<string | null>(null),
  }
  const coordinator = createConvexAuthCoordinator({ authClient, state })
  const clients: RuntimeModelClient[] = []
  const makeClient = (): OwnedConvexClient => {
    const client = new RuntimeModelClient(clients.length + 1)
    clients.push(client)
    return client as unknown as OwnedConvexClient
  }
  const owner = createConvexClientOwner({
    primaryFactory: makeClient,
    anonymousFactory: makeClient,
  })
  owner.attachAuthPort(coordinator.port)
  coordinator.attachPrimary(owner.getPrimary()!.client as ConvexClient)

  return {
    authClient,
    clients,
    coordinator,
    owner,
    state,
    server,
    setClock(value) {
      clockMs = value
    },
  }
}

function currentClient(harness: ModelHarness): RuntimeModelClient {
  return harness.owner.getPrimary()!.client as unknown as RuntimeModelClient
}

function dispatchHangingCall(
  harness: ModelHarness,
  method: 'query' | 'mutation' | 'action',
): Promise<unknown> {
  if (method === 'query') return harness.owner.handle.query(HANG.query, {})
  if (method === 'mutation') return harness.owner.handle.mutation(HANG.mutation, {})
  return harness.owner.handle.action(HANG.action, {})
}

async function waitForPublishedSubject(
  harness: ModelHarness,
  subject: Subject | 'anonymous',
  trace: ModelTrace,
): Promise<void> {
  await waitUntil(
    () => {
      const primary = harness.owner.getPrimary()
      return (
        Boolean(primary) &&
        primary!.identityGeneration === harness.coordinator.port.snapshot().identityGeneration &&
        (primary!.client as unknown as RuntimeModelClient).subject === subject &&
        (harness.coordinator.user.value?.id ?? 'anonymous') === subject
      )
    },
    trace,
    `subject ${subject} was not published atomically`,
  )
}

async function wrappedSignIn(
  harness: ModelHarness,
  subject: Subject,
  lifetimeMs: number,
  trace: ModelTrace,
  delayTurns: number,
): Promise<void> {
  const callsBefore = harness.server.signInCalls
  const integrated = harness.coordinator.integratedSignIn as {
    email(input: SignInInput): Promise<unknown>
  }
  const operation = integrated.email({ subject, lifetimeMs })
  await waitUntil(
    () => harness.server.signInCalls === callsBefore + 1,
    trace,
    'wrapped sign-in did not invoke the underlying method',
  )
  await flushMicrotasks(delayTurns)
  await harness.coordinator.reconcileSession(`session:${subject}`)
  await operation
  trace.events.push(`wrapped-sign-in:${subject}`)
  await waitForPublishedSubject(harness, subject, trace)
}

async function rawSignIn(
  harness: ModelHarness,
  subject: Subject,
  lifetimeMs: number,
  trace: ModelTrace,
): Promise<void> {
  const raw = harness.authClient.signIn as unknown as {
    email(input: SignInInput): Promise<unknown>
  }
  await raw.email({ subject, lifetimeMs })
  await harness.coordinator.reconcileSession(`session:${subject}`)
  trace.events.push(`raw-sign-in:${subject}`)
  await waitForPublishedSubject(harness, subject, trace)
}

async function rawSignOut(harness: ModelHarness, trace: ModelTrace): Promise<void> {
  await harness.authClient.signOut()
  await harness.coordinator.reconcileSession(null)
  trace.events.push('raw-sign-out')
  await waitForPublishedSubject(harness, 'anonymous', trace)
}

async function coordinatedSignOut(harness: ModelHarness, trace: ModelTrace): Promise<void> {
  const callsBefore = harness.server.signOutCalls
  const operation = harness.coordinator.signOut()
  await waitUntil(
    () => harness.server.signOutCalls === callsBefore + 1,
    trace,
    'coordinated sign-out did not invoke the underlying method',
  )
  await harness.coordinator.reconcileSession(null)
  await operation
  trace.events.push('coordinated-sign-out')
  await waitForPublishedSubject(harness, 'anonymous', trace)
}

async function assertDispatchSurfaces(
  harness: ModelHarness,
  subject: Subject | 'anonymous',
  random: () => number,
  trace: ModelTrace,
): Promise<void> {
  const operations = shuffle(
    [
      () => harness.owner.handle.query(READ, {}),
      () => harness.owner.handle.mutation(WRITE, {}),
      () => harness.owner.handle.action(RUN, {}),
    ],
    random,
  )
  for (const operation of operations) {
    await expect(operation(), traceLabel(trace)).resolves.toBe(subject)
  }
}

function assertLiveResources(
  harness: ModelHarness,
  expectedListeners: number,
  expectedConnectionSubscribers: number,
  trace: ModelTrace,
): void {
  expect(harness.coordinator.isPending.value, traceLabel(trace)).toBe(false)
  expect(
    harness.clients.reduce((total, client) => total + client.activeListenerCount(), 0),
    traceLabel(trace),
  ).toBe(expectedListeners)
  expect(
    harness.clients.reduce((total, client) => total + client.connectionSubscriberCount(), 0),
    traceLabel(trace),
  ).toBe(expectedConnectionSubscribers)
}

describe('seeded auth/owner runtime model', () => {
  it('covers clock expiry, auth ceremonies, dispatch, connection, and HMR resources', async () => {
    const baseClockMs = 2_000_000_000_000
    let clockMs = baseClockMs
    const now = vi.spyOn(Date, 'now').mockImplementation(() => clockMs)

    try {
      for (let seed = 1; seed <= 24; seed += 1) {
        const random = randomFor(seed)
        for (let hmrCycle = 0; hmrCycle < 2; hmrCycle += 1) {
          clockMs = baseClockMs + seed * 10_000_000 + hmrCycle * 1_000_000
          const trace: ModelTrace = { seed, hmrCycle, events: ['initial:anonymous'] }
          const harness = createHarness(clockMs)
          const firstSubject: Subject = random() >= 0.5 ? 'A' : 'B'
          const secondSubject: Subject = firstSubject === 'A' ? 'B' : 'A'
          const hangingMethod = (['query', 'mutation', 'action'] as const)[
            Math.floor(random() * 3)
          ]!
          const visibleResults: string[] = []
          let stopStream: ReturnType<ConvexClient['onUpdate']> | null = null
          let stopConnection: (() => void) | null = null

          try {
            await harness.coordinator.ready({ timeoutMs: 0 })
            await waitForPublishedSubject(harness, 'anonymous', trace)

            // Allocate the lazy `none` client as part of the resource model. It
            // stays permanently anonymous and must be closed at the HMR boundary.
            expect(
              (harness.owner.getAnonymous() as unknown as RuntimeModelClient).subject,
              traceLabel(trace),
            ).toBe('anonymous')

            stopStream = harness.owner.handle.onUpdate(STREAM, {}, (value) => {
              visibleResults.push(String(value))
            })
            stopConnection = harness.owner.connection.addConsumer()
            assertLiveResources(harness, 1, 1, trace)

            await wrappedSignIn(
              harness,
              firstSubject,
              3_600_000,
              trace,
              1 + Math.floor(random() * 4),
            )
            await assertDispatchSurfaces(harness, firstSubject, random, trace)

            // Same-user raw rotation changes the auth epoch without replacing
            // the client's identity generation or duplicating subscriptions.
            const generationBeforeRotation = harness.coordinator.port.snapshot().identityGeneration
            await rawSignIn(harness, firstSubject, 3_500_000, trace)
            expect(harness.coordinator.port.snapshot().identityGeneration, traceLabel(trace)).toBe(
              generationBeforeRotation,
            )
            assertLiveResources(harness, 1, 1, trace)

            const retired = currentClient(harness)
            const queuedRetiredResult = retired.queuedQueryResultByPath(
              'model:stream',
              `stale:${firstSubject}`,
            )
            const callsBefore = retired.calls[hangingMethod].length
            const hangingCall = dispatchHangingCall(harness, hangingMethod)
            const hangingOutcome = hangingCall.then(
              (value: unknown) => ({ status: 'resolved' as const, value }),
              (error: unknown) => ({ status: 'rejected' as const, error }),
            )
            await waitUntil(
              () => retired.calls[hangingMethod].length === callsBefore + 1,
              trace,
              `${hangingMethod} was not dispatched before the generation boundary`,
            )

            // A raw identity switch crosses the owner generation boundary. The
            // consumer-held call settles, while its retired underlying promise
            // is allowed to remain abandoned behind a closed client.
            await rawSignIn(harness, secondSubject, 40_000, trace)
            const rejected = await hangingOutcome
            expect(rejected.status, traceLabel(trace)).toBe('rejected')
            if (rejected.status === 'rejected') {
              expect(rejected.error, traceLabel(trace)).toMatchObject({
                code: IDENTITY_CHANGED,
              })
            }
            expect(retired.closeCalls, traceLabel(trace)).toBe(1)

            const snapshotBeforeStaleCallbacks = harness.coordinator.port.snapshot()
            queuedRetiredResult()
            retired.updateConnectionState({
              isWebSocketConnected: true,
              connectionCount: 99,
            })
            await flushMicrotasks()
            expect(visibleResults, traceLabel(trace)).not.toContain(`stale:${firstSubject}`)
            expect(harness.coordinator.port.snapshot(), traceLabel(trace)).toEqual(
              snapshotBeforeStaleCallbacks,
            )

            const connected = currentClient(harness)
            connected.updateConnectionState({
              isWebSocketConnected: false,
              connectionRetries: 1 + Math.floor(random() * 5),
            })
            expect(
              harness.owner.connection.state.value.isWebSocketConnected,
              traceLabel(trace),
            ).toBe(false)
            connected.updateConnectionState({
              isWebSocketConnected: true,
              hasEverConnected: true,
              connectionCount: 1,
            })
            expect(
              harness.owner.connection.state.value.isWebSocketConnected,
              traceLabel(trace),
            ).toBe(true)
            connected.emitQueryResultByPath('model:stream', `fresh:${secondSubject}`)
            expect(visibleResults.at(-1), traceLabel(trace)).toBe(`fresh:${secondSubject}`)
            assertLiveResources(harness, 1, 1, trace)
            await assertDispatchSurfaces(harness, secondSubject, random, trace)

            // The token was accepted with 40s remaining. Move the local clock
            // beyond the 30s safety window: refresh must not retain a no-longer-
            // usable authenticated principal merely because the exchange error
            // is classified as transient.
            clockMs += 11_000
            harness.setClock(clockMs)
            const generationBeforeExpiry = harness.coordinator.port.snapshot().identityGeneration
            await harness.coordinator.refresh()
            trace.events.push('clock:+11s:token-unusable')
            await waitForPublishedSubject(harness, 'anonymous', trace)
            expect(harness.coordinator.port.snapshot().identityGeneration, traceLabel(trace)).toBe(
              generationBeforeExpiry + 1,
            )
            expect(harness.coordinator.token.value, traceLabel(trace)).toBeNull()
            expect(harness.coordinator.user.value, traceLabel(trace)).toBeNull()
            await assertDispatchSurfaces(harness, 'anonymous', random, trace)

            // Correcting the local clock cannot resurrect a server session that
            // has since ended. A later canonical operation is required.
            harness.server.subject = null
            clockMs -= 20_000
            harness.setClock(clockMs)
            const snapshotBeforeClockCorrection = harness.coordinator.port.snapshot()
            await harness.coordinator.refresh()
            trace.events.push('clock:-20s:no-session')
            expect(harness.coordinator.port.snapshot().identityGeneration, traceLabel(trace)).toBe(
              snapshotBeforeClockCorrection.identityGeneration,
            )
            await waitForPublishedSubject(harness, 'anonymous', trace)

            await wrappedSignIn(
              harness,
              firstSubject,
              3_600_000,
              trace,
              1 + Math.floor(random() * 4),
            )
            await rawSignOut(harness, trace)
            await wrappedSignIn(
              harness,
              secondSubject,
              3_600_000,
              trace,
              1 + Math.floor(random() * 4),
            )
            await coordinatedSignOut(harness, trace)
            await assertDispatchSurfaces(harness, 'anonymous', random, trace)
            assertLiveResources(harness, 1, 1, trace)
          } finally {
            const publicStateBeforeDispose = {
              identity: harness.state.identity.value,
              token: harness.coordinator.token.value,
              user: harness.coordinator.user.value,
              pending: harness.state.pending.value,
              error: harness.state.authError.value,
              snapshot: harness.coordinator.port.snapshot(),
              visibleResults: [...visibleResults],
            }
            const lateAuthCallbacks = harness.clients.flatMap((client) => client.authCallbacks)
            const lateStreamDeliveries = harness.clients.map((client) =>
              client.queuedQueryResultByPath('model:stream', `late:${client.ordinal}`),
            )
            stopStream?.()
            stopConnection?.()
            harness.coordinator.dispose()
            await harness.owner.dispose()

            // Already-queued work from the replaced module instance must be
            // inert after teardown. Exercise both verdicts, captured stream
            // callbacks, and connection notifications from every old client.
            for (const [index, callback] of lateAuthCallbacks.entries()) {
              callback(index % 2 === 0)
            }
            for (const deliver of lateStreamDeliveries) deliver()
            for (const client of harness.clients) {
              client.updateConnectionState({
                isWebSocketConnected: true,
                connectionCount: 999,
              })
            }
            await flushMicrotasks()

            // One dispose/remount cycle is the model's HMR boundary. Every
            // allocated socket-shaped client is closed exactly once, all
            // listeners are detached, and every public operation has settled.
            expect(harness.coordinator.isPending.value, traceLabel(trace)).toBe(false)
            assertLiveResources(harness, 0, 0, trace)
            expect(
              harness.clients.every((client) => client.closeCalls === 1 && client.closed),
              traceLabel(trace),
            ).toBe(true)
            expect(
              {
                identity: harness.state.identity.value,
                token: harness.coordinator.token.value,
                user: harness.coordinator.user.value,
                pending: harness.state.pending.value,
                error: harness.state.authError.value,
                snapshot: harness.coordinator.port.snapshot(),
                visibleResults,
              },
              traceLabel(trace),
            ).toEqual(publicStateBeforeDispose)
          }
        }
      }
    } finally {
      now.mockRestore()
    }
  })
})
