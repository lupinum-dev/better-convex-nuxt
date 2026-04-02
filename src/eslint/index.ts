/* eslint-disable @typescript-eslint/no-explicit-any -- ESLint parser AST nodes and fixers are intentionally handled loosely in this plugin layer. */
import {
  analyzeProject,
  findProjectRoot,
  hasTenantCollectionMethod,
  isNullishBooleanLiteral,
  resolveAnalyzerTenantOverride,
} from '../analysis/project'

type RuleContext = {
  filename?: string
  settings?: Record<string, unknown>
  sourceCode?: { getText: (node?: unknown) => string; parserServices?: Record<string, unknown> }
  getFilename?: () => string
  getSourceCode?: () => {
    getText: (node?: unknown) => string
    parserServices?: Record<string, unknown>
  }
  report: (descriptor: Record<string, unknown>) => void
}

type RuleModule = {
  meta: Record<string, unknown>
  create: (context: RuleContext) => Record<string, (node: any) => void>
}

const TENANT_RULE_NAME = 'better-convex-nuxt'
const RULE_DOCS_URL = 'https://better-convex-nuxt.vercel.app'

function getFilename(context: RuleContext): string {
  return context.filename ?? context.getFilename?.() ?? '<input>'
}

function getSourceCode(context: RuleContext) {
  return context.sourceCode ?? context.getSourceCode?.()
}

function createRule(meta: Record<string, unknown>, create: RuleModule['create']): RuleModule {
  return {
    meta: {
      docs: {
        url: `${RULE_DOCS_URL}/docs`,
      },
      ...meta,
    },
    create,
  }
}

function isIdentifier(node: any, name?: string): boolean {
  return !!node && node.type === 'Identifier' && (name ? node.name === name : true)
}

function getLiteralValue(node: any): string | number | boolean | null | undefined {
  if (!node) return undefined
  if (node.type === 'Literal') return node.value
  return undefined
}

function isBooleanLiteral(node: any, value: boolean): boolean {
  return node?.type === 'Literal' && node.value === value
}

function getPropertyName(node: any): string | null {
  if (!node) return null
  if (node.type === 'Property' || node.type === 'PropertyDefinition') {
    if (node.key?.type === 'Identifier') return node.key.name
    if (node.key?.type === 'Literal' && typeof node.key.value === 'string') return node.key.value
  }
  return null
}

function getObjectProperty(objectNode: any, name: string): any | null {
  if (!objectNode || objectNode.type !== 'ObjectExpression') return null
  return (
    objectNode.properties.find(
      (property: any) => property.type === 'Property' && getPropertyName(property) === name,
    ) ?? null
  )
}

function getCallName(node: any): string | null {
  if (!node) return null
  if (node.type === 'Identifier') return node.name
  if (node.type === 'MemberExpression' && !node.computed) {
    if (node.property.type === 'Identifier') return node.property.name
  }
  return null
}

function isCallNamed(node: any, ...names: string[]): boolean {
  return node?.type === 'CallExpression' && names.includes(getCallName(node.callee) ?? '')
}

function isBuilderCall(node: any, builderName: string, ...methodNames: string[]): boolean {
  return (
    node?.type === 'CallExpression' &&
    node.callee?.type === 'MemberExpression' &&
    !node.callee.computed &&
    isIdentifier(node.callee.object, builderName) &&
    methodNames.includes(getCallName(node.callee.property) ?? '')
  )
}

function isCtxDbQueryCall(node: any): boolean {
  if (!isCallNamed(node, 'query')) return false
  const callee = node.callee
  return (
    callee.type === 'MemberExpression' &&
    callee.object?.type === 'MemberExpression' &&
    isIdentifier(callee.object.object, 'ctx') &&
    isIdentifier(callee.object.property, 'db')
  )
}

