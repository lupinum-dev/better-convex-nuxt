import type { ConnectionState, ConvexClient } from 'convex/browser'

import { createAttachedClientRuntime, type AttachedClientRuntime } from './attached-runtime'
import {
  createAuthAdapterIdentityPort,
  type BrowserAuthAdapter,
  type AuthAdapterIdentityPort,
} from './auth-adapter'
import {
  createConvexClientOwner,
  type ConvexClientHandle,
  type ConvexClientOwner,
  type OwnedConvexClient,
} from './client-owner'
import type { ClientIdentityObserver, ClientIdentitySnapshot } from './identity-port'

export interface BetterConvexBrowserRuntime {
  readonly handle: ConvexClientHandle
  readonly identity: ClientIdentityObserver
  readonly attachment: AttachedClientRuntime
  readonly connection: ConvexClientOwner['connection']
  ready(): Promise<void>
  dispose(): Promise<void>
}

export interface CreateBetterConvexBrowserRuntimeInput {
  clientFactory: () => OwnedConvexClient
  auth?: BrowserAuthAdapter
  onRetiredClientCloseError?: (cause: unknown) => void
}

const ANONYMOUS_SNAPSHOT: ClientIdentitySnapshot = Object.freeze({
  authEnabled: false,
  settled: true,
  identityKey: 'anonymous',
  authEpoch: 0,
  identityGeneration: 0,
  error: null,
})

const ANONYMOUS_OBSERVER: ClientIdentityObserver = Object.freeze({
  snapshot: () => ANONYMOUS_SNAPSHOT,
  waitForInitialSettlement: () => Promise.resolve(),
  subscribe: () => () => {},
})

/** Private single constructor that moves intact into the Vue package. */
export function createBetterConvexBrowserRuntime(
  input: CreateBetterConvexBrowserRuntimeInput,
): BetterConvexBrowserRuntime {
  const authPort: AuthAdapterIdentityPort | null = input.auth
    ? createAuthAdapterIdentityPort(input.auth)
    : null
  const owner = createConvexClientOwner({
    primaryFactory: input.clientFactory,
    ...(authPort ? { anonymousFactory: input.clientFactory } : {}),
    onRetiredClientCloseError: input.onRetiredClientCloseError,
  })
  const identity = authPort ?? ANONYMOUS_OBSERVER
  let disposed = false

  if (authPort) owner.attachIdentityPort(authPort)

  const primary = owner.getPrimary()?.client
  const initial =
    authPort && primary && input.auth?.snapshot().status !== 'loading'
      ? authPort.initializePrimary(primary as ConvexClient).catch((cause) => {
          authPort.failPrimary(authPort.snapshot().identityGeneration, cause)
        })
      : Promise.resolve()

  owner.addDisposer(() => authPort?.dispose())
  const attachment = createAttachedClientRuntime({ client: owner.handle, identity })

  return Object.freeze({
    handle: owner.handle,
    identity,
    attachment,
    connection: owner.connection,
    async ready() {
      await initial
      await identity.waitForInitialSettlement()
    },
    async dispose() {
      if (disposed) return
      disposed = true
      await owner.dispose()
    },
  })
}

export type { ConnectionState }
