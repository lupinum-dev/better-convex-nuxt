#!/usr/bin/env node
/**
 * Packed-entry gate (vNext §7 "packed-entry check"; internal §16.2).
 *
 * The command name `check:package-exports` is retained from the earlier
 * line-oriented checker, but the implementation described here replaces it
 * entirely. A regex/line scan can miss multiline imports and cannot prove
 * entry purity or that a published tarball actually resolves for a real
 * consumer. This script instead:
 *
 *   1. runs a fast source-level scan (kept from the original checker) over
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
 *   5. for each ACTIVE table entry, uses the installed TypeScript compiler to
 *      prove the entry's dist files export exactly the expected names, no
 *      forbidden names, and (where declared) import nothing outside the
 *      entry's purity allowlist;
 *   6. for each ACTIVE entry with a packed consumer fixture, runs an isolated
 *      install of that fixture against the freshly packed tarball and proves
 *      runtime resolution (`node`) and type resolution (`tsc`).
 *
 * Rules are declared in one table (`ENTRIES`), gated by `phase`, following
 * the same activation-schedule pattern as `check-vocabulary.mjs` and
 * `check-boundaries.mjs`: only phases listed in `ACTIVE_PHASES` are deep-
 * checked (export shape, purity, packed probe). Scheduled entries
 * (`./auth-client` in Phase 3, `./server` and
 * `./server/createUserSyncTriggers` in Phase 4) exist in the table today so
 * later phases activate them by extending `ACTIVE_PHASES` — no restructuring.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { builtinModules } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

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

/** Phases whose table entries are deep-checked (export shape, purity, packed probe). */
const ACTIVE_PHASES = ['phase0', 'phase2', 'phase3', 'phase4']

const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)])

// ---------------------------------------------------------------------------
// 1. Fast source-level scan (kept from the original checker; no build needed)
// ---------------------------------------------------------------------------

const sourceDeclaredPackages = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.peerDependencies ?? {}),
  ...Object.keys(packageJson.optionalDependencies ?? {}),
  ...Object.keys(packageJson.devDependencies ?? {}),
])
const runtimeDeclaredPackages = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.peerDependencies ?? {}),
  ...Object.keys(packageJson.optionalDependencies ?? {}),
])

const allowedVirtualImports = new Set([
  '#app',
  '#imports',
  '#build',
  '#components',
  'nitropack/runtime',
])
// `#convex/*` is the module's own generated-template alias namespace (vNext
// §8 "Do not use a `#build/*` alias key... `#convex/*` is the module's
// established namespace"), resolved via `nuxt.options.alias` the same way
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
 * vNext §11 "Package checks": `files: ["dist"]` must include every `exports`
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
// Table-driven entries (internal §16.2)
// ---------------------------------------------------------------------------

/**
 * @typedef {object} PurityRule
 * @property {RegExp[]} forbiddenSpecifierPatterns - bare specifiers matching any of these are forbidden
 * @property {Set<string>} allowedBareSpecifiers - explicit exceptions (e.g. `convex`, `convex/values`)
 *
 * @typedef {object} Entry
 * @property {string} subpath - the package.json `exports` key
 * @property {'phase0'|'phase2'|'phase3'|'phase4'} phase - activation-schedule gate
 * @property {string} distJs - dist-relative path to the runtime entry file
 * @property {string} distDts - dist-relative path to the type entry file
 * @property {string[]} expectedValueExports - exact expected value-export names (from the JS file)
 * @property {string[]} [additionalExpectedDeclaredNames] - extra names (types) the .d.ts must also declare
 * @property {string[]} forbiddenNames - names that must be absent from BOTH the JS and the .d.ts
 * @property {PurityRule} [purity] - if present, every file under `distDir` is scanned for forbidden imports
 * @property {string} [distDir] - dist-relative directory (or single file) purity scanning walks (defaults to dirname(distJs))
 * @property {string} [sourceDir] - repo-relative source directory (or single file) purity scanning walks (defaults to `src/runtime/<subpath>`)
 * @property {(ctx: ProbeContext) => void} [packedProbe] - packed consumer probe, run against the extracted tarball
 */

