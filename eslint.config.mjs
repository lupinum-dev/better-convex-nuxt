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
    src: ['./test/internal-harness'],
  },
})
  .prepend(
    // Ignore demo and docs folders - they have their own eslint configs
    {
      ignores: ['demo/**', 'docs/**', '**/convex/_generated/**'],
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
      files: ['src/module.ts', 'src/runtime/**/*.ts', 'test/**/*.ts'],
      languageOptions: {
        parserOptions: {
          project: [
            './tsconfig.eslint.json',
            './test/internal-harness/tsconfig.json',
            './test/internal-harness/server/tsconfig.json',
          ],
          tsconfigRootDir: import.meta.dirname,
        },
      },
      rules: {
        '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
      },
    },
    {
      files: ['test/internal-harness/middleware/**/*.ts'],
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
      files: ['test/internal-harness/plugins/**/*.ts'],
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
