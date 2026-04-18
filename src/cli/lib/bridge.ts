import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  renderComponentBridgeFile,
  renderComponentBridgeFiles,
  renderComponentBridgeManagedEdits,
  type ComponentBridgeManifest,
} from '../../runtime/functions/component-bridge-manifest.js'

function isBareSpecifier(specifier: string): boolean {
  return !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.includes(':\\')
}

async function importModule(specifier: string, cwd: string) {
  if (isBareSpecifier(specifier)) {
    const require = createRequire(resolve(cwd, 'package.json'))
    const resolved = require.resolve(specifier)
    return await import(pathToFileURL(resolved).href)
  }

  return await import(pathToFileURL(resolve(cwd, specifier)).href)
}

export async function loadBridgeManifest(
  packageSpecifier: string,
  cwd: string,
): Promise<ComponentBridgeManifest> {
  const directManifestSpecifier =
    packageSpecifier.endsWith('/convex/manifest') ||
    packageSpecifier.endsWith('/convex/manifest.js') ||
    packageSpecifier.endsWith('/convex/manifest.mjs') ||
    packageSpecifier.endsWith('/manifest.js') ||
    packageSpecifier.endsWith('/manifest.mjs')

  const candidates = [
    ...(directManifestSpecifier
      ? [packageSpecifier]
      : [
          `${packageSpecifier}/convex/manifest`,
          `${packageSpecifier}/convex/manifest.js`,
          `${packageSpecifier}/convex/manifest.mjs`,
        ]),
  ]

  let lastError: unknown = null
  for (const candidate of candidates) {
    try {
      const module = await importModule(candidate, cwd)
      const manifest =
        module.default?.packageName || module.default?.renderFiles
          ? module.default
          : (module.ginkoCmsBridgeManifest ?? module.bridgeManifest ?? module.manifest)
      if (!manifest) {
        throw new Error(`Module "${candidate}" does not export a bridge manifest.`)
      }
      return manifest as ComponentBridgeManifest
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(
    `Failed to load a bridge manifest from ${packageSpecifier}. Expected an export at ${packageSpecifier}/convex/manifest. ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  )
}

export async function writeBridgeFiles(options: {
  cwd: string
  manifest: ComponentBridgeManifest
  force: boolean
}) {
  const renderedFiles = await renderComponentBridgeFiles(options.manifest)
  const managedEdits = await renderComponentBridgeManagedEdits(options.manifest)
  const written: string[] = []
  const skipped: string[] = []

  for (const file of renderedFiles) {
    const target = resolve(options.cwd, file.relativePath)
    const content = renderComponentBridgeFile(options.manifest, file)

    let existing: string | null = null
    try {
      existing = await readFile(target, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }

    if (existing === content) {
      skipped.push(file.relativePath)
      continue
    }

    if (
      existing !== null &&
      !options.force &&
      !existing.startsWith(`// @trellis-bridge-package: ${options.manifest.packageName}\n`)
    ) {
      throw new Error(
        `Refusing to overwrite non-generated file ${file.relativePath}. Re-run with --force to replace it.`,
      )
    }

    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content, 'utf8')
    written.push(file.relativePath)
  }

  for (const edit of managedEdits) {
    const target = resolve(options.cwd, edit.relativePath)

    let existing: string | null = null
    try {
      existing = await readFile(target, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }

    const content = edit.apply(existing)
    if (existing === content) {
      skipped.push(edit.relativePath)
      continue
    }

    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content, 'utf8')
    written.push(edit.relativePath)
  }

  return { written, skipped }
}