/** @type {Entry[]} */
const CHECKER_ENTRY_RULES = [
  {
    subpath: '.',
    phase: 'phase0',
    distJs: 'dist/module.mjs',
    distDts: 'dist/types.d.mts',
    // The root's only real runtime export is the Nuxt module default export.
    // `api`/`internal`/`components` are template TEXT emitted into a
    // generated in-app fallback file (module-templates.ts); a naive text
    // scan of `dist/module.mjs` finds lines that look like
    // `export const api = ...` inside that template string, but they are not
    // actual exports of this file — exactly the class of mistake AST
    // inspection (vs. the old line-oriented checker) exists to catch.
    expectedValueExports: ['default'],
    additionalExpectedDeclaredNames: ['ModuleOptions'],
    // vNext §4.2 deletion ledger: names that must never leak back into the
    // package root's runtime or type surface.
    forbiddenNames: [
      'usePermissions',
      'createPermissions',
      'createBetterConvexAuthClient',
      'resolveBetterConvexAuthBaseURL',
      'useConvexCall',
      'getQueryKey',
      'BetterConvexAuthClientOptions',
      'BetterConvexAuthClientPluginList',
      'ConvexPublicRuntimeConfig',
    ],
    packedProbe: probeRootEntry,
  },
  {
    subpath: './errors',
    phase: 'phase2',
    distJs: 'dist/runtime/errors/index.js',
    distDts: 'dist/runtime/errors/index.d.ts',
    expectedValueExports: [
      'ConvexCallError',
      'normalizeConvexError',
      'isSerializedConvexCallError',
    ],
    additionalExpectedDeclaredNames: [
      'ConvexCallErrorKind',
      'ConvexCallErrorInput',
      'SerializedConvexCallError',
    ],
    // vNext §7 integration checklist: the plain-Error `toError` conversion is
    // deleted; the old serializable interface it replaced must not reappear.
    forbiddenNames: ['toError'],
    purity: {
      // vNext §7 purity guard.
      forbiddenSpecifierPatterns: [
        /^vue$/,
        /^@vue\//,
        /^vue-router$/,
        /^nuxt$/,
        /^@nuxt\//,
        /^#imports$/,
        /^#app\b/,
        /^#build\b/,
        /^#components\b/,
        /^nitropack\b/,
        /^node:/,
      ],
      // `convex/values` is explicitly allowed: the framework-free normalizer
      // needs `instanceof ConvexError`.
      allowedBareSpecifiers: new Set(['convex', 'convex/values']),
    },
    packedProbe: probeErrorsEntry,
  },
  // --- Scheduled (inactive) future entries — flip on by extending ACTIVE_PHASES. ---
  {
    subpath: './auth-client',
    phase: 'phase3',
    distJs: 'dist/runtime/auth-client/index.js',
    distDts: 'dist/runtime/auth-client/index.d.ts',
    expectedValueExports: ['defineConvexAuthClient'],
    additionalExpectedDeclaredNames: [],
    forbiddenNames: [],
    purity: {
      forbiddenSpecifierPatterns: [
        /^vue$/,
        /^@vue\//,
        /^vue-router$/,
        /^nuxt$/,
        /^@nuxt\//,
        /^#imports$/,
        /^#app\b/,
        /^nitropack\b/,
      ],
      allowedBareSpecifiers: new Set(),
    },
    packedProbe: probeAuthClientTyping,
  },
  {
    subpath: './server',
    phase: 'phase4',
    distJs: 'dist/runtime/server/index.js',
    distDts: 'dist/runtime/server/index.d.ts',
    expectedValueExports: [
      'serverConvex',
      'createClassifiedConvexFetch',
      'normalizeServerConvexBoundaryError',
      'exchangeConvexToken',
      'normalizeSiteUrl',
      'serverConvexClearAuthCache',
    ],
    additionalExpectedDeclaredNames: [
      'ServerConvexCaller',
      'ServerConvexOptions',
      'ConvexCredential',
      'ConvexTokenExchangeResult',
    ],
    // vNext §9 / internal §19.1 deletion ledger: the temporary server call
    // trio this phase replaces must never leak back into the entry surface.
    forbiddenNames: [
      'serverConvexQuery',
      'serverConvexMutation',
      'serverConvexAction',
      'fetchQuery',
      'fetchMutation',
      'fetchAction',
    ],
    purity: {
      // Boundary rule for `/server` (internal §16.2): no composables, Vue, or
      // client-side plugin code. `h3`, `convex`/`convex/browser`/`convex/server`,
      // and the Nitro virtual `#imports` alias are legitimate server-side
      // dependencies and are intentionally NOT forbidden here.
      forbiddenSpecifierPatterns: [
        /^vue$/,
        /^@vue\//,
        /^vue-router$/,
        /^nuxt$/,
        /^@nuxt\//,
        /^#app\b/,
        /^#components\b/,
      ],
      allowedBareSpecifiers: new Set(),
    },
    // `dist/runtime/server` is NOT bundled into `index.js` (mkdist copies the
    // directory file-for-file, unlike the bundled `/errors`/`/auth-client`
    // entries) — scope the scan to `utils/`, the subtree actually reachable
    // from `index.ts`, so this entry's rules never see `createUserSyncTriggers`
    // or the Nitro route handlers under `api/auth/*` (neither published under
    // this subpath's `exports` mapping).
    distDir: 'dist/runtime/server/utils',
    sourceDir: 'src/runtime/server/utils',
    packedProbe: probeServerEntry,
  },
  {
    subpath: './server/createUserSyncTriggers',
    phase: 'phase4',
    distJs: 'dist/runtime/server/createUserSyncTriggers.js',
    distDts: 'dist/runtime/server/createUserSyncTriggers.d.ts',
    expectedValueExports: ['createUserSyncTriggers'],
    additionalExpectedDeclaredNames: [
      'BetterAuthUserDocLike',
      'CreateUserSyncTriggersOptions',
      'UserSyncRebuildResult',
    ],
    forbiddenNames: [],
    purity: {
      // Framework-free: this entry has no Convex/H3/Nitro imports of its own
      // (it only takes user-supplied ctx/db shapes as generics), so any Vue,
      // Nuxt, or Nitro import here would be an accidental coupling.
      forbiddenSpecifierPatterns: [
        /^vue$/,
        /^@vue\//,
        /^vue-router$/,
        /^nuxt$/,
        /^@nuxt\//,
        /^#app\b/,
        /^#components\b/,
        /^#imports$/,
        /^nitropack\b/,
        /^h3$/,
      ],
      allowedBareSpecifiers: new Set(),
    },
    // Single-file entry with zero imports of its own — scope the scan to
    // exactly this file so it is never affected by unrelated siblings sharing
    // the same `dist/runtime/server` directory.
    distDir: 'dist/runtime/server/createUserSyncTriggers.js',
    sourceDir: 'src/runtime/server/createUserSyncTriggers.ts',
    packedProbe: probeCreateUserSyncTriggersEntry,
  },
]

