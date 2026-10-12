/**
 * 本地服务入口
 *
 * 启动：node server/index.mjs   （或 npm run start / npm run dev）
 *
 * 部署到 Vercel 时不会用到这个文件，Serverless 入口是 api/[...path].mjs。
 */

import http from 'node:http'
import path from 'node:path'
import url from 'node:url'

import { createApp } from './app.mjs'
import { config, connSummary } from './config.mjs'
import { initDatabase, explainDbError } from './db.mjs'

const here = path.dirname(url.fileURLToPath(import.meta.url))
const DIST = path.resolve(here, '../dist')

/** 端口被占时自动往后顺延，最多试 10 个 */
function listenWithRetry(app, startPort, host, attempts = 10) {
  return new Promise((resolve, reject) => {
    let port = startPort

    const tryListen = (round) => {
      const server = http.createServer(app)

      server.once('error', (error) => {
        server.close()
        if (error?.code === 'EADDRINUSE' && round < attempts) {
          console.warn(`[api] 端口 ${port} 已被占用（可能已有一个打他嘴在跑），改试 ${port + 1}`)
          port += 1
          tryListen(round + 1)
          return
        }
        if (error?.code === 'EADDRINUSE') {
          console.error(`[api] ${host} 的 ${startPort}~${port} 端口全被占用，无法启动。`)
          console.error(
            `      可先执行：netstat -ano | findstr :${startPort}  找到 PID 后 taskkill /PID <pid> /F`,
          )
        }
        reject(error)
      })

      server.listen(port, host, () => resolve({ server, port }))
    }

    tryListen(1)
  })
}

async function main() {
  try {
    const { inserted, skipped } = await initDatabase({ verbose: true, force: true })
    console.log(
      skipped
        ? `[db] ${connSummary()} · 内置语录已是最新，跳过同步`
        : `[db] ${connSummary()} · 本次同步新增 ${inserted} 条内置语录`,
    )
  } catch (error) {
    console.error('[db] 初始化失败：', error.message)
    const hint = explainDbError(error)
    console.error(`     ${hint || '请确认 MySQL 已启动，且账号密码与 .env 一致。'}`)
    process.exit(1)
  }

  const app = createApp({ staticDir: DIST })

  try {
    const { port } = await listenWithRetry(app, config.port, config.host)
    const shown = config.host === '0.0.0.0' ? '127.0.0.1' : config.host
    console.log(`[api] http://${shown}:${port}  (Ctrl+C 退出)`)
  } catch (error) {
    console.error('[api] 启动失败：', error.message)
    process.exit(1)
  }
}

main()
