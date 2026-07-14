import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'

import ts from 'typescript'

const repoRoot = resolve(import.meta.dirname, '../..')
const p = (...segments) => resolve(repoRoot, ...segments)

function parseSource(filePath) {
  const text = readFileSync(filePath, 'utf8')
  return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

// ---------------------------------------------------------------------------
// AST import-edge extraction (purity guard) — mirrors check-boundaries.mjs
// ---------------------------------------------------------------------------

function collectImportSpecifiers(sourceFile) {
  const specifiers = []
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text)
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text)
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      specifiers.push(node.argument.literal.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return specifiers
}

function walkDir(dir, extensions) {
  if (!existsSync(dir)) return []
  const stat = statSync(dir)
  if (stat.isFile()) return extensions.has(extname(dir)) ? [dir] : []
  const files = []
  for (const entry of readdirSync(dir)) {
    files.push(...walkDir(join(dir, entry), extensions))
  }
  return files
}

export function checkEntryPurity(entry, failures, artifactRoot = repoRoot) {
  if (!entry.purity) return
  const distDir = resolve(artifactRoot, entry.distDir ?? dirname(entry.distJs))
  const sourceDir = p(
    entry.sourceDir ??
      (entry.subpath === '.' ? 'src/module.ts' : `src/runtime/${entry.subpath.replace('./', '')}`),
  )

  const filesToScan = [
    ...walkDir(distDir, new Set(['.js', '.mjs', '.cjs', '.d.ts', '.d.mts'])),
    ...walkDir(sourceDir, new Set(['.ts', '.mts'])),
  ]

  for (const file of filesToScan) {
    let specifiers
    try {
      specifiers = collectImportSpecifiers(parseSource(file))
    } catch (error) {
      failures.push(
        `[${entry.subpath}] failed to parse ${relative(repoRoot, file)}: ${error.message}`,
      )
      continue
    }
    for (const specifier of specifiers) {
      if (specifier.startsWith('.')) continue // relative — stays inside the entry by construction
      if (entry.purity.allowedBareSpecifiers.has(specifier)) continue
      const forbidden = entry.purity.forbiddenSpecifierPatterns.some((re) => re.test(specifier))
      if (forbidden) {
        failures.push(
          `[${entry.subpath}] ${relative(repoRoot, file)} imports forbidden specifier "${specifier}" (purity guard)`,
        )
      }
    }
  }
}
