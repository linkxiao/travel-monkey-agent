import { useEffect, useRef, useState, type FormEvent } from 'react'

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

const REMEMBER_EMAIL_KEY = 'ct.auth.email'

function validEmail(value: string) {
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value.trim())
}

function loadRememberedEmail() {
  try { return String(localStorage.getItem(REMEMBER_EMAIL_KEY) || '') } catch { return '' }
}

function rememberEmail(value: string) {
  try {
    const email = value.trim()
    if (email) localStorage.setItem(REMEMBER_EMAIL_KEY, email)
  } catch { /* ignore */ }
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
  inline = false,
}: {
  inline?: boolean
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
  const [account, setAccount] = useState(() => loadRememberedEmail())
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [localError, setLocalError] = useState('')
  const [codeHint, setCodeHint] = useState('')
  const [wait, setWait] = useState(0)

  // 只在登录↔注册切换时清敏感字段；登录页保留邮箱，方便浏览器/本地回填
  useEffect(() => {
    setCode('')
    setPassword('')
    setConfirm('')
    setShowPassword(false)
    setShowConfirm(false)
    setShowLoginPassword(false)
    setLocalError('')
    setCodeHint('')
    setWait(0)
    if (screen === 'login') {
      setAccount((prev) => prev || loadRememberedEmail())
    } else if (screen === 'register') {
      setAccount((prev) => prev || loadRememberedEmail())
    }
  }, [screen])

  useEffect(() => {
    if (!success) return
    setCode('')
    setPassword('')
    setConfirm('')
  }, [success?.kind])

  // 弹窗打开时锁住背后页面，只让蒙层/卡片自己滚，始终对着可视区居中
  useEffect(() => {
    if (inline) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [inline])

  const [fading, setFading] = useState(false)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    setFading(false)
    if (!success) return
    const fade = window.setTimeout(() => setFading(true), 2000)
    const done = window.setTimeout(() => closeRef.current(), 2500)
    return () => {
      window.clearTimeout(fade)
      window.clearTimeout(done)
    }
  }, [success])

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
    rememberEmail(account)
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

  const heading = (title: string) => inline ? <h2 className="sr-only">{title}</h2> : <h2 id="auth-title">{title}</h2>
  const label = (text: string) => <span className="auth-label">{text}</span>
  const hint = (inlineText: string, dialogText: string) => (inline ? inlineText : dialogText)
  const swap = (prompt: string, action: string, target: AuthScreen) => inline ? (
    <p className="auth-alt">
      {prompt}
      <button type="button" disabled={busy} onClick={() => onScreen(target)}>{action}</button>
    </p>
  ) : (
    <button type="button" className="auth-switch" disabled={busy} onClick={() => onScreen(target)}>{prompt}{action}</button>
  )

  const body = success ? (
    <>
      <h2 id="auth-title">{success.kind === 'register' ? '注册成功' : '登录成功'}</h2>
      <div className="auth-status ok">
        <strong>账号 {success.username} 已登录</strong>
      </div>
    </>
  ) : screen === 'account' ? (
    <>
      <h2 id="auth-title">已登录</h2>
      <div className="auth-status">
        <strong>账号 {username}</strong>
        <span>退出只离开这台设备。</span>
      </div>
      <button type="button" className="auth-submit" onClick={onSignOut}>退出登录</button>
    </>
  ) : screen === 'register' ? (
    <form onSubmit={submit}>
      {heading('注册账号')}
      <label>
        {label('邮箱')}
        <input
          name="username"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          autoComplete="username"
          inputMode="email"
          autoFocus
          placeholder={hint('邮箱', 'name@example.com')}
        />
      </label>
      <label>
        {label('验证码')}
        <span className="auth-code-row">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder={hint('6 位验证码', '6 位数字')}
          />
          <button type="button" className="auth-send" disabled={busy || wait > 0} onClick={() => void askCode()}>
            {wait > 0 ? `${wait} 秒后重发` : '发送验证码'}
          </button>
        </span>
      </label>
      {codeHint && <p className="auth-hint">{codeHint}</p>}
      <label>
        {label('密码')}
        <span className="auth-secret">
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder={hint('设置密码，至少 8 位', '至少 8 位')}
          />
          <button type="button" className="auth-eye" aria-label={showPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowPassword((open) => !open)}>
            <EyeIcon open={showPassword} />
          </button>
        </span>
      </label>
      <label>
        {label('确认密码')}
        <span className="auth-secret">
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder={hint('再输入一次密码', '再输入一次')}
          />
          <button type="button" className="auth-eye" aria-label={showConfirm ? '隐藏密码' : '显示密码'} onClick={() => setShowConfirm((open) => !open)}>
            <EyeIcon open={showConfirm} />
          </button>
        </span>
      </label>
      {shownError && <p className="auth-error" role="alert">{shownError}</p>}
      <button type="submit" className="auth-submit" disabled={busy}>{busy ? '正在注册…' : '注册'}</button>
      {swap('已有账号？', '登录', 'login')}
    </form>
  ) : (
    <form onSubmit={submit} method="post" autoComplete="on">
      {heading('登录账号')}
      <label>
        {label('邮箱')}
        <input
          name="username"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          autoComplete="username"
          inputMode="email"
          autoFocus
          placeholder={hint('邮箱', 'name@example.com')}
        />
      </label>
      <label>
        {label('密码')}
        <span className="auth-secret">
          <input
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type={showLoginPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder={hint('密码', '输入密码')}
          />
          <button type="button" className="auth-eye" aria-label={showLoginPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowLoginPassword((open) => !open)}>
            <EyeIcon open={showLoginPassword} />
          </button>
        </span>
      </label>
      {shownError && <p className="auth-error" role="alert">{shownError}</p>}
      <button type="submit" className="auth-submit" disabled={busy}>{busy ? '正在登录…' : '登录'}</button>
      {swap('还没有账号？', '注册', 'register')}
    </form>
  )

  if (inline) return <div className="gate-auth">{body}</div>

  return (
    <div className={fading ? 'auth-mask fading' : 'auth-mask'} role="presentation" onMouseDown={close}>
      <div
        className="auth-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="dialog-close" aria-label="关闭" disabled={busy} onClick={close}>
          <span aria-hidden="true">×</span>
        </button>
        {body}
      </div>
    </div>
  )
}