// Join checker-only probes and purity constraints onto the canonical package
// contract. Export paths and public names are always read from the manifest.
const ENTRIES = packageEntries.map((contract) => {
  const rules = CHECKER_ENTRY_RULES.find((entry) => entry.subpath === contract.subpath)
  if (!rules) throw new Error(`Missing checker rules for package entry ${contract.subpath}`)
  return {
    ...rules,
    distJs: contract.distJs,
    distDts: contract.distDts,
    expectedValueExports: contract.valueExports,
    additionalExpectedDeclaredNames: contract.typeExports,
    forbiddenNames: contract.forbiddenNames,
  }
})

// ---------------------------------------------------------------------------
// AST export-shape extraction
// ---------------------------------------------------------------------------

function parseSource(filePath) {
  const text = readFileSync(filePath, 'utf8')
  return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

/** Every top-level exported name in a file (functions, classes, interfaces, type
 * aliases, const/let/var, `export { ... }` specifiers — using the local `as`
 * alias — and `default`). Does not recurse into `export *` (none of the
 * checked entries use it; treated as "cannot verify" and reported). */
function collectExportedNames(sourceFile, warnings) {
  const names = new Set()
  for (const node of sourceFile.statements) {
    const hasExportModifier = (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0

    if (ts.isFunctionDeclaration(node) && hasExportModifier && node.name) {
      names.add(node.name.text)
    } else if (ts.isClassDeclaration(node) && hasExportModifier && node.name) {
      names.add(node.name.text)
    } else if (ts.isInterfaceDeclaration(node) && hasExportModifier) {
      names.add(node.name.text)
    } else if (ts.isTypeAliasDeclaration(node) && hasExportModifier) {
      names.add(node.name.text)
    } else if (ts.isVariableStatement(node) && hasExportModifier) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) names.add(decl.name.text)
      }
    } else if (ts.isExportAssignment(node)) {
      names.add('default')
    } else if (ts.isExportDeclaration(node)) {
      if (!node.exportClause) {
        warnings.push(
          `${relative(repoRoot, sourceFile.fileName)} has an "export *" — cannot verify exact export set`,
        )
        continue
      }
      if (ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          names.add((element.name ?? element.propertyName).text)
        }
      }
    }
  }
  return names
}

