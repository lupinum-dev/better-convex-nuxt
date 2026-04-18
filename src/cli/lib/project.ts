import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const NUXT_CONFIG_CANDIDATES = [
  'nuxt.config.ts',
  'nuxt.config.mts',
  'nuxt.config.js',
  'nuxt.config.mjs',
  'nuxt.config.cjs',
] as const

const ENV_FILE_CANDIDATES = ['.env.local', '.env'] as const

type PackageJson = Record<string, unknown>

export interface EnvSource {
  path: string
  text: string
}

export interface ProjectInspection {
  cwd: string
  packageJsonPath: string | null
  packageJson: PackageJson | null
  dependencyNames: Set<string>
  nuxtConfigPath: string | null
  nuxtConfigText: string
  envSources: EnvSource[]
  sourceFiles: Array<{ path: string; text: string }>
}

export interface EnvKeySource {
  key: string
  source: string
}

function readTextIfExists(path: string): string | null {
  if (!existsSync(path)) return null
  return readFileSync(path, 'utf8')
}

function readJsonIfExists(path: string): PackageJson | null {
  const text = readTextIfExists(path)
  if (!text) return null

  try {
    return JSON.parse(text) as PackageJson
  } catch {
    return null
  }
}

function getRecordValue(
  packageJson: PackageJson | null,
  key: 'dependencies' | 'devDependencies' | 'optionalDependencies' | 'peerDependencies',
): Record<string, string> {
  const value = packageJson?.[key]
  return value && typeof value === 'object' ? (value as Record<string, string>) : {}
}

function collectDependencyNames(packageJson: PackageJson | null): Set<string> {
  const dependencyNames = new Set<string>()

  for (const key of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ] as const) {
    for (const dependencyName of Object.keys(getRecordValue(packageJson, key))) {
      dependencyNames.add(dependencyName)
    }
  }

  return dependencyNames
}

function findFirstExisting(cwd: string, candidates: readonly string[]): string | null {
  for (const candidate of candidates) {
    const fullPath = resolve(cwd, candidate)
    if (existsSync(fullPath)) return fullPath
  }

  return null
}

function collectProjectSourceFiles(cwd: string): Array<{ path: string; text: string }> {
  const directories = [
    'app',
    'components',
    'composables',
    'convex',
    'layouts',
    'pages',
    'plugins',
    'server',
    'shared',
    'test',
    'tests',
    'utils',
  ]
  const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.vue', '.md'])
  const files: Array<{ path: string; text: string }> = []

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.nuxt' || entry.name === '.output') {
        continue
      }

      const fullPath = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      const extension = fullPath.slice(fullPath.lastIndexOf('.'))
      if (!extensions.has(extension)) {
        continue
      }

      files.push({
        path: fullPath,
        text: readFileSync(fullPath, 'utf8'),
      })
    }
  }

  for (const directory of directories) {
    const fullPath = resolve(cwd, directory)
    if (!existsSync(fullPath) || !statSync(fullPath).isDirectory()) {
      continue
    }
    walk(fullPath)
  }

  return files
}

export function inspectProject(cwd: string): ProjectInspection {
  const resolvedCwd = resolve(cwd)
  const packageJsonPath = resolve(resolvedCwd, 'package.json')
  const packageJson = readJsonIfExists(packageJsonPath)
  const nuxtConfigPath = findFirstExisting(resolvedCwd, NUXT_CONFIG_CANDIDATES)
  const nuxtConfigText = nuxtConfigPath ? (readTextIfExists(nuxtConfigPath) ?? '') : ''
  const envSources = ENV_FILE_CANDIDATES.flatMap((candidate) => {
    const path = resolve(resolvedCwd, candidate)
    const text = readTextIfExists(path)
    return text === null ? [] : [{ path, text }]
  })

  return {
    cwd: resolvedCwd,
    packageJsonPath: existsSync(packageJsonPath) ? packageJsonPath : null,
    packageJson,
    dependencyNames: collectDependencyNames(packageJson),
    nuxtConfigPath,
    nuxtConfigText,
    envSources,
    sourceFiles: collectProjectSourceFiles(resolvedCwd),
  }
}

export function hasDependency(project: ProjectInspection, dependencyName: string): boolean {
  return project.dependencyNames.has(dependencyName)
}

