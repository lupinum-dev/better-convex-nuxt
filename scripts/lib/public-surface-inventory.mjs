import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

const textExtensions = new Set(['.md', '.mdc', '.ts', '.tsx', '.mts', '.vue', '.json'])
const ignoredDirectories = new Set(['.git', '.nuxt', '.output', 'coverage', 'dist', 'node_modules'])

function read(rootDir, path) {
  return readFileSync(resolve(rootDir, path), 'utf8')
}

function walk(rootDir, directory) {
  const fullDirectory = resolve(rootDir, directory)
  if (!existsSync(fullDirectory)) return []
  const rootStats = statSync(fullDirectory)
  if (rootStats.isFile()) return [directory.replaceAll('\\', '/')]

  const entries = []
  for (const entry of readdirSync(fullDirectory)) {
    if (ignoredDirectories.has(entry)) continue
    const fullPath = join(fullDirectory, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      entries.push(...walk(rootDir, relative(rootDir, fullPath)))
      continue
    }
    entries.push(relative(rootDir, fullPath).replaceAll('\\', '/'))
  }
  return entries.sort((a, b) => a.localeCompare(b))
}

function unique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

function extractNames(block) {
  const names = []
  for (const match of block.matchAll(/name:\s*['"]([^'"]+)['"]/g)) {
    names.push(match[1])
  }
  return unique(names)
}

function extractCallBlock(source, callName) {
  const start = source.indexOf(`${callName}([`)
  if (start === -1) return ''

  let depth = 0
  let quote = ''
  let escaped = false
  for (let index = start; index < source.length; index++) {
    const char = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = ''
      }
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }
    if (char === '(' || char === '[' || char === '{') depth++
    if (char === ')' || char === ']' || char === '}') depth--
    if (depth === 0 && char === ')') return source.slice(start, index + 1)
  }
  return ''
}

function extractAliases(source) {
  const aliases = []
  for (const match of source.matchAll(/nuxt\.options\.alias\[['"]([^'"]+)['"]\]/g)) {
    aliases.push(match[1])
  }
  return unique(aliases)
}

function extractTemplateNames(source) {
  const names = []
  for (const match of source.matchAll(/template\s*!==\s*['"]([^'"]+)['"]/g)) {
    names.push(match[1])
  }
  for (const match of source.matchAll(/template\s*===\s*['"]([^'"]+)['"]/g)) {
    names.push(match[1])
  }
  return unique(names)
}

function extractCliCommands(source) {
  const commands = []
  for (const match of source.matchAll(/^\s+([a-zA-Z][\w-]*):\s*[a-zA-Z]\w*Command,/gm)) {
    commands.push(match[1])
  }
  return unique(commands)
}

function grepFiles(rootDir, directories, patterns) {
  const rows = []
  const files = directories.flatMap((directory) => walk(rootDir, directory))
  for (const file of files) {
    if (!textExtensions.has(extname(file))) continue
    const source = read(rootDir, file)
    const matched = patterns.filter((pattern) => source.includes(pattern))
    if (matched.length === 0) continue
    rows.push({ file, matches: matched })
  }
  return rows
}

function existingSources(rootDir, files) {
  return files
    .filter((file) => existsSync(resolve(rootDir, file)))
    .map((file) => read(rootDir, file))
    .join('\n')
}

export function collectRepoPublicSurfaceInventory(rootDir) {
  const packageJson = JSON.parse(read(rootDir, 'package.json'))
  const coreInstaller = read(rootDir, 'src/installers/core.ts')
  const authInstaller = read(rootDir, 'src/installers/auth.ts')
  const permissionsInstaller = read(rootDir, 'src/installers/permissions.ts')
  const mainCli = read(rootDir, 'src/cli/main.ts')
  const initCommand = read(rootDir, 'src/cli/commands/init.ts')
  const authComponentDir = resolve(rootDir, 'src/runtime/auth/ui')
  const installerSources = existingSources(rootDir, [
    'src/installers/core.ts',
    'src/installers/auth.ts',
    'src/installers/permissions.ts',
    'src/installers/advanced.ts',
  ])

  const autoImports = [
    ...extractNames(extractCallBlock(coreInstaller, 'addImports')).map((name) => ({
      layer: 'core',
      name,
    })),
    ...extractNames(extractCallBlock(authInstaller, 'addImports')).map((name) => ({
      layer: 'auth',
      name,
    })),
    ...extractNames(extractCallBlock(permissionsInstaller, 'addImports')).map((name) => ({
      layer: 'permissions',
      name,
    })),
  ].sort((a, b) => `${a.layer}:${a.name}`.localeCompare(`${b.layer}:${b.name}`))

  return {
    packageExports: Object.keys(packageJson.exports).sort((a, b) => a.localeCompare(b)),
    runtimeBarrels: walk(rootDir, 'src/runtime').filter((file) => file.endsWith('/index.ts')),
    generatedNuxtSurface: {
      aliases: extractAliases(installerSources),
      autoImports,
      serverImports: extractNames(extractCallBlock(coreInstaller, 'addServerImports')),
      authComponents: existsSync(authComponentDir)
        ? readdirSync(authComponentDir)
            .filter((name) => name.endsWith('.vue'))
            .map((name) => name.replace(/\.vue$/, ''))
            .sort((a, b) => a.localeCompare(b))
        : [],
    },
    cli: {
      commands: extractCliCommands(mainCli),
      initTemplates: extractTemplateNames(initCommand),
    },
    staleReferences: {
      docsMatches: grepFiles(
        rootDir,
        ['meta', 'apps/docs/content'],
        [
          'tool.fromOperation',
          '_trustedForwardingKey',
          '_trustedForwarding',
          '@lupinum/trellis/bridge',
          '@lupinum/trellis/functions',
          'trellis bridge',
          '--template cms',
        ],
      ),
      docsFrontDoorMatches: grepFiles(
        rootDir,
        [
          'apps/docs/STYLE.md',
          'apps/docs/content/docs/01.getting-started',
          'apps/docs/content/docs/02.concepts',
          'apps/docs/content/docs/08.permissions',
          'apps/docs/content/docs/13.api-reference/3.functions.md',
        ],
        [
          '@lupinum/trellis/functions',
          ' = query({',
          ' = mutation({',
          'unsafe.query',
          'unsafe.mutation',
        ],
      ),
    },
  }
}
