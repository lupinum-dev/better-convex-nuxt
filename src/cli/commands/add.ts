import { basename, resolve } from 'node:path'

import { note, outro } from '@clack/prompts'
import { defineCommand } from 'citty'

import { applyInitTemplateSet, getAddTemplateSet } from '../lib/init.js'

function formatList(items: string[]): string {
  return items.length > 0 ? items.join('\n') : '(none)'
}

export const addCommand = defineCommand({
  meta: {
    name: 'add',
    description: 'Add a canonical Trellis feature slice to the current app',
  },
  args: {
    feature: {
      type: 'positional',
      required: true,
      description: 'Feature to add. One of: mcp, uploads, operation, resource',
    },
    kind: {
      type: 'string',
      description: 'Operation kind. One of: safe, destructive',
      default: 'safe',
    },
    cwd: {
      type: 'string',
      description: 'Target app directory',
      valueHint: 'path',
    },
    force: {
      type: 'boolean',
      description: 'Overwrite existing files',
      default: false,
    },
  },
  async run({ args }) {
    const feature = String(args.feature)
    if (
      feature !== 'mcp' &&
      feature !== 'uploads' &&
      feature !== 'operation' &&
      feature !== 'resource'
    ) {
      throw new Error('Invalid feature. Use one of: mcp, uploads, operation, resource.')
    }

    const kind = String(args.kind)
    if (kind !== 'safe' && kind !== 'destructive') {
      throw new Error('Invalid operation kind. Use one of: safe, destructive.')
    }

    const cwd = resolve(args.cwd || process.cwd())
    const templateSet = await getAddTemplateSet({
      feature,
      cwd,
      name: Array.isArray(args._) && args._.length > 1 ? String(args._[1]) : undefined,
      kind: kind as 'safe' | 'destructive',
      appName: basename(cwd),
    })
    const result = await applyInitTemplateSet(cwd, templateSet, Boolean(args.force))

    note(templateSet.description, templateSet.label)
    note(formatList(result.authored), 'authored files')
    note(formatList(result.generated), 'generated plumbing')
    if (result.written.length > 0) {
      note(formatList(result.written), 'written')
    }
    if (result.skipped.length > 0) {
      note(formatList(result.skipped), 'skipped')
    }
    outro(`Finished ${templateSet.label} add in ${cwd}`)
  },
})
