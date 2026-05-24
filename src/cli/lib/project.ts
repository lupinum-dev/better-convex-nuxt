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

export type ProjectUnsafeSurfaceKind = 'query' | 'mutation' | 'action'
export type ProjectUnsafePermitStyle = 'string-bypass' | 'typed-permit' | 'missing' | 'unknown'

export interface ProjectUnsafeEntrypoint {
  exportName: string | null
  surface: ProjectUnsafeSurfaceKind
  style: ProjectUnsafePermitStyle
  path: string
  line: number
  permit?: {
    kind?: string
    scopeCount?: number
    hasReviewBy: boolean
  }
}

export interface EnvKeySource {
  key: string
  source: string
  value: string
}

function readTextIfExists(path: string): string | null {
  if (!existsSync(path)) return null
  return readFileSync(path, 'utf8')
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
  const authEnabled = isAuthExplicitlyEnabled(project)
  const usesPermissions = usesPermissionSurfaces(project)
  const hasAppDirectory = existsSync(resolve(project.cwd, 'app'))
  const usesMcpToolkit =
    hasDependency(project, '@nuxtjs/mcp-toolkit') ||
    /server[/\\]mcp[/\\]/.test(project.nuxtConfigText) ||
    project.sourceFiles.some((file) => /[/\\]server[/\\]mcp[/\\]/.test(file.path))
  const paths = [
    'convex/functions.ts',
    'convex/schema.ts',
    'convex/features',
    'shared/features',
    'app',
    'app/app.vue',
    'app/pages',
    ...(hasAppDirectory ? ['app/features'] : []),
    ...(authEnabled
      ? [
          'convex/auth.ts',
          'convex/auth.config.ts',
          'convex/convex.config.ts',
          'convex/http.ts',
          'convex/auth',
        ]
      : []),
    ...(usesPermissions ? ['convex/permissions'] : []),
    ...(usesMcpToolkit ? ['server/mcp'] : []),
  ]

  return paths.filter((relativePath) => !existsSync(resolve(project.cwd, relativePath)))
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

function readEnvAssignmentValue(line: string, key: string): string | null {
  const trimmedLine = line.trim()
  const withoutExport = trimmedLine.startsWith('export ')
    ? trimmedLine.slice('export '.length).trimStart()
    : trimmedLine

  if (!withoutExport.startsWith(key)) return null

  const remainder = withoutExport.slice(key.length).trimStart()
  if (!remainder.startsWith('=')) return null

  const value = remainder.slice(1).trim()
  return value.length > 0 ? value : null
}

function findAnyEnvAssignment(line: string, keys: readonly string[]): EnvKeySource | null {
  for (const key of keys) {
    const value = readEnvAssignmentValue(line, key)
    if (value) {
      return {
        key,
        source: '',
        value,
      }
    }
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
      return { key, source: `process.env.${key}`, value: value.trim() }
    }
  }

  for (const envSource of project.envSources) {
    for (const line of envSource.text.split(/\r?\n/)) {
      const matchedKey = findAnyEnvAssignment(line, keys)
      if (matchedKey) {
        return { ...matchedKey, source: envSource.path }
      }
    }
  }

  return null
}

