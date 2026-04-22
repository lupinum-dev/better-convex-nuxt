import { basename, resolve } from 'node:path'

import { defineCommand } from 'citty'

import {
  createTemplateCommandResult,
  renderTemplateCommandResult,
  writeTemplateCommandResultJson,
} from '../lib/command-output.js'
import { applyInitTemplateSet, getAddTemplateSet } from '../lib/init.js'

export const addCommand = defineCommand({
  meta: {
    name: 'add',
    description: 'Add a canonical Trellis feature slice to the current app',
  },
  args: {
    feature: {
      type: 'positional',
      required: true,
      description: 'Feature to add. One of: mcp, uploads, operation, entity',
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
    json: {
      type: 'boolean',
      description: 'Write a machine-readable JSON summary to stdout',
      default: false,
    },
  },
  async run({ args }) {
    const feature = String(args.feature)
    if (
      feature !== 'mcp' &&
      feature !== 'uploads' &&
      feature !== 'operation' &&
      feature !== 'entity'
    ) {
      throw new Error('Invalid feature. Use one of: mcp, uploads, operation, entity.')
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
    const commandResult = createTemplateCommandResult({
      command: 'add',
      label: templateSet.label,
      cwd,
      description: templateSet.description,
      ...result,
    })

    if (args.json) {
      writeTemplateCommandResultJson(commandResult)
      return
    }

    renderTemplateCommandResult(commandResult)
  },
})
