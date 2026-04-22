import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const harnessRoot = path.resolve('apps/harness')
const generatedRoot = path.join(harnessRoot, 'convex/_generated')
const requiredGeneratedFiles = ['api.d.ts', 'api.js', 'dataModel.d.ts', 'server.d.ts', 'server.js']

function hasCommittedGeneratedArtifacts() {
  return requiredGeneratedFiles.every((file) => existsSync(path.join(generatedRoot, file)))
}

function runCodegen() {
  return spawnSync(
    'pnpm',
    ['--dir', 'apps/harness', 'exec', 'convex', 'codegen', '--typecheck', 'disable'],
    {
      stdio: 'pipe',
      encoding: 'utf8',
    },
  )
}

const result = runCodegen()
const stdout = typeof result.stdout === 'string' ? result.stdout : ''
const stderr = typeof result.stderr === 'string' ? result.stderr : ''

if (stdout) process.stdout.write(stdout)
if (stderr) process.stderr.write(stderr)

if (result.status === 0) {
  process.exit(0)
}

const combinedOutput = `${stdout}\n${stderr}`

const missingDeployment =
  combinedOutput.includes('No CONVEX_DEPLOYMENT set') ||
  combinedOutput.includes("Local backend isn't running")

if (missingDeployment && hasCommittedGeneratedArtifacts()) {
  console.warn(
    '[trellis] harness Convex codegen skipped: using committed apps/harness/convex/_generated artifacts because no deployment or local backend is available.',
  )
  process.exit(0)
}

process.exit(result.status ?? 1)
