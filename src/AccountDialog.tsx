import { useEffect, useState, type FormEvent } from 'react'

export type AuthScreen = 'login' | 'register' | 'account'

export type AuthSuccess = {
  kind: 'login' | 'register'
  username: string
}

export type AuthInput = {
  account: string
  code: string
  password: string
}

function validEmail(value: string) {
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value.trim())
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M3 3l18 18" />
      <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M10.6 10.6a2 2 0 002.8 2.8" />
      <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M9.9 5.2A10.8 10.8 0 0112 5c5.5 0 9.5 4.5 10.5 7-.4 1-1.2 2.3-2.3 3.5M6.1 6.1C4.2 7.4 2.8 9.3 1.5 12c1 2.5 5 7 10.5 7 1.5 0 2.9-.3 4.1-.9" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export function AccountDialog({
  screen,
  success,
  username,
  error,
  busy,
  onClose,
  onScreen,
  onSubmit,
  onRequestCode,
  onSignOut,
}: {
  screen: AuthScreen
  success: AuthSuccess | null
  username: string
  error: string
  busy: boolean
  onClose: () => void
  onScreen: (screen: AuthScreen) => void
  onSubmit: (input: AuthInput) => void
  onRequestCode: (input: { purpose: 'register'; account: string }) => Promise<{ channel?: string }>
  onSignOut: () => void
}) {
  const [account, setAccount] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [localError, setLocalError] = useState('')
  const [codeHint, setCodeHint] = useState('')
  const [wait, setWait] = useState(0)

  useEffect(() => {
    setAccount('')
    setCode('')
    setPassword('')
    setConfirm('')
    setShowPassword(false)
    setShowConfirm(false)
    setShowLoginPassword(false)
    setLocalError('')
    setCodeHint('')
    setWait(0)
  }, [screen, success?.kind])

  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])

  function close() {
    if (busy) return
    onClose()
  }

  async function askCode() {
    if (busy || wait > 0) return
    if (!validEmail(account)) {
      setLocalError('请先填写有效的邮箱')
      return
    }
    setLocalError('')
    try {
      await onRequestCode({ purpose: 'register', account: account.trim() })
      setCodeHint('验证码已发出，5 分钟内有效。')
      setWait(60)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '验证码没有发出去')
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (!validEmail(account)) {
      setLocalError('请填写有效的邮箱')
      return
    }
    if (screen === 'register') {
      if (!/^\d{6}$/.test(code.trim())) {
        setLocalError('请输入您的验证码')
        return
      }
      if (password.length < 8) {
        setLocalError('密码至少 8 位')
        return
      }
      if (password !== confirm) {
        setLocalError('两次密码不一致')
        return
      }
    } else if (!password) {
      setLocalError('请输入您的密码')
      return
    }
    setLocalError('')
    onSubmit({ account: account.trim(), code: code.trim(), password })
  }

  const shownError = localError || error

  return (
    <div className="auth-mask" role="presentation" onMouseDown={close}>
      <div
        className="auth-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {success ? (
          <>
            <h2 id="auth-title">{success.kind === 'register' ? '注册成功' : '登录成功'}</h2>
            <div className="auth-status ok">
              <strong>账号 {success.username} 已登录</strong>
            </div>
            <button type="button" className="auth-submit" onClick={close}>知道了</button>
          </>
        ) : screen === 'account' ? (
          <>
            <h2 id="auth-title">已登录</h2>
            <div className="auth-status">
              <strong>账号 {username}</strong>
              <span>退出只离开这台设备。</span>
            </div>
            <button type="button" className="auth-submit" onClick={onSignOut}>退出登录</button>
            <button type="button" className="auth-switch" onClick={close}>关闭</button>
          </>
        ) : screen === 'register' ? (
          <form onSubmit={submit}>
            <h2 id="auth-title">注册账号</h2>
            <label>
              帐户电子邮件
              <input
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                autoComplete="email"
                inputMode="email"
                autoFocus
                placeholder="请输入您的邮箱"
              />
            </label>
            <label>
              验证码
              <span className="auth-code-row">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="请输入您的验证码"
                />
                <button type="button" className="auth-send" disabled={busy || wait > 0} onClick={() => void askCode()}>
                  {wait > 0 ? `${wait}秒` : '发送代码'}
                </button>
              </span>
            </label>
            {codeHint && <p className="auth-hint">{codeHint}</p>}
            <label>
              新密码
              <span className="auth-secret">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="请输入您的密码"
                />
                <button type="button" className="auth-eye" aria-label={showPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowPassword((open) => !open)}>
                  <EyeIcon open={showPassword} />
                </button>
              </span>
            </label>
            <label>
              确认密码
              <span className="auth-secret">
                <input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="请确认您的密码"
                />
                <button type="button" className="auth-eye" aria-label={showConfirm ? '隐藏密码' : '显示密码'} onClick={() => setShowConfirm((open) => !open)}>
                  <EyeIcon open={showConfirm} />
                </button>
              </span>
            </label>
            {shownError && <p className="auth-error" role="alert">{shownError}</p>}
            <button type="submit" className="auth-submit" disabled={busy}>{busy ? '正在提交…' : '提交'}</button>
            <button type="button" className="auth-switch" disabled={busy} onClick={() => onScreen('login')}>去登录</button>
          </form>
        ) : (
          <form onSubmit={submit}>
            <h2 id="auth-title">登录账号</h2>
            <label>
              帐户电子邮件
              <input
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                autoComplete="email"
                inputMode="email"
                autoFocus
                placeholder="请输入您的邮箱"
              />
            </label>
            <label>
              密码
              <span className="auth-secret">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showLoginPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="请输入您的密码"
                />
                <button type="button" className="auth-eye" aria-label={showLoginPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowLoginPassword((open) => !open)}>
                  <EyeIcon open={showLoginPassword} />
                </button>
              </span>
            </label>
            {shownError && <p className="auth-error" role="alert">{shownError}</p>}
            <button type="submit" className="auth-submit" disabled={busy}>{busy ? '正在登录…' : '登录'}</button>
            <button type="button" className="auth-switch" disabled={busy} onClick={() => onScreen('register')}>去注册</button>
          </form>
        )}
      </div>
    </div>
  )
}
