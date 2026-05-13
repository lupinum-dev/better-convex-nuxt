/* eslint-disable @typescript-eslint/no-explicit-any -- ESLint parser AST nodes and fixers are intentionally handled loosely in this plugin layer. */
import {
  createRule,
  getFirstArgTableMap,
  getHandlerFunction,
  getProjectAnalysisForContext,
  hasTenantCollectionMethod,
  isBuilderCall,
  isCtxDbGetCall,
  isCtxDbQueryCall,
  isIdentifier,
  getObjectProperty,
  statementContainsCallArgument,
  traverse,
  unwindCallChain,
} from '../shared.js'

export const isolationRules = {
  'isolation-query-requires-index': createRule(
    {
      type: 'problem',
      schema: [],
      messages: {
        scoped:
          'Isolation-scoped collection reads should use `.withIndex(...)` before collecting results.',
      },
    },
    (context) => ({
      CallExpression(node: any) {
        const analysis = getProjectAnalysisForContext(context)
        if (!analysis?.isolation) return

        const chain = unwindCallChain(node)
        const queryStep = chain.find((entry) => isCtxDbQueryCall(entry.node))
        if (!queryStep) return

        const tableArg = queryStep.node.arguments?.[0]
        const tableName =
          tableArg?.type === 'Literal' && typeof tableArg.value === 'string' ? tableArg.value : null
        if (!tableName) return
        if (!analysis.isolation.tables.includes(tableName)) return

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
  'unsafe-get-requires-isolation-check': createRule(
    {
      type: 'problem',
      schema: [],
      messages: {
        isolation:
          'Isolation-scoped documents loaded with `ctx.db.get()` should be validated with `ensureTenant()` / `loadTenantResource()` / `loadResource()` before use.',
      },
    },
    (context) => ({
      CallExpression(node: any) {
        if (!isBuilderCall(node, 'unsafe', 'query', 'mutation')) return
        const analysis = getProjectAnalysisForContext(context)
        if (!analysis?.isolation) return
        const handler = getHandlerFunction(node)
        if (!handler || handler.body?.type !== 'BlockStatement') return

        const argTableMap = getFirstArgTableMap(node)
        for (let index = 0; index < handler.body.body.length; index++) {
          const statement = handler.body.body[index]
          if (statement.type !== 'VariableDeclaration') continue

          for (const declaration of statement.declarations) {
            if (!isIdentifier(declaration.id)) continue
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
            if (!tableName || !analysis.isolation.tables.includes(tableName)) continue

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
                messageId: 'isolation',
              })
              return
            }
          }
        }
      },
    }),
  ),
  'escape-isolation-requires-reason': createRule(
    {
      type: 'problem',
      schema: [],
      messages: {
        reason:
          '`ctx.db.escapeIsolation(...)` must include a non-empty `reason` so the trust-boundary change is explicit.',
      },
    },
    (context) => ({
      CallExpression(node: any) {
        if (
          node.callee?.type !== 'MemberExpression' ||
          node.callee.computed ||
          !isIdentifier(node.callee.property, 'escapeIsolation')
        ) {
          return
        }

        const options = node.arguments?.[0]
        if (options?.type !== 'ObjectExpression') {
          context.report({
            node,
            messageId: 'reason',
          })
          return
        }

        const reason = getObjectProperty(options, 'reason')?.value
        if (
          reason?.type === 'Literal' &&
          typeof reason.value === 'string' &&
          reason.value.trim().length > 0
        ) {
          return
        }

        if (
          isIdentifier(reason) ||
          reason?.type === 'TemplateLiteral' ||
          reason?.type === 'BinaryExpression'
        ) {
          return
        }

        context.report({
          node: reason ?? options,
          messageId: 'reason',
        })
      },
    }),
  ),
} as const
