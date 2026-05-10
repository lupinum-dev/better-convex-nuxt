import { describe, expect, it } from 'vitest'

import {
  findRuntimeBoundaryViolations,
  formatRuntimeBoundaryViolation,
} from '../../scripts/lib/repo-policy-boundaries.mjs'

function reasons(files: Array<{ path: string; source: string }>) {
  return findRuntimeBoundaryViolations(files).map((violation) => violation.reason)
}

describe('repo policy boundaries', () => {
  it('allows devtools implementation imports from module/devtools roots', () => {
    expect(
      reasons([
        {
          path: 'src/module.ts',
          source: "import { setupConvexDevtools } from './devtools.js'",
        },
        {
          path: 'src/devtools.ts',
          source: "import { setupDevToolsUI } from '@nuxt/devtools-kit'",
        },
      ]),
    ).toEqual([])
  })

  it('allows lightweight runtime devtools instrumentation imports', () => {
    expect(
      reasons([
        {
          path: 'src/runtime/composables/configured-permissions.ts',
          source: "import { usePermissionDevtoolsState } from '../devtools/state.js'",
        },
      ]),
    ).toEqual([])
  })

  it('blocks devtools UI imports from public runtime roots', () => {
    expect(
      reasons([
        {
          path: 'src/runtime/auth/client/auth-bootstrap.ts',
          source: "import { setupDevToolsUI } from '../../../devtools/ui.js'",
        },
        {
          path: 'src/runtime/server/index.ts',
          source: "import { addDevToolsCustomTab } from '@nuxt/devtools-kit'",
        },
      ]),
    ).toEqual(['devtools UI/tooling', 'Nuxt devtools UI/tooling'])
  })

  it('blocks bridge and observability delivery imports from public runtime roots', () => {
    expect(
      reasons([
        {
          path: 'src/runtime/functions/index.ts',
          source: "export { defineBridge } from '@lupinum/trellis-bridge'",
        },
        {
          path: 'src/runtime/observability/sink.ts',
          source: "import { log } from 'evlog'",
        },
      ]),
    ).toEqual(['bridge package', 'observability delivery package'])
  })

  it('blocks MCP implementation imports from non-MCP runtime roots', () => {
    expect(
      reasons([
        {
          path: 'src/runtime/server/index.ts',
          source: "import { defineMcpApp } from '../mcp/define-mcp-app.js'",
        },
      ]),
    ).toEqual(['MCP runtime implementation'])
  })

  it('allows MCP internal imports inside the MCP runtime root', () => {
    expect(
      reasons([
        {
          path: 'src/runtime/mcp/index.ts',
          source: "export { defineMcpApp } from './define-mcp-app.js'",
        },
      ]),
    ).toEqual([])
  })

  it('formats violations with file, line, reason, and source', () => {
    const [violation] = findRuntimeBoundaryViolations([
      {
        path: 'src/runtime/functions/index.ts',
        source: "import { RuleTester } from '@typescript-eslint/utils'",
      },
    ])

    expect(violation).toBeDefined()
    expect(formatRuntimeBoundaryViolation(violation!)).toBe(
      "src/runtime/functions/index.ts:1:eslint tooling: import { RuleTester } from '@typescript-eslint/utils'",
    )
  })
})
