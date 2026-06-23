import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = new URL('..', import.meta.url).pathname
const startersDir = join(repoRoot, 'starters')
const generatedNames = ['.convex', '.nuxt', '.output', 'node_modules', 'dist']
const forbiddenPayloadNames = ['.agents', '.claude', '.env.local', 'CLAUDE.md', 'skills-lock.json']

const offenders = []

function collectEmittedJavaScriptArtifacts(dir, relativeDir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.nuxt' || entry.name === '.output') {
      continue
    }

    const fullPath = join(dir, entry.name)
    const relativePath = `${relativeDir}/${entry.name}`
    if (entry.isDirectory()) {
      if (entry.name !== '_generated') {
        collectEmittedJavaScriptArtifacts(fullPath, relativePath)
      }
      continue
    }

    if (!entry.isFile() || !entry.name.endsWith('.js')) {
      continue
    }

    const sourcePath = fullPath.slice(0, -'.js'.length) + '.ts'
    if (existsSync(sourcePath)) {
      offenders.push(relativePath)
    }
  }
}

for (const entry of readdirSync(startersDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue

  for (const generatedName of generatedNames) {
    const generatedPath = join(startersDir, entry.name, generatedName)
    if (existsSync(generatedPath)) {
      offenders.push(`starters/${entry.name}/${generatedName}`)
    }
  }

  for (const forbiddenName of forbiddenPayloadNames) {
    const forbiddenPath = join(startersDir, entry.name, forbiddenName)
    if (existsSync(forbiddenPath)) {
      offenders.push(`starters/${entry.name}/${forbiddenName}`)
    }
  }

  collectEmittedJavaScriptArtifacts(join(startersDir, entry.name), `starters/${entry.name}`)
}

if (offenders.length > 0) {
  console.error('Starter generated artifacts must not be kept in this repository:')
  for (const offender of offenders) {
    console.error(`- ${offender}`)
  }
  console.error('\nRemove them with:')
  console.error(
    'find starters -maxdepth 2 \\( -name .convex -o -name .nuxt -o -name .output -o -name node_modules -o -name dist -o -name .agents -o -name .claude \\) -type d -prune -exec rm -rf {} +',
  )
  console.error(
    'find starters -maxdepth 2 \\( -name .env.local -o -name CLAUDE.md -o -name skills-lock.json \\) -type f -delete',
  )
  console.error(
    'find starters -path "*/_generated" -prune -o -name "*.js" -exec sh -c \'for f; do [ -f "${f%.js}.ts" ] && rm "$f"; done\' sh {} +',
  )
  process.exit(1)
}
