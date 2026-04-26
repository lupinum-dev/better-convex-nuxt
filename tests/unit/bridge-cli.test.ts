import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import {
  discoverInstalledBridgeComponents,
  loadManifestFromPackage,
} from '../../src/runtime/bridge/index.js'

const repoRoot = process.cwd()
const cliEntry = resolve(repoRoot, 'dist/cli.mjs')

function createTempDir(prefix: string): string {
  return mkdtempSync(resolve(tmpdir(), prefix))
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
}

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

function runCli(args: string[], cwd = repoRoot) {
  return spawnSync(process.execPath, [cliEntry, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1',
    },
  })
}

function writeConsumerPackage(appRoot: string, packageName = '@fixture/bridge-component'): void {
  write(
    resolve(appRoot, 'package.json'),
    JSON.stringify(
      {
        private: true,
        type: 'module',
        dependencies: {
          '@lupinum/trellis': 'workspace:*',
          [packageName]: '1.0.0',
          convex: '^1.34.1',
          nuxt: '^4.4.2',
        },
      },
      null,
      2,
    ),
  )
  write(resolve(appRoot, 'nuxt.config.ts'), 'export default defineNuxtConfig({})\n')
}

function writeBridgePackage(
  appRoot: string,
  options: {
    packageName?: string
    exportPackageJson?: boolean
    manifestSource?: string
  } = {},
): string {
  const packageName = options.packageName ?? '@fixture/bridge-component'
  const packageRoot = resolve(appRoot, 'node_modules', ...packageName.split('/'))
  write(
    resolve(packageRoot, 'package.json'),
    JSON.stringify(
      {
        name: packageName,
        version: '1.2.3',
        type: 'module',
        exports: {
          ...(options.exportPackageJson === true ? { './package.json': './package.json' } : {}),
          './convex/manifest': {
            import: './convex/manifest.js',
          },
        },
      },
      null,
      2,
    ),
  )
  write(
    resolve(packageRoot, 'convex/manifest.js'),
    options.manifestSource ??
      `
export default {
  packageName: '${packageName}',
  version: '1.2.3',
  renderFiles: [
    { relativePath: 'convex/fixture/generated.ts', content: 'export const generated = true\\n' },
  ],
  managedEdits: [
    {
      relativePath: 'convex/convex.config.ts',
      apply(current) {
        if (current?.includes('// fixture managed')) return current
        return [current ?? 'const app = {}\\n', '// fixture managed', ''].join('\\n')
      },
    },
  ],
}
`.trimStart(),
  )
  return packageRoot
}

