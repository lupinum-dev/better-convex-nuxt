/* eslint-disable regexp/no-super-linear-backtracking */
// Transitional safety net for emitted runtime files. Publish-surface source is
// validated separately and should eventually make this rewrite unnecessary.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const DIST_RUNTIME_DIR = new URL('../dist/runtime', import.meta.url)
const DIST_RUNTIME_PATH = fileURLToPath(DIST_RUNTIME_DIR)
const SUPPORTED_EXTENSIONS = /\.(?:js|mjs|cjs|json|vue)$/
const PROCESSABLE_FILE = /\.(?:mjs|js|d\.ts|d\.mts)$/
const FROM_SPECIFIER_PATTERN =
  /((?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?["'])(\.\.?(?:\/[^"'\\]+)+)(["'])/g
const IMPORT_CALL_PATTERN = /(import\(["'])(\.\.?(?:\/[^"'\\]+)+)(["']\))/g

function normalizeSpecifier(specifier) {
  if (!specifier.startsWith('.')) return specifier
  while (specifier.endsWith('.js.js') || specifier.endsWith('.mjs.js')) {
    specifier = specifier.slice(0, -3)
  }
  if (SUPPORTED_EXTENSIONS.test(specifier)) return specifier
  return `${specifier}.js`
}

function rewriteFile(filePath) {
  const source = readFileSync(filePath, 'utf8')
  const next = source
    .replace(FROM_SPECIFIER_PATTERN, (match, prefix, specifier, suffix) => {
      const normalizedSpecifier = normalizeSpecifier(specifier)
      if (normalizedSpecifier === specifier) return match
      return `${prefix}${normalizedSpecifier}${suffix}`
    })
    .replace(IMPORT_CALL_PATTERN, (match, prefix, specifier, suffix) => {
      const normalizedSpecifier = normalizeSpecifier(specifier)
      if (normalizedSpecifier === specifier) return match
      return `${prefix}${normalizedSpecifier}${suffix}`
    })

  if (next !== source) {
    writeFileSync(filePath, next)
  }
}

function walk(dirPath) {
  for (const entry of readdirSync(dirPath)) {
    const fullPath = join(dirPath, entry)
    const stats = statSync(fullPath)

    if (stats.isDirectory()) {
      walk(fullPath)
      continue
    }

    if (PROCESSABLE_FILE.test(entry)) {
      rewriteFile(fullPath)
    }
  }
}

walk(DIST_RUNTIME_PATH)
