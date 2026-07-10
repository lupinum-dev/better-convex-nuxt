import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import ts from 'typescript'

const repoRoot = resolve(import.meta.dirname, '../..')

// ---------------------------------------------------------------------------
// AST export-shape extraction
// ---------------------------------------------------------------------------

function parseSource(filePath) {
  const text = readFileSync(filePath, 'utf8')
  return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

/** Every top-level exported name in a file (functions, classes, interfaces, type
 * aliases, const/let/var, `export { ... }` specifiers — using the local `as`
 * alias — and `default`). Does not recurse into `export *` (none of the
 * checked entries use it; treated as "cannot verify" and reported). */
function collectExportedNames(sourceFile, warnings) {
  const names = new Set()
  for (const node of sourceFile.statements) {
    const hasExportModifier = (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0

    if (ts.isFunctionDeclaration(node) && hasExportModifier && node.name) {
      names.add(node.name.text)
    } else if (ts.isClassDeclaration(node) && hasExportModifier && node.name) {
      names.add(node.name.text)
    } else if (ts.isInterfaceDeclaration(node) && hasExportModifier) {
      names.add(node.name.text)
    } else if (ts.isTypeAliasDeclaration(node) && hasExportModifier) {
      names.add(node.name.text)
    } else if (ts.isVariableStatement(node) && hasExportModifier) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) names.add(decl.name.text)
      }
    } else if (ts.isExportAssignment(node)) {
      names.add('default')
    } else if (ts.isExportDeclaration(node)) {
      if (!node.exportClause) {
        warnings.push(
          `${relative(repoRoot, sourceFile.fileName)} has an "export *" — cannot verify exact export set`,
        )
        continue
      }
      if (ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          names.add((element.name ?? element.propertyName).text)
        }
      }
    }
  }
  return names
}

export function checkEntryExportShape(entry, failures, warnings, artifactRoot = repoRoot) {
  const jsPath = resolve(artifactRoot, entry.distJs)
  const dtsPath = resolve(artifactRoot, entry.distDts)
  if (!existsSync(jsPath)) {
    failures.push(`[${entry.subpath}] expected dist file missing: ${entry.distJs}`)
    return
  }
  if (!existsSync(dtsPath)) {
    failures.push(`[${entry.subpath}] expected dist file missing: ${entry.distDts}`)
    return
  }

  const jsExports = collectExportedNames(parseSource(jsPath), warnings)
  const dtsExports = collectExportedNames(parseSource(dtsPath), warnings)

  const expectedValue = new Set(entry.expectedValueExports)
  for (const expected of expectedValue) {
    if (!jsExports.has(expected)) {
      failures.push(`[${entry.subpath}] ${entry.distJs} is missing expected export "${expected}"`)
    }
  }
  for (const actual of jsExports) {
    if (!expectedValue.has(actual)) {
      failures.push(
        `[${entry.subpath}] ${entry.distJs} exports unexpected name "${actual}" (not in the declared expected set — update the table if intentional)`,
      )
    }
  }

  const expectedDeclared = new Set([
    ...entry.expectedValueExports,
    ...(entry.additionalExpectedDeclaredNames ?? []),
  ])
  for (const expected of expectedDeclared) {
    if (!dtsExports.has(expected)) {
      failures.push(
        `[${entry.subpath}] ${entry.distDts} is missing expected declared name "${expected}"`,
      )
    }
  }

  for (const forbidden of entry.forbiddenNames ?? []) {
    if (jsExports.has(forbidden) || dtsExports.has(forbidden)) {
      failures.push(`[${entry.subpath}] forbidden export "${forbidden}" is present`)
    }
  }
}
