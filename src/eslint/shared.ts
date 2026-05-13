/* eslint-disable @typescript-eslint/no-explicit-any -- ESLint parser AST nodes and fixers are intentionally handled loosely in this plugin layer. */
import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils'

import {
  analyzeProject,
  findProjectRoot,
  hasTenantCollectionMethod,
  isNullishBooleanLiteral,
  resolveAnalyzerTenantOverride,
} from '../analysis/project.js'

export const TENANT_RULE_NAME = '@lupinum/trellis'
const RULE_DOCS_URL = 'https://trellis.vercel.app'

export type RuleContext = TSESLint.RuleContext<string, readonly unknown[]>
export type RuleModule = TSESLint.RuleModule<string, readonly unknown[]>

type SourceCodeLike = {
  getText: (node?: unknown) => string
  parserServices?: Record<string, unknown>
}

type RuleMeta = Omit<TSESLint.RuleMetaData<string>, 'docs'> & {
  docs?: Partial<NonNullable<TSESLint.RuleMetaData<string>['docs']>>
}

export function getFilename(context: RuleContext): string {
  return context.filename
}

export function getSourceCode(context: RuleContext): SourceCodeLike | null {
  return context.sourceCode as SourceCodeLike | null
}

export function createRule(
  meta: RuleMeta,
  create: (context: RuleContext) => TSESLint.RuleListener,
): RuleModule {
  const { docs: metaDocs, ...restMeta } = meta
  const docs = {
    description: metaDocs?.description ?? 'Trellis ESLint rule.',
    url: metaDocs?.url ?? `${RULE_DOCS_URL}/docs`,
    ...metaDocs,
  }

  return {
    meta: {
      docs,
      ...restMeta,
    },
    create,
    defaultOptions: [],
  }
}

export function isIdentifier(node: unknown, name?: string): node is TSESTree.Identifier {
  return (
    !!node &&
    typeof node === 'object' &&
    (node as TSESTree.Node).type === AST_NODE_TYPES.Identifier &&
    (name ? (node as TSESTree.Identifier).name === name : true)
  )
}

export function getLiteralValue(node: any): string | number | boolean | null | undefined {
  if (!node || node.type !== AST_NODE_TYPES.Literal) return undefined
  return node.value
}

export function isBooleanLiteral(node: any, value: boolean): boolean {
  return node?.type === AST_NODE_TYPES.Literal && node.value === value
}

export function getPropertyName(node: any): string | null {
  if (!node) return null
  if (
    (node.type === AST_NODE_TYPES.Property || node.type === AST_NODE_TYPES.PropertyDefinition) &&
    isIdentifier(node.key)
  ) {
    return node.key.name
  }
  if (
    (node.type === AST_NODE_TYPES.Property || node.type === AST_NODE_TYPES.PropertyDefinition) &&
    node.key?.type === AST_NODE_TYPES.Literal &&
    typeof node.key.value === 'string'
  ) {
    return node.key.value
  }
  return null
}

export function getObjectProperty(objectNode: any, name: string): any | null {
  if (!objectNode || objectNode.type !== AST_NODE_TYPES.ObjectExpression) return null
  return (
    objectNode.properties.find(
      (property: any) =>
        property.type === AST_NODE_TYPES.Property && getPropertyName(property) === name,
    ) ?? null
  )
}

export function getCallName(node: any): string | null {
  if (!node) return null
  if (node.type === AST_NODE_TYPES.Identifier) return node.name
  if (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    isIdentifier(node.property)
  ) {
    return node.property.name
  }
  return null
}

export function isCallNamed(node: any, ...names: string[]): boolean {
  return (
    node?.type === AST_NODE_TYPES.CallExpression && names.includes(getCallName(node.callee) ?? '')
  )
}

export function isBuilderCall(node: any, builderName: string, ...methodNames: string[]): boolean {
  return (
    node?.type === AST_NODE_TYPES.CallExpression &&
    node.callee?.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    isIdentifier(node.callee.object, builderName) &&
    methodNames.includes(getCallName(node.callee.property) ?? '')
  )
}

export function isCtxDbQueryCall(node: any): boolean {
  if (!isCallNamed(node, 'query')) return false
  const callee = node.callee
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object?.type === AST_NODE_TYPES.MemberExpression &&
    isIdentifier(callee.object.object, 'ctx') &&
    isIdentifier(callee.object.property, 'db')
  )
}

export function isCtxDbGetCall(node: any): boolean {
  if (!isCallNamed(node, 'get')) return false
  const callee = node.callee
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object?.type === AST_NODE_TYPES.MemberExpression &&
    isIdentifier(callee.object.object, 'ctx') &&
    isIdentifier(callee.object.property, 'db')
  )
}

function isCtxActorAwait(node: any): boolean {
  return (
    node?.type === AST_NODE_TYPES.AwaitExpression &&
    node.argument?.type === AST_NODE_TYPES.CallExpression &&
    node.argument.callee?.type === AST_NODE_TYPES.MemberExpression &&
    isIdentifier(node.argument.callee.object, 'ctx') &&
    isIdentifier(node.argument.callee.property, 'appIdentity')
  )
}

