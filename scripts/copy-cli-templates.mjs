import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const deletedLegacyDirs = [
  resolve(rootDir, 'dist/templates'),
  resolve(rootDir, 'dist/cli/templates'),
]
const copyPairs = [
  {
    sourceDir: resolve(rootDir, 'src/cli/starter-fixtures'),
    destDirs: [
      resolve(rootDir, 'dist/starter-fixtures'),
      resolve(rootDir, 'dist/cli/starter-fixtures'),
    ],
  },
  {
    sourceDir: resolve(rootDir, 'src/cli/add-fixtures'),
    destDirs: [resolve(rootDir, 'dist/add-fixtures'), resolve(rootDir, 'dist/cli/add-fixtures')],
  },
]

for (const legacyDir of deletedLegacyDirs) {
  rmSync(legacyDir, { force: true, recursive: true })
}

function copyDirectoryAtomically(sourceDir, destDir) {
  const parentDir = dirname(destDir)
  const uniqueSuffix = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`
  const tempDir = resolve(parentDir, `.${basename(destDir)}.${uniqueSuffix}.tmp`)
  const backupDir = resolve(parentDir, `.${basename(destDir)}.${uniqueSuffix}.old`)

  rmSync(tempDir, { force: true, recursive: true })
  rmSync(backupDir, { force: true, recursive: true })
  mkdirSync(tempDir, { recursive: true })
  for (const entry of readdirSync(sourceDir)) {
    cpSync(resolve(sourceDir, entry), resolve(tempDir, entry), { recursive: true })
  }

  try {
    renameSync(destDir, backupDir)
  } catch (error) {
    if (!error || typeof error !== 'object' || error.code !== 'ENOENT') {
      throw error
    }
  }

  try {
    renameSync(tempDir, destDir)
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      (error.code === 'EEXIST' || error.code === 'ENOTEMPTY')
    ) {
      rmSync(tempDir, { force: true, recursive: true })
      rmSync(backupDir, { force: true, recursive: true })
      return
    }
    throw error
  }
  rmSync(backupDir, { force: true, recursive: true })
}

for (const { sourceDir, destDirs } of copyPairs) {
  if (!existsSync(sourceDir)) {
    throw new Error(`Missing CLI fixture source directory: ${sourceDir}`)
  }

  for (const destDir of destDirs) {
    copyDirectoryAtomically(sourceDir, destDir)
  }
}
