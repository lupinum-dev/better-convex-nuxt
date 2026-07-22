import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { build } from 'vite'
import { describe, expect, it } from 'vitest'

import type { AttachedClientRuntime } from '../../src/runtime/client-core/attached-runtime'
import type { ClientIdentitySnapshot } from '../../src/runtime/client-core/identity-port'
import { EXPECTED_EMBEDDED_IDENTITY_REPORT } from '../helpers/client-lifecycle-conformance'

type HostModule = {
  hostVueIdentity: unknown
  createHostRuntime(secret: string): {
    runtime: AttachedClientRuntime
    emit(snapshot: ClientIdentitySnapshot): void
    listenerCount(): number
    detachCount(): number
  }
}

type EmbeddedModule = {
  embeddedVueIdentity: unknown
  attachEmbeddedRuntime(runtime: AttachedClientRuntime): {
    snapshot: { value: ClientIdentitySnapshot }
    dispose(): void
  }
}

async function buildFixture(entry: string, outputDirectory: string) {
  await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      emptyOutDir: true,
      lib: {
        entry: resolve(entry),
        formats: ['es'],
        fileName: () => 'bundle.mjs',
      },
      minify: false,
      outDir: outputDirectory,
    },
  })
  return join(outputDirectory, 'bundle.mjs')
}

describe('cross-Vue-copy attached runtime', () => {
  it('uses a plain opaque boundary and detaches the consuming observer exactly once', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'bcn-vue-copy-proof-'))
    try {
      const hostBundle = await buildFixture(
        'test/fixtures/vue-copy-proof/host.ts',
        join(directory, 'host'),
      )
      const embeddedBundle = await buildFixture(
        'test/fixtures/vue-copy-proof/embedded.ts',
        join(directory, 'embedded'),
      )
      const host = (await import(`${pathToFileURL(hostBundle).href}?host`)) as HostModule
      const embedded = (await import(
        `${pathToFileURL(embeddedBundle).href}?embedded`
      )) as EmbeddedModule

      expect(host.hostVueIdentity).not.toBe(embedded.embeddedVueIdentity)

      const secret = 'attached-runtime-token-sentinel'
      const harness = host.createHostRuntime(secret)
      expect(Object.keys(harness.runtime.client).sort()).toEqual([
        'action',
        'mutation',
        'onUpdate',
        'query',
      ])
      expect(Object.keys(harness.runtime.identity.snapshot()).sort()).toEqual([
        'authEnabled',
        'authEpoch',
        'error',
        'identityGeneration',
        'identityKey',
        'settled',
      ])
      expect(harness.runtime.identity.snapshot().error?.cause).toBeUndefined()
      expect(JSON.stringify(harness.runtime)).not.toContain(secret)

      const attached = embedded.attachEmbeddedRuntime(harness.runtime)
      expect(harness.listenerCount()).toBe(1)
      expect(attached.snapshot.value.identityKey).toBe('user:alice')
      const initialIdentity = attached.snapshot.value.identityKey

      harness.emit({
        authEnabled: true,
        settled: true,
        identityKey: 'user:bob',
        authEpoch: 2,
        identityGeneration: 2,
        error: null,
      })
      expect(attached.snapshot.value.identityKey).toBe('user:bob')

      const nextIdentity = attached.snapshot.value.identityKey
      expect(attached.snapshot.value.identityGeneration).toBe(2)

      attached.dispose()
      attached.dispose()
      expect(harness.listenerCount()).toBe(0)
      expect(harness.detachCount()).toBe(1)

      harness.emit({
        authEnabled: true,
        settled: true,
        identityKey: 'anonymous',
        authEpoch: 3,
        identityGeneration: 3,
        error: null,
      })
      expect(attached.snapshot.value.identityKey).toBe('user:bob')

      expect({
        clientMethods: Object.keys(harness.runtime.client).sort(),
        initialIdentity,
        nextIdentity,
        identityAfterDispose: attached.snapshot.value.identityKey,
        listenersAfterDispose: harness.listenerCount(),
        detachCount: harness.detachCount(),
      }).toEqual(EXPECTED_EMBEDDED_IDENTITY_REPORT)

      expect(readFileSync(hostBundle, 'utf8')).not.toContain(secret)
      expect(readFileSync(embeddedBundle, 'utf8')).not.toContain(secret)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }, 30_000)
})
