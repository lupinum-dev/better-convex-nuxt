/* eslint-disable @typescript-eslint/no-explicit-any -- ESLint parser AST nodes and fixers are intentionally handled loosely in this plugin layer. */
import { existsSync } from 'node:fs'
import { dirname, normalize, relative, resolve, sep } from 'node:path'

import { findProjectRoot } from '../../analysis/project.js'
import {
  createImportBoundaryRule,
  createRule,
  getFilename,
  getHandlerFunction,
  getLiteralValue,
  getObjectProperty,
  getSourceCode,
  hasTenantCollectionMethod,
  isBuilderCall,
  isCallNamed,
  isNullishBooleanLiteral,
  traverse,
  unwindCallChain,
} from '../shared.js'

function toPortablePath(path: string): string {
  return normalize(path).replaceAll('\\', '/')
}

function findFeatureBoundaryRoot(filename: string): string | null {
  const portable = toPortablePath(filename)
  const featuresMarker = '/features/'
  const featuresIndex = portable.lastIndexOf(featuresMarker)
  if (featuresIndex >= 0) {
    return portable.slice(0, featuresIndex)
  }

  const projectRoot = findProjectRoot(filename)
  if (!projectRoot) return null

  let cursor = dirname(filename)
  const normalizedProjectRoot = normalize(projectRoot)
  while (cursor.startsWith(normalizedProjectRoot)) {
    if (existsSync(resolve(cursor, 'features'))) {
      return toPortablePath(cursor)
    }
    const parent = dirname(cursor)
    if (parent === cursor) break
    cursor = parent
  }

  return null
}

function resolveImportTarget(filename: string, importSource: string): string | null {
  if (!importSource) return null

  if (importSource.startsWith('.')) {
    return toPortablePath(resolve(dirname(filename), importSource))
  }

  const projectRoot = findProjectRoot(filename)
  if (!projectRoot) return null

  if (importSource.startsWith('~/') || importSource.startsWith('@/')) {
    return toPortablePath(resolve(projectRoot, importSource.slice(2)))
  }

  return null
}

function getFeatureInfo(path: string, boundaryRoot: string) {
  const relativePath = relative(boundaryRoot, path).replaceAll(sep, '/')
  if (relativePath.startsWith('..')) return null
  if (/^features\/index(?:\.[^/]+)?$/u.test(relativePath)) return null
  const match = relativePath.match(/^features\/([^/]+)(?:\/(.*))?$/u)
  if (!match) return null

  return {
    featureName: match[1]!,
    internalPath: match[2] ?? '',
  }
}

function isFeatureBarrelImport(featureInfo: { internalPath: string } | null): boolean {
  if (!featureInfo) return false
  return featureInfo.internalPath === '' || /^index(?:\.[^/]+)?$/u.test(featureInfo.internalPath)
}

function isFeatureOwnedTestFile(path: string, featureName: string, boundaryRoot: string): boolean {
  const info = getFeatureInfo(path, boundaryRoot)
  if (!info || info.featureName !== featureName) return false
  return /(?:^|\/)tests?(?:\.[^/]+)?$/u.test(info.internalPath)
}

function isSchemaEntryFile(relativeFilename: string): boolean {
  return (
    /(?:^|\/)schema(?:\.[^/]+)?$/u.test(relativeFilename) &&
    !relativeFilename.startsWith('features/')
  )
}

function createFeatureBoundaryRule() {
  return createRule(
    {
      type: 'problem',
      schema: [],
      messages: {
        shellFeatureInternal:
          'Shell code may import feature barrels, but not feature internals. Import `features/<name>/index` instead.',
        featureDeepImport:
          'Cross-feature imports must go through `features/<name>/index`, not feature internals.',
      },
    },
    (context) => ({
      ImportDeclaration(node: any) {
        const filename = getFilename(context)
        const boundaryRoot = findFeatureBoundaryRoot(filename)
        if (!boundaryRoot) return

        const importSource = getLiteralValue(node.source)
        if (typeof importSource !== 'string') return
        const target = resolveImportTarget(filename, importSource)
        if (!target) return

        const relativeFilename = relative(boundaryRoot, toPortablePath(filename)).replaceAll(
          sep,
          '/',
        )
        const isFeatureManifestFile = /^features\/index(?:\.[^/]+)?$/u.test(relativeFilename)
        const isSchemaShellFile = isSchemaEntryFile(relativeFilename)

        const currentFeature = getFeatureInfo(toPortablePath(filename), boundaryRoot)
        const targetFeature = getFeatureInfo(target, boundaryRoot)
        if (!targetFeature) return

        if (!currentFeature) {
          if (isFeatureManifestFile && /^feature(?:\.[^/]+)?$/u.test(targetFeature.internalPath)) {
            return
          }
          if (isSchemaShellFile && /^schema(?:\.[^/]+)?$/u.test(targetFeature.internalPath)) {
            return
          }
          if (!isFeatureBarrelImport(targetFeature)) {
            context.report({
              node: node.source,
              messageId: 'shellFeatureInternal',
            })
          }
          return
        }

        if (currentFeature.featureName === targetFeature.featureName) {
          return
        }

        if (
          isFeatureOwnedTestFile(toPortablePath(filename), currentFeature.featureName, boundaryRoot)
        ) {
          return
        }

        if (!isFeatureBarrelImport(targetFeature)) {
          context.report({
            node: node.source,
            messageId: 'featureDeepImport',
          })
        }
      },
    }),
  )
}

