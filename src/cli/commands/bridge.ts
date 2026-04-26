import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { defineCommand } from 'citty'
import consola from 'consola'

import {
  type BridgeDriftViolation,
  checkBridgeDrift,
  discoverInstalledBridgeComponents,
  loadManifestFromPackage,
} from '../../runtime/bridge/index.js'
import {
  renderComponentBridgeFile,
  renderComponentBridgeFiles,
  renderComponentBridgeManagedEdits,
} from '../../runtime/functions/component-bridge-manifest.js'

interface BridgeRunOptions {
  packageName: string
  cwd: string
  quiet?: boolean
}

function readIfExists(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function runGenerate({
  packageName,
  cwd,
  quiet = false,
}: BridgeRunOptions): Promise<{ written: string[]; managed: string[] }> {
  const manifest = await loadManifestFromPackage(packageName, cwd)
  const files = await renderComponentBridgeFiles(manifest)
  const edits = await renderComponentBridgeManagedEdits(manifest)

  // Render every payload first so a manifest error or apply() throw cannot leave the
  // consumer with a half-written bridge.
  const fileWrites = files.map((file) => ({
    relativePath: file.relativePath,
    content: renderComponentBridgeFile(manifest, file),
  }))
  const managedWrites = edits.map((edit) => {
    const target = resolve(cwd, edit.relativePath)
    const existing = readIfExists(target)
    const next = edit.apply(existing)
    return { relativePath: edit.relativePath, target, existing, next }
  })

  for (const { relativePath, content } of fileWrites) {
    const target = resolve(cwd, relativePath)
    try {
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, content, 'utf8')
    } catch (error) {
      throw new Error(
        `Failed to write bridge file ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }
  for (const { relativePath, target, existing, next } of managedWrites) {
    if (next === existing) continue
    try {
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, next, 'utf8')
    } catch (error) {
      throw new Error(
        `Failed to write managed edit ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }

  const written = fileWrites.map((entry) => entry.relativePath)
  const managed = managedWrites.map((entry) => entry.relativePath)

  if (!quiet) {
    consola.success(
      `Generated ${written.length} bridge file(s) and updated ${managed.length} managed edit(s) for ${packageName}.`,
    )
    for (const path of written) consola.info(`  wrote ${path}`)
    for (const path of managed) consola.info(`  managed ${path}`)
  }

  return { written, managed }
}

function violationLine(violation: BridgeDriftViolation): string {
  const verb = violation.reason === 'missing' ? 'is missing' : 'is out of date'
  return `${violation.relativePath} ${verb}`
}

export const bridgeCommand = defineCommand({
  meta: {
    name: 'bridge',
    description: 'Manage Trellis-aware Convex component bridges in a consumer app',
  },
  subCommands: {
    install: defineCommand({
      meta: {
        name: 'install',
        description: 'Render and write bridge files for a Trellis-aware Convex component',
      },
      args: {
        package: {
          type: 'positional',
          required: true,
          description: 'Component package name (e.g. @lupinum/ginko-cms)',
        },
        cwd: {
          type: 'string',
          description: 'Target consumer app directory',
          valueHint: 'path',
        },
      },
      async run({ args }) {
        const cwd = resolve(args.cwd || process.cwd())
        const packageName = String(args.package)
        await runGenerate({ packageName, cwd })
        consola.box(
          `Bridge for ${packageName} installed in ${cwd}.\n` +
            `Verify with \`pnpm exec trellis bridge check ${packageName}\`.`,
        )
        return 0
      },
    }),
    generate: defineCommand({
      meta: {
        name: 'generate',
        description: 'Re-render bridge files (quieter than install)',
      },
      args: {
        package: {
          type: 'positional',
          required: true,
          description: 'Component package name',
        },
        cwd: {
          type: 'string',
          description: 'Target consumer app directory',
          valueHint: 'path',
        },
      },
      async run({ args }) {
        const cwd = resolve(args.cwd || process.cwd())
        const packageName = String(args.package)
        await runGenerate({ packageName, cwd, quiet: true })
        consola.success(`${packageName} bridge regenerated in ${cwd}.`)
        return 0
      },
    }),
    check: defineCommand({
      meta: {
        name: 'check',
        description: 'Exit non-zero if bridge files are missing or stale',
      },
      args: {
        package: {
          type: 'positional',
          required: true,
          description: 'Component package name',
        },
        cwd: {
          type: 'string',
          description: 'Target consumer app directory',
          valueHint: 'path',
        },
      },
      async run({ args }) {
        const cwd = resolve(args.cwd || process.cwd())
        const packageName = String(args.package)
        const manifest = await loadManifestFromPackage(packageName, cwd)
        const violations = await checkBridgeDrift(manifest, cwd)
        if (violations.length === 0) {
          consola.success(`${packageName} bridge is up to date in ${cwd}.`)
          return 0
        }
        consola.error(`${packageName} bridge has ${violations.length} issue(s) in ${cwd}:`)
        for (const violation of violations) consola.error(`  ${violationLine(violation)}`)
        consola.info(`Fix: pnpm exec trellis bridge generate ${packageName}`)
        process.exitCode = 1
        return 1
      },
    }),
    inspect: defineCommand({
      meta: {
        name: 'inspect',
        description: 'Print bridge files, managed edits, and drift state without writing',
      },
      args: {
        package: {
          type: 'positional',
          required: true,
          description: 'Component package name',
        },
        cwd: {
          type: 'string',
          description: 'Target consumer app directory',
          valueHint: 'path',
        },
      },
      async run({ args }) {
        const cwd = resolve(args.cwd || process.cwd())
        const packageName = String(args.package)
        const manifest = await loadManifestFromPackage(packageName, cwd)
        const files = await renderComponentBridgeFiles(manifest)
        const edits = await renderComponentBridgeManagedEdits(manifest)
        const violations = await checkBridgeDrift(manifest, cwd)
        const driftByPath = new Map(
          violations.map((violation) => [violation.relativePath, violation.reason]),
        )

        process.stdout.write(`${packageName}@${manifest.version} bridge plan for ${cwd}\n`)
        process.stdout.write(`Generated files (${files.length}):\n`)
        for (const file of files) {
          const reason = driftByPath.get(file.relativePath)
          process.stdout.write(`  ${file.relativePath}${reason ? ` — ${reason}` : ' — ok'}\n`)
        }
        process.stdout.write(`Managed edits (${edits.length}):\n`)
        for (const edit of edits) {
          const reason = driftByPath.get(edit.relativePath)
          process.stdout.write(`  ${edit.relativePath}${reason ? ` — ${reason}` : ' — ok'}\n`)
        }
        if (violations.length > 0) {
          process.exitCode = 1
          return 1
        }
        return 0
      },
    }),
    ls: defineCommand({
      meta: {
        name: 'ls',
        description: 'List installed Trellis-aware Convex components and their bridge state',
      },
      args: {
        cwd: {
          type: 'string',
          description: 'Target consumer app directory',
          valueHint: 'path',
        },
      },
      async run({ args }) {
        const cwd = resolve(args.cwd || process.cwd())
        const installed = await discoverInstalledBridgeComponents(cwd)
        if (installed.length === 0) {
          consola.info(`No Trellis-aware Convex components found in ${cwd}.`)
          return 0
        }
        let drifted = 0
        for (const entry of installed) {
          const manifest = await loadManifestFromPackage(entry.packageName, cwd)
          const violations = await checkBridgeDrift(manifest, cwd)
          if (violations.length === 0) {
            consola.success(`${entry.packageName}@${manifest.version} — bridge ok`)
          } else {
            drifted += 1
            consola.warn(
              `${entry.packageName}@${manifest.version} — ${violations.length} bridge issue(s)`,
            )
            for (const violation of violations) consola.warn(`  ${violationLine(violation)}`)
          }
        }
        if (drifted > 0) {
          consola.info(
            `Run \`pnpm exec trellis bridge generate <package>\` to refresh stale bridges.`,
          )
          process.exitCode = 1
          return 1
        }
        return 0
      },
    }),
  },
})
