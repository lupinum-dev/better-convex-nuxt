import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { build } from 'vite'
import { describe, expect, it } from 'vitest'

import { EXPECTED_CLIENT_LIFECYCLE_REPORT } from '../helpers/client-lifecycle-conformance'

describe('private plain Vue/Vite lifecycle proof', () => {
  it('production-bundles and executes the one shared client source island', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'bcn-vue-private-proof-'))
    try {
      await build({
        configFile: false,
        logLevel: 'silent',
        build: {
          emptyOutDir: true,
          lib: {
            entry: resolve('test/fixtures/vue-private-proof/main.ts'),
            formats: ['es'],
            fileName: () => 'bundle.mjs',
          },
          minify: true,
          outDir: directory,
        },
      })
      const bundle = join(directory, 'bundle.mjs')
      const source = readFileSync(bundle, 'utf8')
      for (const forbidden of ['#imports', '@nuxt/', 'better-auth', 'from"h3"', 'from"nitro']) {
        expect(source).not.toContain(forbidden)
      }

      const proof = (await import(`${pathToFileURL(bundle).href}?proof`)) as {
        runPrivateVueLifecycleProof(): Promise<unknown>
      }
      await expect(proof.runPrivateVueLifecycleProof()).resolves.toEqual(
        EXPECTED_CLIENT_LIFECYCLE_REPORT,
      )
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }, 30_000)
})
