/**
 * 服务端配置
 *
 * 本地开发用默认值即可（MySQL root/123456，库名 datazui）；
 * 部署到 Vercel 等平台时，全部改用环境变量注入，不要把密码写进代码。
 */

const TRUEY = new Set(['1', 'true', 'required', 'require', 'yes', 'on'])

function truthy(value) {
  return TRUEY.has(String(value ?? '').trim().toLowerCase())
}

/** 支持 DZ_DB_URL / DATABASE_URL 这种一体式连接串（云厂商常见） */
function parseUrl(raw) {
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 3306,
      user: decodeURIComponent(parsed.username || 'root'),
      password: decodeURIComponent(parsed.password || ''),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, '')) || 'datazui',
      ssl: /ssl[-_]?mode=required/i.test(parsed.search),
    }
  } catch {
    return null
  }
}

const rawUrl = process.env.DZ_DB_URL ?? process.env.DATABASE_URL ?? ''
const fromUrl = parseUrl(rawUrl)

const useSsl = truthy(process.env.DZ_DB_SSL) || Boolean(fromUrl?.ssl)
const strictSsl = truthy(process.env.DZ_DB_SSL_STRICT)

/** 运行在 Vercel / Netlify 这类 Serverless 环境 */
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)

export const config = {
  /** 本地默认只监听回环地址；需要局域网访问时设 DZ_HOST=0.0.0.0 */
  host: process.env.DZ_HOST ?? '127.0.0.1',
  port: Number(process.env.DZ_PORT ?? 4173),

  db: {
    host: process.env.DZ_DB_HOST ?? fromUrl?.host ?? '127.0.0.1',
    port: Number(process.env.DZ_DB_PORT ?? fromUrl?.port ?? 3306),
    user: process.env.DZ_DB_USER ?? fromUrl?.user ?? 'root',
    password: process.env.DZ_DB_PASSWORD ?? fromUrl?.password ?? '123456',
    database: process.env.DZ_DB_NAME ?? fromUrl?.database ?? 'datazui',
    charset: 'utf8mb4_unicode_ci',
  },

  /** 云 MySQL 一般强制 TLS；没有厂商 CA 时只能放宽证书校验 */
  dbSsl: useSsl ? { minVersion: 'TLSv1.2', rejectUnauthorized: strictSsl } : undefined,

  isServerless,
  /** Serverless 每个实例都会建池，连接数必须按实例算，不能照着常驻服务给 */
  poolSize: isServerless ? Number(process.env.DZ_DB_POOL ?? 2) : Number(process.env.DZ_DB_POOL ?? 10),

  /** 建库失败不影响运行（云账号常常没有 CREATE DATABASE 权限），设 DZ_DB_AUTOCREATE=0 可显式关闭 */
  allowCreateDatabase: process.env.DZ_DB_AUTOCREATE !== '0',

  /** 单条语录长度上限（与前端 MAX_LEN 对齐，留点余量） */
  maxContentLength: 200,
  maxAuthorLength: 32,

  /**
   * 后台管理口令。为空时后台接口整体关闭（安全默认）。
   * 本地写进 .env，线上在 Vercel 环境变量里配一个强口令。
   */
  adminToken: process.env.DZ_ADMIN_TOKEN ?? '',
}

/** 打日志用，绝不包含密码 */
export const connSummary = () =>
  `mysql://${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database}` +
  (config.dbSsl ? ' (TLS)' : '')
