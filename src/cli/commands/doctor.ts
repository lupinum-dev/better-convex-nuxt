import { resolve } from 'node:path'

import { spinner } from '@clack/prompts'
import { defineCommand } from 'citty'
import consola from 'consola'

import type { DoctorFinding, DoctorReport } from '../lib/findings.js'
import { summarizeFindings } from '../lib/findings.js'
import { renderDoctorReport } from '../lib/output.js'
import {
  findConvexUrlSource,
  hasBetterConvexNuxtRegistration,
  hasDependency,
  inspectProject,
} from '../lib/project.js'

export interface DoctorCommandOptions {
  cwd?: string
  json?: boolean
  verbose?: boolean
  color?: boolean
}

function createDoctorFindings(cwd: string): DoctorFinding[] {
  const project = inspectProject(cwd)
  const isNuxtApp = Boolean(project.packageJsonPath && project.nuxtConfigPath)
  const convexUrlSource = findConvexUrlSource(project)

  return [
    {
      id: 'nuxt-app-root',
      title: 'Nuxt app structure',
      status: isNuxtApp ? 'pass' : 'fail',
      message: isNuxtApp
        ? `Found package.json and ${project.nuxtConfigPath?.split('/').pop()}.`
        : 'Expected package.json and a nuxt.config.* file in the target directory.',
      fixHint: isNuxtApp
        ? 'Run the CLI inside a Nuxt app root when checking consumer setup.'
        : 'Run the command in a Nuxt project root or pass --cwd <path>.',
    },
    {
      id: 'nuxt-installed',
      title: 'Nuxt dependency',
      status: hasDependency(project, 'nuxt') ? 'pass' : 'fail',
      message: hasDependency(project, 'nuxt')
        ? 'nuxt is declared in package.json.'
        : 'nuxt is not declared in dependencies or devDependencies.',
      fixHint: hasDependency(project, 'nuxt') ? 'Keep Nuxt installed in the consumer app.' : 'Add nuxt to the app package.json.',
    },
    {
      id: 'module-installed',
      title: 'better-convex-nuxt dependency',
      status: hasDependency(project, 'better-convex-nuxt') ? 'pass' : 'fail',
      message: hasDependency(project, 'better-convex-nuxt')
        ? 'better-convex-nuxt is declared in package.json.'
        : 'better-convex-nuxt is not declared in dependencies or devDependencies.',
      fixHint: hasDependency(project, 'better-convex-nuxt')
        ? 'Keep the module installed in the consumer app.'
        : 'Add better-convex-nuxt to the app package.json.',
    },
    {
      id: 'module-registered',
      title: 'Nuxt module registration',
      status: hasBetterConvexNuxtRegistration(project) ? 'pass' : 'fail',
      message: hasBetterConvexNuxtRegistration(project)
        ? 'nuxt.config registers better-convex-nuxt in modules.'
        : 'Could not find "better-convex-nuxt" inside the nuxt.config modules array.',
      fixHint: hasBetterConvexNuxtRegistration(project)
        ? 'Keep the module in the Nuxt modules array.'
        : 'Add "better-convex-nuxt" to modules in nuxt.config.*.',
    },
    {
      id: 'convex-installed',
      title: 'Convex dependency',
      status: hasDependency(project, 'convex') ? 'pass' : 'fail',
      message: hasDependency(project, 'convex')
        ? 'convex is declared in package.json.'
        : 'convex is not declared in dependencies or devDependencies.',
      fixHint: hasDependency(project, 'convex') ? 'Keep Convex installed in the consumer app.' : 'Add convex to the app package.json.',
    },
    {
      id: 'convex-url-configured',
      title: 'Convex URL source',
      status: convexUrlSource ? 'pass' : 'warn',
      message: convexUrlSource
        ? `Found Convex URL configuration in ${convexUrlSource}.`
        : 'No CONVEX_URL or NUXT_PUBLIC_CONVEX_URL source was found.',
      fixHint: convexUrlSource
        ? 'Keep the Convex URL available in the environment or env files.'
        : 'Add CONVEX_URL or NUXT_PUBLIC_CONVEX_URL to .env.local, .env, or the process environment.',
    },
  ]
}

export function buildDoctorReport(cwd: string): DoctorReport {
  const findings = createDoctorFindings(cwd)
  return {
    cwd,
    findings,
    summary: summarizeFindings(findings),
  }
}

export const doctorCommand = defineCommand({
  meta: {
    name: 'doctor',
    description: 'Inspect a Nuxt app for better-convex-nuxt setup issues',
  },
  args: {
    cwd: {
      type: 'string',
      description: 'Path to the Nuxt app to inspect',
      valueHint: 'path',
    },
    json: {
      type: 'boolean',
      description: 'Print the report as JSON',
      default: false,
    },
    verbose: {
      type: 'boolean',
      alias: 'v',
      description: 'Print debug details while inspecting the app',
      default: false,
    },
    color: {
      type: 'boolean',
      description: 'Enable colored output',
      default: true,
    },
  },
  async run({ args }) {
    const cwd = resolve(args.cwd || process.cwd())
    const useJson = Boolean(args.json)
    const color = Boolean(args.color)
    const logger = args.verbose ? consola.withTag('doctor') : null
    const loadingSpinner = !useJson ? spinner() : null

    if (!color) {
      process.env.NO_COLOR = '1'
    }

    logger?.debug(`Inspecting ${cwd}`)
    loadingSpinner?.start(`Inspecting ${cwd}`)

    const report = buildDoctorReport(cwd)

    loadingSpinner?.stop('Inspection complete')
    logger?.debug(`Found ${report.summary.fail} failures and ${report.summary.warn} warnings`)

    renderDoctorReport(report, {
      json: useJson,
      color,
    })

    const exitCode = report.summary.fail > 0 ? 1 : 0
    process.exitCode = exitCode
    return exitCode
  },
})