function isPublicFacingSourcePath(filePath: string): boolean {
  const normalized = filePath.replaceAll('\\', '/')
  if (/\/convex\//.test(normalized)) return false

  return /\/(?:app|components|composables|layouts|pages|plugins|shared|utils)\//.test(normalized)
}

export function findIdentityForwardingPublicExposure(
  project: ProjectInspection,
): ProjectSourceLocation[] {
  const findings: ProjectSourceLocation[] = []

  if (
    typeof process.env.NUXT_PUBLIC_CONVEX_IDENTITY_FORWARDING_KEY === 'string' &&
    process.env.NUXT_PUBLIC_CONVEX_IDENTITY_FORWARDING_KEY.trim()
  ) {
    findings.push({
      path: 'process.env.NUXT_PUBLIC_CONVEX_IDENTITY_FORWARDING_KEY',
      line: 1,
    })
  }

  for (const envSource of project.envSources) {
    const lines = envSource.text.split(/\r?\n/)
    for (const [index, line] of lines.entries()) {
      if (readEnvAssignmentValue(line, 'NUXT_PUBLIC_CONVEX_IDENTITY_FORWARDING_KEY')) {
        findings.push({
          path: envSource.path,
          line: index + 1,
        })
      }
    }
  }

  const publicRuntimeConfigMatch = project.nuxtConfigText.match(
    /runtimeConfig\s*:\s*\{[\s\S]*?\bpublic\s*:\s*\{[\s\S]*?CONVEX_IDENTITY_FORWARDING_KEY/,
  )
  if (project.nuxtConfigPath && publicRuntimeConfigMatch?.index !== undefined) {
    findings.push({
      path: project.nuxtConfigPath,
      line: project.nuxtConfigText.slice(0, publicRuntimeConfigMatch.index).split(/\r?\n/).length,
    })
  }

  for (const sourceFile of project.sourceFiles) {
    if (!isPublicFacingSourcePath(sourceFile.path)) continue

    const match =
      sourceFile.text.match(
        /\b(?:CONVEX_IDENTITY_FORWARDING_KEY|NUXT_PUBLIC_CONVEX_IDENTITY_FORWARDING_KEY)\b/,
      ) ?? null
    if (!match?.index && match?.index !== 0) continue

    findings.push({
      path: sourceFile.path,
      line: sourceFile.text.slice(0, match.index).split(/\r?\n/).length,
    })
  }

  return findings
}

export function isAuthExplicitlyDisabled(project: ProjectInspection): boolean {
  return (
    /trellis\s*:\s*\{[\s\S]*?\bauth\s*:\s*false\b/.test(project.nuxtConfigText) ||
    /trellis\s*:\s*\{[\s\S]*?\bauth\s*:\s*\{[\s\S]*?\benabled\s*:\s*false\b/.test(
      project.nuxtConfigText,
    )
  )
}

export function isAuthExplicitlyEnabled(project: ProjectInspection): boolean {
  if (isAuthExplicitlyDisabled(project)) return false
  return /trellis\s*:\s*\{[\s\S]*?\bauth\s*:\s*(?:true|\{)/.test(project.nuxtConfigText)
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

export function usesTrellisUsersTable(project: ProjectInspection): boolean {
  return project.sourceFiles.some((file) =>
    /\.query\(\s*['"]users['"]\s*\)|withIndex\(\s*['"]by_auth_key['"]\s*|defineTable\(\s*\{[\s\S]*?\bauthKey\s*:/.test(
      file.text,
    ),
  )
}

export function hasBetterAuthBootstrapExport(project: ProjectInspection): boolean {
  const convexAuthSource = findConvexAuthSource(project)
  if (!convexAuthSource) return false

  return /\bcreateUserIfNeeded\b/.test(convexAuthSource.text)
}

export function usesIdentityForwardingSurfaces(project: ProjectInspection): boolean {
  if (/#trellis\/mcp|@lupinum\/trellis\/mcp|defineConvexTool\s*\(/.test(project.nuxtConfigText)) {
    return true
  }

  return project.sourceFiles.some((file) =>
    /#trellis\/mcp|@lupinum\/trellis\/mcp|defineConvexTool\s*\(|identityForwardingKey\b/.test(
      file.text,
    ),
  )
}

export function usesMcpRateLimit(project: ProjectInspection): boolean {
  return project.sourceFiles.some((file) => /\brateLimit\s*:\s*\{\s*max\s*:/.test(file.text))
}

function projectHasNamedRedisStoreFactory(project: ProjectInspection, name: string): boolean {
  const pattern = new RegExp(
    `\\b(?:export\\s+)?(?:const|let|var)\\s+${escapeRegex(name)}\\s*=\\s*createRedisMcpRateLimitStore\\s*\\(`,
  )

  return project.sourceFiles.some((sourceFile) => pattern.test(sourceFile.text))
}

function unwrapExpression(node: Node | undefined): Node | undefined {
  if (!node) return undefined

  if (
    Node.isParenthesizedExpression(node) ||
    Node.isAsExpression(node) ||
    Node.isTypeAssertion(node) ||
    Node.isSatisfiesExpression(node)
  ) {
    return unwrapExpression(node.getExpression())
  }

  return node
}

function isRedisStoreCall(node: Node | undefined): boolean {
  const expression = unwrapExpression(node)
  if (!expression || !Node.isCallExpression(expression)) return false

  const callee = expression.getExpression()
  return Node.isIdentifier(callee) && callee.getText() === 'createRedisMcpRateLimitStore'
}

function resolveImportedVariableDeclaration(
  identifier: import('ts-morph').Identifier,
): import('ts-morph').VariableDeclaration | undefined {
  const definitions = identifier.getDefinitions()

  for (const definition of definitions) {
    const declaration = definition.getDeclarationNode()
    if (!declaration) continue

    if (Node.isVariableDeclaration(declaration)) {
      return declaration
    }

    if (!Node.isImportSpecifier(declaration)) continue

    const importDeclaration = declaration.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)
    const importedSourceFile = importDeclaration?.getModuleSpecifierSourceFile()
    if (!importedSourceFile) continue

    const bindingName = declaration.getNameNode().getText()
    const exportedDeclarations = importedSourceFile.getExportedDeclarations().get(bindingName)
    const exportedVariable = exportedDeclarations?.find((node) => Node.isVariableDeclaration(node))

    if (exportedVariable && Node.isVariableDeclaration(exportedVariable)) {
      return exportedVariable
    }
  }

  return undefined
}

function propertyUsesSupportedRedisStore(
  project: ProjectInspection,
  property: import('ts-morph').ObjectLiteralElementLike,
): boolean {
  if (Node.isPropertyAssignment(property)) {
    const initializer = unwrapExpression(property.getInitializer())
    if (isRedisStoreCall(initializer)) {
      return true
    }

    if (initializer && Node.isIdentifier(initializer)) {
      const importedVariable = resolveImportedVariableDeclaration(initializer)
      if (importedVariable && isRedisStoreCall(importedVariable.getInitializer())) {
        return true
      }

      return projectHasNamedRedisStoreFactory(project, initializer.getText())
    }
  }

  if (Node.isShorthandPropertyAssignment(property)) {
    const importedVariable = resolveImportedVariableDeclaration(property.getNameNode())
    if (importedVariable && isRedisStoreCall(importedVariable.getInitializer())) {
      return true
    }

    return projectHasNamedRedisStoreFactory(project, property.getName())
  }

  return false
}

export function findMcpRateLimitStoreSupport(
  project: ProjectInspection,
): 'supported' | 'unverified' | 'none' {
  const analysis = createAnalysisProject(project)
  let sawExplicitStore = false

  for (const sourceFile of analysis.getSourceFiles()) {
    for (const objectLiteral of sourceFile.getDescendantsOfKind(
      SyntaxKind.ObjectLiteralExpression,
    )) {
      const property = objectLiteral
        .getProperties()
        .find((candidate) => getPropertyName(candidate) === 'rateLimitStore')

      if (!property) continue

      sawExplicitStore = true
      if (propertyUsesSupportedRedisStore(project, property)) {
        return 'supported'
      }
    }
  }

  return sawExplicitStore ? 'unverified' : 'none'
}

export function usesPermissionSurfaces(project: ProjectInspection): boolean {
  return project.sourceFiles.some((file) => /\buseAccess\s*\(|\buseAuthGuard\s*\(/.test(file.text))
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

export function findForwardedCallerWithoutTrustedAuth(
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

      const hasCaller = objectLiteral
        .getProperties()
        .some((property) => getPropertyName(property) === 'caller')
      if (!hasCaller || objectHasTrustedAuth(objectLiteral)) continue

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
    if (/tool\.operation\s*\(/.test(sourceFile.text)) continue
    if (
      !/export\s+default\s+tool\.(?:query|mutation)\s*\(|defineConvexTool\s*\(/.test(
        sourceFile.text,
      )
    ) {
      continue
    }
    if (!looksDestructiveTool(sourceFile.text, sourceFile.path)) continue

    const firstMatch =
      sourceFile.text.match(
        /export\s+default\s+tool\.(?:query|mutation)\s*\(|defineConvexTool\s*\(|delete|remove|archive|revoke|destroy|purge|bulk-delete|bulkDelete/i,
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

export function findCustomMcpToolsWithAppWrites(
  project: ProjectInspection,
): ProjectSourceLocation[] {
  const findings: ProjectSourceLocation[] = []

  for (const sourceFile of project.sourceFiles) {
    if (!/[/\\]server[/\\]mcp[/\\]tools[/\\].+\.(?:[cm]?[jt]s|tsx?)$/.test(sourceFile.path)) {
      continue
    }
    if (!/defineTool\s*\(/.test(sourceFile.text)) continue
    const match = sourceFile.text.match(/ctx\.(?:mutation|action)\s*\(/)
    if (!match) continue

    findings.push({
      path: sourceFile.path,
      line: sourceFile.text.slice(0, match.index ?? 0).split(/\r?\n/).length,
    })
  }

  return findings
}

function getUnsafeCallSurface(
  call: import('ts-morph').CallExpression,
): ProjectUnsafeSurfaceKind | null {
  const callee = unwrapExpression(call.getExpression())
  if (!callee || !Node.isPropertyAccessExpression(callee)) return null

  const method = callee.getName()
  const receiver = callee.getExpression()

  if (
    method === 'unsafe' &&
    Node.isIdentifier(receiver) &&
    (receiver.getText() === 'query' ||
      receiver.getText() === 'mutation' ||
      receiver.getText() === 'action')
  ) {
    return receiver.getText() as ProjectUnsafeSurfaceKind
  }

  if (
    Node.isIdentifier(receiver) &&
    receiver.getText() === 'unsafe' &&
    (method === 'query' || method === 'mutation' || method === 'action')
  ) {
    return method as ProjectUnsafeSurfaceKind
  }

  return null
}

function readStaticString(node: Node | undefined): string | undefined {
  const expression = unwrapExpression(node)
  if (!expression) return undefined
  if (Node.isStringLiteral(expression) || Node.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.getLiteralText()
  }
  return undefined
}

function readStaticStringArrayCount(node: Node | undefined): number | undefined {
  const expression = unwrapExpression(node)
  if (!expression || !Node.isArrayLiteralExpression(expression)) return undefined

  let count = 0
  for (const element of expression.getElements()) {
    const value = readStaticString(element)
    if (!value) return undefined
    count += 1
  }
  return count
}

function getPropertyAssignment(
  objectLiteral: import('ts-morph').ObjectLiteralExpression,
  name: string,
): import('ts-morph').PropertyAssignment | null {
  const property = objectLiteral.getProperties().find((entry) => getPropertyName(entry) === name)
  return property && Node.isPropertyAssignment(property) ? property : null
}

function readUnsafePermit(
  permitProperty: import('ts-morph').PropertyAssignment,
): ProjectUnsafeEntrypoint['permit'] | null {
  const initializer = unwrapExpression(permitProperty.getInitializer())
  if (!initializer || !Node.isCallExpression(initializer)) return null

  const callee = unwrapExpression(initializer.getExpression())
  if (!callee || !Node.isPropertyAccessExpression(callee)) return null
  if (callee.getName() !== 'permit') return null
  if (!Node.isIdentifier(callee.getExpression()) || callee.getExpression().getText() !== 'unsafe') {
    return null
  }

  const permitArg = unwrapExpression(initializer.getArguments()[0])
  if (!permitArg || !Node.isObjectLiteralExpression(permitArg)) return null

  const kind = readStaticString(getPropertyAssignment(permitArg, 'kind')?.getInitializer())
  const scopeCount = readStaticStringArrayCount(
    getPropertyAssignment(permitArg, 'scope')?.getInitializer(),
  )
  const hasReviewBy = Boolean(getPropertyAssignment(permitArg, 'reviewBy'))

  return {
    ...(kind ? { kind } : {}),
    ...(scopeCount !== undefined ? { scopeCount } : {}),
    hasReviewBy,
  }
}

function classifyUnsafePermit(objectLiteral: import('ts-morph').ObjectLiteralExpression): {
  style: ProjectUnsafePermitStyle
  permit?: ProjectUnsafeEntrypoint['permit']
} {
  if (getPropertyAssignment(objectLiteral, 'bypass')) {
    return { style: 'string-bypass' }
  }

  const permitProperty = getPropertyAssignment(objectLiteral, 'permit')
  if (!permitProperty) {
    return { style: 'missing' }
  }

  const permit = readUnsafePermit(permitProperty)
  return permit ? { style: 'typed-permit', permit } : { style: 'unknown' }
}

function getExportedVariableName(call: import('ts-morph').CallExpression): string | null {
  const declaration = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)
  if (!declaration?.getVariableStatement()?.isExported()) return null
  return declaration.getName()
}

export function findUnsafeSurfaceEntries(project: ProjectInspection): ProjectUnsafeEntrypoint[] {
  const analysis = createAnalysisProject(project)
  const findings: ProjectUnsafeEntrypoint[] = []

  for (const sourceFile of analysis.getSourceFiles()) {
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const surface = getUnsafeCallSurface(call)
      if (!surface) continue

      const firstArg = unwrapExpression(call.getArguments()[0])
      const permitInfo =
        firstArg && Node.isObjectLiteralExpression(firstArg)
          ? classifyUnsafePermit(firstArg)
          : { style: 'unknown' as const }

      findings.push({
        exportName: getExportedVariableName(call),
        surface,
        style: permitInfo.style,
        path: sourceFile.getFilePath(),
        line: call.getStartLineNumber(),
        ...(permitInfo.permit ? { permit: permitInfo.permit } : {}),
      })
    }
  }

  return findings
}

export function findCrossTenantEscapeInventory(
  project: ProjectInspection,
): ProjectSourceLocation[] {
  const analysis = createAnalysisProject(project)
  const findings: ProjectSourceLocation[] = []

  for (const sourceFile of analysis.getSourceFiles()) {
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = unwrapExpression(call.getExpression())
      if (!callee || !Node.isPropertyAccessExpression(callee)) continue
      if (callee.getName() !== 'escapeIsolation') continue

      findings.push({
        path: sourceFile.getFilePath(),
        line: call.getStartLineNumber(),
      })
    }
  }

  return findings
}

export function findDestructiveOperationInventory(
  project: ProjectInspection,
): ProjectSourceLocation[] {
  const analysis = createAnalysisProject(project)
  const findings: ProjectSourceLocation[] = []

  for (const sourceFile of analysis.getSourceFiles()) {
    for (const objectLiteral of sourceFile.getDescendantsOfKind(
      SyntaxKind.ObjectLiteralExpression,
    )) {
      const kindProperty = objectLiteral
        .getProperties()
        .find((property) => getPropertyName(property) === 'kind')
      if (!kindProperty || !Node.isPropertyAssignment(kindProperty)) continue

      const initializer = unwrapExpression(kindProperty.getInitializer())
      if (
        !initializer ||
        (!Node.isStringLiteral(initializer) && !Node.isNoSubstitutionTemplateLiteral(initializer))
      ) {
        continue
      }

      if (initializer.getLiteralText() !== 'destructive') continue

      findings.push({
        path: sourceFile.getFilePath(),
        line: objectLiteral.getStartLineNumber(),
      })
    }
  }

  return findings
}
