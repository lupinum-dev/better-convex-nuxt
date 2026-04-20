/* eslint-disable @typescript-eslint/no-explicit-any -- ESLint parser AST nodes and fixers are intentionally handled loosely in this plugin layer. */
import {
  createRule,
  getObjectProperty,
  getSourceCode,
  isBooleanLiteral,
  isCallNamed,
  traverse,
} from '../shared.js'

export const mcpRules = {
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
      CallExpression(node: any) {
        if (!isCallNamed(node, 'defineTool')) return
        const options = node.arguments?.[0]
        if (options?.type !== 'ObjectExpression') return

        const scopedProperty = getObjectProperty(options, 'scoped')
        if (!scopedProperty || !isBooleanLiteral(scopedProperty.value, true)) return

        const authProperty = getObjectProperty(options, 'auth')
        const authValue =
          authProperty?.value?.type === 'Literal' ? authProperty.value.value : undefined
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
  'mcp-destructive-requires-preview': createRule(
    {
      type: 'suggestion',
      schema: [],
      messages: {
        preview: 'Destructive tools should define a `preview` handler.',
      },
    },
    (context) => ({
      CallExpression(node: any) {
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
      Property(node: any) {
        if ((node.key?.type === 'Identifier' ? node.key.name : null) !== 'middleware') return
        const fn = node.value
        if (fn?.type !== 'ArrowFunctionExpression' && fn?.type !== 'FunctionExpression') return

        const returnsNext = (() => {
          if (fn.body?.type === 'CallExpression' && isCallNamed(fn.body, 'next')) return true
          if (fn.body?.type === 'AwaitExpression' && isCallNamed(fn.body.argument, 'next')) {
            return true
          }
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
} as const
