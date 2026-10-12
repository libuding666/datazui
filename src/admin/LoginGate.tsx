import * as React from 'react'
import { ArrowLeft, Lock, ShieldCheck } from '@appica/icons-react'
import { Button } from '@appica/ui-react/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@appica/ui-react/card'
import { Field, FieldDescription, FieldLabel } from '@appica/ui-react/field'
import { Input } from '@appica/ui-react/input'
import { AdminError, adminApi } from './api'

type Props = {
  onSuccess: (token: string) => void
  /** 服务端没配 DZ_ADMIN_TOKEN 时的说明文案 */
  disabledNotice?: string | null
}

const FORM_ID = 'dz-admin-login'

export function LoginGate({ onSuccess, disabledNotice }: Props) {
  const [token, setToken] = React.useState('')
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = token.trim()
    if (!value) {
      setError('先填口令')
      return
    }

    setBusy(true)
    setError('')
    try {
      await adminApi.login(value)
      onSuccess(value)
    } catch (err) {
      setError((err as AdminError).message || '验证失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Lock className="size-6" />
          </span>
          <h1 className="dz-display mt-4 text-2xl text-foreground-intense">打他嘴 · 后台</h1>
          <p className="mt-1 text-xs text-foreground-subtle">需要管理口令才能进入</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>输入管理口令</CardTitle>
            <CardDescription>
              口令即服务端的 <code className="text-[11px]">DZ_ADMIN_TOKEN</code>，只存在本机浏览器里。
            </CardDescription>
          </CardHeader>

          <form id={FORM_ID} onSubmit={submit} className="px-6 pb-2">
            <Field>
              <FieldLabel>管理口令</FieldLabel>
              <Input
                type="password"
                value={token}
                autoFocus
                autoComplete="current-password"
                placeholder="••••••••"
                aria-invalid={error ? true : undefined}
                onChange={(event) => {
                  setToken(event.target.value)
                  if (error) setError('')
                }}
                startSlot={<ShieldCheck />}
              />
              <FieldDescription className={error ? 'text-error-emphasis' : undefined}>
                {error || disabledNotice || '忘记的话，看部署时配置的环境变量。'}
              </FieldDescription>
            </Field>
          </form>

          <CardFooter className="flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => {
                window.location.href = './'
              }}
            >
              <ArrowLeft data-icon="start" />
              回前台
            </Button>
            <Button
              type="submit"
              form={FORM_ID}
              size="lg"
              className="w-full sm:w-auto"
              disabled={busy}
            >
              {busy ? '验证中…' : '进入后台'}
            </Button>
          </CardFooter>
        </Card>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-foreground-subtle">
          后台用于查看统计与管理语录，请勿把口令分享给他人。
        </p>
      </div>
    </div>
  )
}