function isCtxDbGetCall(node: any): boolean {
  if (!isCallNamed(node, 'get')) return false
  const callee = node.callee
  return (
    callee.type === 'MemberExpression' &&
    callee.object?.type === 'MemberExpression' &&
    isIdentifier(callee.object.object, 'ctx') &&
    isIdentifier(callee.object.property, 'db')
  )
}

function isCtxActorAwait(node: any): boolean {
  return (
    node?.type === 'AwaitExpression' &&
    node.argument?.type === 'CallExpression' &&
    node.argument.callee?.type === 'MemberExpression' &&
    isIdentifier(node.argument.callee.object, 'ctx') &&
    isIdentifier(node.argument.callee.property, 'actor')
  )
}

function traverse(node: any, visit: (child: any) => void, seen = new WeakSet<object>()): void {
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

function getProjectAnalysisForContext(context: RuleContext) {
  const filename = getFilename(context)
  const rootDir = findProjectRoot(filename)
  if (!rootDir) return null
  const settings =
    (context.settings?.[TENANT_RULE_NAME] as Record<string, unknown> | undefined) ?? {}
  return analyzeProject(rootDir, resolveAnalyzerTenantOverride(settings))
}

function getHandlerFunction(callNode: any): any | null {
  const objectArg = getHandlerOptionsObject(callNode)
  if (!objectArg) return null
  const handlerProperty = getObjectProperty(objectArg, 'handler')
  if (!handlerProperty) return null
  return handlerProperty.value
}

function getHandlerOptionsObject(callNode: any): any | null {
  const objectArg = callNode.arguments?.[0]
  if (objectArg?.type !== 'ObjectExpression') return null
  return objectArg
}

function getHandlerArgsProperty(callNode: any): any | null {
  const objectArg = getHandlerOptionsObject(callNode)
  if (!objectArg) return null
  const argsProperty = getObjectProperty(objectArg, 'args')
  return argsProperty?.value ?? null
}

function getHandlerGuardValue(callNode: any): any | null {
  const objectArg = getHandlerOptionsObject(callNode)
  if (!objectArg) return null
  return getObjectProperty(objectArg, 'guard')?.value ?? null
}

function isOpenGuardValue(node: any): boolean {
  return (
    isIdentifier(node, 'open') ||
    (node?.type === 'MemberExpression' && !node.computed && isIdentifier(node.property, 'open'))
  )
}

function hasProtectedStructuredGuard(callNode: any): boolean {
  const guard = getHandlerGuardValue(callNode)
  return guard !== null && !isOpenGuardValue(guard)
}

function getFirstArgTableMap(callNode: any): Map<string, string> {
  const map = new Map<string, string>()
  const argsNode = getHandlerArgsProperty(callNode)
  if (!argsNode || argsNode.type !== 'ObjectExpression') return map

  for (const property of argsNode.properties) {
    if (property.type !== 'Property') continue
    const keyName = getPropertyName(property)
    if (!keyName) continue
    const value = property.value
    if (
      value?.type === 'CallExpression' &&
      value.callee?.type === 'MemberExpression' &&
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

function getActorDeclaration(handler: any): { name: string; index: number } | null {
  for (const [index, statement] of (handler.body?.body ?? []).entries()) {
    if (statement.type !== 'VariableDeclaration') continue
    for (const declaration of statement.declarations) {
      if (declaration.id?.type !== 'Identifier') continue
      if (isCtxActorAwait(declaration.init)) {
        return {
          name: declaration.id.name,
          index,
        }
      }
    }
  }
  return null
}

function statementContainsCall(statement: any, calleeName: string, firstArgName?: string): boolean {
  let matched = false
  traverse(statement, (node) => {
    if (matched || node.type !== 'CallExpression') return
    if (getCallName(node.callee) !== calleeName) return
    if (firstArgName && !isIdentifier(node.arguments?.[0], firstArgName)) return
    matched = true
  })
  return matched
}

function statementContainsCallArgument(
  statement: any,
  calleeNames: string[],
  identifierName: string,
): boolean {
  let matched = false
  traverse(statement, (node) => {
    if (matched || node.type !== 'CallExpression') return
    const callName = getCallName(node.callee)
    if (!callName || !calleeNames.includes(callName)) return
    if (node.arguments?.some((argument: any) => isIdentifier(argument, identifierName))) {
      matched = true
    }
  })
  return matched
}

function statementContainsProtectedActorAccess(statement: any, actorName: string): any | null {
  let match: any | null = null
  traverse(statement, (node) => {
    if (match) return
    if (
      node.type === 'MemberExpression' &&
      !node.optional &&
      isIdentifier(node.object, actorName) &&
      ['userId', 'role', 'tenantId'].includes(getCallName(node.property) ?? node.property?.name) &&
      !isGuardedActorAccess(node, actorName)
    ) {
      match = node
    }
  })
  return match
}

function isNullLikeNode(node: any): boolean {
  return (node?.type === 'Literal' && node.value === null) || isIdentifier(node, 'undefined')
}

function testContainsNullishActorGuard(testNode: any, actorName: string): boolean {
  let guarded = false
  traverse(testNode, (node) => {
    if (guarded) return
    if (
      node.type === 'UnaryExpression' &&
      node.operator === '!' &&
      isIdentifier(node.argument, actorName)
    ) {
      guarded = true
      return
    }
    if (node.type === 'BinaryExpression' && ['==', '===', '!=', '!=='].includes(node.operator)) {
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
    if (node === targetNode) {
      found = true
    }
  })
  return found
}

function isGuardedActorAccess(node: any, actorName: string): boolean {
  let current = node
  while (current?.parent) {
    const parent = current.parent
    if (parent.type === 'LogicalExpression' && parent.operator === '&&') {
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

function isNullGuardStatement(statement: any, actorName: string): boolean {
  if (statement.type !== 'IfStatement') return false
  if (!testContainsNullishActorGuard(statement.test, actorName)) return false

  const consequentBody =
    statement.consequent?.type === 'BlockStatement'
      ? statement.consequent.body
      : [statement.consequent]
  return consequentBody.some(
    (entry: any) => entry?.type === 'ReturnStatement' || entry?.type === 'ThrowStatement',
  )
}

function unwindCallChain(node: any): Array<{ name: string; node: any }> {
  const chain: Array<{ name: string; node: any }> = []
  let current = node
  while (current?.type === 'CallExpression' && current.callee?.type === 'MemberExpression') {
    chain.push({
      name: getCallName(current.callee.property) ?? '',
      node: current,
    })
    current = current.callee.object
  }
  if (current?.type === 'CallExpression') {
    chain.push({
      name: getCallName(current.callee) ?? '',
      node: current,
    })
  }
  return chain.reverse()
}

function hasUnsafeActorCheck(functionNode: any, context: RuleContext): boolean {
  const param = functionNode.params?.[0]
  if (!isIdentifier(param)) return false
  const paramName = param.name
  const sourceCode = getSourceCode(context)
  const raw = sourceCode?.getText(functionNode.body) ?? ''
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
      node.type === 'MemberExpression' &&
      !node.optional &&
      isIdentifier(node.object, paramName)
    ) {
      unsafe = true
    }
  })
  return unsafe
}

function createImportBoundaryRule(options: {
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
      ImportDeclaration(node) {
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

const rules: Record<string, RuleModule> = {
  'mcp-scoped-requires-auth': createRule(
    {
      type: 'problem',
      fixable: 'code',
      schema: [],
      messages: {
        required: "`scoped: true` requires `auth: 'required'`.",
      },
    },
    (context) => ({
      CallExpression(node) {
        if (!isCallNamed(node, 'defineTool')) return
        const options = node.arguments?.[0]
        if (options?.type !== 'ObjectExpression') return

        const scopedProperty = getObjectProperty(options, 'scoped')
        if (!scopedProperty || !isBooleanLiteral(scopedProperty.value, true)) return

        const authProperty = getObjectProperty(options, 'auth')
        const authValue = getLiteralValue(authProperty?.value)
        if (authValue === 'required') return

        context.report({
          node: authProperty?.value ?? scopedProperty.value,
          messageId: 'required',
          fix:
            authProperty && authProperty.value
              ? (fixer: any) => fixer.replaceText(authProperty.value, "'required'")
              : (fixer: any) => {
                  const sourceCode = getSourceCode(context)
                  const closingBrace = options.range?.[1] ? options.range[1] - 1 : null
                  if (closingBrace == null || !sourceCode) return null
                  const prefix = options.properties.length > 0 ? ', ' : ''
                  return fixer.insertTextBeforeRange(
                    [closingBrace, closingBrace],
                    `${prefix}auth: 'required'`,
                  )
                },
        })
      },
    }),
  ),
  'no-owner-id-as-document-id': createRule(
    {
      type: 'problem',
      schema: [],
      messages: {
        invalid: "`ownerId` must use `v.string()`, not `v.id('users')`.",
      },
    },
    (context) => ({
      Property(node) {
        const filename = getFilename(context)
        if (!filename.endsWith('/schema.ts') && !filename.endsWith('\\schema.ts')) return
        if (getPropertyName(node) !== 'ownerId') return
        const value = node.value
        if (
          value?.type === 'CallExpression' &&
          value.callee?.type === 'MemberExpression' &&
          isIdentifier(value.callee.object, 'v') &&
          isIdentifier(value.callee.property, 'id') &&
          getLiteralValue(value.arguments?.[0]) === 'users'
        ) {
          context.report({
            node: value,
            messageId: 'invalid',
          })
        }
      },
    }),
  ),
  'no-await-convex-mutation': createRule(
    {
      type: 'problem',
      fixable: 'code',
      schema: [],
      messages: {
        sync: '`useConvexMutation()` is synchronous. Await the returned callable instead.',
      },
    },
    (context) => ({
      AwaitExpression(node) {
        if (!isCallNamed(node.argument, 'useConvexMutation')) return
        context.report({
          node,
          messageId: 'sync',
          fix: (fixer: any) => fixer.replaceTextRange([node.range[0], node.argument.range[0]], ''),
        })
      },
    }),
  ),
  'await-convex-query': createRule(
    {
      type: 'problem',
      schema: [],
      messages: {
        ambiguous:
          'Await the query composable when destructuring its result directly. Keep the full query state object only for intentional non-blocking usage.',
      },
    },
    (context) => ({
      VariableDeclarator(node) {
        const init = node.init
        if (!isCallNamed(init, 'useConvexQuery', 'useConvexPaginatedQuery', 'useCachedQuery'))
          return
        if (node.id?.type === 'ObjectPattern') {
          context.report({
            node: init,
            messageId: 'ambiguous',
          })
        }
      },
    }),
  ),
  'reactive-query-args': createRule(
    {
      type: 'problem',
      schema: [],
      messages: {
        reactive:
          'Reactive query args that read `.value` should be wrapped in `computed(() => ...)`.',
      },
    },
    (context) => ({
      CallExpression(node) {
        if (!isCallNamed(node, 'useConvexQuery')) return
        const argsNode = node.arguments?.[1]
        if (!argsNode) return
        if (isCallNamed(argsNode, 'computed')) return
        if (argsNode.type !== 'ObjectExpression' && argsNode.type !== 'ConditionalExpression')
          return

        let referencesRefValue = false
        traverse(argsNode, (child) => {
          if (
            child.type === 'MemberExpression' &&
            !child.computed &&
            child.property?.type === 'Identifier' &&
            child.property.name === 'value'
          ) {
            referencesRefValue = true
          }
        })

        if (referencesRefValue) {
          context.report({
            node: argsNode,
            messageId: 'reactive',
          })
        }
      },
    }),
  ),
  'actor-access-after-enforce': createRule(
    {
      type: 'problem',
      schema: [],
      messages: {
        access:
          'Do not access actor fields before `enforce()` / `requireAuth()` narrows the actor.',
      },
    },
    (context) => ({
      CallExpression(node) {
        const handler = getHandlerFunction(node)
        if (!handler || handler.body?.type !== 'BlockStatement') return
        const actorDeclaration = getActorDeclaration(handler)
        if (!actorDeclaration) return
        const actorName = actorDeclaration.name

        let secured = hasProtectedStructuredGuard(node)
        for (const statement of handler.body.body.slice(actorDeclaration.index + 1)) {
          if (
            statementContainsCall(statement, 'enforce', actorName) ||
            statementContainsCall(statement, 'requireAuth', actorName) ||
            isNullGuardStatement(statement, actorName)
          ) {
            secured = true
          }

          if (secured) continue

          const accessNode = statementContainsProtectedActorAccess(statement, actorName)
          if (!accessNode) continue

          context.report({
            node: accessNode,
            messageId: 'access',
          })
          return
        }
      },
    }),
  ),
  'check-handles-null-actor': createRule(
    {
      type: 'problem',
      schema: [],
      messages: {
        unsafe: 'Actor check functions should handle `null` actors before reading actor fields.',
      },
    },
    (context) => ({
      Property(node) {
        if (getPropertyName(node) !== 'check') return
        if (
          (node.value?.type === 'ArrowFunctionExpression' ||
            node.value?.type === 'FunctionExpression') &&
          hasUnsafeActorCheck(node.value, context)
        ) {
          context.report({
            node: node.value,
            messageId: 'unsafe',
          })
        }
      },
      CallExpression(node) {
        const candidates = [
          { name: 'enforce', index: 2 },
          { name: 'can', index: 1 },
        ]

        for (const candidate of candidates) {
          if (!isCallNamed(node, candidate.name)) continue
          const checkArg = node.arguments?.[candidate.index]
          if (
            (checkArg?.type === 'ArrowFunctionExpression' ||
              checkArg?.type === 'FunctionExpression') &&
            hasUnsafeActorCheck(checkArg, context)
          ) {
            context.report({
              node: checkArg,
              messageId: 'unsafe',
            })
          }
        }
      },
    }),
  ),
  'mcp-destructive-requires-preview': createRule(
    {
      type: 'suggestion',
      schema: [],
      messages: {
        preview: 'Destructive tools should define a `preview` handler.',
      },
    },
    (context) => ({
      CallExpression(node) {
        if (!isCallNamed(node, 'defineTool')) return
        const options = node.arguments?.[0]
        if (options?.type !== 'ObjectExpression') return

        const destructiveProperty = getObjectProperty(options, 'destructive')
        if (!destructiveProperty || !isBooleanLiteral(destructiveProperty.value, true)) return
        if (getObjectProperty(options, 'preview')) return

        context.report({
          node: destructiveProperty.value,
          messageId: 'preview',
        })
      },
    }),
  ),
  'mcp-middleware-awaits-next': createRule(
    {
      type: 'problem',
      schema: [],
      messages: {
        chain: 'Middleware must return `next()` or `await next()` to continue the tool chain.',
      },
    },
    (context) => ({
      Property(node) {
        if (getPropertyName(node) !== 'middleware') return
        const fn = node.value
        if (fn?.type !== 'ArrowFunctionExpression' && fn?.type !== 'FunctionExpression') {
          return
        }

        const returnsNext = (() => {
          if (fn.body?.type === 'CallExpression' && isCallNamed(fn.body, 'next')) return true
          if (fn.body?.type === 'AwaitExpression' && isCallNamed(fn.body.argument, 'next'))
            return true
          let found = false
          traverse(fn.body, (child) => {
            if (found || child.type !== 'ReturnStatement') return
            const argument = child.argument
            if (isCallNamed(argument, 'next')) found = true
            if (argument?.type === 'AwaitExpression' && isCallNamed(argument.argument, 'next')) {
              found = true
            }
          })
          return found
        })()

        if (!returnsNext) {
          context.report({
            node: fn,
            messageId: 'chain',
          })
        }
      },
    }),
  ),
  'shared-no-nuxt-imports': createImportBoundaryRule({
    pathMatcher: (filename) => /[/\\]shared[/\\]/u.test(filename),
    importMatcher: (source) =>
      source === '#app' ||
      source === '#imports' ||
      source === 'vue' ||
      source === 'nuxt' ||
      source.startsWith('@nuxt/'),
    message:
      'Files under `shared/` must stay runtime-agnostic and must not import Nuxt or Vue runtime modules.',
  }),
  'convex-no-nuxt-imports': createImportBoundaryRule({
    pathMatcher: (filename) =>
      /[/\\]convex[/\\]/u.test(filename) && !/[/\\]_generated[/\\]/u.test(filename),
    importMatcher: (source) =>
      source === '#app' ||
      source === '#imports' ||
      source === 'vue' ||
      source === 'nuxt' ||
      source.startsWith('@nuxt/') ||
      /^~\/(?:pages|components|server)\//u.test(source) ||
      /(?:^|[/\\])(?:pages|components|server)[/\\]/u.test(source),
    message:
      'Files under `convex/` must not import Nuxt, Vue, or app runtime modules such as pages/components/server.',
  }),
  'server-convex-auth-explicit': createRule(
    {
      type: 'suggestion',
      schema: [],
      messages: {
        explicit: 'Pass an explicit `{ auth: ... }` option to server-side Convex helpers.',
      },
    },
    (context) => ({
      CallExpression(node) {
        if (!isCallNamed(node, 'serverConvexQuery', 'serverConvexMutation')) return
        const lastArgument = node.arguments?.[node.arguments.length - 1]
        if (
          lastArgument?.type === 'ObjectExpression' &&
          !!getObjectProperty(lastArgument, 'auth')
        ) {
          return
        }
        context.report({
          node,
          messageId: 'explicit',
        })
      },
    }),
  ),
  'prefer-app-query-over-raw': createRule(
    {
      type: 'suggestion',
      schema: [],
      messages: {
        prefer:
          'Prefer `app.query(...)` / `app.mutation(...)` over `raw.query(...)` / `raw.mutation(...)` unless the file is an intentional escape hatch.',
      },
    },
    (context) => ({
      CallExpression(node) {
        const filename = getFilename(context)
        if (!/[/\\]convex[/\\]/u.test(filename)) return
        if (/(?:^|[/\\])(?:auth|http|webhooks?)\./u.test(filename)) return
        if (!isBuilderCall(node, 'raw', 'query', 'mutation')) return
        context.report({
          node,
          messageId: 'prefer',
        })
      },
    }),
  ),
  'no-dead-v-if-false': createRule(
    {
      type: 'suggestion',
      fixable: 'code',
      schema: [],
      messages: {
        dead: 'Remove dead template branches guarded by `v-if="false"`.',
      },
    },
    (context) => {
      const sourceCode = getSourceCode(context)
      const defineTemplateBodyVisitor = sourceCode?.parserServices?.defineTemplateBodyVisitor as
        | ((
            templateVisitor: Record<string, (node: any) => void>,
            scriptVisitor?: Record<string, (node: any) => void>,
          ) => Record<string, (node: any) => void>)
        | undefined

      if (!defineTemplateBodyVisitor) return {}

      return defineTemplateBodyVisitor(
        {
          "VAttribute[directive=true][key.name.name='if']"(node: any) {
            const raw = node.value?.expression
              ? sourceCode?.getText(node.value.expression)
              : node.value?.value
            if (!isNullishBooleanLiteral(raw)) return

            const element = node.parent?.parent
            if (!element?.range) return

            context.report({
              node,
              messageId: 'dead',
              fix: (fixer: any) => fixer.removeRange(element.range),
            })
          },
        },
        {},
      )
    },
  ),
  'enforce-required-in-handler': createRule(
    {
      type: 'problem',
      schema: [],
      messages: {
        gate: 'Protected app handlers should call `enforce()` / `requireAuth()` before touching `ctx.db`.',
      },
    },
    (context) => ({
      CallExpression(node) {
        if (!isBuilderCall(node, 'raw', 'query', 'mutation')) return
        const handler = getHandlerFunction(node)
        if (!handler || handler.body?.type !== 'BlockStatement') return
        const actorDeclaration = getActorDeclaration(handler)
        if (!actorDeclaration) return
        const actorName = actorDeclaration.name

        let gateSeen = false
        let firstDbNode: any | null = null
        for (const statement of handler.body.body.slice(actorDeclaration.index + 1)) {
          if (
            statementContainsCall(statement, 'enforce', actorName) ||
            statementContainsCall(statement, 'requireAuth', actorName) ||
            isNullGuardStatement(statement, actorName)
          ) {
            gateSeen = true
          }

          if (gateSeen) break

          traverse(statement, (child) => {
            if (!firstDbNode && child.type === 'CallExpression') {
              const callName = getCallName(child.callee)
              if (callName === 'get' && isCtxDbGetCall(child)) {
                return
              }
            }
            if (!firstDbNode && child.type === 'MemberExpression') {
              if (
                child.parent?.type === 'MemberExpression' &&
                child.parent.parent?.type === 'CallExpression' &&
                getCallName(child.parent.property) === 'get' &&
                isCtxDbGetCall(child.parent.parent)
              ) {
                return
              }
              if (
                child.object?.type === 'Identifier' &&
                child.object.name === 'ctx' &&
                child.property?.type === 'Identifier' &&
                child.property.name === 'db'
              ) {
                firstDbNode = child
              }
            }
          })
        }

        if (firstDbNode) {
          context.report({
            node: firstDbNode,
            messageId: 'gate',
          })
        }
      },
    }),
  ),
  'tenant-scoped-query-requires-index': createRule(
    {
      type: 'problem',
      schema: [],
      messages: {
        scoped:
          'Tenant-scoped collection reads should use `.withIndex(...)` before collecting results.',
      },
    },
    (context) => ({
      CallExpression(node) {
        const analysis = getProjectAnalysisForContext(context)
        if (!analysis?.tenantIsolation) return

        const chain = unwindCallChain(node)
        const queryStep = chain.find((entry) => isCtxDbQueryCall(entry.node))
        if (!queryStep) return

        const tableName = getLiteralValue(queryStep.node.arguments?.[0])
        if (typeof tableName !== 'string') return
        if (!analysis.tenantIsolation.tables.includes(tableName)) return

        const lastStep = chain[chain.length - 1]
        if (!lastStep || !hasTenantCollectionMethod(lastStep.name)) return
        if (chain.some((entry) => entry.name === 'withIndex')) return

        context.report({
          node: queryStep.node,
          messageId: 'scoped',
        })
      },
    }),
  ),
  'raw-get-requires-tenant-check': createRule(
    {
      type: 'problem',
      schema: [],
      messages: {
        tenant:
          'Tenant-scoped documents loaded with `ctx.db.get()` should be validated with `ensureTenant()` / `loadTenantResource()` / `loadResource()` before use.',
      },
    },
    (context) => ({
      CallExpression(node) {
        if (!isBuilderCall(node, 'raw', 'query', 'mutation')) return
        const analysis = getProjectAnalysisForContext(context)
        if (!analysis?.tenantIsolation) return
        const handler = getHandlerFunction(node)
        if (!handler || handler.body?.type !== 'BlockStatement') return

        const argTableMap = getFirstArgTableMap(node)
        for (let index = 0; index < handler.body.body.length; index++) {
          const statement = handler.body.body[index]
          if (statement.type !== 'VariableDeclaration') continue

          for (const declaration of statement.declarations) {
            if (declaration.id?.type !== 'Identifier') continue
            const init = declaration.init
            if (!isCtxDbGetCall(init?.argument ?? init)) continue

            const callNode = init?.type === 'AwaitExpression' ? init.argument : init
            const firstArg = callNode.arguments?.[0]
            if (
              firstArg?.type !== 'MemberExpression' ||
              !isIdentifier(firstArg.object, 'args') ||
              firstArg.property?.type !== 'Identifier'
            ) {
              continue
            }

            const tableName = argTableMap.get(firstArg.property.name)
            if (!tableName || !analysis.tenantIsolation.tables.includes(tableName)) continue

            let validated = false
            let unsafeUse: any | null = null

            for (const laterStatement of handler.body.body.slice(index + 1)) {
              if (
                statementContainsCallArgument(
                  laterStatement,
                  ['ensureTenant', 'loadTenantResource', 'loadResource'],
                  declaration.id.name,
                )
              ) {
                validated = true
                break
              }

              traverse(laterStatement, (child) => {
                if (unsafeUse || child.type !== 'Identifier') return
                if (child.name === declaration.id.name) unsafeUse = child
              })
              if (unsafeUse) break
            }

            if (!validated && unsafeUse) {
              context.report({
                node: unsafeUse,
                messageId: 'tenant',
              })
              return
            }
          }
        }
      },
    }),
  ),
}

const recommendedRuleLevels: Record<string, 'error' | 'warn'> = {
  [`${TENANT_RULE_NAME}/mcp-scoped-requires-auth`]: 'error',
  [`${TENANT_RULE_NAME}/no-owner-id-as-document-id`]: 'error',
  [`${TENANT_RULE_NAME}/no-await-convex-mutation`]: 'error',
  [`${TENANT_RULE_NAME}/await-convex-query`]: 'error',
  [`${TENANT_RULE_NAME}/reactive-query-args`]: 'error',
  [`${TENANT_RULE_NAME}/actor-access-after-enforce`]: 'error',
  [`${TENANT_RULE_NAME}/check-handles-null-actor`]: 'error',
  [`${TENANT_RULE_NAME}/mcp-destructive-requires-preview`]: 'warn',
  [`${TENANT_RULE_NAME}/mcp-middleware-awaits-next`]: 'error',
  [`${TENANT_RULE_NAME}/shared-no-nuxt-imports`]: 'warn',
  [`${TENANT_RULE_NAME}/convex-no-nuxt-imports`]: 'warn',
  [`${TENANT_RULE_NAME}/server-convex-auth-explicit`]: 'warn',
  [`${TENANT_RULE_NAME}/enforce-required-in-handler`]: 'error',
  [`${TENANT_RULE_NAME}/tenant-scoped-query-requires-index`]: 'error',
  [`${TENANT_RULE_NAME}/raw-get-requires-tenant-check`]: 'error',
}

const strictOnlyRuleLevels: Record<string, 'error'> = {
  [`${TENANT_RULE_NAME}/prefer-app-query-over-raw`]: 'error',
  [`${TENANT_RULE_NAME}/no-dead-v-if-false`]: 'error',
}

const plugin = {
  rules,
  configs: {} as Record<string, Record<string, unknown>>,
}

plugin.configs.recommended = {
  name: `${TENANT_RULE_NAME}/recommended`,
  plugins: {
    [TENANT_RULE_NAME]: plugin,
  },
  rules: recommendedRuleLevels,
}

plugin.configs.strict = {
  name: `${TENANT_RULE_NAME}/strict`,
  plugins: {
    [TENANT_RULE_NAME]: plugin,
  },
  rules: {
    ...Object.fromEntries(Object.keys(recommendedRuleLevels).map((name) => [name, 'error'])),
    ...strictOnlyRuleLevels,
  },
}

export default plugin
export { rules }
