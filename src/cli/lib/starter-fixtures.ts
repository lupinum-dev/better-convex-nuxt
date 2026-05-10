import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  renderStarterFixtureFiles,
  type StarterFixtureManifest,
} from '../../module-internals/starter-fixture-codegen.js'
import type { CanonicalAppTemplate, TemplateFile } from './init.js'

type FixtureBackedTemplate = Extract<
  CanonicalAppTemplate,
  'public' | 'personal' | 'workspace' | 'workspace-mcp'
>

type AppStarterFixtureManifest = StarterFixtureManifest & {
  generatedPaths?: readonly string[]
}

type AddFixture = 'uploads'

const sourceAppNames: Record<FixtureBackedTemplate, string> = {
  public: 'trellis-starter-public',
  personal: 'trellis-starter-personal',
  workspace: 'trellis-starter-workspace',
  'workspace-mcp': 'trellis-starter-workspace-mcp',
}

const fixtureRootCandidates = [
  resolve(dirname(fileURLToPath(import.meta.url)), '../starter-fixtures'),
  resolve(dirname(fileURLToPath(import.meta.url)), '../../starter-fixtures'),
]

const addFixtureRootCandidates = [
  resolve(dirname(fileURLToPath(import.meta.url)), '../add-fixtures'),
  resolve(dirname(fileURLToPath(import.meta.url)), '../../add-fixtures'),
]

function resolveFixtureRoot(): string {
  const root = fixtureRootCandidates.find((candidate) => existsSync(candidate))
  if (!root) {
    throw new Error(
      `Missing CLI starter fixture directory. Checked: ${fixtureRootCandidates.join(', ')}`,
    )
  }
  return root
}

function resolveAddFixtureRoot(): string {
  const root = addFixtureRootCandidates.find((candidate) => existsSync(candidate))
  if (!root) {
    throw new Error(
      `Missing CLI add fixture directory. Checked: ${addFixtureRootCandidates.join(', ')}`,
    )
  }
  return root
}

function appPackageName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'trellis-app'
  )
}

function readManifest(template: FixtureBackedTemplate): AppStarterFixtureManifest {
  const manifestPath = resolve(resolveFixtureRoot(), template, 'starter.manifest.json')
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as AppStarterFixtureManifest
}

function readAddManifest(fixture: AddFixture): StarterFixtureManifest {
  const manifestPath = resolve(resolveAddFixtureRoot(), fixture, 'add.manifest.json')
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as StarterFixtureManifest
}

function transformFixtureContent(input: {
  appName: string
  path: string
  sourceAppName: string
  content: string
}): string {
  if (input.path === 'package.json') {
    const packageJson = JSON.parse(input.content) as Record<string, unknown>
    return `${JSON.stringify({ ...packageJson, name: appPackageName(input.appName) }, null, 2)}\n`
  }

  return input.content.replaceAll(input.sourceAppName, input.appName)
}

export function renderAppStarterFixture(input: {
  appName: string
  template: FixtureBackedTemplate
}): TemplateFile[] {
  const fixtureRoot = resolve(resolveFixtureRoot(), input.template)
  const manifest = readManifest(input.template)
  const generatedPaths = new Set([...(manifest.generatedPaths ?? [])])
  const sourceAppName = sourceAppNames[input.template]

  return renderStarterFixtureFiles(fixtureRoot, manifest).map((file) => ({
    path: file.path,
    content: transformFixtureContent({
      appName: input.appName,
      path: file.path,
      sourceAppName,
      content: file.content,
    }),
    ownership: generatedPaths.has(file.path) ? 'generated' : 'authored',
  }))
}

export function renderAppStarterFixtureSubset(input: {
  appName: string
  template: FixtureBackedTemplate
  paths: readonly string[]
}): TemplateFile[] {
  const filesByPath = new Map(
    renderAppStarterFixture({
      appName: input.appName,
      template: input.template,
    }).map((file) => [file.path, file]),
  )

  return input.paths.map((path) => {
    const file = filesByPath.get(path)
    if (!file) {
      throw new Error(`Missing ${input.template} starter fixture file: ${path}`)
    }
    return file
  })
}

export function renderAddFixture(input: { fixture: AddFixture }): TemplateFile[] {
  const fixtureRoot = resolve(resolveAddFixtureRoot(), input.fixture)
  const manifest = readAddManifest(input.fixture)

  return renderStarterFixtureFiles(fixtureRoot, manifest).map((file) => ({
    path: file.path,
    content: file.content,
    ownership: 'authored',
  }))
}
