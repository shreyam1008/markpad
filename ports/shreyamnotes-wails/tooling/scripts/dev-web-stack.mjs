import { spawn } from 'node:child_process'

const children = []
let shuttingDown = false

function run(name, args) {
  const child = spawn(name, args, {
    stdio: 'inherit',
    shell: true,
    env: process.env
  })
  children.push(child)
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    shuttingDown = true
    for (const other of children) {
      if (other.pid && other.pid !== child.pid) {
        other.kill('SIGTERM')
      }
    }
    if (signal) process.kill(process.pid, signal)
    process.exit(code ?? 0)
  })
  return child
}

function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (child.pid) child.kill('SIGTERM')
  }
  setTimeout(() => {
    for (const child of children) {
      if (child.pid) child.kill('SIGKILL')
    }
  }, 1500).unref()
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

console.log('Starting ShreyamNotes web dev stack:')
console.log('  - server: bun run dev:server')
console.log('  - web:    bun run dev:web')

run('bun', ['run', 'dev:server'])
run('bun', ['run', 'dev:web'])
