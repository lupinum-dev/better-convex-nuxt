// @ts-check
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

// Run `npx @eslint/config-inspector` to inspect the resolved config interactively
export default createConfigForNuxt({
  features: {
    // Rules for module authors
    tooling: true,
    // Rules for formatting
    stylistic: false,
  },
  dirs: {
    src: ['./playground'],
  },
}).prepend(
  // Ignore demo and docs folders - they have their own eslint configs
  {
    ignores: ['demo/**', 'docs/**', '**/convex/_generated/**'],
  },
).append(
  {
    files: ['src/module.ts', 'src/runtime/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
    },
  },
  {
    files: ['playground/middleware/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          selector: 'CallExpression[callee.name="useConvexQuery"]',
          message: 'useConvexQuery is setup-scope only. Use useConvexRpc/serverConvexQuery in middleware/plugins.',
        },
        {
          selector: 'CallExpression[callee.name="useConvexPaginatedQuery"]',
          message: 'useConvexPaginatedQuery is setup-scope only. Use useConvexRpc/serverConvexQuery in middleware/plugins.',
        },
        {
          selector: 'CallExpression[callee.name="useRoute"]',
          message: 'Do not use useRoute() in middleware; use (to, from) arguments instead.',
        },
      ],
    },
  },
  {
    files: ['playground/plugins/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          selector: 'CallExpression[callee.name="useConvexQuery"]',
          message: 'useConvexQuery is setup-scope only. Use useConvexRpc/serverConvexQuery in middleware/plugins.',
        },
        {
          selector: 'CallExpression[callee.name="useConvexPaginatedQuery"]',
          message: 'useConvexPaginatedQuery is setup-scope only. Use useConvexRpc/serverConvexQuery in middleware/plugins.',
        },
      ],
    },
  },
  // Allow self-closing void elements (matches oxcformat behavior)
  {
    files: ['**/*.vue'],
    rules: {
      'vue/html-self-closing': ['warn', {
        html: {
          void: 'any', // Allow both <input> and <input />
          normal: 'always',
          component: 'always',
        },
        svg: 'always',
        math: 'always',
      }],
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
