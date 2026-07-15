#!/usr/bin/env node
/**
 * Packed-entry package contract gate.
 *
 * A regex/line scan can miss multiline imports and cannot prove entry purity
 * or that a published tarball resolves for a real consumer. This script:
 *
 *   1. runs a fast source-level scan over
 *      `src/module.ts` and `src/runtime/**` for alias/absolute-path/
 *      undeclared-dependency leaks — no build required;
 *   2. requires `dist/` to already exist (built by `nuxt-module-build build`,
 *      as `prepack` does) and fails loudly, not vacuously, if it is missing;
 *   3. in the default mode, packs the current tree once and extracts that
 *      exact tarball; release verification instead supplies its already-packed
 *      artifact with `--tarball`, while `prepack` uses `--dist-only` to avoid
 *      recursively packing during the build lifecycle;
 *   4. scans the extracted tarball for invalid path classes, generated debris,
 *      source-machine absolute paths, and undeclared dependencies;
 *   5. for each table entry, uses the installed TypeScript compiler to
 *      prove the entry's dist files export exactly the expected names, no
 *      forbidden names, and (where declared) import nothing outside the
 *      entry's purity allowlist;
 *   6. for each entry with a packed consumer fixture, runs an isolated
 *      install of that fixture against the freshly packed tarball and proves
 *      runtime resolution (`node`) and type resolution (`tsc`).
 *
 * Public paths and export names come exclusively from
 * `package-entry-manifest.mjs`. Checker modules add implementation-specific
 * purity rules and packed consumer probes without redefining that contract.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkEntryExportShape } from './package-check/declarations.mjs'
import { entries } from './package-check/entry-rules.mjs'
import { checkEntryPurity } from './package-check/purity.mjs'
import {
  buildContentManifest,
  checkPackedPathClasses,
  packAndExtract,
  requireDistBuilt,
  scanExtractedTarball,
} from './package-check/tarball.mjs'
import { packageEntries } from './package-entry-manifest.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const p = (...segments) => resolve(repoRoot, ...segments)
const packageJson = JSON.parse(readFileSync(p('package.json'), 'utf8'))
const cliArgs = process.argv.slice(2).filter((argument) => argument !== '--')

function readOption(name) {
  const inline = cliArgs.find((argument) => argument.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = cliArgs.indexOf(name)
  return index >= 0 ? cliArgs[index + 1] : undefined
}

const distOnly = cliArgs.includes('--dist-only')
const suppliedTarball = readOption('--tarball')
const manifestOutput = readOption('--manifest')

for (let index = 0; index < cliArgs.length; index += 1) {
  const argument = cliArgs[index]
  if (argument === '--dist-only') continue
  if (argument === '--tarball' || argument === '--manifest') {
    if (!cliArgs[index + 1] || cliArgs[index + 1].startsWith('--')) {
      console.error(`${argument} requires a path.`)
      process.exit(1)
    }
    index += 1
    continue
  }
  if (argument.startsWith('--tarball=') || argument.startsWith('--manifest=')) continue
  console.error(`Unknown package-check option: ${argument}`)
  process.exit(1)
}

if (distOnly && (suppliedTarball || manifestOutput)) {
  console.error('--dist-only cannot be combined with --tarball or --manifest.')
  process.exit(1)
}

const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)])

// ---------------------------------------------------------------------------
// 1. Fast source-level scan (no build needed)
// ---------------------------------------------------------------------------

const sourceDeclaredPackages = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.peerDependencies ?? {}),
  ...Object.keys(packageJson.optionalDependencies ?? {}),
  ...Object.keys(packageJson.devDependencies ?? {}),
])
const allowedVirtualImports = new Set([
  '#app',
  '#imports',
  '#build',
  '#components',
  'nitropack/runtime',
])
// `#convex/*` is the module's generated-template namespace, resolved through
// `nuxt.options.alias` the same way
// `#app`/`#build`/`#components` are — never a real npm package.
const allowedVirtualPrefixes = ['#app/', '#build/', '#components/', '#convex/']
const allowedFrameworkPackages = new Set(['vue', 'vue-router'])
const checkedExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.vue'])
const EXCLUDED_DIR_NAMES = new Set(['node_modules', '.nuxt', '.git', 'dist'])

function collectFiles(target) {
  if (!existsSync(target)) return []
  const stat = statSync(target)
  if (stat.isFile()) return checkedExtensions.has(extname(target)) ? [target] : []
  if (!stat.isDirectory()) return []
  const files = []
  for (const entry of readdirSync(target)) {
    if (EXCLUDED_DIR_NAMES.has(entry)) continue
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

function validateSourceSpecifier(file, specifier, lineNumber, failures) {
  const location = `${relative(repoRoot, file)}:${lineNumber}`

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
    const relativeToRoot = relative(repoRoot, resolved)
    if (relativeToRoot.startsWith('..') || isAbsolute(relativeToRoot)) {
      failures.push(`${location} imports outside package root via "${specifier}"`)
    }
    return
  }

  if (nodeBuiltins.has(specifier) || isAllowedVirtualSpecifier(specifier)) return
  const packageName = rootPackageName(specifier)
  if (allowedFrameworkPackages.has(packageName)) return
  if (!sourceDeclaredPackages.has(packageName)) {
    failures.push(`${location} imports undeclared package "${packageName}" via "${specifier}"`)
  }
}

function runSourceScan() {
  const failures = []
  const sourceRoots = [p('src/module.ts'), p('src/runtime')]
  const files = sourceRoots.flatMap(collectFiles)

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const lines = source.split(/\r?\n/)
    lines.forEach((line, index) => {
      if (isIgnoredLine(line)) return
      for (const specifier of extractSpecifiers(line)) {
        validateSourceSpecifier(file, specifier, index + 1, failures)
      }
    })
  }

  // package.json exports must at least point at files that exist in source form
  // or will exist once built; a stale export table entry is a real defect.
  for (const [subpath, exportValue] of Object.entries(packageJson.exports ?? {})) {
    for (const target of collectExportTargets(exportValue)) {
      if (!target.startsWith('./')) continue
      // Built files do not exist pre-build; only flag paths that are neither a
      // dist path nor resolvable at all (i.e. clearly a typo).
      if (target.startsWith('./dist/')) continue
      if (!existsSync(resolve(repoRoot, target))) {
        failures.push(`package.json exports["${subpath}"] points to missing file "${target}"`)
      }
    }
  }

  return { failures, filesScanned: files.length }
}

function collectExportTargets(value) {
  if (typeof value === 'string') return [value]
  if (!value || typeof value !== 'object') return []
  return Object.values(value).flatMap((next) => collectExportTargets(next))
}

/**
 * Package manifest checks: `files: ["dist"]` must include every `exports`
 * target, and `typesVersions` must have exactly one entry per non-root
 * `exports` subpath (so `./foo` resolves under both moduleResolution
 * `Bundler`/`NodeNext` and the legacy `node10` typesVersions fallback path).
 * A drift here is a real published-package defect, not a style nit, so it is
 * a hard failure rather than a manual review note.
 */
