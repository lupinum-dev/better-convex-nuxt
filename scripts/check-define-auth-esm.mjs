import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const distAuthPath = resolve(process.cwd(), 'dist/runtime/auth/define-auth.mjs')
const distAuthUrl = pathToFileURL(distAuthPath).href

const smokeSource = `
  import { defineAuth } from ${JSON.stringify(distAuthUrl)}

  const deps = {
    components: { betterAuth: {} },
    internal: { auth: {} },
    mutation: (definition) => definition,
    authConfig: {},
  }

  const result = defineAuth(deps)

  if (!result || typeof result.createAuth !== 'function') {
    throw new Error('defineAuth ESM smoke check failed: invalid return shape.')
  }
`

execFileSync(process.execPath, ['--input-type=module', '--eval', smokeSource], {
  stdio: 'inherit',
})
