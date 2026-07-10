#!/usr/bin/env node
/**
 * AST-based dependency-direction gate (internal §16.1).
 *
 * Uses the repository's installed `typescript` parser (no new dependency) to
 * build a real import/export edge graph — static imports, dynamic `import()`,
 * and `export ... from` — and checks it against a declarative edge table.
 * Type-only imports/exports (`import type`, per-specifier `type`, and
 * `import('mod').Foo` type positions) are tracked separately from value
 * edges because they cannot introduce runtime coupling.
 *
 * This script enforces *architecture* (who may depend on whom). It must not
 * duplicate the vocabulary checker's spelling/wording rules (section 16.3).
 *
 * Rules are declared in one table, gated by `phase`, following the same
 * activation-schedule pattern as `check-vocabulary.mjs`: only phases listed
 * in ACTIVE_PHASES actually run. Rules for future boundaries (`/errors`,
 * `/auth-client`, pure transitions) are listed as scheduled entries so later
 * phases activate them by extending ACTIVE_PHASES — no restructuring.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const p = (...segments) => resolve(repoRoot, ...segments)

/** Phases whose rules actually execute. Extend as later phases land boundaries. */
const ACTIVE_PHASES = ['phase0']

/** Directory names never walked into, anywhere in the tree. */
const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.nuxt',
  '.output',
  '.convex',
  '.cache',
  '.temp',
  '.tmp',
  '.data',
  '.turbo',
  '.idea',
  '.vscode',
  'dist',
  'coverage',
  'reports',
])

const PARSEABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.vue'])

// ---------------------------------------------------------------------------
// Path groups referenced by the edge table.
// ---------------------------------------------------------------------------

/** `src/runtime/server/**` — Nitro/Node-only server runtime. */
const SERVER_RUNTIME_DIR = p('src/runtime/server')

/**
 * Browser runtime: composables, components, route middleware, and the
 * client-only auth engine/plugin. `plugin.server.ts` is intentionally
 * excluded — it is a distinct SSR-entry group (see below): Nuxt's
 * `.server.ts` suffix means it never ships to the browser bundle, and it is
 * the documented bridge that reads server-side auth/token state during SSR.
 */
const BROWSER_RUNTIME_DIRS = [
  p('src/runtime/composables'),
  p('src/runtime/components'),
  p('src/runtime/middleware'),
  p('src/runtime/auth'),
]
const BROWSER_RUNTIME_FILES = [p('src/runtime/plugin.client.ts')]

/**
 * SSR-entry group: runs only in the Nitro/Node SSR pass, never in the
 * browser. Documented, deliberate exception — it is the one browser-runtime
 * sibling allowed to import `src/runtime/server/**` today.
 */
const SSR_ENTRY_FILES = [p('src/runtime/plugin.server.ts')]

/** `src/module*.ts` — module/build code, never a runtime dependency. */
const MODULE_BUILD_FILES = readdirSync(p('src'))
  .filter((name) => /^module.*\.ts$/.test(name) && statSync(p('src', name)).isFile())
  .map((name) => p('src', name))

const RUNTIME_ROOT = p('src/runtime')

/** Future boundary roots that do not exist yet; referenced only by scheduled rules. */
const ERRORS_DIR = p('src/runtime/errors')
const AUTH_CLIENT_DIR = p('src/runtime/auth-client')

function inDir(absPath, dirAbs) {
  return absPath === dirAbs || absPath.startsWith(dirAbs + sep)
}
function inAnyDir(absPath, dirs) {
  return dirs.some((dir) => inDir(absPath, dir))
}
function isAnyFile(absPath, files) {
  return files.includes(absPath)
}

const isServerRuntime = (absPath) => inDir(absPath, SERVER_RUNTIME_DIR)
const isBrowserRuntime = (absPath) =>
  inAnyDir(absPath, BROWSER_RUNTIME_DIRS) || isAnyFile(absPath, BROWSER_RUNTIME_FILES)
const isModuleBuild = (absPath) => isAnyFile(absPath, MODULE_BUILD_FILES)
const isRuntimeEntry = (absPath) => inDir(absPath, RUNTIME_ROOT)

/**
 * Bare-specifier families that only make sense in a browser/Nuxt-app context.
 * `#imports` is deliberately excluded: it is a per-context virtual module
 * (app auto-imports in the browser/SSR-app tsconfig, Nitro auto-imports in
 * `src/runtime/server/tsconfig.json`), so the same specifier text resolves
 * to different, legitimate things depending on which program compiles it.
 */
const BROWSER_ONLY_BARE_SPECIFIERS = [
  /^vue$/,
  /^@vue\//,
  /^vue-router$/,
  /^#app\b/,
  /^#components\b/,
  /^#build\b/,
]

// ---------------------------------------------------------------------------
// Edge table (internal §16.1)
// ---------------------------------------------------------------------------

