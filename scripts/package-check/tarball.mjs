// Packed-tarball absolute-path / undeclared-dependency scan (architecture invariant)
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { tmpdir } from 'node:os'
import { extname, join, relative, resolve, sep } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '../..')
const p = (...segments) => resolve(repoRoot, ...segments)
const packageJson = JSON.parse(readFileSync(p('package.json'), 'utf8'))
const runtimeDeclaredPackages = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.peerDependencies ?? {}),
  ...Object.keys(packageJson.optionalDependencies ?? {}),
])
const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)])

function rootPackageName(specifier) {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/')
  return specifier.split('/')[0]
}

function walkDir(dir, extensions) {
  if (!existsSync(dir)) return []
  const stats = statSync(dir)
  if (stats.isFile()) return extensions.has(extname(dir)) ? [dir] : []

  return readdirSync(dir).flatMap((name) => walkDir(join(dir, name), extensions))
}

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

const ALLOWED_PACKAGE_ROOT_FILES = new Set([
  'LICENSE',
  'LICENSES/Apache-2.0.txt',
  'README.md',
  'THIRD_PARTY_NOTICES.md',
  'package.json',
  'security/upstream-convex-better-auth.json',
])
const REQUIRED_PACKED_FILES = new Set(['dist/runtime/devtools/ui/dist/index.html'])

export function buildContentManifest(packageDir) {
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
  // This is release-content evidence, so it must describe only reproducible
  // package inputs. Recording wall-clock time would make equal builds differ.
  return { version: packedPackageJson.version, files }
}

export function checkPackedPathClasses(manifest, failures) {
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

export function checkRequiredPackedFiles(manifest, failures) {
  const packedFiles = new Set(manifest.files.map(({ path }) => path))
  for (const path of REQUIRED_PACKED_FILES) {
    if (!packedFiles.has(path)) failures.push(`packed tarball is missing required file: ${path}`)
  }
}

export function scanExtractedTarball(packageDir, failures, manifest) {
  checkPackedPathClasses(manifest, failures)
  checkRequiredPackedFiles(manifest, failures)
  const packedPackageJson = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
  const bins =
    typeof packedPackageJson.bin === 'string'
      ? [[packedPackageJson.name, packedPackageJson.bin]]
      : Object.entries(packedPackageJson.bin ?? {})
  for (const [command, target] of bins) {
    if (typeof target !== 'string') {
      failures.push(`packed package bin["${command}"] has a non-string target`)
      continue
    }
    const normalizedTarget = target.replace(/^\.\//, '')
    const absoluteTarget = resolve(packageDir, normalizedTarget)
    if (!absoluteTarget.startsWith(`${packageDir}${sep}`)) {
      failures.push(`packed package bin["${command}"] escapes the package: ${target}`)
      continue
    }
    const manifestEntry = manifest.files.find((entry) => entry.path === normalizedTarget)
    if (!manifestEntry || !existsSync(absoluteTarget)) {
      failures.push(`packed package bin["${command}"] target is missing: ${target}`)
      continue
    }
    if (!readFileSync(absoluteTarget, 'utf8').startsWith('#!/usr/bin/env node\n')) {
      failures.push(`packed package bin["${command}"] target is missing its Node shebang`)
    }
    if ((Number.parseInt(manifestEntry.mode, 8) & 0o111) === 0) {
      failures.push(`packed package bin["${command}"] target is not executable`)
    }
  }
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

export function requireDistBuilt() {
  const requiredFiles = [
    'dist/module.mjs',
    'dist/types.d.mts',
    'dist/runtime/devtools/ui/dist/index.html',
  ]
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
export function packAndExtract(tarballInput) {
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
