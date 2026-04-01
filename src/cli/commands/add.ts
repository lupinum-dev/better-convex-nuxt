import { mkdir, writeFile, access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { cancel, isCancel, note, outro, select } from '@clack/prompts'
import { defineCommand } from 'citty'

import {
  authBlockIds,
  authRecipeRegistry,
  authStarterIds,
  authStarterOptions,
  getAuthRecipe,
  resolveStarterRecipeId,
} from '../recipes/auth.js'

const docsBaseUrl = 'https://better-convex-nuxt.vercel.app'

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function renderRecipeGroup(recipeIds: string[]): string {
  return recipeIds
    .map((recipeId) => {
      const recipe = authRecipeRegistry[recipeId]
      return `${recipe.id} - ${recipe.description} Example: ${recipe.example}`
    })
    .join('\n')
}

function renderRecipeList(): string {
  return [
    'Starters',
    renderRecipeGroup(authStarterIds),
    '',
    'Additive blocks',
    renderRecipeGroup(authBlockIds),
  ].join('\n')
}

async function selectAuthStarter(): Promise<string | null> {
  const result = await select({
    message: 'Choose an auth starter',
    options: authStarterOptions.map((option) => ({
      value: option.recipeId,
      label: option.label,
      hint: `${option.description} Example: ${option.example}`,
    })),
  })

  if (isCancel(result)) {
    cancel('Auth starter selection cancelled.')
    return null
  }

  return result
}

async function resolveRequestedRecipeId(
  recipe: string | undefined,
  starter: string | undefined,
): Promise<string> {
  if (recipe === undefined || recipe === '') {
    throw new Error('Missing recipe. Pass --list to inspect available starters and blocks.')
  }

  if (recipe === 'auth') {
    if (starter) {
      const starterRecipeId = resolveStarterRecipeId(starter)
      if (!starterRecipeId) {
        throw new Error(
          `Unknown starter "${starter}". Expected one of: personal, workspace, workspace-mcp`,
        )
      }
      return starterRecipeId
    }

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error(
        '`add auth` needs an interactive terminal or --starter <personal|workspace|workspace-mcp>.',
      )
    }

    const selected = await selectAuthStarter()
    if (!selected) {
      process.exitCode = 1
      return ''
    }
    return selected
  }

  if (starter) {
    throw new Error('`--starter` only applies to `better-convex-nuxt add auth`.')
  }

  if (!authRecipeRegistry[recipe]) {
    throw new Error(
      `Unknown recipe "${recipe}". Pass --list to inspect available starters and blocks.`,
    )
  }

  return recipe
}

export const addCommand = defineCommand({
  meta: {
    name: 'add',
    description: 'Add better-convex-nuxt starter or block recipe files to your app',
  },
  args: {
    recipe: {
      type: 'positional',
      required: false,
      description:
        'Recipe name. Use `auth` for starter selection or `--list` to inspect available recipes.',
    },
    starter: {
      type: 'string',
      description: 'Starter for `add auth`. One of: personal, workspace, workspace-mcp',
    },
    list: {
      type: 'boolean',
      description: 'List available starters and additive blocks',
      default: false,
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
    if (args.list) {
      note(renderRecipeList(), 'available recipes')
      outro(
        'Use `better-convex-nuxt add auth --starter <name>` for starters or `better-convex-nuxt add <recipe>` for additive blocks.',
      )
      return
    }

    const resolvedRecipeId = await resolveRequestedRecipeId(
      args.recipe ? String(args.recipe) : undefined,
      args.starter ? String(args.starter) : undefined,
    )
    if (!resolvedRecipeId) {
      return 1
    }

    const recipe = getAuthRecipe(resolvedRecipeId)
    if (!recipe) {
      throw new Error(
        `Unknown recipe "${resolvedRecipeId}". Pass --list to inspect available starters and blocks.`,
      )
    }

    const cwd = resolve(args.cwd || process.cwd())
    const written: string[] = []
    const skipped: string[] = []

    for (const template of recipe.templates) {
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

    note(recipe.label, recipe.kind)
    if (written.length > 0) {
      note(written.join('\n'), 'written')
    }
    if (skipped.length > 0) {
      note(skipped.join('\n'), 'skipped')
    }
    note(
      [`Docs: ${docsBaseUrl}${recipe.docsPath}`, `Example: examples/${recipe.example}`].join('\n'),
      'next steps',
    )
    outro(`Finished adding ${recipe.id} in ${cwd}`)
  },
})
