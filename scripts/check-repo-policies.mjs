import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import {
  findRuntimeBoundaryViolations,
  formatRuntimeBoundaryViolation,
} from './lib/repo-policy-boundaries.mjs'
import {
  findDeletedTrellisSurfaceHits,
  formatDeletedTrellisSurfaceHit,
} from './lib/retained-target-old-paths.mjs'

const checks = [
  {
    name: 'protocol-specific agent kinds',
    pattern: /kind: 'mcp'|kind:\s*v\.literal\('mcp'\)|case 'mcp'|principal\.kind === 'mcp'/,
    roots: ['README.md', 'apps/docs/content/docs', 'examples', 'src/cli'],
  },
  {
    name: 'query composables in middleware',
    pattern: /useConvexQuery\(|useConvexPaginatedQuery\(/,
    roots: ['apps/harness/middleware', 'apps/harness/plugins'],
  },
  {
    name: 'useRoute in middleware',
    pattern: /useRoute\(/,
    roots: ['apps/harness/middleware'],
  },
  {
    name: 'middleware subscribe:false docs',
    pattern: /middleware.*subscribe:\s*false|subscribe:\s*false.*middleware/,
    roots: ['apps/docs/content/docs'],
  },
  {
    name: 'stale MCP toolkit pins',
    pattern: /"@nuxtjs\/mcp-toolkit"\s*:\s*"\^?0\.(13|14|15)\./,
    roots: ['package.json', 'apps', 'examples', 'src/cli/starter-fixtures', 'tests/fixtures'],
  },
  {
    name: 'private consumer references',
    pattern: /i18n-cms|\/_temp\/i18n-cms|\/Users\/matthias\/Git\/_temp/,
    roots: ['README.md', 'apps/docs/content/docs', 'examples', 'src', 'tests'],
  },
  {
    name: 'destructive execute examples without confirmation token',
    pattern: /\b(archiveProject|deleteTask)\(\{(?:(?!_confirmationToken).)*\}\)/,
    roots: ['apps/docs/content/docs', 'examples'],
  },
  {
    name: 'stale confirmationToken docs',
    pattern: /\bconfirmationToken\b/,
    roots: ['README.md', 'apps/docs/content/docs', 'labs', 'SPEC.md'],
  },
]

const repoRoot = process.cwd()
const ignoredDirNames = new Set(['node_modules', '_generated', '.git'])
const trackedIgnoredArtifactPathspecs = [
  ':(glob)**/.pack/**',
  ':(glob)**/.pack-check/**',
  ':(glob)**/dist/**',
  ':(glob)**/.nuxt/**',
  ':(glob)**/.output/**',
]

function collectFiles(rootPath) {
  const absoluteRoot = path.resolve(repoRoot, rootPath)
  if (!existsSync(absoluteRoot)) return []

  const stats = statSync(absoluteRoot)
  if (stats.isFile()) return [absoluteRoot]

  const files = []
  for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignoredDirNames.has(entry.name)) continue
      files.push(...collectFiles(path.join(rootPath, entry.name)))
      continue
    }

    if (!entry.isFile()) continue
    files.push(path.join(absoluteRoot, entry.name))
  }

  return files
}

function findMatches(check) {
  const matches = []
  for (const root of check.roots) {
    for (const filePath of collectFiles(root)) {
      let source
      try {
        source = readFileSync(filePath, 'utf8')
      } catch {
        continue
      }

      const lines = source.split('\n')
      lines.forEach((line, index) => {
        if (!check.pattern.test(line)) return
        matches.push(`${path.relative(repoRoot, filePath)}:${index + 1}:${line.trim()}`)
      })
    }
  }

  return matches
}

for (const check of checks) {
  const matches = findMatches(check)
  if (matches.length === 0) continue

  const preview = matches.slice(0, 10).join('\n')
  throw new Error(`[trellis] repo policy violated: ${check.name}\n${preview}`)
}

const trackedIgnoredArtifacts = execFileSync(
  'git',
  ['ls-files', '-ci', '--exclude-standard', ...trackedIgnoredArtifactPathspecs],
  { cwd: repoRoot, encoding: 'utf8' },
)
  .split('\n')
  .filter(Boolean)

if (trackedIgnoredArtifacts.length > 0) {
  throw new Error(
    `[trellis] repo policy violated: ignored generated/release artifacts are tracked\n${trackedIgnoredArtifacts
      .slice(0, 20)
      .join('\n')}`,
  )
}

const runtimeBoundaryFiles = collectFiles('src').map((filePath) => ({
  path: path.relative(repoRoot, filePath),
  source: readFileSync(filePath, 'utf8'),
}))
const runtimeBoundaryViolations = findRuntimeBoundaryViolations(runtimeBoundaryFiles)
if (runtimeBoundaryViolations.length > 0) {
  const preview = runtimeBoundaryViolations
    .slice(0, 10)
    .map(formatRuntimeBoundaryViolation)
    .join('\n')
  throw new Error(
    `[trellis] repo policy violated: public/core runtime must not import advanced implementation code\n${preview}`,
  )
}

const deletedSurfaceHits = findDeletedTrellisSurfaceHits(repoRoot)
if (deletedSurfaceHits.length > 0) {
  const preview = deletedSurfaceHits.slice(0, 20).map(formatDeletedTrellisSurfaceHit).join('\n')
  throw new Error(
    `[trellis] repo policy violated: retained examples/apps must not use deleted Trellis 1.0 surfaces\n${preview}`,
  )
}
