import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import consola from 'consola'

import {
  type ComponentBridgeManifest,
  renderComponentBridgeFile,
  renderComponentBridgeFiles,
  renderComponentBridgeManagedEdits,
} from './component-bridge-manifest.js'
export type { ComponentBridgeManifest } from './component-bridge-manifest.js'

function isComponentBridgeManifest(value: unknown): value is ComponentBridgeManifest {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  if (typeof candidate.packageName !== 'string') return false
  if (typeof candidate.version !== 'string') return false
  return (
    Array.isArray(candidate.renderFiles) ||
    typeof candidate.renderFiles === 'function' ||
    Array.isArray(candidate.modules) ||
    typeof candidate.modules === 'function'
  )
}

function requireFromCwd(cwd: string): NodeRequire {
  return createRequire(pathToFileURL(resolve(cwd, 'package.json')).href)
}

// Resolve an ESM-conditioned subpath export from the package's `exports` map
// directly. We use this in addition to `require.resolve` because `require.resolve`
// (CJS) checks the `require` condition, but bridge manifests only declare `import`
// (ESM) — Node would throw "Package subpath ... is not defined" otherwise.
function resolveImportSubpath(
  packageJsonPath: string,
  packageJson: unknown,
  subpath: string,
): string | null {
  if (typeof packageJson !== 'object' || packageJson === null) return null
  const exportsField = (packageJson as { exports?: unknown }).exports
  if (typeof exportsField !== 'object' || exportsField === null) return null
  const entry = (exportsField as Record<string, unknown>)[subpath]
  const target = pickConditionalTarget(entry)
  if (typeof target !== 'string' || !target.startsWith('./')) return null
  return resolve(dirname(packageJsonPath), target.slice(2))
}

function pickConditionalTarget(entry: unknown): unknown {
  if (typeof entry === 'string') return entry
  if (typeof entry !== 'object' || entry === null) return null
  const record = entry as Record<string, unknown>
  // Order matches Node's default ESM resolution preferences for our use case.
  for (const condition of ['import', 'module', 'default', 'node']) {
    if (condition in record) {
      const next = pickConditionalTarget(record[condition])
      if (next !== null) return next
    }
  }
  return null
}

