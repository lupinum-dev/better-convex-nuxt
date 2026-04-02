import { resolve } from 'node:path'

import { note, outro } from '@clack/prompts'
import { defineCommand } from 'citty'

import { applyInitTemplateSet, getInitTemplateSet } from '../lib/init.js'

type InitSubject = 'auth' | 'permissions' | 'mcp'

function formatList(items: string[]): string {
  return items.length > 0 ? items.join('\n') : '(none)'
}

function normalizeSubject(subject: string | undefined): InitSubject {
  if (subject === 'auth' || subject === 'permissions' || subject === 'mcp') {
    return subject
  }

  throw new Error('Missing or invalid init target. Use one of: auth, permissions, mcp.')
}

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description: 'Scaffold V3 auth, permissions, or MCP files',
  },
  args: {
    target: {
      type: 'positional',
      required: true,
      description: 'Init target. One of: auth, permissions, mcp',
    },
    model: {
      type: 'string',
      description: 'Permissions model. One of: personal, workspace, workspace-mcp',
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
    const target = normalizeSubject(args.target ? String(args.target) : undefined)
    if (target !== 'permissions' && args.model) {
      throw new Error('`--model` only applies to `trellis init permissions`.')
    }

    const cwd = resolve(args.cwd || process.cwd())
    const templateSet = getInitTemplateSet(
      target,
      args.model ? (String(args.model) as 'personal' | 'workspace' | 'workspace-mcp') : undefined,
    )
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
    outro(`Finished ${templateSet.label} init in ${cwd}`)
  },
})
