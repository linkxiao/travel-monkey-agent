import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { decorateShareHtml, extractShareMeta, isLinkCrawler, localShareAsset, publishShareHtml, readShareHtml, requestOrigin, shareCardDocument, signWechatUrl, wantsLinkPreview } from './share.mjs'

const page = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>蜀道 · 行程计划</title>
<style>.hero{background-image:linear-gradient(#000,#000),url('travel-assets/xian/banner.jpg')}</style>
</head><body>
<div class="hero-sub">剑门关<span class="sep"></span>汉中<span class="sep"></span>西安</div>
<img src="travel-assets/xian/spot.png" alt="">
</body></html>`

test('same page keeps the same link id', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-share-'))
  const first = publishShareHtml(page, dir)
  const again = publishShareHtml(page, dir)
  assert.equal(first, again)
  assert.equal(readShareHtml(first, dir), page)
  assert.equal(fs.readdirSync(dir).filter((name) => name.endsWith('.html')).length, 1)
})

test('share page carries a WeChat card and a root base url', () => {
  const meta = extractShareMeta(page)
  assert.equal(meta.title, '蜀道 · 行程计划')
  assert.equal(meta.description, '剑门关 汉中 西安')
  assert.equal(meta.image, 'travel-assets/xian/banner.jpg')
  const html = decorateShareHtml(page, { pageUrl: 'https://trip.example/s/abc', origin: 'https://trip.example' })
  assert.match(html, /property="og:title" content="蜀道 · 行程计划"/)
  assert.match(html, /property="og:image" content="https:\/\/trip\.example\/travel-assets\/xian\/banner\.jpg"/)
  assert.match(html, /property="og:description" content="剑门关 汉中 西安"/)
  assert.match(html, /<base href="\/">/)
  assert.match(html, /id="tm-wx-share"/)
  assert.match(html, /复制链接/)
  assert.doesNotMatch(html, /jweixin/)
})

test('share card can point at a small same-origin thumbnail', () => {
  const html = decorateShareHtml(page, {
    pageUrl: 'http://119.91.204.216/s/abc',
    origin: 'http://119.91.204.216',
    cardImage: 'http://119.91.204.216/s/abc/card.jpg',
  })
  assert.match(html, /property="og:image" content="http:\/\/119\.91\.204\.216\/s\/abc\/card\.jpg"/)
  assert.match(html, /itemprop="image" content="http:\/\/119\.91\.204\.216\/s\/abc\/card\.jpg"/)
})

test('wechat crawler gets a compact card document', () => {
  assert.equal(isLinkCrawler('Mozilla/5.0 MicroMessenger/8.0'), true)
  assert.equal(isLinkCrawler('Mozilla/5.0 (iPhone) Safari'), false)
  // 微信服务器抓卡片的 UA 也像手机，但没有 Sec-Fetch-Dest
  const scraper = 'Mozilla/5.0 (Linux; Android 7.0; MHA-AL00 Build/HUAWEIMHA-AL00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/62.0.3202.84 Mobile Safari/537.36 MicroMessenger/6.6.1.1220(0x26060135) NetType/WIFI Language/zh_CN'
  assert.equal(isLinkCrawler(scraper, {}), true)
  assert.equal(wantsLinkPreview({ headers: { 'user-agent': scraper } }), true)
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49(0x1800312e) NetType/WIFI Language/zh_CN'
  const android = 'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.0.0 Mobile Safari/537.36 XWEB/1220053 MMWEBSDK/20240404 MMWEBID/1234 MicroMessenger/8.0.49 Weixin NetType/WIFI Language/zh_CN'
  assert.equal(isLinkCrawler(iphone, { 'sec-fetch-dest': 'document' }), false)
  assert.equal(isLinkCrawler(android, { 'sec-fetch-dest': 'document' }), false)
  assert.equal(wantsLinkPreview({ headers: { 'user-agent': iphone, 'sec-fetch-dest': 'document' } }), false)
  const html = shareCardDocument({
    title: '京都奈良',
    description: '寺院与樱花',
    pageUrl: 'http://119.91.204.216/s/abc',
    image: 'http://119.91.204.216/s/abc/card.jpg',
  })
  assert.match(html, /property="og:title" content="京都奈良"/)
  assert.match(html, /property="og:description" content="寺院与樱花"/)
  assert.match(html, /property="og:image" content="http:\/\/119\.91\.204\.216\/s\/abc\/card\.jpg"/)
  assert.match(html, /og:image:width" content="300"/)
})

test('local share asset stays inside travel-assets', () => {
  assert.match(localShareAsset('travel-assets/xian/banner.jpg'), /travel-assets\/xian\/banner\.jpg$/)
  assert.equal(localShareAsset('../server/share.mjs'), '')
  assert.equal(localShareAsset('/etc/passwd'), '')
  assert.equal(localShareAsset('https://img.example/a.jpg'), '')
})

test('proxied https photo becomes the WeChat card image', () => {
  const photo = `/travel-photo?u=${encodeURIComponent('https://img.example/kyoto.jpg')}`
  const html = `<!DOCTYPE html><html><head><title>京都奈良</title></head><body>
<p class="hero-sub">寺院、抹茶和樱花</p>
<img src="${photo}" alt="清水寺">
</body></html>`
  const meta = extractShareMeta(html)
  assert.equal(meta.description, '寺院、抹茶和樱花')
  assert.equal(meta.image, photo)
  const page = decorateShareHtml(html, { pageUrl: 'http://119.91.204.216/s/abc', origin: 'http://119.91.204.216' })
  assert.match(page, /property="og:image" content="https:\/\/img\.example\/kyoto\.jpg"/)
  assert.match(page, /property="og:description" content="寺院、抹茶和樱花"/)
})

test('loopback share links prefer this machine\'s network address', () => {
  const origin = requestOrigin({ headers: { host: '127.0.0.1:5177' } })
  const host = new URL(origin).hostname
  assert.match(origin, /^http:\/\/.+/)
  assert.notEqual(host, '::1')
})

test('wechat signature matches the official sample', () => {
  const signed = signWechatUrl(
    'sM4AOVdWfPE4DxkXGEs8VMCPGGVi4C3VM0P37wVUCFvkVAy_90u5h9nbSlYy3-Sl-HhTdfl2fzFy1AOcHKP7qg',
    'http://mp.weixin.qq.com?params=value',
    { nonceStr: 'Wm3WZYTPz0wzccnW', timestamp: 1414587457 },
  )
  assert.equal(signed.signature, '0f9de62fce790f9a083d5c99e95740ceb90c27ed')
})
