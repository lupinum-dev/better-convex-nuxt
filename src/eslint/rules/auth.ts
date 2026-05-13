/* eslint-disable @typescript-eslint/no-explicit-any -- ESLint parser AST nodes and fixers are intentionally handled loosely in this plugin layer. */
import {
  createRule,
  getActorDeclaration,
  getCallName,
  getHandlerFunction,
  getHandlerOptionsObject,
  getObjectProperty,
  hasProtectedStructuredGuard,
  hasUnsafeAppIdentityCheck,
  isBuilderCall,
  isCtxDbGetCall,
  isNullGuardStatement,
  statementContainsCall,
  statementContainsProtectedActorAccess,
  traverse,
} from '../shared.js'

export const authRules = {
  'appIdentity-access-after-enforce': createRule(
    {
      type: 'problem',
      schema: [],
      messages: {
        access:
          'Do not access appIdentity fields before `enforce()` / `requireAuth()` narrows the appIdentity.',
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
  'check-handles-null-appIdentity': createRule(
    {
      type: 'problem',
      schema: [],
      messages: {
        unsafe:
          'AppIdentity check functions should handle `null` actors before reading appIdentity fields.',
      },
    },
    (context) => ({
      Property(node: any) {
        const keyName = node.key?.type === 'Identifier' ? node.key.name : null
        if (keyName !== 'check') return
        if (
          (node.value?.type === 'ArrowFunctionExpression' ||
            node.value?.type === 'FunctionExpression') &&
          hasUnsafeAppIdentityCheck(node.value, context)
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
            hasUnsafeAppIdentityCheck(checkArg, context)
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
        if (!isBuilderCall(node, 'unsafe', 'query', 'mutation')) return
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
  'guard-no-db': createRule(
    {
      type: 'problem',
      schema: [],
      messages: {
        pure: 'Structured `guard` must stay synchronous and DB-free. Move record loading into `load` and record-bound checks into `authorize`.',
      },
    },
    (context) => ({
      CallExpression(node: any) {
        const bareBuilderName = getCallName(node.callee)
        const isStructuredBuilder =
          bareBuilderName === 'query' ||
          bareBuilderName === 'mutation' ||
          isBuilderCall(node, 'query', 'protected') ||
          isBuilderCall(node, 'mutation', 'protected') ||
          isBuilderCall(node, 'unsafe', 'query', 'mutation')
        if (!isStructuredBuilder) return
        const options = getHandlerOptionsObject(node)
        const guard = getObjectProperty(options, 'guard')?.value
        if (
          !guard ||
          (guard.type !== 'ArrowFunctionExpression' && guard.type !== 'FunctionExpression')
        ) {
          return
        }

        let violationNode: any | null = null
        traverse(guard.body, (child) => {
          if (violationNode) return
          if (child.type === 'AwaitExpression') {
            violationNode = child
            return
          }
          if (
            child.type === 'MemberExpression' &&
            child.object?.type === 'MemberExpression' &&
            child.object.object?.type === 'Identifier' &&
            child.object.object.name === 'ctx' &&
            child.object.property?.type === 'Identifier' &&
            child.object.property.name === 'db'
          ) {
            violationNode = child
          }
        })

        if (violationNode) {
          context.report({
            node: violationNode,
            messageId: 'pure',
          })
        }
      },
    }),
  ),
} as const
