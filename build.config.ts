import { existsSync } from 'node:fs'
import { lstat, readdir, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'

/**
 * Post-build dist cleanup (F-37).
 *
 * @nuxt/module-builder's `runtime` mkdist entry (in its own hardcoded config)
 * copies the entire `src/runtime/` tree into `dist/runtime/`, including
 * `src/runtime/devtools/ui/` — a self-contained Nuxt app whose *source*
 * (app.vue, composables/, components/, assets/, public/, nuxt.config.js)
 * only exists to produce the static build the devtools bridge actually
 * serves (`ui/dist/`, built separately by the `build:devtools` script and
 * symlinked into `src/runtime/devtools/ui/dist`). None of that source is
 * needed — or usable — by a consumer; only the built static output ships.
 *
 * mkdist's `pattern` exclude list for that entry is not something this file
 * can safely edit: unbuild deep-merges build.config.ts with
 * @nuxt/module-builder's inline config via defu, and defu *concatenates*
 * array values (including `entries`) rather than patching individual entry
 * objects — so redeclaring `entries` here would add a second, competing
 * runtime entry instead of adjusting module-builder's. Hooks, by contrast,
 * are additive (registered independently via `ctx.hooks.addHooks`), so a
 * `build:done` hook is the supported extension point: it runs once, after
 * mkdist/rollup/dts have finished writing `dist/`, and can prune paths that
 * have no per-entry exclude control.
 *
 * Also deletes:
 * - the stray `dist/runtime/server/tsconfig.json`, copied verbatim from
 *   `src/runtime/server/tsconfig.json`, which `extends` a repo-relative
 *   `../../../.nuxt/tsconfig.server.json` that does not exist for a
 *   published consumer.
 * - `dist/runtime/devtools/.output/`, nitro's raw static-build output
 *   directory (created by the `build:devtools` script at
 *   `src/runtime/devtools/.output`, sibling to `ui/`, not inside it) — a
 *   second, unreferenced copy of the exact same static site already kept at
 *   `ui/dist/`. `src/module.ts` only ever resolves
 *   `./runtime/devtools/ui/dist` to serve the devtools UI; `.output` is
 *   dead weight.
 */

interface MinimalBuildDoneContext {
  options: { outDir: string }
}

async function removeSiblingsExcept(dir: string, keep: string): Promise<void> {
  if (!existsSync(dir)) return
  const entries = await readdir(dir, { withFileTypes: true })
  await Promise.all(
    entries
      .filter((entry) => entry.name !== keep)
      .map((entry) => rm(join(dir, entry.name), { recursive: true, force: true })),
  )
}

export default {
  hooks: {
    async 'build:done'(ctx: MinimalBuildDoneContext) {
      const outDir = ctx.options.outDir
      if (basename(outDir) !== 'dist') {
        return
      }
      const runtimeDir = join(outDir, 'runtime')
      if (existsSync(runtimeDir) && (await lstat(runtimeDir)).isSymbolicLink()) {
        return
      }

      // Keep only the built static output (`ui/dist`); drop the devtools UI source.
      await removeSiblingsExcept(join(runtimeDir, 'devtools/ui'), 'dist')

      // Drop the stray tsconfig that extends a repo-only path.
      const serverTsconfig = join(runtimeDir, 'server/tsconfig.json')
      if (existsSync(serverTsconfig)) {
        await rm(serverTsconfig, { force: true })
      }

      // Drop the duplicate raw nitro output — ui/dist above is the one that ships.
      const devtoolsRawOutput = join(runtimeDir, 'devtools/.output')
      if (existsSync(devtoolsRawOutput)) {
        await rm(devtoolsRawOutput, { recursive: true, force: true })
      }
    },
  },
}
