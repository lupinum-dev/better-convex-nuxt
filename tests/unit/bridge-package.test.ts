import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import {
  checkBridgeDrift,
  discoverInstalledBridgeComponents,
  loadManifestFromPackage,
} from '@lupinum/trellis-bridge'
import {
  renderComponentBridgeFile,
  renderComponentBridgeFiles,
  renderComponentBridgeManagedEdits,
} from '@lupinum/trellis-bridge/manifest'
import { describe, expect, it } from 'vitest'

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

function writeConsumerPackage(appRoot: string, packageName = '@fixture/bridge-component'): void {
  write(
    resolve(appRoot, 'package.json'),
    JSON.stringify(
      {
        private: true,
        type: 'module',
        dependencies: {
          '@lupinum/trellis': 'workspace:*',
          '@lupinum/trellis-bridge': 'workspace:*',
          [packageName]: '1.0.0',
          convex: '^1.38.0',
          nuxt: '^4.4.5',
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

async function applyBridge(packageName: string, appRoot: string): Promise<void> {
  const manifest = await loadManifestFromPackage(packageName, appRoot)
  const files = await renderComponentBridgeFiles(manifest)
  const edits = await renderComponentBridgeManagedEdits(manifest)

  const fileWrites = files.map((file) => ({
    relativePath: file.relativePath,
    content: renderComponentBridgeFile(manifest, file),
  }))
  const managedWrites = edits.map((edit) => {
    const target = resolve(appRoot, edit.relativePath)
    const existing = existsSync(target) ? read(target) : null
    const next = edit.apply(existing)
    return { target, next }
  })

  for (const { relativePath, content } of fileWrites) {
    write(resolve(appRoot, relativePath), content)
  }
  for (const { target, next } of managedWrites) {
    write(target, next)
  }
}

describe('Trellis bridge package runtime contract', () => {
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

  it('renders, detects drift, and repairs bridge output', async () => {
    const appRoot = createTempDir('trellis-bridge-package-')
    writeConsumerPackage(appRoot)
    writeBridgePackage(appRoot)

    await applyBridge('@fixture/bridge-component', appRoot)
    expect(read(resolve(appRoot, 'convex/fixture/generated.ts'))).toContain(
      '@trellis-bridge-package: @fixture/bridge-component',
    )
    expect(read(resolve(appRoot, 'convex/convex.config.ts'))).toContain('// fixture managed')

    await expect(
      checkBridgeDrift(
        await loadManifestFromPackage('@fixture/bridge-component', appRoot),
        appRoot,
      ),
    ).resolves.toEqual([])
    await expect(discoverInstalledBridgeComponents(appRoot)).resolves.toMatchObject([
      { packageName: '@fixture/bridge-component' },
    ])

    write(resolve(appRoot, 'convex/fixture/generated.ts'), 'drift\n')
    write(resolve(appRoot, 'convex/convex.config.ts'), 'const app = {}\n')
    await expect(
      checkBridgeDrift(
        await loadManifestFromPackage('@fixture/bridge-component', appRoot),
        appRoot,
      ),
    ).resolves.toMatchObject([
      { relativePath: 'convex/fixture/generated.ts', reason: 'out-of-date' },
      { relativePath: 'convex/convex.config.ts', reason: 'out-of-date' },
    ])

    await applyBridge('@fixture/bridge-component', appRoot)
    await expect(
      checkBridgeDrift(
        await loadManifestFromPackage('@fixture/bridge-component', appRoot),
        appRoot,
      ),
    ).resolves.toEqual([])
  })

  it('does not write partial output when managed edit rendering fails', async () => {
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

    await expect(applyBridge('@fixture/bridge-component', appRoot)).rejects.toThrow(
      'managed edit failed',
    )
    expect(existsSync(resolve(appRoot, 'convex/fixture/generated.ts'))).toBe(false)
  })
})
