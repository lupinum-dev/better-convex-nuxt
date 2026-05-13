import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildPublicConvexRuntimeConfig,
  collectModuleStartupWarnings,
  collectValidationMessages,
  deriveModuleSetupState,
  resolvePermissionQuerySetup,
} from '../../src/module-internals/setup'

function createFixture(files: Record<string, string>) {
  const rootDir = mkdtempSync(resolve(tmpdir(), 'bcn-module-setup-'))
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = resolve(rootDir, relativePath)
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, contents, 'utf8')
  }
  return rootDir
}

describe('module-setup', () => {
  it('normalizes auth shorthand and assembles the public runtime config without dropping existing keys', () => {
    const setup = deriveModuleSetupState(
      {
        url: 'https://demo.convex.cloud',
        auth: true,
        permissions: {
          query: 'permissions/context.getAccessContext',
          codegen: true,
        },
        upload: { maxConcurrent: 7 },
      },
      {},
    )

    expect(setup.isAuthEnabled).toBe(true)
    expect(setup.authRoute).toBe('/api/auth')
    expect(setup.resolvedSiteUrl).toBe('https://demo.convex.site')
    expect(setup.permissionCodegenEnabled).toBe(true)
    expect(setup.permissionCodegenInclude).toEqual([
      'convex/auth/permissions.ts',
      'convex/features/**/permissions.ts',
    ])

    const config = buildPublicConvexRuntimeConfig(
      {
        url: 'https://demo.convex.cloud',
        auth: true,
        permissions: {
          query: 'permissions/context.getAccessContext',
          codegen: true,
        },
        upload: { maxConcurrent: 7 },
      },
      {
        existingKey: 'keep-me',
        auth: {
          existingAuthKey: true,
        },
      },
      setup,
    )

    expect(config).toMatchObject({
      existingKey: 'keep-me',
      siteUrl: 'https://demo.convex.site',
      permissions: {
        query: 'permissions/context.getAccessContext',
        codegen: true,
      },
      upload: {
        maxConcurrent: 7,
      },
      auth: {
        route: '/api/auth',
        existingAuthKey: true,
      },
    })
  })

  it('forwards backend and mcp observability capture flags into runtime config', () => {
    const setup = deriveModuleSetupState(
      {
        url: 'https://demo.convex.cloud',
        observability: {
          capture: {
            backend: false,
            mcp: false,
            browser: true,
          },
        },
      },
      {},
    )

    const config = buildPublicConvexRuntimeConfig(
      {
        url: 'https://demo.convex.cloud',
        observability: {
          capture: {
            backend: false,
            mcp: false,
            browser: true,
          },
        },
      },
      undefined,
      setup,
    )

    expect(config.observability?.capture).toEqual({
      backend: false,
      mcp: false,
      browser: true,
    })
  })

  it('keeps permission codegen disabled unless explicitly enabled', () => {
    expect(
      deriveModuleSetupState(
        {
          permissions: 'permissions/context.getAccessContext',
        },
        {},
      ).permissionCodegenEnabled,
    ).toBe(false)

    expect(
      deriveModuleSetupState(
        {
          permissions: {
            query: 'permissions/context.getAccessContext',
          },
        },
        {},
      ).permissionCodegenEnabled,
    ).toBe(false)

    expect(
      deriveModuleSetupState(
        {
          permissions: {
            query: 'permissions/context.getAccessContext',
            codegen: true,
          },
        },
        {},
      ).permissionCodegenEnabled,
    ).toBe(true)
  })

  it('collects startup warnings for invalid URLs and clamped cache TTL values', () => {
    const options = {
      url: 'notaurl',
      auth: {
        enabled: true,
        cache: { enabled: true, ttl: 999 },
      },
    }
    const setup = deriveModuleSetupState(options, { CONVEX_URL: 'notaurl' })
    const warnings = collectModuleStartupWarnings(options, setup)

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Invalid Convex URL format'),
        expect.stringContaining('no usable siteUrl was resolved'),
        expect.stringContaining('Using 60s instead'),
      ]),
    )
  })

  it('validates configured permission queries and prefixes validation findings for strict mode', () => {
    expect(resolvePermissionQuerySetup('/tmp/project', undefined)).toEqual({})

    const rootDir = createFixture({
      'pages/index.vue': `
        <script setup lang="ts">
        const auth = useConvexAuth()
        </script>
      `,
    })

    const validation = collectValidationMessages({
      rootDir,
      authEnabled: false,
      validationStrict: true,
    })

    expect(validation.warnings).toEqual([])
    expect(validation.errors).toHaveLength(1)
    expect(validation.errors[0]).toContain('[trellis]')
    expect(validation.errors[0]).toContain('auth.enabled')
  })
})
