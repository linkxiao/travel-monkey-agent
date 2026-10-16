// 验证码真正发出去：邮件走 SMTP。没配好就明确失败，不假装已发送。
import net from 'node:net'
import tls from 'node:tls'
import './config.mjs'

export function mailReady() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

function smtpSession(socket) {
  let buf = ''
  let waiter = null
  const take = () => {
    if (!waiter || !buf.endsWith('\n')) return
    const lines = buf.split(/\r?\n/).filter(Boolean)
    const last = lines[lines.length - 1] || ''
    if (!/^\d{3} /.test(last)) return
    buf = ''
    const current = waiter
    waiter = null
    if (!last.startsWith('2') && !last.startsWith('3')) current.reject(new Error(last))
    else current.resolve(last)
  }
  socket.on('data', (chunk) => {
    buf += chunk.toString('utf8')
    take()
  })
  const expect = () => new Promise((resolve, reject) => {
    waiter = { resolve, reject }
    take()
  })
  const send = (line) => {
    socket.write(`${line}\r\n`)
    return expect()
  }
  return { expect, send }
}

export async function sendMail({ to, code, host, port, secure, user, pass, from }) {
  const smtpHost = host || process.env.SMTP_HOST
  const smtpPort = Number(port || process.env.SMTP_PORT || 465)
  const useTls = secure !== undefined ? secure : smtpPort === 465
  const smtpUser = user ?? process.env.SMTP_USER ?? ''
  const smtpPass = pass ?? process.env.SMTP_PASS ?? ''
  const smtpFrom = from || process.env.SMTP_FROM || smtpUser
  const opened = await new Promise((resolve, reject) => {
    const sock = useTls ? tls.connect({ host: smtpHost, port: smtpPort, servername: smtpHost }) : net.connect({ host: smtpHost, port: smtpPort })
    const smtp = smtpSession(sock)
    sock.once('error', reject)
    sock.once(useTls ? 'secureConnect' : 'connect', () => resolve({ sock, smtp }))
  })
  const { sock, smtp } = opened
  try {
    await smtp.expect()
    await smtp.send('EHLO localhost')
    if (smtpUser) {
      await smtp.send('AUTH LOGIN')
      await smtp.send(Buffer.from(smtpUser).toString('base64'))
      await smtp.send(Buffer.from(smtpPass).toString('base64'))
    }
    await smtp.send(`MAIL FROM:<${smtpFrom}>`)
    await smtp.send(`RCPT TO:<${to}>`)
    await smtp.send('DATA')
    const subject = `=?UTF-8?B?${Buffer.from('验证码').toString('base64')}?=`
    const body = [
      `From: ${smtpFrom}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      `验证码 ${code}，5 分钟内有效。`,
      '.',
    ].join('\r\n')
    await smtp.send(body)
    await smtp.send('QUIT')
  } finally {
    sock.end()
  }
}

export async function deliverCode({ channel, target, code }) {
  if (channel !== 'email') throw new Error('请填写邮箱')
  if (!mailReady()) throw new Error('邮件服务还没配好，验证码发不出去')
  await sendMail({ to: target, code })
  return 'smtp'
}