export async function loadManifestFromPackage(
  packageName: string,
  cwd: string,
): Promise<ComponentBridgeManifest> {
  const require = requireFromCwd(cwd)
  let packageJsonPath: string
  try {
    packageJsonPath = require.resolve(`${packageName}/package.json`)
  } catch {
    packageJsonPath = ''
  }
  if (!packageJsonPath) {
    const fallback = findPackageJsonInNodeModules(packageName, cwd)
    if (!fallback) {
      throw new Error(
        `Could not locate "${packageName}" from ${cwd}. ` + `Is the package installed?`,
      )
    }
    packageJsonPath = fallback
  }

  let packageJson: unknown
  try {
    packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  } catch (error) {
    throw new Error(
      `Failed to read ${packageName}'s package.json at ${packageJsonPath}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }

  const manifestPath = resolveImportSubpath(packageJsonPath, packageJson, './convex/manifest')
  if (!manifestPath) {
    throw new Error(
      `Could not resolve the bridge manifest for "${packageName}" from ${cwd}. ` +
        `Is the package installed and does it export "./convex/manifest"?`,
    )
  }

  const moduleUrl = pathToFileURL(manifestPath).href
  let moduleNamespace: Record<string, unknown>
  try {
    moduleNamespace = await import(moduleUrl)
  } catch (error) {
    throw new Error(
      `Failed to load the bridge manifest module for "${packageName}" at ${manifestPath}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }

  const candidate = moduleNamespace.default

  if (!isComponentBridgeManifest(candidate)) {
    throw new Error(
      `The bridge manifest for "${packageName}" at ${manifestPath} did not export a valid ComponentBridgeManifest. ` +
        `Expected a default export.`,
    )
  }

  if (candidate.packageName !== packageName) {
    throw new Error(
      `The bridge manifest for "${packageName}" declares a different packageName "${candidate.packageName}".`,
    )
  }

  return candidate
}

function readIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

export interface BridgeDriftViolation {
  packageName: string
  relativePath: string
  reason: 'missing' | 'out-of-date'
}

export async function checkBridgeDrift(
  manifest: ComponentBridgeManifest,
  rootDir: string,
): Promise<BridgeDriftViolation[]> {
  const violations: BridgeDriftViolation[] = []
  const files = await renderComponentBridgeFiles(manifest)

  for (const file of files) {
    const targetPath = resolve(rootDir, file.relativePath)
    const existing = readIfExists(targetPath)
    const expected = renderComponentBridgeFile(manifest, file)
    if (existing === null) {
      violations.push({
        packageName: manifest.packageName,
        relativePath: file.relativePath,
        reason: 'missing',
      })
    } else if (existing !== expected) {
      violations.push({
        packageName: manifest.packageName,
        relativePath: file.relativePath,
        reason: 'out-of-date',
      })
    }
  }

  const managedEdits = await renderComponentBridgeManagedEdits(manifest)
  for (const edit of managedEdits) {
    const targetPath = resolve(rootDir, edit.relativePath)
    const existing = readIfExists(targetPath)
    if (existing === null) {
      violations.push({
        packageName: manifest.packageName,
        relativePath: edit.relativePath,
        reason: 'missing',
      })
      continue
    }
    if (existing !== edit.apply(existing)) {
      violations.push({
        packageName: manifest.packageName,
        relativePath: edit.relativePath,
        reason: 'out-of-date',
      })
    }
  }

  return violations
}

export async function assertBridgeInstalled(packageName: string, rootDir: string): Promise<void> {
  const manifest = await loadManifestFromPackage(packageName, rootDir)
  const violations = await checkBridgeDrift(manifest, rootDir)
  if (violations.length === 0) return

  const lines = violations.map((violation) => {
    const verb = violation.reason === 'missing' ? 'is missing' : 'is out of date'
    return `${violation.relativePath} ${verb}.`
  })
  lines.push(
    `Run the package-owned bridge installer for ${packageName} and commit the result. ` +
      `Trellis bridge provides drift helpers, not a generic CLI.`,
  )
  throw new Error(lines.join('\n'))
}

export interface InstalledBridgeComponent {
  packageName: string
  manifestPath: string
  packageRoot: string
}

function declaresBridgeManifest(packageJson: unknown): boolean {
  if (typeof packageJson !== 'object' || packageJson === null) return false
  const exportsField = (packageJson as { exports?: unknown }).exports
  if (typeof exportsField !== 'object' || exportsField === null) return false
  const exportsRecord = exportsField as Record<string, unknown>
  return (
    Object.prototype.hasOwnProperty.call(exportsRecord, './convex/manifest') ||
    Object.prototype.hasOwnProperty.call(exportsRecord, './convex/manifest.js')
  )
}

function findPackageJsonInNodeModules(packageName: string, cwd: string): string | null {
  let current = resolve(cwd)
  while (true) {
    const candidate = resolve(current, 'node_modules', packageName, 'package.json')
    if (existsSync(candidate)) return candidate
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

function resolvePackageJsonPath(
  require: NodeRequire,
  packageName: string,
  cwd: string,
): string | null {
  // `require.resolve` honors `exports` strictly. Some components don't list
  // `./package.json` in their exports, in which case we walk node_modules manually.
  try {
    return require.resolve(`${packageName}/package.json`)
  } catch {
    // continue
  }
  return findPackageJsonInNodeModules(packageName, cwd)
}

export async function discoverInstalledBridgeComponents(
  cwd: string,
): Promise<InstalledBridgeComponent[]> {
  const packageJsonPath = resolve(cwd, 'package.json')
  if (!existsSync(packageJsonPath)) return []
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }

  const candidates = new Set<string>([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {}),
  ])

  const require = requireFromCwd(cwd)
  const installed: InstalledBridgeComponent[] = []
  for (const candidate of candidates) {
    const candidatePackageJsonPath = resolvePackageJsonPath(require, candidate, cwd)
    if (!candidatePackageJsonPath) continue

    let candidatePackageJson: unknown
    try {
      candidatePackageJson = JSON.parse(readFileSync(candidatePackageJsonPath, 'utf8'))
    } catch (error) {
      consola.warn(
        `Skipping ${candidate}: malformed package.json at ${candidatePackageJsonPath} ` +
          `(${error instanceof Error ? error.message : String(error)}).`,
      )
      continue
    }
    if (!declaresBridgeManifest(candidatePackageJson)) continue

    const candidateManifest = resolveImportSubpath(
      candidatePackageJsonPath,
      candidatePackageJson,
      './convex/manifest',
    )
    if (!candidateManifest) {
      consola.warn(
        `Skipping ${candidate}: declares "./convex/manifest" in exports but the target could not be resolved.`,
      )
      continue
    }
    if (!existsSync(candidateManifest)) {
      consola.warn(
        `Skipping ${candidate}: bridge manifest target does not exist at ${candidateManifest}.`,
      )
      continue
    }
    installed.push({
      packageName: candidate,
      manifestPath: candidateManifest,
      packageRoot: dirname(candidatePackageJsonPath),
    })
  }
  return installed
}