function checkPackageJsonManifestConsistency() {
  const failures = []
  const exportsMap = packageJson.exports ?? {}
  const declaredFiles = packageJson.files ?? []

  const contractSubpaths = new Set(packageEntries.map((entry) => entry.subpath))
  for (const entry of packageEntries) {
    const packageEntry = exportsMap[entry.subpath]
    if (!packageEntry) {
      failures.push(`package.json exports is missing manifest entry "${entry.subpath}"`)
      continue
    }
    if (packageEntry.import !== `./${entry.distJs}`) {
      failures.push(
        `package.json exports["${entry.subpath}"].import must be "./${entry.distJs}" (manifest source of truth)`,
      )
    }
    if (packageEntry.types !== `./${entry.distDts}`) {
      failures.push(
        `package.json exports["${entry.subpath}"].types must be "./${entry.distDts}" (manifest source of truth)`,
      )
    }
  }
  for (const subpath of Object.keys(exportsMap)) {
    if (!contractSubpaths.has(subpath)) {
      failures.push(`package.json exports contains undeclared manifest entry "${subpath}"`)
    }
  }

  // `files: ["dist"]` (a bare directory entry) covers every `./dist/...`
  // target by construction; only flag an export target that escapes `dist/`
  // entirely and isn't otherwise covered by a declared `files` entry.
  const filesCoversDist = declaredFiles.includes('dist')
  for (const [subpath, exportValue] of Object.entries(exportsMap)) {
    for (const target of collectExportTargets(exportValue)) {
      if (!target.startsWith('./')) continue
      const stripped = target.slice(2)
      const coveredByDist = filesCoversDist && stripped.startsWith('dist/')
      const coveredExplicitly = declaredFiles.some(
        (entry) => stripped === entry || stripped.startsWith(`${entry.replace(/\/$/, '')}/`),
      )
      if (!coveredByDist && !coveredExplicitly) {
        failures.push(
          `package.json exports["${subpath}"] target "${target}" is not covered by "files": ${JSON.stringify(declaredFiles)}`,
        )
      }
    }
  }

  // `typesVersions["*"]` must have exactly one key per non-root `exports`
  // subpath (the subpath with its leading "./" stripped), and vice versa.
  const typesVersionsStar = packageJson.typesVersions?.['*'] ?? {}
  const exportSubpaths = new Set(
    Object.keys(exportsMap).map((subpath) => (subpath === '.' ? '.' : subpath.slice(2))),
  )
  const typesVersionsKeys = new Set(Object.keys(typesVersionsStar))

  for (const subpath of exportSubpaths) {
    if (!typesVersionsKeys.has(subpath)) {
      failures.push(`typesVersions["*"] is missing an entry for exports subpath "${subpath}"`)
    }
  }
  for (const key of typesVersionsKeys) {
    if (!exportSubpaths.has(key)) {
      failures.push(`typesVersions["*"]["${key}"] has no matching exports subpath`)
    }
  }

  return failures
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const failures = []
  const warnings = []

  const sourceScan = runSourceScan()
  failures.push(...sourceScan.failures)
  failures.push(...checkPackageJsonManifestConsistency())

  requireDistBuilt()

  if (distOnly) {
    for (const entry of entries) {
      checkEntryExportShape(entry, failures, warnings)
      checkEntryPurity(entry, failures)
    }
  } else {
    console.log(
      suppliedTarball
        ? `Extracting the supplied tarball for packed-probe evidence: ${suppliedTarball}`
        : 'Packing and extracting the current tree for packed-probe evidence…',
    )
    const { scratchDir, tarballPath, packageDir } = packAndExtract(suppliedTarball)
    try {
      const manifest = buildContentManifest(packageDir)
      scanExtractedTarball(packageDir, failures, manifest)

      for (const entry of entries) {
        checkEntryExportShape(entry, failures, warnings, packageDir)
        checkEntryPurity(entry, failures, packageDir)
      }

      if (failures.length === 0) {
        const ctx = { tarballPath, packageDir, failures }
        for (const entry of entries) {
          if (!entry.packedProbe) continue
          console.log(`Running packed probe for "${entry.subpath}"…`)
          entry.packedProbe(ctx)
        }
      }

      if (manifestOutput && failures.length === 0) {
        const outputPath = resolve(repoRoot, manifestOutput)
        mkdirSync(dirname(outputPath), { recursive: true })
        writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`)
        console.log(`Content manifest: ${outputPath}`)
      }
    } finally {
      rmSync(scratchDir, { recursive: true, force: true })
    }
  }

  for (const warning of warnings) {
    console.warn(`⚠ ${warning}`)
  }

  if (failures.length > 0) {
    console.error(`\nPackage export validation failed with ${failures.length} issue(s):`)
    for (const failure of failures) {
      console.error(`- ${failure}`)
    }
    process.exitCode = 1
    return
  }

  console.log(
    `✓ ${distOnly ? 'dist-entry' : 'packed-entry'} gate passed (${sourceScan.filesScanned} source file(s) scanned, ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} deep-checked).`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}

export { checkPackedPathClasses }
