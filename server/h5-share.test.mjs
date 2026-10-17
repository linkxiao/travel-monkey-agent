import assert from 'node:assert/strict'
import test from 'node:test'
import { h5ShareData } from '../src/lib/h5Share.ts'

const card = { title: '六安宣城5天4晚', url: 'http://119.91.204.216/s/abc?v=6' }

test('iPhone share is a bare link so WeChat can build the card', () => {
  const data = h5ShareData(card, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
  assert.deepEqual(data, { title: card.title, url: card.url })
  assert.equal('text' in data, false)
  assert.equal('files' in data, false)
})

test('Android share puts only the link in text', () => {
  const data = h5ShareData(card, 'Mozilla/5.0 (Linux; Android 14; Pixel 7)')
  assert.deepEqual(data, { title: card.title, text: card.url })
  assert.equal('files' in data, false)
})

test('missing title falls back to 行程', () => {
  assert.equal(h5ShareData({ url: card.url }, '').title, '行程')
})
