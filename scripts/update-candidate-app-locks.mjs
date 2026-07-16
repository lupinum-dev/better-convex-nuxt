#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { maintainedCandidateApps } from './maintained-candidate-apps.mjs'

const repoRoot = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2).filter((argument) => argument !== '--')
if (args.length !== 2 || args[0] !== '--tarball') {
  console.error('Usage: pnpm update:candidate-app-locks -- --tarball <better-convex-nuxt.tgz>')
  process.exit(1)
}

const tarballPath = resolve(repoRoot, args[1])
if (!existsSync(tarballPath)) {
  console.error(`Candidate tarball does not exist: ${tarballPath}`)
  process.exit(1)
}

const tarball = readFileSync(tarballPath)
const packageJson = JSON.parse(
  execFileSync('tar', ['-xOf', tarballPath, 'package/package.json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }),
)
const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`
const originalLocks = new Map(
  maintainedCandidateApps.map(({ path: directory }) => {
    const lockPath = join(repoRoot, directory, 'pnpm-lock.yaml')
    return [lockPath, readFileSync(lockPath, 'utf8')]
  }),
)
const updatedLocks = new Map()

function runPnpm(directory, registry, frozen) {
  return new Promise((resolvePromise, reject) => {
    const installArgs = frozen
      ? ['install', '--frozen-lockfile', '--ignore-scripts']
      : ['install', '--lockfile-only', '--no-frozen-lockfile', '--ignore-scripts']
    console.log(`\n> pnpm ${installArgs.join(' ')} (${directory})`)
    const child = spawn('pnpm', installArgs, {
      cwd: resolve(repoRoot, directory),
      env: { ...process.env, npm_config_registry: registry },
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`pnpm exited with ${signal ?? code} for ${directory}`))
    })
  })
}

function transformCandidateResolution(lock, replacementBlocks) {
  const lines = lock.split('\n')
  const output = []
  const blocks = {}
  const removed = { importers: 0, packages: 0, snapshots: 0 }
  let section

  for (let index = 0; index < lines.length;) {
    const line = lines[index]
    if (/^\S.*:$/.test(line)) section = line.slice(0, -1)

    const indent =
      section === 'importers' && line === `      ${packageJson.name}:`
        ? 6
        : (section === 'packages' || section === 'snapshots') &&
            line.startsWith(`  ${packageJson.name}@`) &&
            line.endsWith(':')
          ? 2
          : undefined

    if (indent === undefined) {
      output.push(line)
      index += 1
      continue
    }

    const blockStart = index
    index += 1
    while (
      index < lines.length &&
      lines[index].trim() !== '' &&
      lines[index].length - lines[index].trimStart().length > indent
    ) {
      index += 1
    }
    removed[section] += 1
    blocks[section] = lines.slice(blockStart, index).join('\n')
    if (replacementBlocks) output.push(...replacementBlocks[section].split('\n'))
  }

  for (const [sectionName, count] of Object.entries(removed)) {
    if (count !== 1) {
      throw new Error(`Expected one ${packageJson.name} block in ${sectionName}; found ${count}`)
    }
  }
  return { blocks, lock: output.join('\n') }
}

let registry
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', registry)
    if (url.pathname === `/${packageJson.name}`) {
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          name: packageJson.name,
          'dist-tags': { latest: packageJson.version },
          versions: {
            [packageJson.version]: {
              ...packageJson,
              dist: {
                integrity,
                tarball: `${registry}${packageJson.name}/-/${packageJson.name}-${packageJson.version}.tgz`,
              },
            },
          },
        }),
      )
      return
    }
    if (url.pathname === `/${packageJson.name}/-/${packageJson.name}-${packageJson.version}.tgz`) {
      response.setHeader('content-type', 'application/octet-stream')
      response.end(tarball)
      return
    }

    await new Promise((resolvePromise, reject) => {
      const upstreamRequest = httpsRequest(
        {
          headers: { accept: request.headers.accept ?? '*/*' },
          hostname: 'registry.npmjs.org',
          method: 'GET',
          path: `${url.pathname}${url.search}`,
          protocol: 'https:',
        },
        (upstreamResponse) => {
          response.statusCode = upstreamResponse.statusCode ?? 502
          for (const [name, value] of Object.entries(upstreamResponse.headers)) {
            if (
              value !== undefined &&
              !['content-encoding', 'content-length', 'transfer-encoding'].includes(name)
            ) {
              response.setHeader(name, value)
            }
          }
          upstreamResponse.on('error', reject)
          upstreamResponse.on('end', resolvePromise)
          upstreamResponse.pipe(response)
        },
      )
      upstreamRequest.on('error', reject)
      upstreamRequest.end()
    })
  } catch {
    response.statusCode = 502
    response.end('Upstream registry request failed')
  }
})

await new Promise((resolvePromise, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolvePromise)
})
const address = server.address()
if (!address || typeof address === 'string') {
  server.close()
  throw new Error('Could not determine the temporary registry port')
}
registry = `http://127.0.0.1:${address.port}/`
const validationRoot = mkdtempSync(join(tmpdir(), 'bcn-candidate-locks-'))

try {
  for (const { path: directory } of maintainedCandidateApps) {
    const lockPath = join(repoRoot, directory, 'pnpm-lock.yaml')
    const previousLock = readFileSync(lockPath, 'utf8')
    const lockWithoutCandidate = transformCandidateResolution(previousLock).lock
    const validationDir = join(validationRoot, directory)
    mkdirSync(validationDir, { recursive: true })
    for (const filename of ['package.json', 'pnpm-workspace.yaml']) {
      const sourcePath = join(repoRoot, directory, filename)
      if (existsSync(sourcePath)) copyFileSync(sourcePath, join(validationDir, filename))
    }
    const validationLockPath = join(validationDir, 'pnpm-lock.yaml')
    writeFileSync(validationLockPath, lockWithoutCandidate)
    await runPnpm(validationDir, registry, false)
    const lock = readFileSync(validationLockPath, 'utf8')
    // Requests proxied through the temporary registry otherwise make pnpm
    // spell every ordinary npm resolution with a redundant explicit tarball
    // URL. Strip only that default-registry noise; integrity hashes remain.
    const normalizedLock = lock.replace(/, tarball: https:\/\/registry\.npmjs\.org\/[^\n]+\}/g, '}')
    if (
      !normalizedLock.includes(
        `\n  ${packageJson.name}@${packageJson.version}:\n    resolution: {integrity: ${integrity}}`,
      )
    ) {
      throw new Error(`${directory}/pnpm-lock.yaml did not adopt the candidate integrity`)
    }
    const refreshedBlocks = transformCandidateResolution(normalizedLock).blocks
    const mergedLock = transformCandidateResolution(previousLock, refreshedBlocks).lock
    writeFileSync(validationLockPath, mergedLock)
    await runPnpm(validationDir, registry, true)
    if (readFileSync(validationLockPath, 'utf8') !== mergedLock) {
      throw new Error(`${directory}/pnpm-lock.yaml changed during frozen validation`)
    }
    updatedLocks.set(lockPath, mergedLock)
  }
  for (const [lockPath, updatedLock] of updatedLocks) writeFileSync(lockPath, updatedLock)
  console.log(
    `\nUpdated ${maintainedCandidateApps.length} candidate app lockfiles from ${tarballPath}.`,
  )
} catch (error) {
  for (const [lockPath, originalLock] of originalLocks) {
    writeFileSync(lockPath, originalLock)
  }
  throw error
} finally {
  await new Promise((resolvePromise) => {
    server.close(resolvePromise)
    server.closeAllConnections()
  })
  rmSync(validationRoot, { recursive: true, force: true })
}
