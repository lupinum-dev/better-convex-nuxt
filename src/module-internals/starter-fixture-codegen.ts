import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { renderMcpToolRefsModule, type McpToolRefBindingInput } from './mcp-tool-ref-codegen.js'
import {
  renderOperationRefsModule,
  type OperationRefBindingInput,
} from './operation-ref-codegen.js'

export type StarterGeneratedFile =
  | {
      kind: 'operationRefs'
      path: string
      projectOperationRefImport: string
      apiImport: string
      descriptorImport: string
      descriptors: readonly string[]
      refs: readonly OperationRefBindingInput[]
    }
  | {
      kind: 'mcpToolRefs'
      path: string
      projectMcpToolRefImport: string
      apiImport: string
      descriptorImport: string
      descriptors: readonly string[]
      refs: readonly McpToolRefBindingInput[]
    }

export interface StarterFixtureManifest {
  name: string
  description?: string
  include: readonly string[]
  exclude: readonly string[]
  generated?: readonly StarterGeneratedFile[]
}

export interface RenderedStarterFile {
  path: string
  content: string
}

export function renderStarterGeneratedFiles(
  manifest: StarterFixtureManifest,
): RenderedStarterFile[] {
  return (manifest.generated ?? []).map((file) => {
    switch (file.kind) {
      case 'operationRefs':
        return {
          path: file.path,
          content: renderOperationRefsModule(file),
        }
      case 'mcpToolRefs':
        return {
          path: file.path,
          content: renderMcpToolRefsModule(file),
        }
    }
  })
}

function toManifestPath(path: string): string {
  return path.split(sep).join('/')
}

function matchesPattern(path: string, pattern: string): boolean {
  const deepFileMatch = pattern.match(/^(.+)\/\*\*\/\*(\.[^/]+)$/)
  if (deepFileMatch) {
    const prefix = deepFileMatch[1]
    const suffix = deepFileMatch[2]
    if (!prefix || !suffix) return false
    return path.startsWith(`${prefix}/`) && path.endsWith(suffix)
  }

  if (pattern.endsWith('/**')) {
    return path.startsWith(pattern.slice(0, -3))
  }

  return path === pattern
}

function matchesAny(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesPattern(path, pattern))
}

function includeSearchRoots(patterns: readonly string[]): string[] {
  const roots = new Set<string>()
  for (const pattern of patterns) {
    const wildcardIndex = pattern.indexOf('*')
    if (wildcardIndex === -1) {
      const slashIndex = pattern.lastIndexOf('/')
      roots.add(slashIndex === -1 ? pattern : pattern.slice(0, slashIndex))
      continue
    }

    const prefix = pattern.slice(0, wildcardIndex).replace(/\/+$/u, '')
    roots.add(prefix || '.')
  }
  return [...roots]
}

function collectFiles(rootDir: string, searchRoot: string): string[] {
  const absoluteRoot = join(rootDir, searchRoot)
  if (!existsSync(absoluteRoot)) return []
  const stats = statSync(absoluteRoot)
  if (stats.isFile()) return [toManifestPath(searchRoot)]
  if (!stats.isDirectory()) return []

  const files: string[] = []
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(absolutePath)
        continue
      }
      if (!entry.isFile()) continue
      files.push(toManifestPath(relative(rootDir, absolutePath)))
    }
  }
  walk(absoluteRoot)
  return files
}

export function renderStarterFixtureFiles(
  rootDir: string,
  manifest: StarterFixtureManifest,
): RenderedStarterFile[] {
  const generated = new Map(renderStarterGeneratedFiles(manifest).map((file) => [file.path, file]))
  const selected = new Set<string>()

  for (const searchRoot of includeSearchRoots(manifest.include)) {
    for (const path of collectFiles(rootDir, searchRoot)) {
      if (!matchesAny(path, manifest.include)) continue
      if (matchesAny(path, manifest.exclude)) continue
      selected.add(path)
    }
  }

  for (const path of generated.keys()) {
    if (!matchesAny(path, manifest.include)) continue
    if (matchesAny(path, manifest.exclude)) continue
    selected.add(path)
  }

  return [...selected]
    .sort((left, right) => left.localeCompare(right))
    .map((path) => ({
      path,
      content: generated.get(path)?.content ?? readFileSync(join(rootDir, path), 'utf8'),
    }))
}
