import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { snapshotGeneratedDir } from '../support/e2e/managed-convex'

let tempRoot: string | null = null

async function createGeneratedFixture(): Promise<string> {
  tempRoot = await mkdtemp(path.join(tmpdir(), 'trellis-generated-restore-'))
  const generatedDir = path.join(tempRoot, 'convex/_generated')
  await mkdir(generatedDir, { recursive: true })
  await writeFile(path.join(generatedDir, 'api.d.ts'), 'original api\n')
  await writeFile(path.join(generatedDir, 'server.js'), 'original server\n')
  await mkdir(path.join(tempRoot, 'convex/other'), { recursive: true })
  await writeFile(path.join(tempRoot, 'convex/other/user-file.ts'), 'keep me\n')
  return tempRoot
}

describe('managed Convex generated restore', () => {
  afterEach(async () => {
    if (tempRoot) await rm(tempRoot, { force: true, recursive: true })
    tempRoot = null
  })

  it('restores changed generated files and removes unexpected generated files only', async () => {
    const cwd = await createGeneratedFixture()
    const restore = await snapshotGeneratedDir(cwd)
    const generatedDir = path.join(cwd, 'convex/_generated')

    await writeFile(path.join(generatedDir, 'api.d.ts'), 'changed api\n')
    await writeFile(path.join(generatedDir, 'new-file.js'), 'generated during e2e\n')
    await writeFile(path.join(cwd, 'convex/other/user-file.ts'), 'keep changed user file\n')

    await restore()

    await expect(readFile(path.join(generatedDir, 'api.d.ts'), 'utf8')).resolves.toBe(
      'original api\n',
    )
    await expect(readFile(path.join(generatedDir, 'server.js'), 'utf8')).resolves.toBe(
      'original server\n',
    )
    await expect(readFile(path.join(generatedDir, 'new-file.js'), 'utf8')).rejects.toThrow()
    await expect(readFile(path.join(cwd, 'convex/other/user-file.ts'), 'utf8')).resolves.toBe(
      'keep changed user file\n',
    )
  })
})