export const boundaryRules = {
  'feature-boundaries': createFeatureBoundaryRule(),
  'shared-features-runtime-neutral': createImportBoundaryRule({
    pathMatcher: (filename) => /[/\\]shared[/\\]features[/\\]/u.test(filename),
    importMatcher: (source) =>
      source === '#app' ||
      source === '#imports' ||
      source === 'vue' ||
      source === 'nuxt' ||
      source.startsWith('@nuxt/') ||
      source === 'convex/server' ||
      source.startsWith('convex/server') ||
      source.startsWith('convex/_generated'),
    message:
      'Files under `shared/features/` are runtime-neutral contract artifacts and must not import Vue, Nuxt, or Convex server modules.',
  }),
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
      /^(?:~|@)\/(?:pages|components|server)\//u.test(source) ||
      /^(?:\.\.\/)+(?:pages|components|server)\//u.test(source),
    message:
      'Files under `convex/` must not import Nuxt, Vue, or app runtime modules such as pages/components/server.',
  }),
  'prefer-app-query-over-unsafe': createRule(
    {
      type: 'suggestion',
      schema: [],
      messages: {
        prefer:
          'Prefer `query(...)` / `mutation(...)` over `unsafe.query(...)` / `unsafe.mutation(...)` unless the file is an intentional escape hatch.',
      },
    },
    (context) => ({
      CallExpression(node: any) {
        const filename = getFilename(context)
        if (!/[/\\]convex[/\\]/u.test(filename)) return
        if (/(?:^|[/\\])(?:auth|http|webhooks?)\./u.test(filename)) return
        if (!isBuilderCall(node, 'unsafe', 'query', 'mutation')) return
        context.report({
          node,
          messageId: 'prefer',
        })
      },
    }),
  ),
  'unsafe-requires-permit': createRule(
    {
      type: 'problem',
      schema: [],
      messages: {
        permit:
          'Unsafe handlers must declare `permit: unsafe.permit(...)` so the escape hatch is explicit in review.',
      },
    },
    (context) => ({
      CallExpression(node: any) {
        if (
          !isBuilderCall(
            node,
            'unsafe',
            'query',
            'mutation',
            'action',
            'internalQuery',
            'internalMutation',
          )
        ) {
          return
        }

        const options = node.arguments?.[0]
        if (options?.type !== 'ObjectExpression') {
          context.report({
            node,
            messageId: 'permit',
          })
          return
        }

        const permit = getObjectProperty(options, 'permit')?.value
        if (permit) return

        context.report({
          node: options,
          messageId: 'permit',
        })
      },
    }),
  ),
  'unsafe-query-collection-requires-index': createRule(
    {
      type: 'problem',
      schema: [],
      messages: {
        indexed:
          'Collection reads inside `unsafe.query(...)` should use `.withIndex(...)` before collecting results.',
      },
    },
    (context) => ({
      CallExpression(node: any) {
        if (!isBuilderCall(node, 'unsafe', 'query')) return
        const handler = getHandlerFunction(node)
        if (!handler || handler.body?.type !== 'BlockStatement') return

        traverse(handler.body, (child) => {
          if (child.type !== 'CallExpression') return
          const chain = unwindCallChain(child)
          const queryStep = chain.find((entry) => isCallNamed(entry.node, 'query'))
          if (!queryStep) return

          const lastStep = chain[chain.length - 1]
          if (!lastStep || !hasTenantCollectionMethod(lastStep.name)) return
          if (chain.some((entry) => entry.name === 'withIndex')) return

          context.report({
            node: queryStep.node,
            messageId: 'indexed',
          })
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
} as const
