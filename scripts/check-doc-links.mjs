#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, relative, resolve, sep } from 'node:path'

const rootDir = process.cwd()
const docsContentDir = resolve(rootDir, 'docs/content')

function walk(target) {
  if (!existsSync(target)) return []
  const stats = statSync(target)
  if (stats.isFile()) return [target]

  const files = []
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.nuxt' || entry.name === '.output')
      continue
    files.push(...walk(resolve(target, entry.name)))
  }
  return files
}

function stripNumericPrefix(value) {
  return value.replace(/^\d+\./, '')
}

function toDocRoute(filePath) {
  const relativePath = relative(docsContentDir, filePath).split(sep)
  if (relativePath[0] === 'index.md') return '/docs'
  if (relativePath[0] !== 'docs') return null

  const sections = relativePath.slice(1).map((part) => part.replace(/\.md$/, ''))
  return `/docs/${sections.map(stripNumericPrefix).join('/')}`
}

function buildDocRouteSet() {
  const files = walk(docsContentDir).filter((file) => extname(file) === '.md')
  const routes = new Set(['/docs'])
  for (const file of files) {
    const route = toDocRoute(file)
    if (route) routes.add(route)
  }
  return routes
}

function normalizeDocRoute(pathname) {
  return pathname.replace(/\/$/, '') || '/docs'
}

function extractLinks(source) {
  return Array.from(source.matchAll(/\[[^\]]+\]\([^)]+\)/g)).map((match) => {
    const raw = match[0]
    const start = raw.indexOf('](')
    return start === -1 ? '' : raw.slice(start + 2, -1)
  })
}

const routeSet = buildDocRouteSet()
const markdownTargets = [
  resolve(rootDir, 'README.md'),
  resolve(rootDir, 'DEVELOPMENT.md'),
  resolve(rootDir, 'SKILL.md'),
  resolve(rootDir, 'test/TESTING.md'),
  ...walk(resolve(rootDir, 'docs')).filter((file) => extname(file) === '.md'),
  ...walk(resolve(rootDir, 'examples')).filter((file) => extname(file) === '.md'),
  ...walk(resolve(rootDir, 'demo')).filter((file) => extname(file) === '.md'),
  ...walk(resolve(rootDir, 'test/internal-harness')).filter((file) => extname(file) === '.md'),
]

const issues = []

for (const filePath of markdownTargets) {
  const source = readFileSync(filePath, 'utf8')
  for (const rawLink of extractLinks(source)) {
    const link = rawLink.trim()
    if (!link || link.startsWith('#')) continue
    if (/^(?:https?:|mailto:|tel:)/.test(link)) continue

    const withoutHash = link.split('#')[0]
    if (!withoutHash) continue

    if (withoutHash.startsWith('/docs')) {
      const normalized = normalizeDocRoute(withoutHash)
      if (!routeSet.has(normalized)) {
        issues.push(`${relative(rootDir, filePath)} -> missing docs route ${withoutHash}`)
      }
      continue
    }

    if (withoutHash.startsWith('/')) {
      continue
    }

    const resolved = resolve(filePath, '..', withoutHash)
    if (!existsSync(resolved)) {
      issues.push(`${relative(rootDir, filePath)} -> missing relative path ${withoutHash}`)
    }
  }
}

if (issues.length > 0) {
  console.error('[docs] Broken internal links found:')
  for (const issue of issues) {
    console.error(`- ${issue}`)
  }
  process.exit(1)
}

console.log('Docs links look good.')
