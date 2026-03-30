import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  failOnWarn: false,
  entries: [
    'src/module',
    { builder: 'mkdist', input: 'src/runtime/auth', outDir: 'dist/runtime/auth' },
    { builder: 'mkdist', input: 'src/runtime/composables', outDir: 'dist/runtime/composables' },
    { builder: 'mkdist', input: 'src/runtime/schema', outDir: 'dist/runtime/schema' },
    { builder: 'mkdist', input: 'src/runtime/mcp', outDir: 'dist/runtime/mcp' },
    { builder: 'mkdist', input: 'src/runtime/server', outDir: 'dist/runtime/server' },
    { builder: 'mkdist', input: 'src/runtime/testing', outDir: 'dist/runtime/testing' },
  ],
})
