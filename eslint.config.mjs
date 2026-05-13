// @ts-check
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'
import { createJiti } from 'jiti'

const jiti = createJiti(import.meta.url)
const bcn =
  /** @type {typeof import('./src/eslint/index.ts')} */ (await jiti.import('./src/eslint/index.ts'))

// Run `npx @eslint/config-inspector` to inspect the resolved config interactively
export default createConfigForNuxt({
  features: {
    // Rules for module authors
    tooling: true,
    // Formatting is owned by oxfmt. Keep ESLint non-stylistic so the two tools
    // cannot rewrite the same files in different ways.
    stylistic: false,
  },
  dirs: {
    src: ['./apps/harness'],
  },
})
  .prepend(
    // Ignore the standalone docs app - it has its own eslint config.
    {
      ignores: ['apps/docs/**', '**/_generated/**'],
    },
  )
  .append(
    {
      ...bcn.default.configs.recommended,
      files: ['examples/**/*.{ts,vue}'],
    },
    {
      files: ['examples/**/*.{ts,vue}'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'vue/multi-word-component-names': 'off',
      },
    },
    {
      files: ['src/module.ts', 'src/runtime/**/*.ts', 'tests/**/*.ts'],
      languageOptions: {
        parserOptions: {
          project: [
            './tsconfig.eslint.json',
            './apps/harness/tsconfig.json',
            './apps/harness/server/tsconfig.json',
          ],
          tsconfigRootDir: import.meta.dirname,
        },
      },
      rules: {
        '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
      },
    },
    {
      files: ['src/runtime/auth/**/*.{ts,vue}', 'src/runtime/convex/**/*.{ts,vue}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '**/utils/observability',
                  '**/utils/observability.js',
                  '**/utils/observability/**',
                  '**/utils/runtime-observer',
                  '**/utils/runtime-observer.js',
                ],
                message:
                  'Auth and Convex must import observability from src/runtime/observability, not legacy utils paths.',
              },
            ],
          },
        ],
      },
    },
    {
      files: [
        'src/runtime/auth/composables/useConvexAuth.ts',
        'src/runtime/convex/composables/useConvexAction.ts',
        'src/runtime/convex/composables/useConvexConnectionState.ts',
        'src/runtime/convex/composables/useConvexMutation.ts',
        'src/runtime/convex/composables/useConvexPaginatedQuery.ts',
        'src/runtime/convex/composables/useConvexQuery.ts',
        'src/runtime/convex/composables/useConvexUpload.ts',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '../devtools/**',
                  '../../devtools/**',
                  '../utils/logger',
                  '../utils/logger.js',
                  '../../utils/logger',
                  '../../utils/logger.js',
                  '../utils/convex-cache',
                  '../utils/convex-cache.js',
                  '../../utils/convex-cache',
                  '../../utils/convex-cache.js',
                  '../shared/convex-cache',
                  '../shared/convex-cache.js',
                  '../../shared/convex-cache',
                  '../../shared/convex-cache.js',
                  '../auth/shared/auth-unauthorized',
                  '../auth/shared/auth-unauthorized.js',
                  '../../auth/shared/auth-unauthorized',
                  '../../auth/shared/auth-unauthorized.js',
                  '../query/live-query-resource',
                  '../query/live-query-resource.js',
                  '../shared/convex-call-state',
                  '../shared/convex-call-state.js',
                ],
                message:
                  'Public composables are facade entry points and must not import low-level runtime plumbing directly.',
              },
            ],
          },
        ],
      },
    },
    {
      files: [
        'src/runtime/composables/index.ts',
        'src/runtime/auth/index.ts',
        'src/runtime/functions/index.ts',
      ],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: 'ExportAllDeclaration',
            message: 'Public runtime barrels must enumerate exports explicitly.',
          },
        ],
      },
    },
    {
      files: ['src/runtime/composables/index.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector:
              'ExportNamedDeclaration[source.value=/^\\.\\.\\/auth\\/(?:client|internal|middleware|server|shared|ui)\\//]',
            message:
              'The composables barrel must not re-export auth internals; only public auth composables belong here.',
          },
          {
            selector:
              'ExportNamedDeclaration[source.value=/^\\.\\.\\/convex\\/(?:client|pagination|query|server|shared|upload)\\//]',
            message:
              'The composables barrel must not re-export low-level Convex runtime internals; only public composables belong here.',
          },
          {
            selector:
              'ExportNamedDeclaration[source.value=/^\\.\\.\\/(?:devtools|functions|identity-forwarding|mcp|observability|visibility)\\//]',
            message:
              'The composables barrel is a narrow public facade and must not re-export other runtime verticals.',
          },
        ],
      },
    },
    {
      files: ['src/runtime/auth/index.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector:
              'ExportNamedDeclaration[source.value=/^\\.\\/(?:client|composables|internal|middleware|server|shared|ui)\\//]',
            message:
              'The auth barrel must stay on public authoring primitives and must not re-export auth runtime internals.',
          },
        ],
      },
    },
    {
      files: ['src/runtime/functions/index.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector:
              'ExportNamedDeclaration[source.value=/^\\.\\.\\/(?:auth|composables|convex|devtools|identity-forwarding|mcp|observability|server|visibility)\\//]',
            message:
              'The functions barrel must not re-export other runtime verticals or private plumbing.',
          },
        ],
      },
    },
    {
      files: [
        'examples/**/convex/**/*.ts',
        'examples/**/server/**/*.ts',
        'apps/harness/convex/**/*.ts',
        'apps/harness/server/**/*.ts',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '**/src/runtime/auth',
                  '**/src/runtime/auth/**',
                  '**/src/runtime/functions',
                  '**/src/runtime/functions/**',
                  '**/src/runtime/composables',
                  '**/src/runtime/composables/**',
                ],
                message:
                  'Package-consumer app code must use @lupinum/trellis subpath imports instead of repo-local runtime paths.',
              },
            ],
          },
        ],
      },
    },
    {
      files: [
        'examples/**/convex/schema.ts',
        'examples/**/convex/components/**/schema.ts',
        'apps/harness/convex/schema.ts',
        'apps/harness/convex/components/**/schema.ts',
      ],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: 'ImportDeclaration[source.value=/^\\.\\/features$/]',
            message:
              'Schema entrypoints must not import aggregated ./features barrels. Import schema modules directly.',
          },
          {
            selector: 'ImportDeclaration[source.value=/^\\.\\/features\\/[^/]+(?:\\/index)?$/]',
            message:
              'Schema entrypoints must import ./features/*/schema directly, never a feature barrel.',
          },
        ],
      },
    },
    {
      files: ['apps/harness/middleware/**/*.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: 'CallExpression[callee.name="useConvexQuery"]',
            message:
              'useConvexQuery is setup-scope only. Use useConvexRpc/serverConvexQuery in middleware/plugins.',
          },
          {
            selector: 'CallExpression[callee.name="useConvexPaginatedQuery"]',
            message:
              'useConvexPaginatedQuery is setup-scope only. Use useConvexRpc/serverConvexQuery in middleware/plugins.',
          },
          {
            selector: 'CallExpression[callee.name="useRoute"]',
            message: 'Do not use useRoute() in middleware; use (to, from) arguments instead.',
          },
        ],
      },
    },
    {
      files: ['apps/harness/plugins/**/*.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: 'CallExpression[callee.name="useConvexQuery"]',
            message:
              'useConvexQuery is setup-scope only. Use useConvexRpc/serverConvexQuery in middleware/plugins.',
          },
          {
            selector: 'CallExpression[callee.name="useConvexPaginatedQuery"]',
            message:
              'useConvexPaginatedQuery is setup-scope only. Use useConvexRpc/serverConvexQuery in middleware/plugins.',
          },
        ],
      },
    },
    // Allow self-closing void elements (matches oxcformat behavior)
    {
      files: ['**/*.vue'],
      rules: {
        'vue/html-self-closing': [
          'warn',
          {
            html: {
              void: 'any', // Allow both <input> and <input />
              normal: 'always',
              component: 'always',
            },
            svg: 'always',
            math: 'always',
          },
        ],
      },
    },
    // Disable multi-word-component-names for Nuxt special files
    {
      files: [
        '**/error.vue',
        '**/layouts/**/*.vue',
        '**/pages/index.vue',
        '**/pages/**/index.vue',
        '**/pages/[[]...slug].vue',
      ],
      rules: {
        'vue/multi-word-component-names': 'off',
      },
    },
  )