function checkEntryExportShape(entry, failures, warnings, artifactRoot = repoRoot) {
  const jsPath = resolve(artifactRoot, entry.distJs)
  const dtsPath = resolve(artifactRoot, entry.distDts)
  if (!existsSync(jsPath)) {
    failures.push(`[${entry.subpath}] expected dist file missing: ${entry.distJs}`)
    return
  }
  if (!existsSync(dtsPath)) {
    failures.push(`[${entry.subpath}] expected dist file missing: ${entry.distDts}`)
    return
  }

  const jsExports = collectExportedNames(parseSource(jsPath), warnings)
  const dtsExports = collectExportedNames(parseSource(dtsPath), warnings)

  const expectedValue = new Set(entry.expectedValueExports)
  for (const expected of expectedValue) {
    if (!jsExports.has(expected)) {
      failures.push(`[${entry.subpath}] ${entry.distJs} is missing expected export "${expected}"`)
    }
  }
  for (const actual of jsExports) {
    if (!expectedValue.has(actual)) {
      failures.push(
        `[${entry.subpath}] ${entry.distJs} exports unexpected name "${actual}" (not in the declared expected set — update the table if intentional)`,
      )
    }
  }

  const expectedDeclared = new Set([
    ...entry.expectedValueExports,
    ...(entry.additionalExpectedDeclaredNames ?? []),
  ])
  for (const expected of expectedDeclared) {
    if (!dtsExports.has(expected)) {
      failures.push(
        `[${entry.subpath}] ${entry.distDts} is missing expected declared name "${expected}"`,
      )
    }
  }

  for (const forbidden of entry.forbiddenNames ?? []) {
    if (jsExports.has(forbidden) || dtsExports.has(forbidden)) {
      failures.push(`[${entry.subpath}] forbidden export "${forbidden}" is present`)
    }
  }
}

// ---------------------------------------------------------------------------
// AST import-edge extraction (purity guard) — mirrors check-boundaries.mjs
// ---------------------------------------------------------------------------

function collectImportSpecifiers(sourceFile) {
  const specifiers = []
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text)
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text)
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      specifiers.push(node.argument.literal.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return specifiers
}

function walkDir(dir, extensions) {
  if (!existsSync(dir)) return []
  const stat = statSync(dir)
  if (stat.isFile()) return extensions.has(extname(dir)) ? [dir] : []
  const files = []
  for (const entry of readdirSync(dir)) {
    files.push(...walkDir(join(dir, entry), extensions))
  }
  return files
}

function checkEntryPurity(entry, failures, artifactRoot = repoRoot) {
  if (!entry.purity) return
  const distDir = resolve(artifactRoot, entry.distDir ?? dirname(entry.distJs))
  const sourceDir = p(
    entry.sourceDir ??
      (entry.subpath === '.' ? 'src/module.ts' : `src/runtime/${entry.subpath.replace('./', '')}`),
  )

  const filesToScan = [
    ...walkDir(distDir, new Set(['.js', '.mjs', '.cjs', '.d.ts', '.d.mts'])),
    ...walkDir(sourceDir, new Set(['.ts', '.mts'])),
  ]

  for (const file of filesToScan) {
    let specifiers
    try {
      specifiers = collectImportSpecifiers(parseSource(file))
    } catch (error) {
      failures.push(
        `[${entry.subpath}] failed to parse ${relative(repoRoot, file)}: ${error.message}`,
      )
      continue
    }
    for (const specifier of specifiers) {
      if (specifier.startsWith('.')) continue // relative — stays inside the entry by construction
      if (entry.purity.allowedBareSpecifiers.has(specifier)) continue
      const forbidden = entry.purity.forbiddenSpecifierPatterns.some((re) => re.test(specifier))
      if (forbidden) {
        failures.push(
          `[${entry.subpath}] ${relative(repoRoot, file)} imports forbidden specifier "${specifier}" (purity guard)`,
        )
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Packed-tarball absolute-path / undeclared-dependency scan (internal §16.2)
// ---------------------------------------------------------------------------

/** Host-provided runtime specifiers legitimately unresolved by this package's
 * own declared dependencies — the consumer's Nuxt/Vue/Nitro host provides
 * them. `nitropack/runtime` is also a Nitro virtual import, handled by the
 * `#`-prefix skip above for its sibling `#internal/nitro` form. */
const allowedHostRuntimeSpecifiers = new Set(['vue', 'vue-router', 'nitropack'])

const ABS_PATH_RE = /(\/Users\/|\/home\/|[A-Z]:\\\\Users)\S*/g
const ALIAS_RE = /(?:^|["'`(\s])(~~?\/[^"'`)\s]*|\$lib\/[^"'`)\s]*|\$app\/[^"'`)\s]*)/g
// Four disjoint alternatives (no adjacent overlapping quantifiers) so this
// cannot backtrack super-linearly: `from '...'`, `require(...)`, dynamic
// `import(...)`, and a bare top-of-line `import '...'`.
const BARE_IMPORT_RE =
  /\bfrom\s+["']([^"'.][^"']*)["']|\brequire\(\s*["']([^"'.][^"']*)["']\s*\)|\bimport\(\s*["']([^"'.][^"']*)["']\s*\)|^\s*import\s+["']([^"'.][^"']*)["']/gm

const ALLOWED_PACKAGE_ROOT_FILES = new Set(['LICENSE', 'README.md', 'package.json'])

function buildContentManifest(packageDir) {
  const files = []

  function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const absolutePath = join(dir, name)
      const stats = statSync(absolutePath)
      if (stats.isDirectory()) {
        walk(absolutePath)
        continue
      }
      files.push({
        path: relative(packageDir, absolutePath).split('\\').join('/'),
        mode: (stats.mode & 0o777).toString(8).padStart(3, '0'),
        size: stats.size,
        sha256: createHash('sha256').update(readFileSync(absolutePath)).digest('hex'),
      })
    }
  }

  walk(packageDir)
  const packedPackageJson = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
  return { version: packedPackageJson.version, generatedAt: new Date().toISOString(), files }
}

