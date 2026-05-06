import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, relative, resolve } from 'node:path'

const DEFINITION_EXTENSIONS = new Set(['.ts', '.js', '.mts', '.mjs'])

export type McpDefinitionKind = 'tools' | 'resources' | 'prompts'

export interface McpDefinitionPreflightPaths {
  tools?: string[]
  resources?: string[]
  prompts?: string[]
}

export interface McpDefinitionPreflightOptions {
  layerServers: string[]
  paths: McpDefinitionPreflightPaths
}

export interface FinalMcpDefinitionPreflightOptions {
  callDefinitionsHook: (paths: McpDefinitionPreflightPaths) => unknown | Promise<unknown>
  layerServers: string[]
  mcpDir?: string
}

export function defaultMcpDefinitionPaths(mcpDir = 'mcp'): Required<McpDefinitionPreflightPaths> {
  return {
    tools: [`${mcpDir}/tools`],
    resources: [`${mcpDir}/resources`],
    prompts: [`${mcpDir}/prompts`],
  }
}

function toPosixPath(value: string): string {
  return value.replaceAll('\\', '/')
}

function isDefinitionFile(path: string): boolean {
  if (path.endsWith('.d.ts')) return false
  for (const extension of DEFINITION_EXTENSIONS) {
    if (path.endsWith(extension)) return true
  }
  return false
}

function walkDefinitionFiles(dir: string): string[] {
  if (!existsSync(dir)) return []

  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = resolve(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      files.push(...walkDefinitionFiles(path))
    } else if (stat.isFile() && isDefinitionFile(path)) {
      files.push(path)
    }
  }
  return files
}

function hasDefaultExport(source: string): boolean {
  return /\bexport\s+default\b/.test(source)
}

function expectedDefinition(kind: McpDefinitionKind): string {
  switch (kind) {
    case 'tools':
      return 'a default MCP tool export'
    case 'resources':
      return 'a default MCP resource export'
    case 'prompts':
      return 'a default MCP prompt export'
  }
}

function scanKind(
  layerServer: string,
  kind: McpDefinitionKind,
  paths: string[] | undefined,
): string[] {
  const errors: string[] = []
  for (const pathPattern of paths ?? []) {
    const root = resolve(layerServer, pathPattern)
    for (const file of walkDefinitionFiles(root)) {
      const label = toPosixPath(relative(layerServer, file))
      const filename = basename(file)
      if (filename.startsWith('_')) {
        errors.push(
          `MCP ${kind} helper file "${label}" is inside a toolkit-loaded folder. Move helper code to server/mcp/_shared; @nuxtjs/mcp-toolkit still imports underscore files at runtime.`,
        )
        continue
      }

      if (!hasDefaultExport(readFileSync(file, 'utf8'))) {
        errors.push(`MCP ${kind} file "${label}" must export ${expectedDefinition(kind)}.`)
      }
    }
  }
  return errors
}

export function validateMcpDefinitionFiles(options: McpDefinitionPreflightOptions): void {
  const errors = options.layerServers.flatMap((layerServer) => [
    ...scanKind(layerServer, 'tools', options.paths.tools),
    ...scanKind(layerServer, 'resources', options.paths.resources),
    ...scanKind(layerServer, 'prompts', options.paths.prompts),
  ])

  if (errors.length > 0) {
    throw new Error(`Trellis MCP definition preflight failed:\n${errors.join('\n')}`)
  }
}

export async function validateFinalMcpDefinitionFiles(
  options: FinalMcpDefinitionPreflightOptions,
): Promise<void> {
  const paths = defaultMcpDefinitionPaths(options.mcpDir)
  await options.callDefinitionsHook(paths)
  validateMcpDefinitionFiles({
    layerServers: options.layerServers,
    paths,
  })
}
