import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { buildContentManifest, packAndExtract } from './package-check/tarball.mjs'

const repositoryRoot = resolve(import.meta.dirname, '..')
const packageRoot = join(repositoryRoot, 'packages/vue')

function parseTarballArgument(args) {
  if (args.length === 0) return undefined
  if (args.length !== 2 || args[0] !== '--tarball' || !args[1]) {
    throw new Error('Usage: <vue-consumer-check> [--tarball <path>]')
  }
  return resolve(repositoryRoot, args[1])
}

export function prepareVueCandidate(args, scratchRoot) {
  let tarballPath = parseTarballArgument(args)
  if (!tarballPath) {
    execFileSync('pnpm', ['run', 'build'], {
      cwd: packageRoot,
      stdio: 'inherit',
    })
    const result = JSON.parse(
      execFileSync(
        'npm',
        ['pack', '--json', '--ignore-scripts', '--pack-destination', scratchRoot],
        { cwd: packageRoot, encoding: 'utf8' },
      ),
    )
    if (!Array.isArray(result) || result.length !== 1 || !result[0]?.filename) {
      throw new Error('Vue package pack must produce exactly one tarball')
    }
    tarballPath = join(scratchRoot, result[0].filename)
  }

  if (!existsSync(tarballPath)) throw new Error(`Vue candidate tarball is missing: ${tarballPath}`)
  const stats = lstatSync(tarballPath)
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error('Vue candidate tarball must be one regular file, not a symlink')
  }

  const extracted = packAndExtract('vue', tarballPath)
  const expected = buildContentManifest(extracted.packageDir)
  const manifest = JSON.parse(readFileSync(join(extracted.packageDir, 'package.json'), 'utf8'))
  if (manifest.name !== 'better-convex-vue') {
    rmSync(extracted.scratchDir, { force: true, recursive: true })
    throw new Error(`Vue candidate has unexpected package name: ${String(manifest.name)}`)
  }

  return {
    tarballPath,
    version: manifest.version,
    assertInstalled(installedDirectory) {
      const actual = buildContentManifest(installedDirectory)
      const contentIdentity = ({ version, files }) => ({
        version,
        files: files
          .filter(({ path }) => path !== 'node_modules' && !path.startsWith('node_modules/'))
          .map(({ path, size, sha256 }) => ({ path, size, sha256 })),
      })
      const actualIdentity = contentIdentity(actual)
      const expectedIdentity = contentIdentity(expected)
      if (JSON.stringify(actualIdentity) !== JSON.stringify(expectedIdentity)) {
        const actualFiles = new Map(actualIdentity.files.map((file) => [file.path, file]))
        const expectedFiles = new Map(expectedIdentity.files.map((file) => [file.path, file]))
        const changedPaths = [...new Set([...actualFiles.keys(), ...expectedFiles.keys()])].filter(
          (path) =>
            JSON.stringify(actualFiles.get(path)) !== JSON.stringify(expectedFiles.get(path)),
        )
        throw new Error(
          `Installed Vue package bytes differ from the candidate tarball: ${changedPaths.join(', ')}`,
        )
      }
    },
    cleanup() {
      rmSync(extracted.scratchDir, { force: true, recursive: true })
    },
  }
}
