import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = resolve(rootDir, 'src/cli/templates')
const destDirs = [resolve(rootDir, 'dist/templates'), resolve(rootDir, 'dist/cli/templates')]

if (!existsSync(sourceDir)) {
  throw new Error(`Missing CLI template source directory: ${sourceDir}`)
}

for (const destDir of destDirs) {
  mkdirSync(destDir, { recursive: true })
  cpSync(sourceDir, destDir, { recursive: true })
}
