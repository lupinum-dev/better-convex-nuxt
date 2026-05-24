import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const matrix = JSON.parse(readFileSync(resolve(repoRoot, 'compatibility.json'), 'utf8'))
const tracked = matrix.tracked ?? {}
const releaseStack = matrix.releaseStack ?? {}

const ignoredDirs = new Set([
  '.git',
  '.nuxt',
  '.output',
  '.pack',
  '.pack-check',
  'dist',
  'node_modules',
])
const dependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]

function collectPackageJsonFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue
      files.push(...collectPackageJsonFiles(join(directory, entry.name)))
      continue
    }
    if (entry.isFile() && entry.name === 'package.json') files.push(join(directory, entry.name))
  }
  return files
}

function isLocalRange(range) {
  return (
    typeof range === 'string' &&
    (range.startsWith('workspace:') || range.startsWith('file:') || range.startsWith('link:'))
  )
}

const violations = []

const packageLocations = {
  '@lupinum/trellis': 'package.json',
  '@lupinum/trellis-bridge': 'packages/trellis-bridge/package.json',
}

for (const [packageName, expectedVersion] of Object.entries(releaseStack)) {
  const manifestPath = packageLocations[packageName]
  if (!manifestPath) {
    violations.push(`compatibility.json releaseStack.${packageName} has no package location`)
    continue
  }

  const manifest = JSON.parse(readFileSync(resolve(repoRoot, manifestPath), 'utf8'))
  if (manifest.version !== expectedVersion) {
    violations.push(
      `${manifestPath} version is ${JSON.stringify(manifest.version)}; expected ${expectedVersion} from compatibility.json`,
    )
  }
}

const publicPackageFiles = collectPackageJsonFiles(repoRoot).filter((filePath) => {
  const manifest = JSON.parse(readFileSync(filePath, 'utf8'))
  return manifest.private !== true && typeof manifest.name === 'string'
})

for (const filePath of publicPackageFiles) {
  const manifest = JSON.parse(readFileSync(filePath, 'utf8'))
  if (manifest.version === '0.0.0') {
    violations.push(
      `${relative(repoRoot, filePath).replaceAll('\\', '/')} is publishable at version 0.0.0`,
    )
  }
}

for (const filePath of collectPackageJsonFiles(repoRoot)) {
  if (!existsSync(filePath)) continue
  const manifest = JSON.parse(readFileSync(filePath, 'utf8'))
  const rel = relative(repoRoot, filePath).replaceAll('\\', '/')

  for (const field of dependencyFields) {
    const dependencies = manifest[field] ?? {}
    for (const [name, allowedRanges] of Object.entries(tracked)) {
      const range = dependencies[name]
      if (!range || isLocalRange(range)) continue
      if (!allowedRanges.includes(range)) {
        violations.push(
          `${rel} ${field}.${name} is ${JSON.stringify(range)}; expected one of ${allowedRanges.join(', ')}`,
        )
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Compatibility matrix check failed:')
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log(`Compatibility matrix check passed: ${matrix.name}`)
