import assert from 'node:assert/strict'
import test from 'node:test'
import { wechatShareCaption } from './wechatCard.ts'

test('share caption always carries the full trip link', () => {
  const text = wechatShareCaption({
    title: '京都奈良',
    url: 'http://119.91.204.216.sslip.io/s/abc',
  })
  assert.match(text, /京都奈良/)
  assert.match(text, /打开完整行程/)
  assert.match(text, /sslip\.io\/s\/abc/)
})