/**
 * @typedef {object} Rule
 * @property {string} name - short rule identifier
 * @property {string} description - human-readable summary shown on failure
 * @property {'phase0'|'phase2'|'phase3'} phase - activation-schedule gate, see ACTIVE_PHASES
 * @property {(absPath: string) => boolean} from - files this rule inspects
 * @property {(edge: Edge) => boolean} disallow - true if the edge is forbidden
 * @property {boolean} [typeOnlyExempt] - if true (default), a type-only edge that would
 *   otherwise match `disallow` is allowed because it cannot introduce runtime coupling.
 * @typedef {object} Edge
 * @property {boolean} isRelative - whether the specifier is a relative path (`./`, `../`)
 * @property {string|null} resolvedAbsPath - resolved file, if relative and it exists
 * @property {string} specifier - raw module specifier text
 * @property {boolean} isTypeOnly - whether the edge is type-only (no runtime coupling)
 */

/** @type {Rule[]} */
const RULES = [
  {
    name: 'server-no-browser-imports',
    description:
      'src/runtime/server/** must never import composables, components, middleware, the auth engine, Vue, or the client plugin.',
    phase: 'phase0',
    from: isServerRuntime,
    disallow: (edge) => {
      if (edge.isRelative) {
        return edge.resolvedAbsPath !== null && isBrowserRuntime(edge.resolvedAbsPath)
      }
      return BROWSER_ONLY_BARE_SPECIFIERS.some((re) => re.test(edge.specifier))
    },
  },
  {
    name: 'browser-no-server-imports',
    description:
      'Browser runtime (composables, components, middleware, auth engine, client plugin) must never import src/runtime/server/**.',
    phase: 'phase0',
    from: (absPath) => isBrowserRuntime(absPath),
    disallow: (edge) =>
      edge.isRelative && edge.resolvedAbsPath !== null && isServerRuntime(edge.resolvedAbsPath),
  },
  {
    name: 'module-no-runtime-leak',
    description:
      'src/runtime/** must never import src/module*.ts (module/build code leaking into runtime entries).',
    phase: 'phase0',
    from: isRuntimeEntry,
    disallow: (edge) =>
      edge.isRelative && edge.resolvedAbsPath !== null && isModuleBuild(edge.resolvedAbsPath),
    typeOnlyExempt: false,
  },

  // --- Scheduled (inactive) future boundaries — flip on by extending ACTIVE_PHASES. ---
  {
    name: 'errors-framework-free',
    description:
      '/errors implementation must import only its own framework-free code, platform-neutral language primitives, and the public Convex error-value entry.',
    phase: 'phase2',
    from: (absPath) => inDir(absPath, ERRORS_DIR),
    disallow: (edge) => {
      if (!edge.isRelative) {
        return edge.specifier !== 'convex' && !edge.specifier.startsWith('convex/')
      }
      return edge.resolvedAbsPath !== null && !inDir(edge.resolvedAbsPath, ERRORS_DIR)
    },
  },
  {
    name: 'auth-client-no-runtime-deps',
    description:
      '/auth-client implementation must import no runtime dependency; type-only Better Auth imports are allowed, Nuxt/#app/Vue/Nitro/Node-only/server-runtime are forbidden.',
    phase: 'phase3',
    from: (absPath) => inDir(absPath, AUTH_CLIENT_DIR),
    disallow: (edge) => {
      if (edge.isRelative) {
        return edge.resolvedAbsPath !== null && isServerRuntime(edge.resolvedAbsPath)
      }
      return (
        BROWSER_ONLY_BARE_SPECIFIERS.some((re) => re.test(edge.specifier)) ||
        edge.specifier.startsWith('node:') ||
        edge.specifier === 'nitropack' ||
        edge.specifier.startsWith('nitropack/')
      )
    },
  },
  {
    name: 'pure-transitions-no-framework',
    description:
      'Pure auth/query transition modules must never import Nuxt, Vue, Nitro, or environment globals.',
    phase: 'phase3',
    from: () => false, // no dedicated directory exists yet; activated with its owning rewrite.
    disallow: (edge) => {
      if (edge.isRelative) return false
      return (
        BROWSER_ONLY_BARE_SPECIFIERS.some((re) => re.test(edge.specifier)) ||
        edge.specifier.startsWith('node:') ||
        edge.specifier === 'nitropack'
      )
    },
  },
]

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

function collectFiles(absoluteRoot) {
  const files = []
  const stack = [absoluteRoot]
  while (stack.length > 0) {
    const dir = stack.pop()
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIR_NAMES.has(entry.name)) continue
        stack.push(join(dir, entry.name))
        continue
      }
      if (!entry.isFile()) continue
      if (!PARSEABLE_EXTENSIONS.has(extname(entry.name))) continue
      files.push(join(dir, entry.name))
    }
  }
  return files
}

// ---------------------------------------------------------------------------
// AST edge extraction
// ---------------------------------------------------------------------------

/** Extract `<script ...>...</script>` block contents (there may be two: normal + setup). */
function extractVueScriptBlocks(source) {
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi
  return [...source.matchAll(re)].map((match) => match[1])
}

