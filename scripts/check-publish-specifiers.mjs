import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import ts from 'typescript'

const ROOT = new URL('..', import.meta.url)
const rootPath = ROOT.pathname
const targetDirectories = [
  'src/analysis',
  'src/devtools',
  'src/eslint',
  'src/installers',
  'src/module-internals',
  'src/runtime',
  'src/cli',
]
const targetFiles = ['src/devtools.ts', 'src/module.ts', 'src/cli.mts']
const supportedSourceFiles = new Set(['.ts', '.mts', '.vue'])
const allowedExplicitExtensions = ['.js', '.mjs', '.cjs', '.json', '.vue']
const ignoredFiles = new Set(['src/cli/lib/init.ts'])
const ignoredDirectories = ['src/cli/starter-fixtures/', 'src/cli/add-fixtures/']

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

function collectFiles() {
  const files = []
  for (const file of targetFiles) {
    files.push(join(rootPath, file))
  }
  for (const directory of targetDirectories) {
    files.push(...walk(join(rootPath, directory)))
  }
  return files.filter((filePath) => {
    const normalized = relative(rootPath, filePath).replaceAll('\\', '/')
    if (ignoredFiles.has(normalized)) return false
    if (ignoredDirectories.some((directory) => normalized.startsWith(directory))) return false
    return [...supportedSourceFiles].some((extension) => normalized.endsWith(extension))
  })
}

function getScriptBlocks(filePath, source) {
  if (!filePath.endsWith('.vue')) {
    return [{ offset: 0, content: source }]
  }

  const blocks = []
  const pattern = /<script\b[^>]*>([\s\S]*?)<\/script>/g
  let match
  while ((match = pattern.exec(source)) !== null) {
    const content = match[1]
    const offset = match.index + match[0].indexOf(content)
    blocks.push({ offset, content })
  }
  return blocks
}

function hasAllowedExtension(specifier) {
  return allowedExplicitExtensions.some((extension) => specifier.endsWith(extension))
}

function shouldCheck(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../')
}

const errors = []

for (const filePath of collectFiles()) {
  const source = readFileSync(filePath, 'utf8')
  const blocks = getScriptBlocks(filePath, source)

  for (const block of blocks) {
    const sourceFile = ts.createSourceFile(
      filePath,
      block.content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )

    function record(specifier, nodeStart) {
      if (!shouldCheck(specifier) || hasAllowedExtension(specifier)) return
      const { line } = sourceFile.getLineAndCharacterOfPosition(nodeStart)
      const relativePath = relative(rootPath, filePath).replaceAll('\\', '/')
      errors.push(
        `${relativePath}:${line + 1} uses extensionless publish-surface import "${specifier}"`,
      )
    }

    function visit(node) {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        record(node.moduleSpecifier.text, node.moduleSpecifier.getStart(sourceFile))
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const [firstArgument] = node.arguments
        if (firstArgument && ts.isStringLiteral(firstArgument)) {
          record(firstArgument.text, firstArgument.getStart(sourceFile))
        }
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}
