import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  validateFinalMcpDefinitionFiles,
  validateMcpDefinitionFiles,
} from '../../src/module-internals/mcp-definition-preflight'

function createFixture(files: Record<string, string>) {
  const root = mkdtempSync(resolve(tmpdir(), 'trellis-mcp-preflight-'))
  const server = resolve(root, 'server')
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = resolve(server, relativePath)
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, contents, 'utf8')
  }
  return server
}

describe('MCP definition preflight', () => {
  it('allows default-export definitions and helpers outside toolkit-loaded folders', () => {
    const server = createFixture({
      'mcp/_shared/helpers.ts': 'export const helper = true',
      'mcp/tools/list.ts': 'export default defineMcpTool({ name: "list" })',
      'mcp/resources/guide.ts': 'export default defineMcpResource({ name: "guide" })',
      'mcp/prompts/write.ts': 'export default defineMcpPrompt({ name: "write" })',
    })

    expect(() =>
      validateMcpDefinitionFiles({
        layerServers: [server],
        paths: {
          tools: ['mcp/tools'],
          resources: ['mcp/resources'],
          prompts: ['mcp/prompts'],
        },
      }),
    ).not.toThrow()
  })

  it('rejects underscore files inside toolkit-loaded definition folders', () => {
    const server = createFixture({
      'mcp/tools/_shared.ts': 'export const helper = true',
    })

    expect(() =>
      validateMcpDefinitionFiles({
        layerServers: [server],
        paths: { tools: ['mcp/tools'] },
      }),
    ).toThrow(/Move helper code to server\/mcp\/_shared/)
  })

  it('rejects non-underscore definitions without a default export', () => {
    const server = createFixture({
      'mcp/tools/broken.ts': 'export const helper = true',
      'mcp/resources/broken.ts': 'export const helper = true',
      'mcp/prompts/broken.ts': 'export const helper = true',
    })

    expect(() =>
      validateMcpDefinitionFiles({
        layerServers: [server],
        paths: {
          tools: ['mcp/tools'],
          resources: ['mcp/resources'],
          prompts: ['mcp/prompts'],
        },
      }),
    ).toThrow(
      /mcp\/tools\/broken\.ts.*default MCP tool export[\s\S]*mcp\/resources\/broken\.ts.*default MCP resource export[\s\S]*mcp\/prompts\/broken\.ts.*default MCP prompt export/,
    )
  })

  it('validates paths added by later definition contributors', async () => {
    const server = createFixture({
      'ginko-mcp/tools/_shared.ts': 'export const helper = true',
    })

    await expect(
      validateFinalMcpDefinitionFiles({
        layerServers: [server],
        callDefinitionsHook: (paths) => {
          paths.tools?.push('ginko-mcp/tools')
        },
      }),
    ).rejects.toThrow(/ginko-mcp\/tools\/_shared\.ts[\s\S]*server\/mcp\/_shared/)
  })
})
