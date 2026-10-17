import assert from 'node:assert/strict'
import test from 'node:test'
import { exportPhotoUrl } from '../src/lib/exportPhoto.ts'

const page = 'http://127.0.0.1:5177/'
const kyoto = '/travel-photo?u=' + encodeURIComponent('https://img.example/kyoto.jpg')
const nara = '/travel-photo?u=' + encodeURIComponent('https://img.example/nara.jpg')

test('each day photo keeps its own query', () => {
  const a = exportPhotoUrl(kyoto, page)
  const b = exportPhotoUrl(nara, page)
  assert.notEqual(a, b)
  assert.equal(a, 'http://127.0.0.1:5177' + kyoto)
  assert.equal(b, 'http://127.0.0.1:5177' + nara)
})

test('srcdoc photo urls are rewritten onto the page origin', () => {
  assert.equal(exportPhotoUrl('about:srcdoc' + kyoto, page), 'http://127.0.0.1:5177' + kyoto)
})

test('data urls stay embedded', () => {
  assert.equal(exportPhotoUrl('data:image/jpeg;base64,abc', page), 'data:image/jpeg;base64,abc')
})

test('external photos are forced through the same-origin proxy', () => {
  const abs = exportPhotoUrl('https://upload.wikimedia.org/wikipedia/commons/a.jpg', page)
  assert.equal(
    abs,
    'http://127.0.0.1:5177/travel-photo?u=' + encodeURIComponent('https://upload.wikimedia.org/wikipedia/commons/a.jpg'),
  )
})

test('local travel-assets stay on the page origin', () => {
  assert.equal(
    exportPhotoUrl('travel-assets/xian/banner.jpg', page),
    'http://127.0.0.1:5177/travel-assets/xian/banner.jpg',
  )
})
