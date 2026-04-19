#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, relative, resolve, sep } from 'node:path'

const rootDir = process.cwd()
const docsContentDir = resolve(rootDir, 'apps/docs/content')

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

function stripFormatting(value) {
  return value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~]/g, '')
    .replace(/<[^>]+>/g, '')
    .trim()
}

function toAnchorSlug(value) {
  return stripFormatting(value)
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function buildDocAnchorMap() {
  const files = walk(docsContentDir).filter((file) => extname(file) === '.md')
  const anchors = new Map()

  for (const file of files) {
    const route = toDocRoute(file)
    if (!route) continue

    const source = readFileSync(file, 'utf8')
    const routeAnchors = new Set()
    for (const match of source.matchAll(/^#{1,6}\s+(.+)$/gm)) {
      const slug = toAnchorSlug(match[1] ?? '')
      if (slug) routeAnchors.add(slug)
    }
    anchors.set(route, routeAnchors)
  }

  return anchors
}

function extractLinks(source) {
  return Array.from(source.matchAll(/\[[^\]]+\]\([^)]+\)/g)).map((match) => {
    const raw = match[0]
    const start = raw.indexOf('](')
    return start === -1 ? '' : raw.slice(start + 2, -1)
  })
}

function extractToTargets(source) {
  const matches = []

  for (const match of source.matchAll(/(?:^|\n)\s*to:\s*['"]([^'"\n]+)['"]/gm)) {
    matches.push(match[1] ?? '')
  }

  for (const match of source.matchAll(
    /(?:^|\n)\s*to:\s*((?:\/|https?:\/\/|mailto:|tel:)[^\s"'`]+)/gm,
  )) {
    matches.push((match[1] ?? '').trim())
  }

  return matches
}

function looksLikeLocalFilesystemPath(link) {
  return (
    link.startsWith('file://') ||
    link.startsWith('/Users/') ||
    link.startsWith('/home/') ||
    link.startsWith('/var/') ||
    link.startsWith('/tmp/') ||
    /^[A-Za-z]:[\\/]/.test(link)
  )
}

function splitLinkTarget(link) {
  const hashIndex = link.indexOf('#')
  if (hashIndex === -1) return { pathname: link, hash: '' }
  return {
    pathname: link.slice(0, hashIndex),
    hash: link.slice(hashIndex + 1),
  }
}

function normalizeAnchor(value) {
  return toAnchorSlug(decodeURIComponent(value))
}

const routeSet = buildDocRouteSet()
const anchorMap = buildDocAnchorMap()
const sourceTargets = [
  resolve(rootDir, 'README.md'),
  resolve(rootDir, 'DEVELOPMENT.md'),
  resolve(rootDir, 'SKILL.md'),
  resolve(rootDir, 'tests/TESTING.md'),
  ...walk(resolve(rootDir, 'apps/docs/content')).filter((file) => extname(file) === '.md'),
  ...walk(resolve(rootDir, 'apps/docs/app')).filter((file) =>
    ['.vue', '.ts'].includes(extname(file)),
  ),
  resolve(rootDir, 'apps/docs/mdc-components.md'),
  ...walk(resolve(rootDir, 'examples')).filter((file) => extname(file) === '.md'),
  ...walk(resolve(rootDir, 'apps/harness')).filter((file) => extname(file) === '.md'),
]

const forbiddenPublicDocsPatterns = [
  {
    pattern: /\buseDemoPermissions\s*\(/,
    message: 'demo-only wrapper useDemoPermissions() leaked into public docs',
  },
  {
    pattern: /Authorization:\s*Bearer\s+demo:/,
    message: 'demo-only bearer token flow leaked into public docs',
  },
]

const issues = []

for (const filePath of sourceTargets) {
  const source = readFileSync(filePath, 'utf8')
  const extension = extname(filePath)
  const targets = [
    ...(extension === '.md' ? extractLinks(source) : []),
    ...extractToTargets(source),
  ]

  for (const rawLink of targets) {
    const link = rawLink.trim()
    if (!link || link.startsWith('#')) continue
    if (link.includes('${')) continue
    if (/^(?:https?:|mailto:|tel:)/.test(link)) continue
    if (looksLikeLocalFilesystemPath(link)) {
      issues.push(`${relative(rootDir, filePath)} -> local filesystem path ${link}`)
      continue
    }

    const { pathname, hash } = splitLinkTarget(link)
    if (!pathname) continue

    if (pathname.startsWith('/docs')) {
      const normalized = normalizeDocRoute(pathname)
      if (!routeSet.has(normalized)) {
        issues.push(`${relative(rootDir, filePath)} -> missing docs route ${pathname}`)
      } else if (hash) {
        const anchor = normalizeAnchor(hash)
        const routeAnchors = anchorMap.get(normalized) ?? new Set()
        if (!routeAnchors.has(anchor)) {
          issues.push(`${relative(rootDir, filePath)} -> missing docs anchor ${pathname}#${hash}`)
        }
      }
      continue
    }

    if (pathname === '/' || pathname.startsWith('/')) {
      continue
    }

    const resolved = resolve(filePath, '..', pathname)
    if (!existsSync(resolved)) {
      issues.push(`${relative(rootDir, filePath)} -> missing relative path ${pathname}`)
    }
  }

  const isPublicDocsSource =
    filePath.startsWith(resolve(rootDir, 'apps/docs/content')) ||
    filePath === resolve(rootDir, 'README.md')

  if (isPublicDocsSource) {
    for (const rule of forbiddenPublicDocsPatterns) {
      if (rule.pattern.test(source)) {
        issues.push(`${relative(rootDir, filePath)} -> ${rule.message}`)
      }
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
