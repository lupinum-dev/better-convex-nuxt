/* eslint-disable @typescript-eslint/no-explicit-any -- ESLint parser AST nodes and fixers are intentionally handled loosely in this plugin layer. */
import {
  createImportBoundaryRule,
  createRule,
  getFilename,
  getObjectProperty,
  getSourceCode,
  isBuilderCall,
  isCallNamed,
  isNullishBooleanLiteral,
  traverse,
} from '../shared.js'

export const boundaryRules = {
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
  'prefer-app-query-over-raw': createRule(
    {
      type: 'suggestion',
      schema: [],
      messages: {
        prefer:
          'Prefer `query(...)` / `mutation(...)` over `raw.query(...)` / `raw.mutation(...)` unless the file is an intentional escape hatch.',
      },
    },
    (context) => ({
      CallExpression(node: any) {
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
  'server-convex-auth-explicit': createRule(
    {
      type: 'suggestion',
      schema: [],
      messages: {
        explicit: 'Pass an explicit `{ auth: ... }` option to server-side Convex helpers.',
      },
    },
    (context) => ({
      CallExpression(node: any) {
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
      VariableDeclarator(node: any) {
        const init = node.init
        if (!isCallNamed(init, 'useConvexQuery', 'useConvexPaginatedQuery', 'useCachedQuery')) {
          return
        }
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
      CallExpression(node: any) {
        if (!isCallNamed(node, 'useConvexQuery')) return
        const argsNode = node.arguments?.[1]
        if (!argsNode) return
        if (isCallNamed(argsNode, 'computed')) return
        if (argsNode.type !== 'ObjectExpression' && argsNode.type !== 'ConditionalExpression') {
          return
        }

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
  'no-owner-id-as-document-id': createRule(
    {
      type: 'problem',
      schema: [],
      messages: {
        invalid: "`ownerId` must use `v.string()`, not `v.id('users')`.",
      },
    },
    (context) => ({
      Property(node: any) {
        const filename = getFilename(context)
        if (!filename.endsWith('/schema.ts') && !filename.endsWith('\\schema.ts')) return
        const propertyName =
          node.key?.type === 'Identifier'
            ? node.key.name
            : node.key?.type === 'Literal' && typeof node.key.value === 'string'
              ? node.key.value
              : null
        if (propertyName !== 'ownerId') return
        const value = node.value
        if (
          value?.type === 'CallExpression' &&
          value.callee?.type === 'MemberExpression' &&
          value.callee.object?.type === 'Identifier' &&
          value.callee.object.name === 'v' &&
          value.callee.property?.type === 'Identifier' &&
          value.callee.property.name === 'id' &&
          value.arguments?.[0]?.type === 'Literal' &&
          value.arguments[0].value === 'users'
        ) {
          context.report({
            node: value,
            messageId: 'invalid',
          })
        }
      },
    }),
  ),
} as const
