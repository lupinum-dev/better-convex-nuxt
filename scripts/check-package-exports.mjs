#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'

const rootDir = process.cwd()
const checkDist = process.argv.includes('--dist')
const packageJson = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'))
const declaredPackages = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.peerDependencies ?? {}),
  ...Object.keys(packageJson.optionalDependencies ?? {}),
  ...Object.keys(packageJson.devDependencies ?? {}),
])
const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)])

const sourceRoots = [resolve(rootDir, 'src/module.ts'), resolve(rootDir, 'src/runtime')]
const builtRoots = checkDist
  ? [
      resolve(rootDir, 'dist/module.mjs'),
      resolve(rootDir, 'dist/types.d.mts'),
      resolve(rootDir, 'dist/runtime'),
    ].filter(existsSync)
  : []

const allowedVirtualImports = new Set([
  '#app',
  '#imports',
  '#build',
  '#components',
  'nitropack/runtime',
])
const allowedVirtualPrefixes = ['#app/', '#build/', '#components/']
const allowedFrameworkPackages = new Set(['vue', 'vue-router'])
const checkedExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.vue'])

const failures = []

function collectFiles(target) {
  if (!existsSync(target)) return []
  const stat = statSync(target)
  if (stat.isFile()) return checkedExtensions.has(extname(target)) ? [target] : []
  if (!stat.isDirectory()) return []

  const files = []
  for (const entry of readdirSync(target)) {
    if (entry === 'node_modules' || entry === '.nuxt') continue
    files.push(...collectFiles(join(target, entry)))
  }
  return files
}

function rootPackageName(specifier) {
  if (specifier.startsWith('@')) {
    const [scope, name] = specifier.split('/')
    return scope && name ? `${scope}/${name}` : specifier
  }
  return specifier.split('/')[0] ?? specifier
}

function isRelativeSpecifier(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../')
}

function isAllowedVirtualSpecifier(specifier) {
  return (
    allowedVirtualImports.has(specifier) ||
    allowedVirtualPrefixes.some((prefix) => specifier.startsWith(prefix))
  )
}

function isIgnoredLine(line) {
  const trimmed = line.trim()
  return (
    trimmed.startsWith('*') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('<!--') ||
    trimmed.startsWith('|')
  )
}

function readQuotedSpecifier(line, startIndex) {
  const quoteIndex = line.slice(startIndex).search(/['"]/)
  if (quoteIndex < 0) return null
  const absoluteQuoteIndex = startIndex + quoteIndex
  const quote = line[absoluteQuoteIndex]
  const endIndex = line.indexOf(quote, absoluteQuoteIndex + 1)
  if (endIndex < 0) return null
  return line.slice(absoluteQuoteIndex + 1, endIndex)
}

function extractSpecifiers(line) {
  const specifiers = []
  const trimmed = line.trimStart()

  if (trimmed.startsWith('import ') || trimmed.startsWith('export ')) {
    const fromIndex = line.lastIndexOf(' from ')
    if (fromIndex >= 0) {
      const specifier = readQuotedSpecifier(line, fromIndex + ' from '.length)
      if (specifier) specifiers.push(specifier)
    } else if (trimmed.startsWith('import ')) {
      const importIndex = line.indexOf('import')
      const specifier = readQuotedSpecifier(line, importIndex + 'import'.length)
      if (specifier) specifiers.push(specifier)
    }
  }

  let dynamicIndex = line.indexOf('import(')
  while (dynamicIndex >= 0) {
    const specifier = readQuotedSpecifier(line, dynamicIndex + 'import('.length)
    if (specifier) specifiers.push(specifier)
    dynamicIndex = line.indexOf('import(', dynamicIndex + 1)
  }

  return specifiers
}

function validateSpecifier(file, specifier, lineNumber) {
  const location = `${relative(rootDir, file)}:${lineNumber}`

  if (
    specifier.startsWith('$lib') ||
    specifier.startsWith('$app') ||
    specifier.startsWith('~/') ||
    specifier.startsWith('~~/')
  ) {
    failures.push(`${location} imports app-specific alias "${specifier}"`)
  }

  if (specifier.includes('/Users/') || specifier.startsWith('/Users/')) {
    failures.push(`${location} imports local machine path "${specifier}"`)
  }

  if (/\b(?:playground|demo|starters)\b/.test(specifier)) {
    failures.push(`${location} imports non-package workspace path "${specifier}"`)
  }

  if (isRelativeSpecifier(specifier)) {
    const resolved = resolve(dirname(file), specifier)
    const relativeToRoot = relative(rootDir, resolved)
    if (relativeToRoot.startsWith('..') || isAbsolute(relativeToRoot)) {
      failures.push(`${location} imports outside package root via "${specifier}"`)
    }
    return
  }

  if (nodeBuiltins.has(specifier) || isAllowedVirtualSpecifier(specifier)) return

  const packageName = rootPackageName(specifier)
  if (allowedFrameworkPackages.has(packageName)) return

  if (!declaredPackages.has(packageName)) {
    failures.push(`${location} imports undeclared package "${packageName}" via "${specifier}"`)
  }
}

function validateFile(file) {
  const source = readFileSync(file, 'utf8')
  const lines = source.split(/\r?\n/)
  lines.forEach((line, index) => {
    if (isIgnoredLine(line)) return
    for (const specifier of extractSpecifiers(line)) {
      validateSpecifier(file, specifier, index + 1)
    }
  })
}

const files = [...sourceRoots, ...builtRoots].flatMap(collectFiles)
for (const file of files) {
  validateFile(file)
}

if (failures.length > 0) {
  console.error(`Package export validation failed with ${failures.length} issue(s):`)
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exitCode = 1
} else {
  console.log(`Package export validation passed (${files.length} file(s) checked).`)
}
