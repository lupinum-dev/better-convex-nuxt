/* eslint-disable @typescript-eslint/no-explicit-any -- ESLint parser AST nodes and fixers are intentionally handled loosely in this plugin layer. */
import {
  createRule,
  getActorDeclaration,
  getHandlerFunction,
  hasProtectedStructuredGuard,
  hasUnsafeActorCheck,
  isBuilderCall,
  isCtxDbGetCall,
  isNullGuardStatement,
  statementContainsCall,
  statementContainsProtectedActorAccess,
  traverse,
} from '../shared.js'

export const authRules = {
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
      CallExpression(node: any) {
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
      Property(node: any) {
        const keyName = node.key?.type === 'Identifier' ? node.key.name : null
        if (keyName !== 'check') return
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
      CallExpression(node: any) {
        const candidates = [
          { name: 'enforce', index: 2 },
          { name: 'can', index: 1 },
        ]

        for (const candidate of candidates) {
          if (node.callee?.type !== 'Identifier' || node.callee.name !== candidate.name) continue
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
  'enforce-required-in-handler': createRule(
    {
      type: 'problem',
      schema: [],
      messages: {
        gate: 'Protected app handlers should call `enforce()` / `requireAuth()` before touching `ctx.db`.',
      },
    },
    (context) => ({
      CallExpression(node: any) {
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
              const callName =
                child.callee?.type === 'Identifier'
                  ? child.callee.name
                  : child.callee?.property?.type === 'Identifier'
                    ? child.callee.property.name
                    : null
              if (callName === 'get' && isCtxDbGetCall(child)) {
                return
              }
            }
            if (!firstDbNode && child.type === 'MemberExpression') {
              if (
                child.parent?.type === 'MemberExpression' &&
                child.parent.parent?.type === 'CallExpression' &&
                child.parent.property?.type === 'Identifier' &&
                child.parent.property.name === 'get' &&
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
} as const
