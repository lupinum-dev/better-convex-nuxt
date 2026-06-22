import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = new URL('..', import.meta.url).pathname
const startersDir = join(repoRoot, 'starters')
const generatedNames = ['.nuxt', '.output', 'node_modules', 'dist']
const forbiddenPayloadNames = ['.agents', '.claude', '.env.local', 'CLAUDE.md', 'skills-lock.json']

const offenders = []

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
}

if (offenders.length > 0) {
  console.error('Starter generated artifacts must not be kept in this repository:')
  for (const offender of offenders) {
    console.error(`- ${offender}`)
  }
  console.error('\nRemove them with:')
  console.error(
    'find starters -maxdepth 2 \\( -name .nuxt -o -name .output -o -name node_modules -o -name dist -o -name .agents -o -name .claude \\) -type d -prune -exec rm -rf {} +',
  )
  console.error(
    'find starters -maxdepth 2 \\( -name .env.local -o -name CLAUDE.md -o -name skills-lock.json \\) -type f -delete',
  )
  process.exit(1)
}
