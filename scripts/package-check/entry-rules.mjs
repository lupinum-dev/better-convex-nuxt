import { packageEntries } from '../package-entry-manifest.mjs'
import {
  probeAuthClientTyping,
  probeCreateUserSyncTriggersEntry,
  probeErrorsEntry,
  probeRootEntry,
  probeServerEntry,
} from './probes.mjs'

// ---------------------------------------------------------------------------
// Table-driven entries (internal §16.2)
// ---------------------------------------------------------------------------

/**
 * @typedef {object} PurityRule
 * @property {RegExp[]} forbiddenSpecifierPatterns - bare specifiers matching any of these are forbidden
 * @property {Set<string>} allowedBareSpecifiers - explicit exceptions (e.g. `convex`, `convex/values`)
 *
 * @typedef {object} CheckerEntryRule
 * @property {string} subpath - the package.json `exports` key
 * @property {'phase0'|'phase2'|'phase3'|'phase4'} phase - activation-schedule gate
 * @property {PurityRule} [purity] - if present, every file under `distDir` is scanned for forbidden imports
 * @property {string} [distDir] - dist-relative directory (or single file) purity scanning walks (defaults to dirname(distJs))
 * @property {string} [sourceDir] - repo-relative source directory (or single file) purity scanning walks (defaults to `src/runtime/<subpath>`)
 * @property {(ctx: ProbeContext) => void} [packedProbe] - packed consumer probe, run against the extracted tarball
 */

/** @type {CheckerEntryRule[]} */
const CHECKER_ENTRY_RULES = [
  {
    subpath: '.',
    phase: 'phase0',
    packedProbe: probeRootEntry,
  },
  {
    subpath: './errors',
    phase: 'phase2',
    purity: {
      // vNext §7 purity guard.
      forbiddenSpecifierPatterns: [
        /^vue$/,
        /^@vue\//,
        /^vue-router$/,
        /^nuxt$/,
        /^@nuxt\//,
        /^#imports$/,
        /^#app\b/,
        /^#build\b/,
        /^#components\b/,
        /^nitropack\b/,
        /^node:/,
      ],
      // `convex/values` is explicitly allowed: the framework-free normalizer
      // needs `instanceof ConvexError`.
      allowedBareSpecifiers: new Set(['convex', 'convex/values']),
    },
    packedProbe: probeErrorsEntry,
  },
  {
    subpath: './auth-client',
    phase: 'phase3',
    purity: {
      forbiddenSpecifierPatterns: [
        /^vue$/,
        /^@vue\//,
        /^vue-router$/,
        /^nuxt$/,
        /^@nuxt\//,
        /^#imports$/,
        /^#app\b/,
        /^nitropack\b/,
      ],
      allowedBareSpecifiers: new Set(),
    },
    packedProbe: probeAuthClientTyping,
  },
  {
    subpath: './server',
    phase: 'phase4',
    purity: {
      // Boundary rule for `/server` (internal §16.2): no composables, Vue, or
      // client-side plugin code. `h3`, `convex`/`convex/browser`/`convex/server`,
      // and the Nitro virtual `#imports` alias are legitimate server-side
      // dependencies and are intentionally NOT forbidden here.
      forbiddenSpecifierPatterns: [
        /^vue$/,
        /^@vue\//,
        /^vue-router$/,
        /^nuxt$/,
        /^@nuxt\//,
        /^#app\b/,
        /^#components\b/,
      ],
      allowedBareSpecifiers: new Set(),
    },
    // `dist/runtime/server` is NOT bundled into `index.js` (mkdist copies the
    // directory file-for-file, unlike the bundled `/errors`/`/auth-client`
    // entries) — scope the scan to `utils/`, the subtree actually reachable
    // from `index.ts`, so this entry's rules never see `createUserSyncTriggers`
    // or the Nitro route handlers under `api/auth/*` (neither published under
    // this subpath's `exports` mapping).
    distDir: 'dist/runtime/server/utils',
    sourceDir: 'src/runtime/server/utils',
    packedProbe: probeServerEntry,
  },
  {
    subpath: './server/createUserSyncTriggers',
    phase: 'phase4',
    purity: {
      // Framework-free: this entry has no Convex/H3/Nitro imports of its own
      // (it only takes user-supplied ctx/db shapes as generics), so any Vue,
      // Nuxt, or Nitro import here would be an accidental coupling.
      forbiddenSpecifierPatterns: [
        /^vue$/,
        /^@vue\//,
        /^vue-router$/,
        /^nuxt$/,
        /^@nuxt\//,
        /^#app\b/,
        /^#components\b/,
        /^#imports$/,
        /^nitropack\b/,
        /^h3$/,
      ],
      allowedBareSpecifiers: new Set(),
    },
    // Single-file entry with zero imports of its own — scope the scan to
    // exactly this file so it is never affected by unrelated siblings sharing
    // the same `dist/runtime/server` directory.
    distDir: 'dist/runtime/server/createUserSyncTriggers.js',
    sourceDir: 'src/runtime/server/createUserSyncTriggers.ts',
    packedProbe: probeCreateUserSyncTriggersEntry,
  },
]

// Join checker-only probes and purity constraints onto the canonical package
// contract. Export paths and public names are always read from the manifest.
export const entries = packageEntries.map((contract) => {
  const rules = CHECKER_ENTRY_RULES.find((entry) => entry.subpath === contract.subpath)
  if (!rules) throw new Error(`Missing checker rules for package entry ${contract.subpath}`)
  return {
    ...rules,
    distJs: contract.distJs,
    distDts: contract.distDts,
    expectedValueExports: contract.valueExports,
    additionalExpectedDeclaredNames: contract.typeExports,
    forbiddenNames: contract.forbiddenNames,
  }
})

for (const rules of CHECKER_ENTRY_RULES) {
  if (!packageEntries.some((entry) => entry.subpath === rules.subpath)) {
    throw new Error(`Checker rules reference unknown package entry ${rules.subpath}`)
  }
}
