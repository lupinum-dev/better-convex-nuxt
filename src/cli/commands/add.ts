import { mkdir, writeFile, access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { note, outro } from '@clack/prompts'
import { defineCommand } from 'citty'

import { authRecipeRegistry } from '../recipes/auth.js'

const recipeNames = Object.keys(authRecipeRegistry).sort()

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export const addCommand = defineCommand({
  meta: {
    name: 'add',
    description: 'Add better-convex-nuxt recipe files to your app',
  },
  args: {
    recipe: {
      type: 'positional',
      required: true,
      description: `Recipe name. One of: ${recipeNames.join(', ')}`,
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
    const recipeName = String(args.recipe)
    const templates = authRecipeRegistry[recipeName]
    if (!templates) {
      throw new Error(`Unknown recipe "${recipeName}". Expected one of: ${recipeNames.join(', ')}`)
    }

    const cwd = resolve(args.cwd || process.cwd())
    const written: string[] = []
    const skipped: string[] = []

    for (const template of templates) {
      const destination = resolve(cwd, template.path)
      const exists = await pathExists(destination)
      if (exists && !args.force) {
        skipped.push(template.path)
        continue
      }

      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, template.content, 'utf8')
      written.push(template.path)
    }

    note(recipeName, 'recipe')
    if (written.length > 0) {
      note(written.join('\n'), 'written')
    }
    if (skipped.length > 0) {
      note(skipped.join('\n'), 'skipped')
    }
    outro(`Finished adding ${recipeName} in ${cwd}`)
  },
})