export function traverse(
  node: any,
  visit: (child: any) => void,
  seen = new WeakSet<object>(),
): void {
  if (!node || typeof node !== 'object') return
  if (seen.has(node)) return
  seen.add(node)
  visit(node)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') continue
    if (Array.isArray(value)) {
      for (const entry of value) traverse(entry, visit, seen)
      continue
    }
    if (value && typeof value === 'object' && 'type' in value) {
      traverse(value, visit, seen)
    }
  }
}

export function getProjectAnalysisForContext(context: RuleContext) {
  const filename = getFilename(context)
  const rootDir = findProjectRoot(filename)
  if (!rootDir) return null
  const settings =
    (context.settings?.[TENANT_RULE_NAME] as Record<string, unknown> | undefined) ?? {}
  return analyzeProject(rootDir, resolveAnalyzerTenantOverride(settings))
}

export function getHandlerOptionsObject(callNode: any): any | null {
  const objectArg = callNode.arguments?.[0]
  if (objectArg?.type !== AST_NODE_TYPES.ObjectExpression) return null
  return objectArg
}

export function getHandlerFunction(callNode: any): any | null {
  const objectArg = getHandlerOptionsObject(callNode)
  if (!objectArg) return null
  const handlerProperty = getObjectProperty(objectArg, 'handler')
  return handlerProperty?.value ?? null
}

export function getHandlerArgsProperty(callNode: any): any | null {
  const objectArg = getHandlerOptionsObject(callNode)
  if (!objectArg) return null
  return getObjectProperty(objectArg, 'args')?.value ?? null
}

export function getHandlerGuardValue(callNode: any): any | null {
  const objectArg = getHandlerOptionsObject(callNode)
  if (!objectArg) return null
  return getObjectProperty(objectArg, 'guard')?.value ?? null
}

function isOpenGuardValue(node: any): boolean {
  return (
    isIdentifier(node, 'open') ||
    (node?.type === AST_NODE_TYPES.MemberExpression &&
      !node.computed &&
      isIdentifier(node.property, 'open'))
  )
}

export function hasProtectedStructuredGuard(callNode: any): boolean {
  const guard = getHandlerGuardValue(callNode)
  return guard !== null && !isOpenGuardValue(guard)
}

export function getFirstArgTableMap(callNode: any): Map<string, string> {
  const map = new Map<string, string>()
  const argsNode = getHandlerArgsProperty(callNode)
  if (!argsNode || argsNode.type !== AST_NODE_TYPES.ObjectExpression) return map

  for (const property of argsNode.properties) {
    if (property.type !== AST_NODE_TYPES.Property) continue
    const keyName = getPropertyName(property)
    if (!keyName) continue
    const value = property.value
    if (
      value?.type === AST_NODE_TYPES.CallExpression &&
      value.callee?.type === AST_NODE_TYPES.MemberExpression &&
      isIdentifier(value.callee.object, 'v') &&
      isIdentifier(value.callee.property, 'id')
    ) {
      const tableName = getLiteralValue(value.arguments?.[0])
      if (typeof tableName === 'string') {
        map.set(keyName, tableName)
      }
    }
  }

  return map
}

export function getActorDeclaration(handler: any): { name: string; index: number } | null {
  for (const [index, statement] of (handler.body?.body ?? []).entries()) {
    if (statement.type !== AST_NODE_TYPES.VariableDeclaration) continue
    for (const declaration of statement.declarations) {
      if (!isIdentifier(declaration.id)) continue
      if (isCtxActorAwait(declaration.init)) {
        return { name: declaration.id.name, index }
      }
    }
  }
  return null
}

export function statementContainsCall(
  statement: any,
  calleeName: string,
  firstArgName?: string,
): boolean {
  let matched = false
  traverse(statement, (node) => {
    if (matched || node.type !== AST_NODE_TYPES.CallExpression) return
    if (getCallName(node.callee) !== calleeName) return
    if (firstArgName && !isIdentifier(node.arguments?.[0], firstArgName)) return
    matched = true
  })
  return matched
}

export function statementContainsCallArgument(
  statement: any,
  calleeNames: string[],
  identifierName: string,
): boolean {
  let matched = false
  traverse(statement, (node) => {
    if (matched || node.type !== AST_NODE_TYPES.CallExpression) return
    const callName = getCallName(node.callee)
    if (!callName || !calleeNames.includes(callName)) return
    if (node.arguments?.some((argument: any) => isIdentifier(argument, identifierName))) {
      matched = true
    }
  })
  return matched
}

export function statementContainsProtectedActorAccess(
  statement: any,
  actorName: string,
): any | null {
  let match: any | null = null
  traverse(statement, (node) => {
    if (match) return
    if (
      node.type === AST_NODE_TYPES.MemberExpression &&
      !node.optional &&
      isIdentifier(node.object, actorName) &&
      ['userId', 'role', 'workspaceId'].includes(
        getCallName(node.property) ?? node.property?.name,
      ) &&
      !isGuardedActorAccess(node, actorName)
    ) {
      match = node
    }
  })
  return match
}

