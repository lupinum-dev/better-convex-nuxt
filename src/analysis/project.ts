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

export interface IsolationMetadata {
  tables: string[]
  sharedTables: string[]
  field: string
  indexName: string
  source: 'manifest' | 'functions'
}

export interface SchemaTableMetadata {
  name: string
  fields: string[]
  indexes: string[]
}

export interface ProjectAnalysis {
  rootDir: string
  isolation: IsolationMetadata | null
  destructiveOperations: {
    confirmationTable: string
    auditTable: string
  } | null
  schemaTables: SchemaTableMetadata[]
}

export interface AnalyzerIsolationOverride {
  tables?: string[]
  sharedTables?: string[]
  field?: string
  indexName?: string
}

function readTextIfExists(path: string): string | null {
  if (!existsSync(path)) return null
  return readFileSync(path, 'utf8')
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

function dedupePreservingStrings(values: readonly string[]): string[] {
  const unique: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    unique.push(value)
  }

  return unique
}

function dedupeSchemaTables(tables: readonly SchemaTableMetadata[]): SchemaTableMetadata[] {
  const byName = new Map<string, SchemaTableMetadata>()

  for (const table of tables) {
    if (!byName.has(table.name)) {
      byName.set(table.name, table)
    }
  }

  return [...byName.values()]
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
      /export\s+const\s+(\w+)\s*=\s*(?:(?:[\w$]+\.)?(?:query|mutation|action|internalQuery|internalMutation|internalAction)(?:\.(?:public|protected|unsafe))?|[\w$]+Query|[\w$]+Mutation)\s*\(/g,
    )) {
      paths.add(`${relativeFile}.${match[1]}`)
    }
    if (text.includes('@trellis-bridge-package:')) {
      for (const match of text.matchAll(/export\s+const\s+(\w+)\s*=\s*[\w$]+\.[\w$]+/g)) {
        paths.add(`${relativeFile}.${match[1]}`)
      }
    }
  }

  return [...paths].sort()
}

function parseIsolationFromFunctions(
  source: string,
): Omit<IsolationMetadata, 'indexName' | 'source'> | null {
  const marker = source.indexOf('isolation')
  if (marker === -1) return null

  const objectStart = source.indexOf('{', marker)
  if (objectStart === -1) return null
  const objectEnd = findMatchingToken(source, objectStart, '{', '}')
  if (objectEnd === -1) return null

  const objectText = source.slice(objectStart + 1, objectEnd)
  const tablesMatch = objectText.match(/tables\s*:\s*\[([\s\S]*?)\]/)
  const sharedTablesMatch = objectText.match(/sharedTables\s*:\s*\[([\s\S]*?)\]/)
  const fieldMatch = objectText.match(/field\s*:\s*['"]([^'"]+)['"]/)

  return {
    tables: parseStringArray(tablesMatch?.[1]),
    sharedTables: parseStringArray(sharedTablesMatch?.[1]),
    field: fieldMatch?.[1] ?? 'workspaceId',
  }
}

function parseDestructiveOperationsFromFunctions(
  source: string,
): ProjectAnalysis['destructiveOperations'] {
  const marker = source.indexOf('destructiveOperations')
  if (marker === -1) return null

  const objectStart = source.indexOf('{', marker)
  if (objectStart === -1) return null
  const objectEnd = findMatchingToken(source, objectStart, '{', '}')
  if (objectEnd === -1) return null

  const objectText = source.slice(objectStart + 1, objectEnd)
  const confirmationMatch = objectText.match(/confirmationTable\s*:\s*['"]([^'"]+)['"]/)
  const auditMatch = objectText.match(/auditTable\s*:\s*['"]([^'"]+)['"]/)
  if (!confirmationMatch || !auditMatch) return null

  return {
    confirmationTable: confirmationMatch[1]!,
    auditTable: auditMatch[1]!,
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

function collectFeatureFiles(
  rootDir: string,
  expectedBaseName: 'schema' | 'feature',
): Array<{ path: string; text: string }> {
  const featuresDir = resolve(rootDir, 'convex/features')
  if (!existsSync(featuresDir)) return []

  const files: Array<{ path: string; text: string }> = []
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }
      if (!entry.isFile()) continue
      if (!new RegExp(`${expectedBaseName}\\.[cm]?[jt]sx?$`, 'u').test(entry.name)) continue

      files.push({
        path: fullPath,
        text: readFileSync(fullPath, 'utf8'),
      })
    }
  }

  walk(featuresDir)
  return files
}

