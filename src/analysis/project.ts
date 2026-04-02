import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const SOURCE_DIRECTORIES = [
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

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.cts',
  '.mjs',
  '.cjs',
  '.vue',
  '.md',
])

export interface TenantIsolationMetadata {
  tables: string[]
  field: string
  indexName: string
}

export interface SchemaTableMetadata {
  name: string
  fields: string[]
  indexes: string[]
}

export interface ProjectAnalysis {
  rootDir: string
  tenantIsolation: TenantIsolationMetadata | null
  schemaTables: SchemaTableMetadata[]
}

export interface AnalyzerTenantIsolationOverride {
  tables?: string[]
  field?: string
  indexName?: string
}

function readTextIfExists(path: string): string | null {
  if (!existsSync(path)) return null
  return readFileSync(path, 'utf8')
}

function skipTrivia(source: string, index: number): number {
  let cursor = index
  while (cursor < source.length) {
    const char = source[cursor]
    const next = source[cursor + 1]
    if (char == null) break

    if (/\s/u.test(char)) {
      cursor++
      continue
    }

    if (char === '/' && next === '/') {
      cursor += 2
      while (cursor < source.length && source[cursor] !== '\n') cursor++
      continue
    }

    if (char === '/' && next === '*') {
      cursor += 2
      while (cursor < source.length && !(source[cursor] === '*' && source[cursor + 1] === '/')) {
        cursor++
      }
      cursor += 2
      continue
    }

    break
  }

  return cursor
}

function findMatchingToken(source: string, start: number, open: string, close: string): number {
  let depth = 0
  let cursor = start
  let quote: '"' | "'" | '`' | null = null

  while (cursor < source.length) {
    const char = source[cursor]
    const next = source[cursor + 1]

    if (quote) {
      if (char === '\\') {
        cursor += 2
        continue
      }
      if (char === quote) {
        quote = null
      }
      cursor++
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      cursor++
      continue
    }

    if (char === '/' && next === '/') {
      cursor += 2
      while (cursor < source.length && source[cursor] !== '\n') cursor++
      continue
    }

    if (char === '/' && next === '*') {
      cursor += 2
      while (cursor < source.length && !(source[cursor] === '*' && source[cursor + 1] === '/')) {
        cursor++
      }
      cursor += 2
      continue
    }

    if (char === open) depth++
    if (char === close) {
      depth--
      if (depth === 0) return cursor
    }

    cursor++
  }

  return -1
}

function snakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
}

export function normalizeTenantIndexName(field = 'workspaceId'): string {
  const base = field.endsWith('Id') ? field.slice(0, -2) : field
  return `by_${snakeCase(base)}`
}

function parseStringArray(raw: string | undefined): string[] {
  if (!raw) return []
  const values: string[] = []
  for (const match of raw.matchAll(/['"]([^'"]+)['"]/g)) {
    values.push(match[1]!)
  }
  return values
}

export function collectConvexFunctionPaths(projectRoot: string): string[] {
  const convexDir = resolve(projectRoot, 'convex')
  if (!existsSync(convexDir)) return []

  const files: string[] = []
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '_generated') continue
      const fullPath = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }
      if (/\.[cm]?[jt]sx?$/u.test(entry.name)) {
        files.push(fullPath)
      }
    }
  }

  walk(convexDir)

  const paths = new Set<string>()
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const relativeFile = file
      .slice(convexDir.length + 1)
      .replaceAll('\\', '/')
      .replace(/\.[^.]+$/, '')
    for (const match of text.matchAll(
      /export\s+const\s+(\w+)\s*=\s*(?:(?:[\w$]+\.)?(?:query|mutation|action|internalQuery|internalMutation|internalAction)|[\w$]+Query|[\w$]+Mutation)\s*\(/g,
    )) {
      paths.add(`${relativeFile}.${match[1]}`)
    }
  }

  return [...paths].sort()
}

function parseTenantIsolationFromFunctions(
  source: string,
): Omit<TenantIsolationMetadata, 'indexName'> | null {
  const marker = source.indexOf('tenantIsolation')
  if (marker === -1) return null

  const objectStart = source.indexOf('{', marker)
  if (objectStart === -1) return null
  const objectEnd = findMatchingToken(source, objectStart, '{', '}')
  if (objectEnd === -1) return null

  const objectText = source.slice(objectStart + 1, objectEnd)
  const tablesMatch = objectText.match(/tables\s*:\s*\[([\s\S]*?)\]/)
  const fieldMatch = objectText.match(/field\s*:\s*['"]([^'"]+)['"]/)

  return {
    tables: parseStringArray(tablesMatch?.[1]),
    field: fieldMatch?.[1] ?? 'workspaceId',
  }
}

