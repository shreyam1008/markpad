import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..', '..')
const webDistIndex = resolve(repoRoot, 'apps/web/dist/index.html')
const bunCommand = process.platform === 'win32' ? 'bun.exe' : 'bun'

async function fileExists(path) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function run(command, args, cwd = repoRoot, options = {}) {
  const shell = options.shell ?? false
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell
    })
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      rejectPromise(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`))
    })
    child.on('error', rejectPromise)
  })
}

if (!(await fileExists(webDistIndex))) {
  await run(bunCommand, ['--filter', '@zennotes/web', 'build'], repoRoot, {
    shell: process.platform === 'win32'
  })
}

await run(process.execPath, [resolve(repoRoot, 'tooling/scripts/sync-web-dist.mjs')])