function checkPackedPathClasses(manifest, failures) {
  for (const { path } of manifest.files) {
    if (!path.startsWith('dist/') && !ALLOWED_PACKAGE_ROOT_FILES.has(path)) {
      failures.push(`packed tarball contains an unplanned root path: ${path}`)
    }
    if (path.includes('/.output/') || path.startsWith('.output/')) {
      failures.push(`packed tarball contains raw build output: ${path}`)
    }
    if (
      path.startsWith('dist/runtime/devtools/ui/') &&
      !path.startsWith('dist/runtime/devtools/ui/dist/')
    ) {
      failures.push(`packed tarball contains raw DevTools UI source: ${path}`)
    }
    if (path.startsWith('dist/runtime/devtools/ui/dist/') && /\.d\.(?:m|c)?ts$/.test(path)) {
      failures.push(`packed tarball contains a declaration generated for a static asset: ${path}`)
    }
    if (
      path === 'dist/runtime/server/tsconfig.json' ||
      /(?:^|\/)tsconfig\.tsbuildinfo$/.test(path)
    ) {
      failures.push(`packed tarball contains generated build configuration: ${path}`)
    }
  }
}

function scanExtractedTarball(packageDir, failures, manifest) {
  checkPackedPathClasses(manifest, failures)
  const distDir = join(packageDir, 'dist')
  const files = walkDir(
    distDir,
    new Set(['.js', '.mjs', '.cjs', '.ts', '.d.ts', '.d.mts', '.json']),
  )

  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const rel = relative(packageDir, file)

    for (const match of text.matchAll(ABS_PATH_RE)) {
      failures.push(
        `packed ${rel} contains a source-machine absolute path: "${match[0].slice(0, 120)}"`,
      )
    }
    for (const match of text.matchAll(ALIAS_RE)) {
      failures.push(`packed ${rel} contains an app-specific alias leak: "${match[1] ?? match[0]}"`)
    }

    if (extname(file) === '.json') continue
    for (const match of text.matchAll(BARE_IMPORT_RE)) {
      const specifier = match[1] ?? match[2] ?? match[3] ?? match[4]
      if (!specifier) continue
      if (specifier.startsWith('node:') || specifier.startsWith('#')) continue
      if (nodeBuiltins.has(specifier)) continue
      // The published `dist/` ships browser-runtime and Nitro-runtime files
      // that legitimately expect their host (a Nuxt/Vue/Nitro app) to provide
      // these — they are peer/host runtime, not an undeclared dependency of
      // this package. `/errors`, the only framework-free entry today, is
      // separately covered by the stricter per-entry purity guard above.
      if (allowedHostRuntimeSpecifiers.has(rootPackageName(specifier))) continue
      const packageName = rootPackageName(specifier)
      if (!runtimeDeclaredPackages.has(packageName)) {
        failures.push(
          `packed ${rel} resolves undeclared dependency "${packageName}" via "${specifier}"`,
        )
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Pack + extract
// ---------------------------------------------------------------------------

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: repoRoot, encoding: 'utf8', ...options })
}

function requireDistBuilt() {
  const requiredFiles = ['dist/module.mjs', 'dist/types.d.mts']
  const missing = requiredFiles.filter((f) => !existsSync(p(f)))
  if (missing.length > 0) {
    console.error(
      `check:package-exports requires a built dist/. Missing: ${missing.join(', ')}.\n` +
        `Run \`pnpm exec nuxt-module-build build\` (or \`pnpm run prepack\`) first.`,
    )
    process.exit(1)
  }
}

