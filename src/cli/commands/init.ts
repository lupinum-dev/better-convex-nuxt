import { isAbsolute, resolve } from 'node:path'

import { defineCommand } from 'citty'

import {
  createTemplateCommandResult,
  renderTemplateCommandResult,
  writeTemplateCommandResultJson,
} from '../lib/command-output.js'
import { applyInitTemplateSet, getCanonicalAppTemplateSet } from '../lib/init.js'

function assertAppName(value: string | undefined): string {
  const appName = value?.trim()
  if (!appName) {
    throw new Error(
      'Missing app name. Use `trellis init <name> --template public|personal|workspace|workspace-mcp`.',
    )
  }

  if (['app', 'auth', 'permissions', 'mcp'].includes(appName)) {
    throw new Error(
      `Legacy init flow removed. Use \`trellis init <name> --template ...\` or \`trellis add ...\` instead of \`trellis init ${appName}\`.`,
    )
  }

  if (
    appName === '.' ||
    appName === '..' ||
    appName.includes('/') ||
    appName.includes('\\') ||
    isAbsolute(appName)
  ) {
    throw new Error('Invalid app name. Use a single directory name, not a path.')
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
      description: 'App template. One of: public, personal, workspace, workspace-mcp',
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
    json: {
      type: 'boolean',
      description: 'Write a machine-readable JSON summary to stdout',
      default: false,
    },
  },
  async run({ args }) {
    const appName = assertAppName(args.name ? String(args.name) : undefined)
    const template = String(args.template)
    const mcp = Boolean(args.mcp)

    if (
      template !== 'public' &&
      template !== 'personal' &&
      template !== 'workspace' &&
      template !== 'workspace-mcp'
    ) {
      throw new Error('Invalid template. Use one of: public, personal, workspace, workspace-mcp.')
    }

    if (mcp && template !== 'workspace' && template !== 'workspace-mcp') {
      throw new Error(
        '`--mcp` is currently only supported with `--template workspace` or `--template workspace-mcp`.',
      )
    }

    const parentDir = resolve(args.cwd || process.cwd())
    const cwd = resolve(parentDir, appName)
    const templateSet = getCanonicalAppTemplateSet({
      appName,
      template,
      mcp,
    })
    const result = await applyInitTemplateSet(cwd, templateSet, Boolean(args.force))
    const commandResult = createTemplateCommandResult({
      command: 'init',
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
