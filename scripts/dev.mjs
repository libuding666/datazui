/**
 * 开发模式：一条命令同时拉起 API 服务与 Vite。
 *
 *   API  → http://127.0.0.1:4173  （Express + MySQL）
 *   Web  → http://127.0.0.1:5173  （Vite，/api 自动代理到上面）
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import url from 'node:url'

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..')

const targets = [
  { name: 'api', color: '\u001b[36m', args: ['server/index.mjs'] },
  { name: 'web', color: '\u001b[35m', args: ['node_modules/vite/bin/vite.js'] },
]

const children = targets.map(({ name, color, args }) => {
  const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  const prefix = `${color}[${name}]\u001b[0m `
  const pipe = (stream) => {
    stream.setEncoding('utf8')
    let buffer = ''
    stream.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) process.stdout.write(prefix + line + '\n')
    })
  }
  pipe(child.stdout)
  pipe(child.stderr)
  child.on('exit', (code) => {
    process.stdout.write(`${prefix}已退出（code ${code}）\n`)
    shutdown()
  })
  return child
})

let closing = false
function shutdown() {
  if (closing) return
  closing = true
  for (const child of children) child.kill()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