describe('Trellis bridge CLI and runtime contract', () => {
  beforeAll(() => {
    const buildResult = spawnSync('pnpm', ['run', 'build'], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NUXT_TELEMETRY_DISABLED: '1',
      },
    })
    expect(buildResult.status, `${buildResult.stdout}\n${buildResult.stderr}`).toBe(0)
  }, 90_000)

  it('loads an import-conditioned manifest from the target consumer cwd', async () => {
    const appRoot = createTempDir('trellis-bridge-load-')
    writeConsumerPackage(appRoot)
    writeBridgePackage(appRoot)

    const manifest = await loadManifestFromPackage('@fixture/bridge-component', appRoot)

    expect(manifest.packageName).toBe('@fixture/bridge-component')
    expect(manifest.version).toBe('1.2.3')
  })

  it('loads packages that do not export ./package.json', async () => {
    const appRoot = createTempDir('trellis-bridge-no-package-json-export-')
    writeConsumerPackage(appRoot)
    writeBridgePackage(appRoot, { exportPackageJson: false })

    await expect(
      loadManifestFromPackage('@fixture/bridge-component', appRoot),
    ).resolves.toMatchObject({
      packageName: '@fixture/bridge-component',
    })
  })

  it('rejects invalid and mismatched manifests', async () => {
    const invalidRoot = createTempDir('trellis-bridge-invalid-')
    writeConsumerPackage(invalidRoot)
    writeBridgePackage(invalidRoot, {
      manifestSource: 'export default { packageName: "@fixture/bridge-component" }\n',
    })

    await expect(loadManifestFromPackage('@fixture/bridge-component', invalidRoot)).rejects.toThrow(
      'Expected a default export',
    )

    const mismatchRoot = createTempDir('trellis-bridge-mismatch-')
    writeConsumerPackage(mismatchRoot)
    writeBridgePackage(mismatchRoot, {
      manifestSource: `
export default {
  packageName: '@fixture/other',
  version: '1.2.3',
  renderFiles: [],
}
`.trimStart(),
    })

    await expect(
      loadManifestFromPackage('@fixture/bridge-component', mismatchRoot),
    ).rejects.toThrow('declares a different packageName')
  })

  it(
    'installs, checks, lists, detects drift, and repairs bridge output',
    { timeout: 20_000 },
    async () => {
      const appRoot = createTempDir('trellis-bridge-cli-')
      writeConsumerPackage(appRoot)
      writeBridgePackage(appRoot)

      const install = runCli(['bridge', 'install', '@fixture/bridge-component', '--cwd', appRoot])
      expect(install.status, `${install.stdout}\n${install.stderr}`).toBe(0)
      expect(read(resolve(appRoot, 'convex/fixture/generated.ts'))).toContain(
        '@trellis-bridge-package: @fixture/bridge-component',
      )
      expect(read(resolve(appRoot, 'convex/convex.config.ts'))).toContain('// fixture managed')

      const cleanCheck = runCli(['bridge', 'check', '@fixture/bridge-component', '--cwd', appRoot])
      expect(cleanCheck.status, `${cleanCheck.stdout}\n${cleanCheck.stderr}`).toBe(0)

      const inspect = runCli(['bridge', 'inspect', '@fixture/bridge-component', '--cwd', appRoot])
      expect(inspect.status, `${inspect.stdout}\n${inspect.stderr}`).toBe(0)
      expect(`${inspect.stdout}\n${inspect.stderr}`).toContain('Generated files (1)')
      expect(`${inspect.stdout}\n${inspect.stderr}`).toContain('Managed edits (1)')

      const ls = runCli(['bridge', 'ls', '--cwd', appRoot])
      expect(ls.status, `${ls.stdout}\n${ls.stderr}`).toBe(0)
      await expect(discoverInstalledBridgeComponents(appRoot)).resolves.toMatchObject([
        { packageName: '@fixture/bridge-component' },
      ])

      write(resolve(appRoot, 'convex/fixture/generated.ts'), 'drift\n')
      write(resolve(appRoot, 'convex/convex.config.ts'), 'const app = {}\n')
      const driftCheck = runCli(['bridge', 'check', '@fixture/bridge-component', '--cwd', appRoot])
      expect(driftCheck.status, `${driftCheck.stdout}\n${driftCheck.stderr}`).toBe(1)
      expect(`${driftCheck.stdout}\n${driftCheck.stderr}`).toContain('convex/fixture/generated.ts')
      expect(`${driftCheck.stdout}\n${driftCheck.stderr}`).toContain('convex/convex.config.ts')

      const generate = runCli(['bridge', 'generate', '@fixture/bridge-component', '--cwd', appRoot])
      expect(generate.status, `${generate.stdout}\n${generate.stderr}`).toBe(0)
      const repairedCheck = runCli([
        'bridge',
        'check',
        '@fixture/bridge-component',
        '--cwd',
        appRoot,
      ])
      expect(repairedCheck.status, `${repairedCheck.stdout}\n${repairedCheck.stderr}`).toBe(0)
    },
  )

  it('does not write partial output when managed edit rendering fails', () => {
    const appRoot = createTempDir('trellis-bridge-partial-')
    writeConsumerPackage(appRoot)
    writeBridgePackage(appRoot, {
      manifestSource: `
export default {
  packageName: '@fixture/bridge-component',
  version: '1.2.3',
  renderFiles: [
    { relativePath: 'convex/fixture/generated.ts', content: 'export const generated = true\\n' },
  ],
  managedEdits: [
    {
      relativePath: 'convex/convex.config.ts',
      apply() {
        throw new Error('managed edit failed')
      },
    },
  ],
}
`.trimStart(),
    })

    const install = runCli(['bridge', 'install', '@fixture/bridge-component', '--cwd', appRoot])

    expect(install.status).not.toBe(0)
    expect(existsSync(resolve(appRoot, 'convex/fixture/generated.ts'))).toBe(false)
  })

  it('surfaces bridge state in doctor', () => {
    const appRoot = createTempDir('trellis-bridge-doctor-')
    writeConsumerPackage(appRoot)
    writeBridgePackage(appRoot)
    expect(
      runCli(['bridge', 'install', '@fixture/bridge-component', '--cwd', appRoot]).status,
    ).toBe(0)

    const cleanDoctor = runCli(['doctor', '--json', '--cwd', appRoot])
    const cleanReport = JSON.parse(cleanDoctor.stdout) as {
      findings: Array<{ id: string; status: string; message: string }>
    }
    expect(
      cleanReport.findings.find((finding) => finding.id === 'bridge--fixture-bridge-component')
        ?.status,
    ).toBe('pass')

    write(resolve(appRoot, 'convex/fixture/generated.ts'), 'drift\n')
    const driftDoctor = runCli(['doctor', '--json', '--cwd', appRoot])
    const driftReport = JSON.parse(driftDoctor.stdout) as {
      findings: Array<{ id: string; status: string; message: string }>
    }
    const bridgeFinding = driftReport.findings.find(
      (finding) => finding.id === 'bridge--fixture-bridge-component',
    )
    expect(bridgeFinding?.status).toBe('fail')
    expect(bridgeFinding?.message).toContain('convex/fixture/generated.ts')
  })
})