export function hasBetterConvexNuxtRegistration(project: ProjectInspection): boolean {
  if (!project.nuxtConfigText) return false

  const modulesIndex = project.nuxtConfigText.indexOf('modules')
  const moduleLiteralMatch = project.nuxtConfigText.match(/["']@lupinum\/trellis["']/)
  const moduleLiteralIndex = moduleLiteralMatch?.index ?? -1

  return modulesIndex !== -1 && moduleLiteralIndex !== -1 && modulesIndex < moduleLiteralIndex
}

function hasEnvAssignment(line: string, key: 'CONVEX_URL' | 'NUXT_PUBLIC_CONVEX_URL'): boolean {
  const trimmedLine = line.trim()
  const withoutExport = trimmedLine.startsWith('export ')
    ? trimmedLine.slice('export '.length).trimStart()
    : trimmedLine

  if (!withoutExport.startsWith(key)) return false

  const remainder = withoutExport.slice(key.length).trimStart()
  if (!remainder.startsWith('=')) return false

  return remainder.slice(1).trim().length > 0
}

function hasAnyEnvAssignment(line: string, keys: readonly string[]): string | null {
  for (const key of keys) {
    const trimmedLine = line.trim()
    const withoutExport = trimmedLine.startsWith('export ')
      ? trimmedLine.slice('export '.length).trimStart()
      : trimmedLine

    if (!withoutExport.startsWith(key)) continue

    const remainder = withoutExport.slice(key.length).trimStart()
    if (!remainder.startsWith('=')) continue
    if (remainder.slice(1).trim().length === 0) continue
    return key
  }

  return null
}

export function findConvexUrlSource(project: ProjectInspection): string | null {
  if (typeof process.env.CONVEX_URL === 'string' && process.env.CONVEX_URL.trim()) {
    return 'process.env.CONVEX_URL'
  }

  if (
    typeof process.env.NUXT_PUBLIC_CONVEX_URL === 'string' &&
    process.env.NUXT_PUBLIC_CONVEX_URL.trim()
  ) {
    return 'process.env.NUXT_PUBLIC_CONVEX_URL'
  }

  for (const envSource of project.envSources) {
    for (const line of envSource.text.split(/\r?\n/)) {
      if (
        hasEnvAssignment(line, 'CONVEX_URL') ||
        hasEnvAssignment(line, 'NUXT_PUBLIC_CONVEX_URL')
      ) {
        return envSource.path
      }
    }
  }

  return null
}

export function findEnvKeySource(
  project: ProjectInspection,
  keys: readonly string[],
): EnvKeySource | null {
  for (const key of keys) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim()) {
      return { key, source: `process.env.${key}` }
    }
  }

  for (const envSource of project.envSources) {
    for (const line of envSource.text.split(/\r?\n/)) {
      const matchedKey = hasAnyEnvAssignment(line, keys)
      if (matchedKey) {
        return { key: matchedKey, source: envSource.path }
      }
    }
  }

  return null
}

export function isAuthExplicitlyDisabled(project: ProjectInspection): boolean {
  return /trellis\s*:\s*\{[\s\S]*?\bauth\s*:\s*false\b/.test(project.nuxtConfigText)
}

export function findConvexHttpSource(
  project: ProjectInspection,
): { path: string; text: string } | null {
  return (
    project.sourceFiles.find((file) =>
      /[/\\]convex[/\\]http\.(?:ts|js|mts|mjs|cjs)$/.test(file.path),
    ) ?? null
  )
}

export function hasBetterAuthRouteRegistration(project: ProjectInspection): boolean {
  const convexHttpSource = findConvexHttpSource(project)
  if (!convexHttpSource) return false

  return (
    /\bauthComponent\b/.test(convexHttpSource.text) &&
    /\.registerRoutes\s*\(/.test(convexHttpSource.text)
  )
}

export function findConvexAuthSource(
  project: ProjectInspection,
): { path: string; text: string } | null {
  return (
    project.sourceFiles.find((file) =>
      /[/\\]convex[/\\]auth\.(?:ts|js|mts|mjs|cjs)$/.test(file.path),
    ) ?? null
  )
}

export function usesSyncedUsersTable(project: ProjectInspection): boolean {
  return project.sourceFiles.some((file) =>
    /\.query\(\s*['"]users['"]\s*\)|withIndex\(\s*['"]by_auth_id['"]\s*|defineTable\(\s*\{[\s\S]*?\bauthId\s*:/.test(
      file.text,
    ),
  )
}

export function hasBetterAuthTriggerExports(project: ProjectInspection): boolean {
  const convexAuthSource = findConvexAuthSource(project)
  if (!convexAuthSource) return false

  return (
    /authComponent\.triggersApi\s*\(/.test(convexAuthSource.text) &&
    /onCreate/.test(convexAuthSource.text) &&
    /onUpdate/.test(convexAuthSource.text) &&
    /onDelete/.test(convexAuthSource.text)
  )
}

export function usesTrustedCallerSurfaces(project: ProjectInspection): boolean {
  if (/#trellis\/mcp|@lupinum\/trellis\/mcp|defineConvexTool\s*\(/.test(project.nuxtConfigText)) {
    return true
  }

  return project.sourceFiles.some((file) =>
    /#trellis\/mcp|@lupinum\/trellis\/mcp|defineConvexTool\s*\(|withTrustedCallerHandler\s*\(|trustedCallerKey\b/.test(
      file.text,
    ),
  )
}
