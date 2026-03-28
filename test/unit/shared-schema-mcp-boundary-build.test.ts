import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('shared schema + MCP boundary build smoke', () => {
  it(
    'builds a Nuxt app whose server files import the schema and MCP subpaths',
    { timeout: 120000 },
    () => {
      const fixtureRoot = resolve(process.cwd(), 'test/fixtures/shared-schema-mcp-boundary')
      const result = spawnSync('pnpm', ['exec', 'nuxi', 'build', '--cwd', fixtureRoot], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          NUXT_TELEMETRY_DISABLED: '1',
        },
      })

      const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`

      expect(result.status, output).toBe(0)
      expect(output).not.toContain('failed to find "useNuxtApp" imported from "#imports"')
    },
  )
})
