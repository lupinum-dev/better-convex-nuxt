import { cp, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../../../../../', import.meta.url))
export const exactCallSourceFixture = fileURLToPath(new URL('./fixture', import.meta.url))
const canonicalSource = fileURLToPath(new URL('./canonical-convex.ts', import.meta.url))
const proofSource = fileURLToPath(new URL('./service-call-proof.ts', import.meta.url))
const managedEnvironmentNames = [
  'CONVEX_DEPLOYMENT',
  'CONVEX_E2E_AUTO_START',
  'CONVEX_SITE_URL',
  'CONVEX_URL',
  'NUXT_PUBLIC_CONVEX_SITE_URL',
  'NUXT_PUBLIC_CONVEX_URL',
] as const

export function enterExactCallLocalEnvironment(): () => void {
  const saved = new Map<string, string | undefined>()
  for (const name of managedEnvironmentNames) {
    saved.set(name, process.env[name])
    Reflect.deleteProperty(process.env, name)
  }
  process.env.CONVEX_E2E_AUTO_START = 'true'
  return () => {
    for (const [name, value] of saved) {
      if (value === undefined) Reflect.deleteProperty(process.env, name)
      else process.env[name] = value
    }
  }
}

export async function exactCallVerifierJwk(key: CryptoKey): Promise<JsonWebKey> {
  return {
    ...(await crypto.subtle.exportKey('jwk', key)),
    alg: 'EdDSA',
    key_ops: ['verify'],
    use: 'sig',
  }
}

export async function materializeExactCallFixture(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'better-convex-vnext-exact-call-'))
  await cp(exactCallSourceFixture, directory, { recursive: true })
  await cp(canonicalSource, path.join(directory, 'convex', 'canonical_convex.ts'))
  const proof = (await readFile(proofSource, 'utf8')).replace(
    "from './canonical-convex'",
    "from './canonical_convex'",
  )
  await writeFile(path.join(directory, 'convex', 'service_call_proof.ts'), proof, 'utf8')
  await symlink(
    path.join(repositoryRoot, 'node_modules'),
    path.join(directory, 'node_modules'),
    'dir',
  )
  return directory
}
