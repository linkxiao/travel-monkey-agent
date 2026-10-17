import assert from 'node:assert/strict'
import test from 'node:test'

// Node 里没有 canvas/Image，这里只校验模块可加载与类型导出面。
test('wechat card module exports builder', async () => {
  const mod = await import('./wechatCard.ts')
  assert.equal(typeof mod.buildWechatShareCard, 'function')
})