/** @returns {{ scratchDir: string, tarballPath: string, packageDir: string }} the scratch directory holding the pack, the tarball's absolute path, and the extracted package directory */
function packAndExtract(tarballInput) {
  const scratchDir = mkdtempSync(join(tmpdir(), 'bcn-packed-entry-'))
  let tarballPath = tarballInput ? resolve(repoRoot, tarballInput) : undefined
  if (!tarballPath) {
    let parsed
    try {
      const out = run('pnpm', [
        'pack',
        '--json',
        '--config.ignore-scripts=true',
        '--pack-destination',
        scratchDir,
      ])
      parsed = JSON.parse(out)
    } catch (error) {
      console.error(`\`pnpm pack\` failed: ${error.message}`)
      process.exit(1)
    }
    tarballPath = parsed.filename
  }
  if (!tarballPath || !existsSync(tarballPath)) {
    console.error(`Expected tarball does not exist: ${tarballPath ?? '<missing path>'}.`)
    process.exit(1)
  }

  const extractDir = join(scratchDir, 'extracted')
  mkdirSync(extractDir, { recursive: true })
  try {
    run('tar', ['xf', tarballPath, '-C', extractDir])
  } catch (error) {
    console.error(`Failed to extract packed tarball: ${error.message}`)
    process.exit(1)
  }
  const packageDir = join(extractDir, 'package')
  if (!existsSync(packageDir)) {
    console.error(`Expected extracted package directory missing: ${packageDir}`)
    process.exit(1)
  }

  return { scratchDir, tarballPath, packageDir }
}

// ---------------------------------------------------------------------------
// Packed consumer probes
// ---------------------------------------------------------------------------

/** @typedef {{ tarballPath: string, packageDir: string, failures: string[] }} ProbeContext */

/**
 * Package-root probe: an ephemeral (non-repo, non-committed) consumer that
 * installs the packed tarball and proves runtime resolution (the default
 * Nuxt-module export plus the `api`/`internal`/`components` fallback value
 * exports actually resolve from node_modules) and type resolution (`tsc`
 * against the installed tarball's declaration files) without needing a full
 * Nuxt build. No dedicated fixture directory is required by vNext §7's
 * new-files list for the package root, unlike `/errors`.
 */
