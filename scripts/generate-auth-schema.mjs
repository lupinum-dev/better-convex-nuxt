import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getAuthTables } from 'better-auth/db'
import { format } from 'oxfmt'

import { schemaAuthOptions } from '../internal/convex-auth/schema-options.ts'
import { generateAuthSchemaArtifacts } from '../src/runtime/convex-auth/adapter/generate-schema.ts'
import { schemaAuthOptions as agenticSchemaAuthOptions } from '../starters/agentic-saas/convex/betterAuth/schemaOptions.ts'
import { schemaAuthOptions as teamSchemaAuthOptions } from '../starters/team/convex/betterAuth/schemaOptions.ts'
import localSchemaOptions from '../test/fixtures/better-auth-local-component/convex/betterAuth/schemaOptions.ts'
import twoFactorSchemaOptions from '../test/fixtures/better-auth-two-factor/convex/betterAuth/schemaOptions.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const componentDirectory = path.join(root, 'src/runtime/convex-auth/component')
const curatedArtifacts = generateAuthSchemaArtifacts(getAuthTables(schemaAuthOptions))
const agenticArtifacts = generateAuthSchemaArtifacts(getAuthTables(agenticSchemaAuthOptions))
const teamArtifacts = generateAuthSchemaArtifacts(getAuthTables(teamSchemaAuthOptions))
const localArtifacts = generateAuthSchemaArtifacts(getAuthTables(localSchemaOptions))
const twoFactorArtifacts = generateAuthSchemaArtifacts(getAuthTables(twoFactorSchemaOptions))
const formatOptions = {
  printWidth: 100,
  semi: false,
  singleQuote: true,
  sortImports: {},
  tabWidth: 2,
  trailingComma: 'all',
}
const outputSources = new Map([
  [path.join(componentDirectory, 'schema.ts'), curatedArtifacts.schemaCode],
  [path.join(componentDirectory, 'schemaMetadata.ts'), curatedArtifacts.metadataCode],
  [
    path.join(root, 'starters/agentic-saas/convex/betterAuth/schema.ts'),
    agenticArtifacts.schemaCode,
  ],
  [
    path.join(root, 'starters/agentic-saas/convex/betterAuth/schemaMetadata.ts'),
    agenticArtifacts.metadataCode,
  ],
  [path.join(root, 'starters/team/convex/betterAuth/schema.ts'), teamArtifacts.schemaCode],
  [
    path.join(root, 'starters/team/convex/betterAuth/schemaMetadata.ts'),
    teamArtifacts.metadataCode,
  ],
  [
    path.join(root, 'test/fixtures/better-auth-local-component/convex/betterAuth/schema.ts'),
    localArtifacts.schemaCode,
  ],
  [
    path.join(
      root,
      'test/fixtures/better-auth-local-component/convex/betterAuth/schemaMetadata.ts',
    ),
    localArtifacts.metadataCode,
  ],
  [
    path.join(root, 'test/fixtures/better-auth-two-factor/convex/betterAuth/schema.ts'),
    twoFactorArtifacts.schemaCode,
  ],
  [
    path.join(root, 'test/fixtures/better-auth-two-factor/convex/betterAuth/schemaMetadata.ts'),
    twoFactorArtifacts.metadataCode,
  ],
])
const outputs = new Map()
for (const [file, source] of outputSources) {
  const result = await format(file, source, formatOptions)
  if (result.errors.length > 0) throw new Error(`Unable to format ${file}`)
  outputs.set(file, result.code)
}
const check = process.argv.includes('--check')

let stale = false
for (const [file, contents] of outputs) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined
  if (current === contents) continue
  stale = true
  if (!check) fs.writeFileSync(file, contents, 'utf8')
  console.error(`${check ? 'stale' : 'generated'}: ${path.relative(root, file)}`)
}

if (check && stale) process.exitCode = 1
