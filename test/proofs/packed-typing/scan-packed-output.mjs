// §5.8 / internal §16.2 baseline evidence: scan the packed tarball's `dist`
// for (1) source-machine absolute paths and (2) bare imports not declared in
// the package's own dependencies/peerDependencies (undeclared-dependency risk).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const tarball = process.argv[2] ?? join(here, 'better-convex-nuxt-0.5.0.tgz')

const work = mkdtempSync(join(tmpdir(), 'packed-scan-'))
execFileSync('tar', ['-xzf', tarball, '-C', work])
const pkgRoot = join(work, 'package')
const pkgJson = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))
const declared = new Set([
  ...Object.keys(pkgJson.dependencies ?? {}),
  ...Object.keys(pkgJson.peerDependencies ?? {}),
  ...Object.keys(pkgJson.optionalDependencies ?? {}),
])

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const distDir = join(pkgRoot, 'dist')
const files = walk(distDir)

// (1) absolute source-machine paths
const absPathRe = /(\/Users\/[\w.-]+|\/home\/[\w.-]+|[A-Z]:\\\\Users)\S*/g
const absHits = []
// (2) bare import specifiers
const importRe =
  /(?:import|export)\s+(?:[\s\S]*?from\s+)?["']([^"'.][^"']*)["']|require\(\s*["']([^"'.][^"']*)["']\s*\)|import\(\s*["']([^"'.][^"']*)["']\s*\)/g
const undeclared = new Map() // specifier -> Set(files)

const pkgNameOf = (spec) => {
  if (spec.startsWith('node:')) return null
  const parts = spec.split('/')
  return spec.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
}
const NODE_BUILTINS = new Set([
  'fs',
  'path',
  'os',
  'url',
  'crypto',
  'http',
  'https',
  'stream',
  'util',
  'events',
  'buffer',
  'child_process',
  'module',
  'assert',
  'zlib',
  'net',
  'tls',
  'dns',
  'querystring',
  'string_decoder',
  'timers',
  'process',
])

for (const f of files) {
  if (
    !['.mjs', '.js', '.cjs', '.ts', '.mts', '.cts', '.d.ts', '.d.mts', '.map', '.json'].includes(
      extname(f),
    ) &&
    !f.endsWith('.d.ts')
  )
    continue
  const text = readFileSync(f, 'utf8')
  const rel = f.slice(pkgRoot.length + 1)
  for (const m of text.matchAll(absPathRe)) absHits.push({ file: rel, match: m[0].slice(0, 120) })
  if (f.endsWith('.map') || f.endsWith('.json')) continue
  for (const m of text.matchAll(importRe)) {
    const spec = m[1] ?? m[2] ?? m[3]
    if (!spec) continue
    const pkg = pkgNameOf(spec)
    if (!pkg || NODE_BUILTINS.has(pkg) || pkg.startsWith('#')) continue
    if (!declared.has(pkg)) {
      if (!undeclared.has(pkg)) undeclared.set(pkg, new Set())
      undeclared.get(pkg).add(rel)
    }
  }
}

console.log('=== declared deps/peers ===')
console.log([...declared].sort().join(', '))
console.log('\n=== (1) source-machine absolute paths in dist ===')
console.log(absHits.length === 0 ? 'NONE' : JSON.stringify(absHits, null, 2))
console.log('\n=== (2) undeclared bare imports in dist ===')
if (undeclared.size === 0) console.log('NONE')
else
  for (const [pkg, fileSet] of [...undeclared].sort())
    console.log(`${pkg}  <-  ${[...fileSet].sort().join(', ')}`)

console.log('\nfilesScanned', files.length)
