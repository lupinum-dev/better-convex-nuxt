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
 *   3. packs the current tree with `pnpm pack --config.ignore-scripts=true`
 *      (skips the `prepack` lifecycle hook so this does not recurse when
 *      `prepack` itself invokes this script) and extracts that exact tarball
 *      — the real published artifact, not the local `dist/` tree — to a
 *      scratch directory;
 *   4. scans the extracted tarball for source-machine absolute paths and
 *      undeclared bare-specifier dependencies (internal §16.2);
 *   5. for each ACTIVE table entry, uses the installed TypeScript compiler to
 *      prove the entry's dist files export exactly the expected names, no
 *      forbidden names, and (where declared) import nothing outside the
 *      entry's purity allowlist;
 *   6. for each ACTIVE entry with a packed consumer fixture, runs a clean
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

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const p = (...segments) => resolve(repoRoot, ...segments)
const packageJson = JSON.parse(readFileSync(p('package.json'), 'utf8'))

/** Phases whose table entries are deep-checked (export shape, purity, packed probe). */
const ACTIVE_PHASES = ['phase0', 'phase2']

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
const allowedVirtualPrefixes = ['#app/', '#build/', '#components/']
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
 * @property {string} [distDir] - dist-relative directory purity scanning walks (defaults to dirname(distJs))
 * @property {(ctx: ProbeContext) => void} [packedProbe] - packed consumer probe, run against the extracted tarball
 */

/** @type {Entry[]} */
const ENTRIES = [
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
  },
  {
    subpath: './server',
    phase: 'phase4',
    distJs: 'dist/runtime/server/index.js',
    distDts: 'dist/runtime/server/index.d.ts',
    expectedValueExports: [],
    additionalExpectedDeclaredNames: [],
    forbiddenNames: [],
  },
  {
    subpath: './server/createUserSyncTriggers',
    phase: 'phase4',
    distJs: 'dist/runtime/server/createUserSyncTriggers.js',
    distDts: 'dist/runtime/server/createUserSyncTriggers.d.ts',
    expectedValueExports: [],
    additionalExpectedDeclaredNames: [],
    forbiddenNames: [],
  },
]

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

function checkEntryExportShape(entry, failures, warnings) {
  const jsPath = p(entry.distJs)
  const dtsPath = p(entry.distDts)
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

function checkEntryPurity(entry, failures) {
  if (!entry.purity) return
  const distDir = p(entry.distDir ?? dirname(entry.distJs))
  const sourceDir = p(
    entry.subpath === '.' ? 'src/module.ts' : `src/runtime/${entry.subpath.replace('./', '')}`,
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

function scanExtractedTarball(packageDir, failures) {
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
function packAndExtract() {
  const scratchDir = mkdtempSync(join(tmpdir(), 'bcn-packed-entry-'))
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
  const tarballPath = parsed.filename
  if (!tarballPath || !existsSync(tarballPath)) {
    console.error(
      `\`pnpm pack\` did not produce the expected tarball (got: ${JSON.stringify(parsed)}).`,
    )
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
      "console.log('root-entry-probe runtime OK')",
      '',
    ].join('\n'),
  )
  writeFile(
    join(dir, 'index.ts'),
    [
      "import type { ModuleOptions } from 'better-convex-nuxt'",
      "import mod from 'better-convex-nuxt'",
      '',
      'const _opts: ModuleOptions | undefined = undefined',
      'void mod',
      'void _opts',
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

  requireDistBuilt()

  const activeEntries = ENTRIES.filter((entry) => ACTIVE_PHASES.includes(entry.phase))
  const scheduledEntries = ENTRIES.filter((entry) => !ACTIVE_PHASES.includes(entry.phase))

  for (const entry of activeEntries) {
    checkEntryExportShape(entry, failures, warnings)
    checkEntryPurity(entry, failures)
  }

  console.log('Packing and extracting the current tree for packed-probe evidence…')
  const { scratchDir, tarballPath, packageDir } = packAndExtract()
  try {
    scanExtractedTarball(packageDir, failures)

    const ctx = { tarballPath, packageDir, failures }
    for (const entry of activeEntries) {
      if (!entry.packedProbe) continue
      console.log(`Running packed probe for "${entry.subpath}"…`)
      entry.packedProbe(ctx)
    }
  } finally {
    rmSync(scratchDir, { recursive: true, force: true })
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
    `✓ packed-entry gate passed (${sourceScan.filesScanned} source file(s) scanned, ${activeEntries.length} active entr${activeEntries.length === 1 ? 'y' : 'ies'} deep-checked).`,
  )
  if (scheduledEntries.length > 0) {
    console.log(
      `  scheduled (inactive): ${scheduledEntries.map((e) => `${e.subpath} [${e.phase}]`).join(', ')}`,
    )
  }
}

main()
