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
