import { spawnSync } from 'node:child_process'

function runGit(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : ''
    throw new Error(stderr || `git ${args.join(' ')} failed`)
  }

  return typeof result.stdout === 'string' ? result.stdout : ''
}

const trackedGeneratedFiles = runGit(['ls-files', '--', '*convex/_generated/*'])
  .split('\n')
  .map((file) => file.trim())
  .filter(Boolean)

if (trackedGeneratedFiles.length === 0) {
  process.exit(0)
}

const worktreeDrift = runGit(['diff', '--name-only', '--', ...trackedGeneratedFiles])
  .split('\n')
  .filter(Boolean)
const indexDrift = runGit(['diff', '--cached', '--name-only', '--', ...trackedGeneratedFiles])
  .split('\n')
  .filter(Boolean)
const driftedFiles = [...new Set([...worktreeDrift, ...indexDrift])].sort()

if (driftedFiles.length === 0) {
  console.log(
    `[trellis] Checked ${trackedGeneratedFiles.length} tracked Convex _generated files: no drift.`,
  )
  process.exit(0)
}

console.error('[trellis] Tracked Convex _generated artifacts have uncommitted drift:')
for (const file of driftedFiles) {
  console.error(`  - ${file}`)
}
console.error('Regenerate the affected Convex artifacts or remove them from source control.')
process.exit(1)
