#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDir = process.cwd()
const modulePath = resolve(rootDir, 'src/module.ts')
const componentsDir = resolve(rootDir, 'src/runtime/components')
const outputPath = resolve(rootDir, 'docs/content/docs/6.advanced/8.api-surface.md')

const moduleSource = readFileSync(modulePath, 'utf8')

function extractNames(pattern) {
  const names = new Set()
  for (const match of moduleSource.matchAll(pattern)) {
    if (!match[1]) continue
    names.add(match[1])
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}

const composableImports = extractNames(
  /name:\s*'([^']+)'\s*,\s*from:\s*resolver\.resolve\('\.\/runtime\/composables\/[^']+'\)/g,
)
const serverImports = extractNames(
  /name:\s*'([^']+)'\s*,\s*from:\s*resolver\.resolve\('\.\/runtime\/server\/utils\/[^']+'\)/g,
)
const componentNames = readdirSync(componentsDir)
  .filter(name => name.endsWith('.vue'))
  .map(name => name.replace(/\.vue$/, ''))
  .sort((a, b) => a.localeCompare(b))

const file = `---
title: API Surface
description: Auto-generated list of Nuxt auto-imports and global auth components from module entrypoints.
navigation:
  icon: i-lucide-list
---

This page is generated from [src/module.ts](/Users/matthias/Git/libs/better-convex-nuxt/src/module.ts) and [src/runtime/components](/Users/matthias/Git/libs/better-convex-nuxt/src/runtime/components).

Run:

\`\`\`bash
node scripts/generate-api-surface.mjs
\`\`\`

## Composable Auto-Imports

| Name |
| ---- |
${composableImports.map(name => `| \`${name}\` |`).join('\n')}

## Server Auto-Imports

| Name |
| ---- |
${serverImports.map(name => `| \`${name}\` |`).join('\n')}

## Global Auth Components

| Name |
| ---- |
${componentNames.map(name => `| \`<${name}>\` |`).join('\n')}
`

writeFileSync(outputPath, file)
console.log(`Generated ${outputPath}`)
