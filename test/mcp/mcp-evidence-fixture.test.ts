import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  parseMcpEvidenceFixtureConfiguration,
  safeMcpFixtureChildEnvironment,
  startMcpEvidenceFixture,
} from '../../scripts/mcp-evidence-fixture.mjs'

const validExternalEnvironment = (appDir = '/tmp/bcn-external-mcp-fixture') => ({
  BCN_MCP_TEST_APP_DIR: appDir,
  BCN_MCP_TEST_CONVEX_SITE_URL: 'https://disposable.example.convex.site',
  BCN_MCP_TEST_CONVEX_URL: 'https://disposable.example.convex.cloud',
  BCN_MCP_TEST_EMAIL: 'mcp-evidence@example.test',
  BCN_MCP_TEST_MODE: 'external-disposable',
  BCN_MCP_TEST_ORIGIN: 'https://mcp-disposable.example.test',
  BCN_MCP_TEST_PASSWORD: 'one-time-password',
})

describe('MCP evidence fixture selection', () => {
  it('keeps the self-contained local fixture as the only default', () => {
    expect(parseMcpEvidenceFixtureConfiguration({})).toEqual({ mode: 'local' })
    expect(parseMcpEvidenceFixtureConfiguration({ BCN_MCP_TEST_MODE: 'local' })).toEqual({
      mode: 'local',
    })
    expect(() =>
      parseMcpEvidenceFixtureConfiguration({
        BCN_MCP_TEST_EMAIL: 'unexpected@example.test',
      }),
    ).toThrow(/external-disposable/)
  })

  it('fails unknown modes and every incomplete external-disposable configuration', () => {
    expect(() => parseMcpEvidenceFixtureConfiguration({ BCN_MCP_TEST_MODE: 'cloud' })).toThrow(
      /Unknown BCN_MCP_TEST_MODE/,
    )

    const complete = validExternalEnvironment()
    for (const name of Object.keys(complete).filter((name) => name !== 'BCN_MCP_TEST_MODE')) {
      const incomplete = Object.fromEntries(
        Object.entries(complete).filter(([candidate]) => candidate !== name),
      )
      expect(() => parseMcpEvidenceFixtureConfiguration(incomplete)).toThrow(name)
    }
  })

  it('accepts only an absolute app path and exact secure or loopback origins', () => {
    expect(parseMcpEvidenceFixtureConfiguration(validExternalEnvironment())).toMatchObject({
      appDir: '/tmp/bcn-external-mcp-fixture',
      mode: 'external-disposable',
      origin: 'https://mcp-disposable.example.test',
    })
    expect(() =>
      parseMcpEvidenceFixtureConfiguration(validExternalEnvironment('relative/app')),
    ).toThrow(/absolute path/)
    expect(() =>
      parseMcpEvidenceFixtureConfiguration({
        ...validExternalEnvironment(),
        BCN_MCP_TEST_ORIGIN: 'https://mcp-disposable.example.test/',
      }),
    ).toThrow(/exact canonical origin/)
    expect(() =>
      parseMcpEvidenceFixtureConfiguration({
        ...validExternalEnvironment(),
        BCN_MCP_TEST_CONVEX_URL: 'http://disposable.example.convex.cloud',
      }),
    ).toThrow(/HTTPS/)
    expect(() =>
      parseMcpEvidenceFixtureConfiguration({
        ...validExternalEnvironment(),
        BCN_MCP_TEST_PASSWORD: 'short-password',
      }),
    ).toThrow(/between 15 and 1,024/)
  })

  it('strips fixture and deployment credentials from every child environment', () => {
    const child = safeMcpFixtureChildEnvironment({
      ...validExternalEnvironment(),
      BCN_AUTH_PROXY_IP_SECRET: 'proxy-secret',
      BCN_MCP_CONFORMANCE_BEARER: 'bearer-secret',
      BETTER_AUTH_SECRETS: '1:better-auth-secret',
      CONVEX_DEPLOY_KEY: 'deployment-secret',
      CONVEX_DEPLOYMENT: 'prod:wrong-deployment',
      CONVEX_SELF_HOSTED_ADMIN_KEY: 'self-hosted-secret',
      MCP_SERVER_SECRET: 'private-mcp-secret',
      PATH: '/safe/bin',
    })
    expect(child).toEqual({ PATH: '/safe/bin' })
  })

  it('uses an existing exact-topology app and never cleans the external fixture', async () => {
    const appDir = await mkdtemp(join(tmpdir(), 'bcn-external-mcp-contract-'))
    const environment = validExternalEnvironment(appDir)
    await writeFile(
      join(appDir, '.env.local'),
      [
        `SITE_URL=${environment.BCN_MCP_TEST_ORIGIN}`,
        `CONVEX_URL=${environment.BCN_MCP_TEST_CONVEX_URL}`,
        `CONVEX_SITE_URL=${environment.BCN_MCP_TEST_CONVEX_SITE_URL}`,
        `NUXT_PUBLIC_CONVEX_URL=${environment.BCN_MCP_TEST_CONVEX_URL}`,
        `NUXT_PUBLIC_CONVEX_SITE_URL=${environment.BCN_MCP_TEST_CONVEX_SITE_URL}`,
        '',
      ].join('\n'),
    )
    try {
      const fixture = await startMcpEvidenceFixture(environment)
      expect(fixture).toMatchObject({
        cwd: appDir,
        email: environment.BCN_MCP_TEST_EMAIL,
        origin: environment.BCN_MCP_TEST_ORIGIN,
      })
      await fixture.release()
      await fixture.release()
      expect((await stat(appDir)).isDirectory()).toBe(true)
    } finally {
      await rm(appDir, { force: true, recursive: true })
    }
  })

  it('rejects an app directory whose .env.local selects a different topology', async () => {
    const appDir = await mkdtemp(join(tmpdir(), 'bcn-external-mcp-mismatch-'))
    const environment = validExternalEnvironment(appDir)
    await writeFile(
      join(appDir, '.env.local'),
      [
        'SITE_URL=https://different.example.test',
        `CONVEX_URL=${environment.BCN_MCP_TEST_CONVEX_URL}`,
        `CONVEX_SITE_URL=${environment.BCN_MCP_TEST_CONVEX_SITE_URL}`,
        `NUXT_PUBLIC_CONVEX_URL=${environment.BCN_MCP_TEST_CONVEX_URL}`,
        `NUXT_PUBLIC_CONVEX_SITE_URL=${environment.BCN_MCP_TEST_CONVEX_SITE_URL}`,
        '',
      ].join('\n'),
    )
    try {
      await expect(startMcpEvidenceFixture(environment)).rejects.toThrow(/exactly match/)
    } finally {
      await rm(appDir, { force: true, recursive: true })
    }
  })

  it('pins the repository Convex CLI and .env.local without deployment lifecycle commands', async () => {
    const source = await readFile(
      fileURLToPath(new URL('../../scripts/mcp-evidence-fixture.mjs', import.meta.url)),
      'utf8',
    )
    expect(source).toContain(
      "fileURLToPath(new URL('../node_modules/convex/bin/main.js', import.meta.url))",
    )
    expect(source).toContain("[convexCli, 'run', functionName")
    expect(source).toContain("'--env-file', '.env.local'")
    expect(source).toContain('cwd: configuration.appDir')
    expect(source).not.toMatch(/\b(?:deploy|provision|sign-up)\b/u)
    expect(source).not.toContain("['env', 'set'")
    expect(source).not.toContain('rm(')
  })

  it('redacts external fixture credentials from Inspector evidence logs', async () => {
    const source = await readFile(
      fileURLToPath(new URL('../../scripts/run-mcp-auth.mjs', import.meta.url)),
      'utf8',
    )
    expect(
      source.match(/inspectorToken,\n\s+fixture\.email,\n\s+fixture\.password,/gu),
    ).toHaveLength(2)
  })
})
