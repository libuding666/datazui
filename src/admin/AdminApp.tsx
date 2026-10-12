import * as React from 'react'
import { ArrowLeft, Logout, Refresh, ShieldCheck } from '@appica/icons-react'
import { Alert, AlertDescription, AlertIcon, AlertTitle } from '@appica/ui-react/alert'
import { Button } from '@appica/ui-react/button'
import { Skeleton } from '@appica/ui-react/skeleton'
import { ThemeToggle } from '../components/ThemeToggle'
import { AdminError, adminApi, clearToken, readToken, writeToken, type AdminStats } from './api'
import { BragManager } from './BragManager'
import { LoginGate } from './LoginGate'
import { StatsPanel } from './StatsPanel'

type Phase = 'checking' | 'login' | 'ready'

export function AdminApp() {
  const [token, setToken] = React.useState(() => readToken())
  const [phase, setPhase] = React.useState<Phase>(() => (readToken() ? 'checking' : 'login'))
  const [loginHint, setLoginHint] = React.useState('')

  const [stats, setStats] = React.useState<AdminStats | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  const loadStats = React.useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setStats(await adminApi.stats())
    } catch (err) {
      const e = err as AdminError
      if (e.status === 401) {
        clearToken()
        setToken('')
        setLoginHint('口令已失效，请重新输入')
        setPhase('login')
        return
      }
      setError(e.message || '统计加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  // 首屏：有口令就先验一次
  React.useEffect(() => {
    if (phase !== 'checking') return
    let alive = true
    adminApi
      .session()
      .then(() => {
        if (alive) setPhase('ready')
      })
      .catch((err) => {
        if (!alive) return
        const e = err as AdminError
        if (e.code === 'ADMIN_DISABLED') {
          setLoginHint(e.message)
        } else {
          clearToken()
          setToken('')
          setLoginHint(e.status === 401 ? '口令已失效，请重新输入' : e.message)
        }
        setPhase('login')
      })
    return () => {
      alive = false
    }
  }, [phase])

  React.useEffect(() => {
    if (phase === 'ready') void loadStats()
  }, [phase, loadStats])

  function handleLogin(next: string) {
    writeToken(next)
    setToken(next)
    setLoginHint('')
    setStats(null)
    setPhase('checking')
  }

  function handleLogout() {
    clearToken()
    setToken('')
    setStats(null)
    setLoginHint('')
    setPhase('login')
  }

  if (phase === 'login') {
    return <LoginGate onSuccess={handleLogin} disabledNotice={loginHint} />
  }

  if (phase === 'checking') {
    return (
      <div className="min-h-dvh bg-background">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <Skeleton className="mx-auto h-8 w-48" />
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* 顶栏 */}
      <header className="dz-safe-t sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-black text-foreground-intense">打他嘴 · 后台</h1>
            <p className="truncate text-[11px] text-foreground-subtle">
              {stats
                ? `共 ${stats.overview.total} 条语录 · 累计打嘴 ${stats.overview.slaps}`
                : token
                  ? '已登录'
                  : ''}
            </p>
          </div>

          <Button variant="ghost" size="icon-md" aria-label="刷新统计" onClick={() => void loadStats()}>
            <Refresh />
          </Button>
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon-md"
            aria-label="回到前台"
            onClick={() => {
              window.location.href = './'
            }}
          >
            <ArrowLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <Logout data-icon="start" />
            <span className="hidden sm:inline">退出</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5">
        {error ? (
          <Alert variant="warning">
            <AlertIcon />
            <AlertTitle>没能拿到统计</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {stats ? (
          <StatsPanel stats={stats} />
        ) : loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : null}

        <BragManager onChanged={() => void loadStats()} />

        <footer className="border-t border-border pt-5 pb-10 text-center text-[11px] leading-relaxed text-foreground-subtle">
          后台口令来自服务端环境变量 <code>DZ_ADMIN_TOKEN</code>，仅保存在本机浏览器。
          <br />
          删除操作不可恢复，请谨慎。
        </footer>
      </main>
    </div>
  )
}
