import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import { Node, Project, SyntaxKind } from 'ts-morph'

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

export interface ProjectSourceLocation {
  path: string
  line: number
}

const CANONICAL_LAYOUT_PATHS = [
  'convex/auth.ts',
  'convex/auth.config.ts',
  'convex/convex.config.ts',
  'convex/functions.ts',
  'convex/http.ts',
  'convex/schema.ts',
  'convex/auth',
  'convex/domain',
  'convex/operations',
  'convex/permissions',
  'shared/schemas',
  'pages',
  'server/api',
  'server/mcp',
] as const

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
  } catch (error) {
    throw new Error(
      `Invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`,
    )
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

export function findMissingCanonicalLayoutPaths(project: ProjectInspection): string[] {
  return CANONICAL_LAYOUT_PATHS.filter(
    (relativePath) => !existsSync(resolve(project.cwd, relativePath)),
  )
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
    /#trellis\/mcp|@lupinum\/trellis\/mcp|defineConvexTool\s*\(|trustedCallerKey\b/.test(file.text),
  )
}

export function usesPermissionSurfaces(project: ProjectInspection): boolean {
  return project.sourceFiles.some((file) =>
    /\busePermissions\s*\(|\buseAuthGuard\s*\(/.test(file.text),
  )
}

export function findConfiguredPermissionQueryPath(project: ProjectInspection): string | undefined {
  const objectMatch = project.nuxtConfigText.match(
    /permissions\s*:\s*\{[\s\S]*?\bquery\s*:\s*['"]([^'"]+)['"]/,
  )
  if (objectMatch?.[1]) return objectMatch[1]

  const shorthandMatch = project.nuxtConfigText.match(/permissions\s*:\s*['"]([^'"]+)['"]/)
  if (shorthandMatch?.[1]) return shorthandMatch[1]

  return undefined
}

function createAnalysisProject(project: ProjectInspection): Project {
  const analysis = new Project({ skipAddingFilesFromTsConfig: true })
  for (const sourceFile of project.sourceFiles) {
    if (!/\.(?:[cm]?[jt]s|tsx?)$/.test(sourceFile.path)) continue
    analysis.createSourceFile(sourceFile.path, sourceFile.text, { overwrite: true })
  }
  return analysis
}

function getPropertyName(node: Node): string | null {
  if (Node.isPropertyAssignment(node) || Node.isShorthandPropertyAssignment(node)) {
    return node.getName()
  }
  return null
}

function objectHasTrustedAuth(node: import('ts-morph').ObjectLiteralExpression): boolean {
  const authProperty = node.getProperties().find((property) => getPropertyName(property) === 'auth')

  if (!authProperty || !Node.isPropertyAssignment(authProperty)) return false

  const initializer = authProperty.getInitializer()
  if (!initializer) return false

  return (
    (Node.isStringLiteral(initializer) || Node.isNoSubstitutionTemplateLiteral(initializer)) &&
    initializer.getLiteralText() === 'trusted'
  )
}

export function findForwardedPrincipalWithoutTrustedAuth(
  project: ProjectInspection,
): ProjectSourceLocation[] {
  const analysis = createAnalysisProject(project)
  const findings: ProjectSourceLocation[] = []

  for (const sourceFile of analysis.getSourceFiles()) {
    const filePath = sourceFile.getFilePath()
    if (!/[/\\]server[/\\].+\.(?:[cm]?[jt]s|tsx?)$/.test(filePath)) continue
    if (/[/\\]tests?[/\\]/.test(filePath)) continue

    for (const objectLiteral of sourceFile.getDescendantsOfKind(
      SyntaxKind.ObjectLiteralExpression,
    )) {
      const parent = objectLiteral.getParent()
      if (!parent || !Node.isCallExpression(parent)) continue

      const hasPrincipal = objectLiteral
        .getProperties()
        .some((property) => getPropertyName(property) === 'principal')
      if (!hasPrincipal || objectHasTrustedAuth(objectLiteral)) continue

      findings.push({
        path: filePath,
        line: objectLiteral.getStartLineNumber(),
      })
    }
  }

  return findings
}

function looksDestructiveTool(text: string, filePath: string): boolean {
  const destructiveVerb =
    /\b(?:delete|remove|archive|revoke|destroy|purge)\b|bulk-delete|bulkDelete/i
  const fileName = filePath.split(/[/\\]/).pop() ?? filePath
  return (
    destructiveVerb.test(fileName) ||
    /destructive\s*:\s*true/.test(text) ||
    /name\s*:\s*['"`][^'"`]*(?:delete|remove|archive|revoke|destroy|purge|bulk-delete|bulkDelete)/i.test(
      text,
    )
  )
}

export function findDestructiveMcpToolsWithoutOperationBinding(
  project: ProjectInspection,
): ProjectSourceLocation[] {
  const findings: ProjectSourceLocation[] = []

  for (const sourceFile of project.sourceFiles) {
    if (!/[/\\]server[/\\]mcp[/\\]tools[/\\].+\.(?:[cm]?[jt]s|tsx?)$/.test(sourceFile.path)) {
      continue
    }
    if (/tool\.fromOperation\s*\(/.test(sourceFile.text)) continue
    if (!/export\s+default\s+tool\s*\(|defineConvexTool\s*\(/.test(sourceFile.text)) continue
    if (!looksDestructiveTool(sourceFile.text, sourceFile.path)) continue

    const firstMatch =
      sourceFile.text.match(
        /export\s+default\s+tool\s*\(|defineConvexTool\s*\(|delete|remove|archive|revoke|destroy|purge|bulk-delete|bulkDelete/i,
      ) ?? null
    const matchIndex = firstMatch?.index ?? 0
    const line = sourceFile.text.slice(0, matchIndex).split(/\r?\n/).length

    findings.push({
      path: sourceFile.path,
      line,
    })
  }

  return findings
}
