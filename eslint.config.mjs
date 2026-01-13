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
    ignores: ['demo/**', 'docs/**'],
  },
).append(
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