function isNullLikeNode(node: any): boolean {
  return (
    (node?.type === AST_NODE_TYPES.Literal && node.value === null) ||
    isIdentifier(node, 'undefined')
  )
}

function testContainsNullishActorGuard(testNode: any, actorName: string): boolean {
  let guarded = false
  traverse(testNode, (node) => {
    if (guarded) return
    if (
      node.type === AST_NODE_TYPES.UnaryExpression &&
      node.operator === '!' &&
      isIdentifier(node.argument, actorName)
    ) {
      guarded = true
      return
    }
    if (
      node.type === AST_NODE_TYPES.BinaryExpression &&
      ['==', '===', '!=', '!=='].includes(node.operator)
    ) {
      const actorOnLeft = isIdentifier(node.left, actorName) && isNullLikeNode(node.right)
      const actorOnRight = isIdentifier(node.right, actorName) && isNullLikeNode(node.left)
      if (actorOnLeft || actorOnRight) {
        guarded = true
      }
    }
  })
  return guarded
}

function branchContainsNode(branchNode: any, targetNode: any): boolean {
  let found = false
  traverse(branchNode, (node) => {
    if (node === targetNode) found = true
  })
  return found
}

function isGuardedActorAccess(node: any, actorName: string): boolean {
  let current = node
  while (current?.parent) {
    const parent = current.parent
    if (parent.type === AST_NODE_TYPES.LogicalExpression && parent.operator === '&&') {
      if (
        branchContainsNode(parent.right, current) &&
        testContainsNullishActorGuard(parent.left, actorName)
      ) {
        return true
      }
      if (
        branchContainsNode(parent.left, current) &&
        testContainsNullishActorGuard(parent.right, actorName)
      ) {
        return true
      }
    }
    current = parent
  }
  return false
}

export function isNullGuardStatement(statement: any, actorName: string): boolean {
  if (statement.type !== AST_NODE_TYPES.IfStatement) return false
  if (!testContainsNullishActorGuard(statement.test, actorName)) return false
  const consequentBody =
    statement.consequent?.type === AST_NODE_TYPES.BlockStatement
      ? statement.consequent.body
      : [statement.consequent]
  return consequentBody.some(
    (entry: any) =>
      entry?.type === AST_NODE_TYPES.ReturnStatement ||
      entry?.type === AST_NODE_TYPES.ThrowStatement,
  )
}

export function unwindCallChain(node: any): Array<{ name: string; node: any }> {
  const chain: Array<{ name: string; node: any }> = []
  let current = node
  while (
    current?.type === AST_NODE_TYPES.CallExpression &&
    current.callee?.type === AST_NODE_TYPES.MemberExpression
  ) {
    chain.push({
      name: getCallName(current.callee.property) ?? '',
      node: current,
    })
    current = current.callee.object
  }
  if (current?.type === AST_NODE_TYPES.CallExpression) {
    chain.push({
      name: getCallName(current.callee) ?? '',
      node: current,
    })
  }
  return chain.reverse()
}

export function hasUnsafeAppIdentityCheck(functionNode: any, context: RuleContext): boolean {
  const param = functionNode.params?.[0]
  if (!isIdentifier(param)) return false
  const paramName = param.name
  const raw = getSourceCode(context)?.getText(functionNode.body) ?? ''
  if (
    raw.includes(`${paramName}?.`) ||
    raw.includes(`!!${paramName}`) ||
    raw.includes(`${paramName} &&`) ||
    raw.includes(`!${paramName}`) ||
    raw.includes(`${paramName} != null`) ||
    raw.includes(`${paramName} !== null`) ||
    raw.includes(`${paramName} == null`) ||
    raw.includes(`${paramName} === null`)
  ) {
    return false
  }

  let unsafe = false
  traverse(functionNode.body, (node) => {
    if (unsafe) return
    if (
      node.type === AST_NODE_TYPES.MemberExpression &&
      !node.optional &&
      isIdentifier(node.object, paramName)
    ) {
      unsafe = true
    }
  })
  return unsafe
}

export function createImportBoundaryRule(options: {
  pathMatcher: (filename: string) => boolean
  importMatcher: (source: string) => boolean
  message: string
}): RuleModule {
  return createRule(
    {
      type: 'problem',
      schema: [],
      messages: {
        boundary: options.message,
      },
    },
    (context) => ({
      ImportDeclaration(node: any) {
        const filename = getFilename(context)
        if (!options.pathMatcher(filename)) return
        const importSource = getLiteralValue(node.source)
        if (typeof importSource !== 'string' || !options.importMatcher(importSource)) return
        context.report({
          node: node.source,
          messageId: 'boundary',
        })
      },
    }),
  )
}

export { hasTenantCollectionMethod, isNullishBooleanLiteral }
