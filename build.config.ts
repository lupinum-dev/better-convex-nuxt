import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  failOnWarn: false,
  entries: [
    'src/module',
    'src/cli.mts',
    'src/eslint/index',
    { builder: 'mkdist', input: 'src/runtime/args', outDir: 'dist/runtime/args' },
    { builder: 'mkdist', input: 'src/runtime/auth', outDir: 'dist/runtime/auth' },
    { builder: 'mkdist', input: 'src/runtime/composables', outDir: 'dist/runtime/composables' },
    { builder: 'mkdist', input: 'src/runtime/functions', outDir: 'dist/runtime/functions' },
    { builder: 'mkdist', input: 'src/runtime/schema', outDir: 'dist/runtime/schema' },
    {
      builder: 'mkdist',
      input: 'src/runtime/trusted-caller',
      outDir: 'dist/runtime/trusted-caller',
    },
    { builder: 'mkdist', input: 'src/runtime/mcp', outDir: 'dist/runtime/mcp' },
    { builder: 'mkdist', input: 'src/runtime/server', outDir: 'dist/runtime/server' },
    { builder: 'mkdist', input: 'src/runtime/testing', outDir: 'dist/runtime/testing' },
    { builder: 'mkdist', input: 'src/runtime/visibility', outDir: 'dist/runtime/visibility' },
  ],
})
