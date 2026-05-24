import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const packDir = resolve(repoRoot, '.pack-check')

const targets = [
  { name: '@lupinum/trellis', dir: repoRoot },
  { name: '@lupinum/trellis-bridge', dir: resolve(repoRoot, 'packages/trellis-bridge') },
]

function isPublishable(packageDir) {
  const manifestPath = join(packageDir, 'package.json')
  if (!existsSync(manifestPath)) return false
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  return manifest.private !== true
}

rmSync(packDir, { recursive: true, force: true })
mkdirSync(packDir, { recursive: true })

const offenders = []
const inspected = []

try {
  for (const target of targets) {
    if (!isPublishable(target.dir)) continue
    execFileSync('pnpm', ['pack', '--pack-destination', packDir], {
      cwd: target.dir,
      stdio: 'inherit',
      env: { ...process.env, npm_config_verify_deps_before_run: 'false' },
    })
  }

  const tarballs = readdirSync(packDir).filter((file) => file.endsWith('.tgz'))
  if (tarballs.length === 0) {
    console.error(`No tarballs produced under ${packDir}.`)
    process.exit(1)
  }

  for (const tarball of tarballs) {
    const tempDir = mkdtempSync(join(tmpdir(), 'trellis-pack-check-'))
    try {
      execFileSync('tar', ['-xzf', resolve(packDir, tarball)], { cwd: tempDir, stdio: 'pipe' })
      const packageJsonPath = join(tempDir, 'package', 'package.json')
      if (!existsSync(packageJsonPath)) {
        offenders.push({ tarball, reason: 'missing package/package.json after extract' })
        continue
      }
      const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
      inspected.push(tarball)
      const fields = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']
      for (const field of fields) {
        const section = manifest[field]
        if (!section) continue
        for (const [name, range] of Object.entries(section)) {
          if (typeof range === 'string' && range.startsWith('workspace:')) {
            offenders.push({
              tarball,
              reason: `${field}.${name} ships ${range} (publishable packages must resolve to concrete semver)`,
            })
          }
        }
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  }
} finally {
  rmSync(packDir, { recursive: true, force: true })
}

if (offenders.length > 0) {
  console.error('Packed tarball workspace:* check failed:')
  for (const offender of offenders) {
    console.error(`  - ${offender.tarball}: ${offender.reason}`)
  }
  process.exit(1)
}

console.log(
  `Packed tarball workspace:* check passed (${inspected.length} tarballs: ${inspected.join(', ')}).`,
)