function tryResolveRelative(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier)
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.d.ts`,
    `${base}.vue`,
    `${base}.js`,
    `${base}.mjs`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
    join(base, 'index.vue'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

/** Collect import/export/dynamic-import edges from one TS source text. */
function collectEdgesFromSource(fileName, text) {
  const sourceFile = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  /** @type {{ specifier: string, isTypeOnly: boolean }[]} */
  const raw = []

  function visit(node) {
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const clause = node.importClause
      let isTypeOnly = false
      if (clause) {
        if (clause.isTypeOnly) {
          isTypeOnly = true
        } else if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          const elements = clause.namedBindings.elements
          isTypeOnly = elements.length > 0 && elements.every((el) => el.isTypeOnly)
        }
      }
      raw.push({ specifier: node.moduleSpecifier.text, isTypeOnly })
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      let isTypeOnly = node.isTypeOnly
      if (!isTypeOnly && node.exportClause && ts.isNamedExports(node.exportClause)) {
        const elements = node.exportClause.elements
        isTypeOnly = elements.length > 0 && elements.every((el) => el.isTypeOnly)
      }
      raw.push({ specifier: node.moduleSpecifier.text, isTypeOnly })
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      // Dynamic `import(...)` always introduces a real runtime edge.
      raw.push({ specifier: node.arguments[0].text, isTypeOnly: false })
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      // `import('mod').Foo` used purely as a type — never a runtime edge.
      raw.push({ specifier: node.argument.literal.text, isTypeOnly: true })
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return raw
}

function buildEdges(absoluteFile) {
  const text = readFileSync(absoluteFile, 'utf8')
  const isVue = extname(absoluteFile) === '.vue'
  const rawEdges = isVue
    ? extractVueScriptBlocks(text).flatMap((block) => collectEdgesFromSource(absoluteFile, block))
    : collectEdgesFromSource(absoluteFile, text)

  return rawEdges.map(({ specifier, isTypeOnly }) => {
    const isRelative = specifier.startsWith('.')
    const resolvedAbsPath = isRelative ? tryResolveRelative(absoluteFile, specifier) : null
    return { isRelative, resolvedAbsPath, specifier, isTypeOnly }
  })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/** Path-group constants documented as existing today; catches config rot if a file moves. */
function assertKnownPathsExist() {
  const knownFiles = [...BROWSER_RUNTIME_FILES, ...SSR_ENTRY_FILES, ...MODULE_BUILD_FILES]
  const knownDirs = [SERVER_RUNTIME_DIR, ...BROWSER_RUNTIME_DIRS, RUNTIME_ROOT]
  for (const file of knownFiles) {
    if (!existsSync(file)) {
      throw new Error(
        `boundary checker misconfigured: expected file does not exist: ${relative(repoRoot, file)}`,
      )
    }
  }
  for (const dir of knownDirs) {
    if (!existsSync(dir)) {
      throw new Error(
        `boundary checker misconfigured: expected directory does not exist: ${relative(repoRoot, dir)}`,
      )
    }
  }
}

function main() {
  assertKnownPathsExist()

  const activeRules = RULES.filter((rule) => ACTIVE_PHASES.includes(rule.phase))
  const scheduledRules = RULES.filter((rule) => !ACTIVE_PHASES.includes(rule.phase))

  const files = collectFiles(p('src'))

  /** @type {{ rule: Rule, file: string, specifier: string, isTypeOnly: boolean }[]} */
  const violations = []

  for (const absoluteFile of files) {
    let edges
    try {
      edges = buildEdges(absoluteFile)
    } catch (error) {
      console.error(
        `✗ boundary checker failed to parse ${relative(repoRoot, absoluteFile)}: ${error.message}`,
      )
      process.exit(1)
    }

    for (const rule of activeRules) {
      if (!rule.from(absoluteFile)) continue
      const typeOnlyExempt = rule.typeOnlyExempt !== false
      for (const edge of edges) {
        if (edge.isTypeOnly && typeOnlyExempt) continue
        if (rule.disallow(edge)) {
          violations.push({
            rule,
            file: absoluteFile,
            specifier: edge.specifier,
            isTypeOnly: edge.isTypeOnly,
          })
        }
      }
    }
  }

  if (violations.length > 0) {
    const byRule = new Map()
    for (const violation of violations) {
      if (!byRule.has(violation.rule.name)) byRule.set(violation.rule.name, [])
      byRule.get(violation.rule.name).push(violation)
    }
    for (const [ruleName, ruleViolations] of byRule) {
      console.error(`\n✗ ${ruleName}: ${ruleViolations[0].rule.description}`)
      for (const violation of ruleViolations) {
        console.error(`  ${relative(repoRoot, violation.file)} -> "${violation.specifier}"`)
      }
    }
    console.error(
      `\nboundary check failed: ${violations.length} forbidden edge(s) across ${byRule.size} rule(s).`,
    )
    process.exit(1)
  }

  console.log(
    `✓ boundary check passed (${activeRules.length} active rule(s), ${files.length} file(s) scanned).`,
  )
  if (scheduledRules.length > 0) {
    console.log(
      `  scheduled (inactive): ${scheduledRules.map((r) => `${r.name} [${r.phase}]`).join(', ')}`,
    )
  }
}

export { ACTIVE_PHASES, RULES }

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  main()
}
