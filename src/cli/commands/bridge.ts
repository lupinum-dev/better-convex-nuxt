import { resolve } from 'node:path'

import { note, outro } from '@clack/prompts'
import { defineCommand } from 'citty'

import { loadBridgeManifest, writeBridgeFiles } from '../lib/bridge.js'

function formatList(items: string[]) {
  return items.length > 0 ? items.join('\n') : '(none)'
}

export const bridgeCommand = defineCommand({
  meta: {
    name: 'bridge',
    description: 'Generate host bridge files for packaged Trellis components',
  },
  args: {
    action: {
      type: 'positional',
      required: true,
      description: 'Only supported action: generate',
    },
    package: {
      type: 'positional',
      required: true,
      description: 'Installed package name or local path exposing /convex/manifest',
    },
    cwd: {
      type: 'string',
      description: 'Target app directory',
      valueHint: 'path',
    },
    force: {
      type: 'boolean',
      default: false,
      description: 'Overwrite non-generated files',
    },
  },
  async run({ args }) {
    const action = args.action ? String(args.action) : undefined
    if (action !== 'generate') {
      throw new Error('Missing or invalid bridge action. Use: trellis bridge generate <package>.')
    }

    const cwd = resolve(args.cwd || process.cwd())
    const packageSpecifier = String(args.package)
    const manifest = await loadBridgeManifest(packageSpecifier, cwd)
    const result = await writeBridgeFiles({
      cwd,
      manifest,
      force: Boolean(args.force),
    })

    note(`Generated bridge files for ${manifest.packageName}`, 'bridge')
    note(formatList(result.written), 'written')
    note(formatList(result.skipped), 'skipped')
    outro(`Finished bridge generation in ${cwd}`)
  },
})