function probeRootEntry(ctx) {
  const dir = mkdtempSync(join(tmpdir(), 'bcn-root-probe-'))

  writeJson(join(dir, 'package.json'), {
    name: 'root-entry-probe',
    private: true,
    type: 'module',
    devDependencies: {
      'better-convex-nuxt': `file:${ctx.tarballPath}`,
      typescript: packageJson.devDependencies.typescript,
      '@types/node': packageJson.devDependencies['@types/node'],
    },
  })
  writeFile(join(dir, '.npmrc'), 'ignore-scripts=true\n')
  writeFile(
    join(dir, 'pnpm-workspace.yaml'),
    '# isolated root for the ephemeral packed-root probe\n',
  )
  writeFile(
    join(dir, 'index.mjs'),
    [
      "import mod from 'better-convex-nuxt'",
      "if (typeof mod !== 'function' && typeof mod !== 'object') throw new Error('default export did not resolve')",
      '',
      '// vNext §11 "Package checks" negative-resolution assertions: deleted named',
      '// exports must not resolve from the packed root, even via a dynamic import',
      '// namespace object (which — unlike a static `import { X } from ...` — would',
      '// silently omit the property rather than throw, so this must check for its',
      '// absence explicitly rather than rely on a parse/link failure).',
      "const rootNamespace = await import('better-convex-nuxt')",
      'const forbiddenRootNames = [',
      "  'usePermissions',",
      "  'createPermissions',",
      "  'createBetterConvexAuthClient',",
      "  'resolveBetterConvexAuthBaseURL',",
      "  'useConvexCall',",
      "  'getQueryKey',",
      ']',
      'for (const name of forbiddenRootNames) {',
      '  if (name in rootNamespace) {',
      '    throw new Error(`forbidden export "${name}" resolved from the packed package root`)',
      '  }',
      '}',
      '',
      '// The deleted `better-convex-nuxt/composables` subpath must not resolve at all.',
      'let composablesSubpathResolved = true',
      'try {',
      "  await import('better-convex-nuxt/composables')",
      '} catch {',
      '  composablesSubpathResolved = false',
      '}',
      'if (composablesSubpathResolved) {',
      '  throw new Error(\'deleted subpath "better-convex-nuxt/composables" resolved but must not\')',
      '}',
      '',
      "console.log('root-entry-probe runtime OK')",
      '',
    ].join('\n'),
  )
  writeFile(
    join(dir, 'index.ts'),
    [
      'import type {',
      '  BaseAuthClient, ConvexAuthMode, ConvexAuthOptions, ConvexAuthClientRegistry,',
      '  ConvexAuthStatus, ConvexCallErrorKind, ConvexClientHandle, ConvexRuntimeConfig,',
      '  InferRegisteredConvexAuthClient, ModuleOptions, ServerConvexOptions,',
      '  UseConvexAuthReturn, UseConvexMutationOptions, UseConvexPaginatedQueryOptions,',
      '  UseConvexQueryOptions,',
      "} from 'better-convex-nuxt'",
      "import mod from 'better-convex-nuxt'",
      '',
      'const _opts: ModuleOptions | undefined = undefined',
      'type PublicContract = [',
      '  BaseAuthClient, ConvexAuthMode, ConvexAuthOptions, ConvexAuthClientRegistry,',
      '  ConvexAuthStatus, ConvexCallErrorKind, ConvexClientHandle, ConvexRuntimeConfig,',
      '  InferRegisteredConvexAuthClient, ServerConvexOptions, UseConvexAuthReturn,',
      '  UseConvexMutationOptions<never>, UseConvexPaginatedQueryOptions, UseConvexQueryOptions<unknown>,',
      ']',
      'const _contract: PublicContract | undefined = undefined',
      'void mod',
      'void _opts',
      'void _contract',
      '',
      '// vNext §11 "Package checks" negative-resolution assertions: these named',
      '// imports must fail to typecheck against the packed root — if any of them',
      '// starts compiling, a deleted export has silently come back.',
      '// @ts-expect-error "createBetterConvexAuthClient" is not an export of the packed root',
      "import { createBetterConvexAuthClient } from 'better-convex-nuxt'",
      '// @ts-expect-error "getQueryKey" is not an export of the packed root',
      "import { getQueryKey } from 'better-convex-nuxt'",
      '// @ts-expect-error raw runtime config must remain private',
      "import type { ConvexPublicRuntimeConfig } from 'better-convex-nuxt'",
      'void createBetterConvexAuthClient',
      'void getQueryKey',
      'type _NoRawConfig = ConvexPublicRuntimeConfig',
      '',
    ].join('\n'),
  )
  // The root default export drags in the module-build/Nuxt/Nitro type graph
  // (`@nuxt/schema`, `nitropack`, transitively `nuxt`). Real consumers
  // typecheck that graph with `skipLibCheck: true` and bundler resolution —
  // Nuxt's own generated tsconfig does the same — so this probe matches that
  // real-world configuration rather than an artificially strict one that
  // would fail on upstream declaration quirks unrelated to this package.
  writeJson(join(dir, 'tsconfig.json'), {
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2022', 'DOM'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: ['node'],
    },
    include: ['index.ts'],
  })

  try {
    run('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], { cwd: dir })
    run('node', ['index.mjs'], { cwd: dir })
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], { cwd: dir })
  } catch (error) {
    ctx.failures.push(`[.] packed root-entry probe failed: ${error.message}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * `/errors` probe: installs the packed tarball into the committed
 * `test/fixtures/errors-consumer` fixture (vNext §7 new-files list) and runs
 * its `build` (type resolution via `tsc`) and `start` (runtime resolution +
 * behavioral assertions) scripts.
 */
function probeErrorsEntry(ctx) {
  const fixtureDir = p('test/fixtures/errors-consumer')
  const localTarball = join(fixtureDir, 'better-convex-nuxt.tgz')
  copyFileSync(ctx.tarballPath, localTarball)

  try {
    run('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], { cwd: fixtureDir })
    run('pnpm', ['run', 'build'], { cwd: fixtureDir })
    run('pnpm', ['run', 'start'], { cwd: fixtureDir })
  } catch (error) {
    ctx.failures.push(`[./errors] packed errors-consumer probe failed: ${error.message}`)
  } finally {
    rmSync(join(fixtureDir, 'node_modules'), { recursive: true, force: true })
    rmSync(join(fixtureDir, 'dist'), { recursive: true, force: true })
    rmSync(localTarball, { force: true })
    rmSync(join(fixtureDir, 'pnpm-lock.yaml'), { force: true })
  }
}

/**
 * `/auth-client` probe: the permanent §5.8 proof-1 release gate. Installs the
 * packed tarball into the committed `test/fixtures/auth-client-typing` fixture
 * so the module and consumer share ONE `better-auth` copy, then:
 *   - `nuxi prepare` generates the REAL registry declaration from the fixture's
 *     `convex-auth.ts` (apiKeyClient) definition;
 *   - `nuxi typecheck` proves the narrowed `InferRegisteredConvexAuthClient`
 *     exposes `apiKey.create` typed (criteria a + c + d);
 *   - `tsc` over the separate `base-fallback` program proves the empty-fallback
 *     registration exposes only the base client, no `apiKey` (criterion b).
 */
function probeAuthClientTyping(ctx) {
  const fixtureDir = p('test/fixtures/auth-client-typing')
  const localTarball = join(fixtureDir, 'better-convex-nuxt.tgz')
  copyFileSync(ctx.tarballPath, localTarball)

  try {
    run('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], { cwd: fixtureDir })
    run('pnpm', ['run', 'prepare:types'], { cwd: fixtureDir })
    run('pnpm', ['run', 'typecheck'], { cwd: fixtureDir })
    run('pnpm', ['run', 'typecheck:base-fallback'], { cwd: fixtureDir })
  } catch (error) {
    ctx.failures.push(`[./auth-client] packed auth-client-typing probe failed: ${error.message}`)
  } finally {
    rmSync(join(fixtureDir, 'node_modules'), { recursive: true, force: true })
    rmSync(join(fixtureDir, '.nuxt'), { recursive: true, force: true })
    rmSync(join(fixtureDir, '.output'), { recursive: true, force: true })
    rmSync(localTarball, { force: true })
    rmSync(join(fixtureDir, 'pnpm-lock.yaml'), { force: true })
  }
}

/**
 * `/server` probe: installs the packed tarball into the committed
 * `test/fixtures/server-consumer` fixture (vNext §9 "a server subpath
 * consumer typecheck fixture") and runs `nuxi prepare` (proves the Nuxt
 * module still installs cleanly from the packed tarball) then `nuxi
 * typecheck` (proves type resolution of the real `better-convex-nuxt/server`
 * subpath, plus the `@ts-expect-error` negative-space contract proving the
 * deleted server trio no longer typechecks there — vNext §9 mandatory test
 * "old trio imports fail typecheck").
 */
function probeServerEntry(ctx) {
  const fixtureDir = p('test/fixtures/server-consumer')
  const localTarball = join(fixtureDir, 'better-convex-nuxt.tgz')
  copyFileSync(ctx.tarballPath, localTarball)

  try {
    run('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], { cwd: fixtureDir })
    run('pnpm', ['run', 'prepare:types'], { cwd: fixtureDir })
    run('pnpm', ['run', 'typecheck'], { cwd: fixtureDir })
  } catch (error) {
    ctx.failures.push(`[./server] packed server-consumer probe failed: ${error.message}`)
  } finally {
    rmSync(join(fixtureDir, 'node_modules'), { recursive: true, force: true })
    rmSync(join(fixtureDir, '.nuxt'), { recursive: true, force: true })
    rmSync(join(fixtureDir, '.output'), { recursive: true, force: true })
    rmSync(localTarball, { force: true })
    rmSync(join(fixtureDir, 'pnpm-lock.yaml'), { force: true })
  }
}

/**
 * `/server/createUserSyncTriggers` probe: this entry is framework-free (no
 * Nuxt/H3/Convex import of its own), so — like `/errors` — it is proved with
 * a standalone Node consumer rather than a full Nuxt fixture: installs the
 * packed tarball into `test/fixtures/user-sync-triggers-consumer` and runs its
 * `build` (type resolution via `tsc`) and `start` (runtime resolution).
 */
function probeCreateUserSyncTriggersEntry(ctx) {
  const fixtureDir = p('test/fixtures/user-sync-triggers-consumer')
  const localTarball = join(fixtureDir, 'better-convex-nuxt.tgz')
  copyFileSync(ctx.tarballPath, localTarball)

  try {
    run('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], { cwd: fixtureDir })
    run('pnpm', ['run', 'build'], { cwd: fixtureDir })
    run('pnpm', ['run', 'start'], { cwd: fixtureDir })
  } catch (error) {
    ctx.failures.push(
      `[./server/createUserSyncTriggers] packed user-sync-triggers-consumer probe failed: ${error.message}`,
    )
  } finally {
    rmSync(join(fixtureDir, 'node_modules'), { recursive: true, force: true })
    rmSync(join(fixtureDir, 'dist'), { recursive: true, force: true })
    rmSync(localTarball, { force: true })
    rmSync(join(fixtureDir, 'pnpm-lock.yaml'), { force: true })
  }
}

function writeFile(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
}

function writeJson(path, value) {
  return writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
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

  const activeEntries = ENTRIES.filter((entry) => ACTIVE_PHASES.includes(entry.phase))
  const scheduledEntries = ENTRIES.filter((entry) => !ACTIVE_PHASES.includes(entry.phase))

  if (distOnly) {
    for (const entry of activeEntries) {
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

      for (const entry of activeEntries) {
        checkEntryExportShape(entry, failures, warnings, packageDir)
        checkEntryPurity(entry, failures, packageDir)
      }

      if (failures.length === 0) {
        const ctx = { tarballPath, packageDir, failures }
        for (const entry of activeEntries) {
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
    `✓ ${distOnly ? 'dist-entry' : 'packed-entry'} gate passed (${sourceScan.filesScanned} source file(s) scanned, ${activeEntries.length} active entr${activeEntries.length === 1 ? 'y' : 'ies'} deep-checked).`,
  )
  if (scheduledEntries.length > 0) {
    console.log(
      `  scheduled (inactive): ${scheduledEntries.map((e) => `${e.subpath} [${e.phase}]`).join(', ')}`,
    )
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}

export { checkPackedPathClasses }