function parseSchemaTables(source: string): SchemaTableMetadata[] {
  const tables: SchemaTableMetadata[] = []
  const tableRegex = /(\w+)\s*:\s*defineTable\s*\(/g

  for (const match of source.matchAll(tableRegex)) {
    const name = match[1]
    const callStart = source.indexOf('(', match.index! + match[0].length - 1)
    if (callStart === -1) continue

    const objectStart = source.indexOf('{', callStart)
    if (objectStart === -1) continue
    const objectEnd = findMatchingToken(source, objectStart, '{', '}')
    if (objectEnd === -1) continue
    const callEnd = findMatchingToken(source, callStart, '(', ')')
    if (callEnd === -1) continue

    const fieldsText = source.slice(objectStart + 1, objectEnd)
    const fields = [...fieldsText.matchAll(/\b([a-z_]\w*)\s*:/gi)].map((entry) => entry[1]!)

    const nextTableStart = (() => {
      tableRegex.lastIndex = callEnd + 1
      const next = tableRegex.exec(source)
      tableRegex.lastIndex = 0
      return next?.index ?? source.length
    })()
    const chainText = source.slice(callEnd + 1, nextTableStart)
    const indexes = [...chainText.matchAll(/\.index\s*\(\s*(['"])([^'"]+)\1/g)].map(
      (entry) => entry[2]!,
    )

    tables.push({
      name: name!,
      fields,
      indexes,
    })
  }

  return tables
}

const analysisCache = new Map<string, ProjectAnalysis>()

export function analyzeProject(
  rootDir: string,
  override?: AnalyzerTenantIsolationOverride,
): ProjectAnalysis {
  const normalizedRoot = resolve(rootDir)
  const cacheKey = JSON.stringify({
    root: normalizedRoot,
    override: override ?? null,
  })
  const cached = analysisCache.get(cacheKey)
  if (cached) return cached

  const functionsSource = readTextIfExists(resolve(normalizedRoot, 'convex/functions.ts')) ?? ''
  const schemaSource = readTextIfExists(resolve(normalizedRoot, 'convex/schema.ts')) ?? ''

  const discoveredTenantIsolation = parseTenantIsolationFromFunctions(functionsSource)
  const resolvedField = override?.field ?? discoveredTenantIsolation?.field ?? 'workspaceId'
  const resolvedIndexName = override?.indexName ?? normalizeTenantIndexName(resolvedField)
  const tenantIsolationTables = override?.tables ?? discoveredTenantIsolation?.tables ?? []

  const analysis: ProjectAnalysis = {
    rootDir: normalizedRoot,
    tenantIsolation:
      tenantIsolationTables.length > 0
        ? {
            tables: [...tenantIsolationTables],
            field: resolvedField,
            indexName: resolvedIndexName,
          }
        : null,
    schemaTables: schemaSource ? parseSchemaTables(schemaSource) : [],
  }

  analysisCache.set(cacheKey, analysis)
  return analysis
}

export function findProjectRoot(startPath: string): string | null {
  let current = resolve(dirname(startPath))

  while (true) {
    if (existsSync(resolve(current, 'convex')) || existsSync(resolve(current, 'package.json'))) {
      return current
    }
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

export function collectProjectSourceFiles(rootDir: string): Array<{ path: string; text: string }> {
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
      if (!entry.isFile()) continue

      const extension = fullPath.slice(fullPath.lastIndexOf('.'))
      if (!SOURCE_EXTENSIONS.has(extension)) continue

      files.push({
        path: fullPath,
        text: readFileSync(fullPath, 'utf8'),
      })
    }
  }

  for (const directory of SOURCE_DIRECTORIES) {
    const fullPath = resolve(rootDir, directory)
    if (!existsSync(fullPath) || !statSync(fullPath).isDirectory()) continue
    walk(fullPath)
  }

  return files
}

export function resolveAnalyzerTenantOverride(
  settings: Record<string, unknown> | undefined,
): AnalyzerTenantIsolationOverride | undefined {
  const raw = settings?.tenantIsolation
  if (!raw || typeof raw !== 'object') return undefined

  const record = raw as Record<string, unknown>
  return {
    tables: Array.isArray(record.tables)
      ? record.tables.filter((value): value is string => typeof value === 'string')
      : undefined,
    field: typeof record.field === 'string' ? record.field : undefined,
    indexName: typeof record.indexName === 'string' ? record.indexName : undefined,
  }
}

export function findSchemaTable(
  analysis: ProjectAnalysis,
  tableName: string,
): SchemaTableMetadata | undefined {
  return analysis.schemaTables.find((table) => table.name === tableName)
}

export function hasTenantCollectionMethod(nodeName: string): boolean {
  return nodeName === 'collect' || nodeName === 'take' || nodeName === 'first'
}

export function isNullishBooleanLiteral(raw: string | null | undefined): boolean {
  if (!raw) return false
  const normalized = raw.trim()
  return normalized === 'false' || normalized === '{{ false }}'
}

export function readBraceObjectLiteral(source: string, marker: string): string | null {
  const markerIndex = source.indexOf(marker)
  if (markerIndex === -1) return null

  const colonIndex = source.indexOf(':', markerIndex)
  if (colonIndex === -1) return null

  const objectStart = skipTrivia(source, colonIndex + 1)
  if (source[objectStart] !== '{') return null
  const objectEnd = findMatchingToken(source, objectStart, '{', '}')
  if (objectEnd === -1) return null
  return source.slice(objectStart, objectEnd + 1)
}
