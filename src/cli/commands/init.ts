import { resolve } from 'node:path'

import { note, outro } from '@clack/prompts'
import { defineCommand } from 'citty'

import { applyInitTemplateSet, getCanonicalAppTemplateSet } from '../lib/init.js'

function formatList(items: string[]): string {
  return items.length > 0 ? items.join('\n') : '(none)'
}

function assertAppName(value: string | undefined): string {
  const appName = value?.trim()
  if (!appName) {
    throw new Error(
      'Missing app name. Use `trellis init <name> --template personal|workspace|cms`.',
    )
  }

  if (['app', 'auth', 'permissions', 'mcp'].includes(appName)) {
    throw new Error(
      `Legacy init flow removed. Use \`trellis init <name> --template ...\` or \`trellis add ...\` instead of \`trellis init ${appName}\`.`,
    )
  }

  return appName
}

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description: 'Create a canonical Trellis app root',
  },
  args: {
    name: {
      type: 'positional',
      required: true,
      description: 'App directory name',
    },
    template: {
      type: 'string',
      required: true,
      description: 'App template. One of: personal, workspace, cms',
    },
    mcp: {
      type: 'boolean',
      default: false,
      description: 'Add the MCP runtime to the workspace starter',
    },
    cwd: {
      type: 'string',
      description: 'Parent directory for the new app',
      valueHint: 'path',
    },
    force: {
      type: 'boolean',
      description: 'Overwrite existing files',
      default: false,
    },
  },
  async run({ args }) {
    const appName = assertAppName(args.name ? String(args.name) : undefined)
    const template = String(args.template)
    const mcp = Boolean(args.mcp)

    if (template !== 'personal' && template !== 'workspace' && template !== 'cms') {
      throw new Error('Invalid template. Use one of: personal, workspace, cms.')
    }

    if (mcp && template !== 'workspace') {
      throw new Error('`--mcp` is currently only supported with `--template workspace`.')
    }

    const parentDir = resolve(args.cwd || process.cwd())
    const cwd = resolve(parentDir, appName)
    const templateSet = getCanonicalAppTemplateSet({
      appName,
      template,
      mcp,
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
    outro(`Finished ${templateSet.label} init in ${cwd}`)
  },
})
