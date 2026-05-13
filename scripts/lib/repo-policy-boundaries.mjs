import path from 'node:path'

export const publicCoreRuntimeRoots = [
  'src/runtime/auth',
  'src/runtime/args',
  'src/runtime/backend',
  'src/runtime/composables',
  'src/runtime/convex',
  'src/runtime/feature',
  'src/runtime/functions',
  'src/runtime/observability',
  'src/runtime/schema',
  'src/runtime/server',
  'src/runtime/testing',
  'src/runtime/identity-forwarding',
  'src/runtime/type-primitives',
  'src/runtime/types',
  'src/runtime/utils',
  'src/runtime/visibility',
]

const importLike =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s*)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g

function normalizePath(input) {
  return input.split(path.sep).join('/')
}

function stripExtension(input) {
  return input.replace(/\.(?:mjs|mts|cts|cjs|js|ts|tsx|vue)$/, '')
}

function isUnderRoot(filePath, root) {
  return filePath === root || filePath.startsWith(`${root}/`)
}

function isPublicCoreRuntimeFile(filePath) {
  return publicCoreRuntimeRoots.some((root) => isUnderRoot(filePath, root))
}

function resolveRelativeSpecifier(filePath, specifier) {
  if (!specifier.startsWith('.')) return specifier
  return normalizePath(path.normalize(path.join(path.dirname(filePath), specifier)))
}

function classifyForbiddenSpecifier(filePath, specifier) {
  const resolved = stripExtension(resolveRelativeSpecifier(filePath, specifier))

  if (
    specifier === '@lupinum/trellis-bridge' ||
    specifier.startsWith('@lupinum/trellis-bridge/') ||
    resolved.includes('packages/trellis-bridge')
  ) {
    return 'bridge package'
  }

  if (specifier === 'evlog' || specifier.startsWith('evlog/')) {
    return 'observability delivery package'
  }

  if (
    specifier === 'eslint' ||
    specifier.startsWith('eslint/') ||
    specifier.startsWith('@typescript-eslint/')
  ) {
    return 'eslint tooling'
  }

  if (specifier === '@nuxt/devtools' || specifier.startsWith('@nuxt/devtools')) {
    return 'Nuxt devtools UI/tooling'
  }

  if (isUnderRoot(resolved, 'src/devtools')) {
    return 'devtools UI/tooling'
  }

  if (isUnderRoot(resolved, 'src/runtime/mcp') && !isUnderRoot(filePath, 'src/runtime/mcp')) {
    return 'MCP runtime implementation'
  }

  return null
}

export function findImportSpecifiers(source) {
  const imports = []
  const lines = source.split('\n')

  lines.forEach((line, index) => {
    importLike.lastIndex = 0
    let match
    while ((match = importLike.exec(line)) !== null) {
      imports.push({
        line: index + 1,
        lineText: line.trim(),
        specifier: match[1] ?? match[2] ?? '',
      })
    }
  })

  return imports
}

export function findRuntimeBoundaryViolations(files) {
  const violations = []

  for (const file of files) {
    const filePath = normalizePath(file.path)
    const checkAllSourceForBridge = filePath.startsWith('src/') && !isUnderRoot(filePath, 'src/cli')
    const checkPublicCoreRuntime = isPublicCoreRuntimeFile(filePath)

    if (!checkAllSourceForBridge && !checkPublicCoreRuntime) continue

    for (const entry of findImportSpecifiers(file.source)) {
      const reason = classifyForbiddenSpecifier(filePath, entry.specifier)
      if (!reason) continue
      if (!checkPublicCoreRuntime && reason !== 'bridge package') continue

      violations.push({
        filePath,
        line: entry.line,
        lineText: entry.lineText,
        reason,
        specifier: entry.specifier,
      })
    }
  }

  return violations
}

export function formatRuntimeBoundaryViolation(violation) {
  return `${violation.filePath}:${violation.line}:${violation.reason}: ${violation.lineText}`
}
