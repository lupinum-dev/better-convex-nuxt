#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const distDir = resolve(process.cwd(), 'dist')
const supportedExtensions = new Set(['.d.ts', '.d.mts'])
const invalidSpecifierPattern = /\.(?:mjs|cjs|js)\.js\b/g

function walk(directory) {
  const entries = []
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      entries.push(...walk(fullPath))
      continue
    }
    entries.push(fullPath)
  }
  return entries
}

function shouldCheck(filePath) {
  return [...supportedExtensions].some((extension) => filePath.endsWith(extension))
}

const errors = []

for (const filePath of walk(distDir).filter(shouldCheck)) {
  const source = readFileSync(filePath, 'utf8')
  if (!invalidSpecifierPattern.test(source)) continue
  invalidSpecifierPattern.lastIndex = 0
  errors.push(relative(process.cwd(), filePath).replaceAll('\\', '/'))
}

if (errors.length > 0) {
  console.error('[trellis] invalid declaration specifiers remain in:')
  for (const filePath of errors) {
    console.error(` - ${filePath}`)
  }
  process.exit(1)
}
