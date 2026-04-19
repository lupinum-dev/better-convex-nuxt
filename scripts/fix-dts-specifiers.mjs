#!/usr/bin/env node

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const distDir = resolve(process.cwd(), 'dist')
const supportedExtensions = new Set(['.d.ts', '.d.mts'])

function normalizeDeclarationSpecifiers(source) {
  return source
    .replaceAll('.mjs.js', '.mjs')
    .replaceAll('.cjs.js', '.cjs')
    .replaceAll('.js.js', '.js')
}

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

function shouldRewrite(filePath) {
  return [...supportedExtensions].some((extension) => filePath.endsWith(extension))
}

let rewritten = 0

for (const filePath of walk(distDir).filter(shouldRewrite)) {
  const source = readFileSync(filePath, 'utf8')
  const fixed = normalizeDeclarationSpecifiers(source)

  if (fixed === source) continue

  writeFileSync(filePath, fixed, 'utf8')
  rewritten++
}

if (rewritten > 0) {
  console.log(`[trellis] normalized declaration specifiers in ${rewritten} file(s).`)
}