function parseFeatureClassification(
  source: string,
): Pick<IsolationMetadata, 'tables' | 'sharedTables'> {
  const marker = source.indexOf('defineFeature')
  if (marker === -1) return { tables: [], sharedTables: [] }

  const objectStart = source.indexOf('{', marker)
  if (objectStart === -1) return { tables: [], sharedTables: [] }
  const objectEnd = findMatchingToken(source, objectStart, '{', '}')
  if (objectEnd === -1) return { tables: [], sharedTables: [] }

  const objectText = source.slice(objectStart + 1, objectEnd)
  const tablesMatch = objectText.match(/tenantTables\s*:\s*\[([\s\S]*?)\]/)
  const sharedTablesMatch = objectText.match(/sharedTables\s*:\s*\[([\s\S]*?)\]/)

  return {
    tables: parseStringArray(tablesMatch?.[1]),
    sharedTables: parseStringArray(sharedTablesMatch?.[1]),
  }
}

function hasTenantShape(table: SchemaTableMetadata, field: string, indexName: string): boolean {
  return table.fields.includes(field) && table.indexes.includes(indexName)
}

const analysisCache = new Map<string, ProjectAnalysis>()

export function analyzeProject(
  rootDir: string,
  override?: AnalyzerIsolationOverride,
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
  const featureSchemaTables = collectFeatureFiles(normalizedRoot, 'schema').flatMap((file) =>
    parseSchemaTables(file.text),
  )
  const featureClassifications = collectFeatureFiles(normalizedRoot, 'feature').map((file) =>
    parseFeatureClassification(file.text),
  )
  const manifestSharedTables = dedupePreservingStrings(
    featureClassifications.flatMap((entry) => entry.sharedTables),
  )
  const manifestTenantOverrides = dedupePreservingStrings(
    featureClassifications.flatMap((entry) => entry.tables),
  )

  const discoveredIsolation = parseIsolationFromFunctions(functionsSource)
  const destructiveOperations = parseDestructiveOperationsFromFunctions(functionsSource)
  const resolvedField = override?.field ?? discoveredIsolation?.field ?? 'workspaceId'
  const resolvedIndexName = override?.indexName ?? normalizeTenantIndexName(resolvedField)
  const schemaTables = dedupeSchemaTables([
    ...(schemaSource ? parseSchemaTables(schemaSource) : []),
    ...featureSchemaTables,
  ])
  const derivedManifestTenantTables = dedupePreservingStrings(
    featureSchemaTables
      .filter((table) => hasTenantShape(table, resolvedField, resolvedIndexName))
      .map((table) => table.name),
  )
  const manifestTenantTables = dedupePreservingStrings([
    ...derivedManifestTenantTables,
    ...manifestTenantOverrides,
  ]).filter((table) => !manifestSharedTables.includes(table))
  const isolationTables =
    override?.tables ??
    (manifestTenantTables.length > 0 ? manifestTenantTables : discoveredIsolation?.tables) ??
    []
  const isolationSharedTables =
    override?.sharedTables ??
    (manifestSharedTables.length > 0 ? manifestSharedTables : discoveredIsolation?.sharedTables) ??
    []
  const isolationSource: IsolationMetadata['source'] =
    featureSchemaTables.length > 0 ||
    manifestSharedTables.length > 0 ||
    manifestTenantOverrides.length > 0
      ? 'manifest'
      : 'functions'

  const analysis: ProjectAnalysis = {
    rootDir: normalizedRoot,
    isolation:
      isolationTables.length > 0 || isolationSharedTables.length > 0
        ? {
            tables: [...isolationTables],
            sharedTables: [...isolationSharedTables],
            field: resolvedField,
            indexName: resolvedIndexName,
            source: isolationSource,
          }
        : null,
    destructiveOperations,
    schemaTables,
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
  settings: { isolation?: unknown } | undefined,
): AnalyzerIsolationOverride | undefined {
  const raw = settings?.isolation
  if (!raw || typeof raw !== 'object') return undefined

  const record = raw as Record<string, unknown>
  return {
    tables: Array.isArray(record.tables)
      ? record.tables.filter((value): value is string => typeof value === 'string')
      : undefined,
    sharedTables: Array.isArray(record.sharedTables)
      ? record.sharedTables.filter((value): value is string => typeof value === 'string')
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
