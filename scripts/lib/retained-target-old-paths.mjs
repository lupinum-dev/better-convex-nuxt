import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const ignoredDirNames = new Set([
  '.convex',
  '.git',
  '.nuxt',
  '.output',
  'dist',
  'node_modules',
  '_generated',
])

const scannedExtensions = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
  '.vue',
])

export const retainedTargetRoots = [
  'README.md',
  'CHANGELOG.md',
  'examples',
  'apps/harness',
  'apps/docs',
  'apps/devtools-ui',
]

export const deletedTrellisSurfacePatterns = [
  {
    label: '@lupinum/trellis/functions',
    pattern: /@lupinum\/trellis\/functions/,
  },
  {
    label: '@lupinum/trellis/trusted-forwarding',
    pattern: /@lupinum\/trellis\/trusted-forwarding/,
  },
  {
    label: '@lupinum/trellis/bridge',
    pattern: /@lupinum\/trellis\/bridge/,
  },
  {
    label: 'tool.fromOperation',
    pattern: /\btool\.fromOperation\b/,
  },
  {
    label: 'raw trusted-forwarding key',
    pattern: /\b_trustedForwardingKey\b/,
  },
  {
    label: 'raw trusted-forwarding payload',
    pattern: /\b_trustedForwarding\b/,
  },
  {
    label: 'workspace --mcp',
    pattern: /\bworkspace\s+--mcp\b/,
  },
  {
    label: '--template cms',
    pattern: /\b--template\s+cms\b/,
  },
  {
    label: 'trellis bridge',
    pattern: /\btrellis\s+bridge\b/,
  },
]

function collectFiles(repoRoot, rootPath) {
  const absoluteRoot = path.resolve(repoRoot, rootPath)
  if (!existsSync(absoluteRoot)) return []

  const stats = statSync(absoluteRoot)
  if (stats.isFile()) return [absoluteRoot]

  const files = []
  for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignoredDirNames.has(entry.name)) continue
      files.push(...collectFiles(repoRoot, path.join(rootPath, entry.name)))
      continue
    }

    if (!entry.isFile()) continue
    const absolutePath = path.join(absoluteRoot, entry.name)
    if (!scannedExtensions.has(path.extname(entry.name))) continue
    files.push(absolutePath)
  }

  return files
}

export function findDeletedTrellisSurfaceHits(repoRoot, roots = retainedTargetRoots) {
  const hits = []

  for (const root of roots) {
    for (const filePath of collectFiles(repoRoot, root)) {
      const source = readFileSync(filePath, 'utf8')
      const lines = source.split(/\r?\n/)
      lines.forEach((line, index) => {
        for (const { label, pattern } of deletedTrellisSurfacePatterns) {
          if (!pattern.test(line)) continue
          hits.push({
            label,
            line: index + 1,
            path: path.relative(repoRoot, filePath).replaceAll('\\', '/'),
          })
        }
      })
    }
  }

  return hits
}

export function formatDeletedTrellisSurfaceHit(hit) {
  return `${hit.path}:${hit.line}:${hit.label}`
}
