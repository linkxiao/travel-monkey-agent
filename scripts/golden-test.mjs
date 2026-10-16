// Golden 回归集：内容稳的证据链（离线可跑，不调外部网络）。
// 跑法：npm run golden
import assert from 'node:assert'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dayBrief, normalizeTrip, tripTitle } from '../server/viz.mjs'
import { askTitle, tripFromPlan } from '../src/lib/plan.ts'
import { researchQuery } from '../server/research.mjs'
import { resolveTargets } from '../src/lib/target.ts'
import { applyAdds, applyChanges, applyPhotoTo, applyReplaceDays, collectPhotoRequest, collectPhotos, explicitPhotoQuery, extractEnvelope, findUnseenInHtml, inferChangesFromText, inferEditFrom, photoOutcome, stripEditClaim, wantsPhotos, wantsTripEdit } from '../src/lib/trip.ts'
import { buildRouteMessages, carryLine, countPeople, isNewTask, localTurn, parseTurn, planPrefs, portablePrefs, statedDays, tripHead, tripNames } from '../src/lib/route.ts'
import { mentionedDays } from '../src/lib/target.ts'
import zlib from 'node:zlib'
import { wantsVision } from '../src/lib/attach.ts'
import { readZip } from '../src/lib/zip.ts'
import { buildChatMessages, buildFillMessages, buildPlanMessages, splitWindow, userPack } from '../src/lib/context.ts'
import { isEmptySession, newSessionId, sessionStage, sessionTitle } from '../src/lib/session.ts'
import { attachImages, loadImageForModel } from '../server/images.mjs'
import { enrichTripPhotos } from '../server/photos.mjs'
import { enrichTripTickets, enrichTripTransport } from '../server/transport.mjs'
import { qualityChecklist } from '../server/quality.mjs'
import { hoursIssues, parseOpenText } from '../server/hours.mjs'
import net from 'node:net'
import { loginUser, normalizeEmail, quotaLeft, refundQuota, registerUser, requestVerify, sessionUser, takeQuota } from '../server/users.mjs'
import { dataKeys, publicConfig } from '../server/config.mjs'
import { searchWeb } from '../server/search.mjs'
import { pickModel } from '../server/chat-proxy.mjs'
import { sendMail } from '../server/deliver.mjs'
import { todayAdvice } from '../src/lib/today.ts'
import os from 'node:os'
import path from 'node:path'

let n = 0
const ok = (name, cond) => {
  n += 1
  assert(cond, `GOLDEN FAIL: ${name}`)
  console.log(`ok ${n} - ${name}`)
}

const BASE = {
  title: '回归行程',
  startDate: '2026-10-01',
  disclaimer: '本页全部信息均为参考建议，可能不准确，请务必核实后再出发。',
  persona: 'stay',
}
const dayWith = (stay) => ({
  theme: 'D',
  slots: [
    { kind: 'route', name: 'r' },
    { kind: 'spot', name: 'a' },
    { kind: 'spot', name: '午休' },
    { kind: 'spot', name: 'b' },
    { kind: 'stay', name: stay },
    { kind: 'food', name: 'c' },
  ],
})

// 1. 住宿：同片区合并 + 连住 + access + 预算
{
  const t = normalizeTrip({
    ...BASE,
    days: ['夏河宾馆', '夏河宾馆', '合作饭店'].map(dayWith),
    hotelAreas: [
      { area: '夏河县城', reason: '近寺。', options: [{ tier: '经济', name: '夏河如家酒店' }, { tier: '中档', name: '夏河大酒店' }, { tier: '高端', name: '夏河希尔顿花园酒店' }] },
      { area: '夏河老城', reason: '近街。', options: [{ tier: '经济', name: '夏河青年旅舍' }, { tier: '中档', name: '夏河藏式民宿' }, { tier: '高端', name: '夏河度假酒店' }] },
      { area: '合作市区', reason: '近站。', options: [{ tier: '经济', name: '合作如家酒店' }, { tier: '中档', name: '合作大酒店' }, { tier: '高端', name: '合作度假酒店' }] },
    ],
  })
  ok('同片区合并为2处', t.hotelAreas.length === 2)
  ok('连住注记', /连住2晚/.test(t.hotelAreas[0].reason))
  ok('跳镇不误标连住', !/连住/.test(t.hotelAreas[1].reason))
  ok('access 结构化', t.hotelAreas[0].options[0].access?.note?.includes('适老'))
  ok('预算信封', t.budget?.tiers?.length === 3 && /晚参考/.test(t.budget.tiers[0].total))
  ok('旅居 tips', t.tips.some((x) => String(x).includes('电梯')))
}

// 页面版式：待办与行前须知成对排齐，日标题 Day 大写、星期日期小字
{
  const days = ['甲宾馆', '甲宾馆'].map(dayWith)
  const odd = normalizeTrip({ ...BASE, days, reminders: [{ item: '订包车', leadDays: 7 }, { item: '订门票', leadDays: 5 }, { item: '订住宿', leadDays: 9 }] })
  ok('待办：奇数条补成偶数，补的不和已有重复', odd.reminders.length === 4 && !/住宿/.test(odd.reminders[3].item))
  const even = normalizeTrip({ ...BASE, days, reminders: [{ item: '订包车', leadDays: 7 }, { item: '订门票', leadDays: 5 }] })
  ok('待办：已是偶数不动', even.reminders.length === 2)
  ok('待办：默认清单也是偶数', normalizeTrip({ ...BASE, days }).reminders.length % 2 === 0)
  ok('行前须知：交通出行有兜底', typeof odd.preTrip.transport === 'string' && odd.preTrip.transport.length > 0)
  const { renderTrip } = createRequire(import.meta.url)('../vendor/mold/scripts/gen-shudao-html.js')
  const html = renderTrip(odd)
  ok('行前须知：6 项两列排齐', (html.match(/class="info-row"/g) || []).length === 6)
  const timeline = html.split('function renderTimeline')[1] || ''
  ok('日标题：左 Day，右侧星期在上日期在下，再右是当日概述', /day-weekday">Day' \+ \(di \+ 1\)/.test(timeline) && /day-when-week[\s\S]*day-when-date[\s\S]*day-brief/.test(timeline) && !/day-num/.test(timeline))
  const spotDay = (theme, names) => ({ theme, slots: [{ kind: 'route', name: '甲地→乙地' }, ...names.map((name) => ({ kind: 'spot', name }))] })
  ok('概述：主题像样就用主题', dayBrief(spotDay('古寺穿越与山脊徒步', ['甲寺'])) === '古寺穿越与山脊徒步')
  ok('概述：主题只是第N天时用景点名拼，跳过午休', dayBrief(spotDay('第 2 天', ['甲寺', '午休', '乙寺', '丙寺'])) === '甲寺·乙寺·丙寺')
  ok('概述：不超过 20 字，不把景点名切半', [...dayBrief(spotDay('D3', ['甲乙丙丁戊己庚', '子丑寅卯辰巳午', '天地玄黄宇宙洪']))].length <= 20 && dayBrief(spotDay('D3', ['甲乙丙丁戊己庚', '子丑寅卯辰巳午', '天地玄黄宇宙洪'])) === '甲乙丙丁戊己庚·子丑寅卯辰巳午')
  ok('概述：长主题截到 20 字', [...dayBrief(spotDay('一二三四五六七八九十一二三四五六七八九十一二', []))].length === 20)
  ok('概述：normalize 每天都带上', odd.days.every((d) => typeof d.brief === 'string' && [...d.brief].length <= 20))
}

// 换肤：每套皮肤的字色和底色都拉得开
{
  const { THEMES, contrast, themeCss, themePalette } = await import('../server/themes.mjs')
  const low = []
  for (const theme of THEMES) {
    const p = themePalette(theme)
    for (const bg of [p.card, p.raise]) {
      for (const [key, min] of [['ink', 7], ['mid', 4.5], ['sakura', 4.5], ['tealInk', 4.5], ['deepInk', 4.5]]) {
        if (contrast(p[key], bg) < min) low.push(`${theme.id}.${key}`)
      }
    }
    if (contrast('#ffffff', p.deep) < 7 || contrast(p.deepAccent, p.deep) < 4.5) low.push(`${theme.id}.deep`)
  }
  ok('换肤：正文、次要字、强调色在卡片和内块上都够对比度', low.length === 0)
  const css = themeCss(THEMES.find((t) => t.id === 'coast'))
  ok('换肤：深色底（封面、日标题、待办）上的字固定用浅色', /\.hero-title,\.day-weekday,\.checklist-title\{color:#fff!important\}/.test(css) && /\.day-when-week,\.day-brief\{color:rgba\(255,255,255/.test(css) && !/\.hero-title[^{]*\{color:var\(--ink\)/.test(css))
  ok('换肤：模板里写死的深色字跟着皮肤走', /\.overview-day[^{]*\{color:var\(--ink\)!important\}/.test(css) && /\.craft-body[^{]*\{color:var\(--ink-mid\)!important\}/.test(css))
}

// 2. 三餐：软硬标签 + 旅居硬菜建议
{
  const t = normalizeTrip({
    ...BASE,
    days: [{
      theme: 'D1',
      slots: dayWith('成都宾馆').slots,
      dining: [{ meal: '早餐', place: '蒸饺店' }, { meal: '午餐', place: '麻辣火锅' }, { meal: '晚餐', place: '串串香' }],
    }],
  })
  const [b, l, d] = t.days[0].dining
  ok('早餐偏软', b.soft === '偏软')
  ok('午餐偏辣硬', l.soft === '偏辣硬')
  ok('旅居硬菜给建议', /换软和/.test(d.note))
}

// 3. 知识库三层：L3 地名线 + L2 模式兜底 + 库外诚实
{
  const lib = JSON.parse(fs.readFileSync(new URL('../server/routes.json', import.meta.url), 'utf8'))
  ok('L3 瘦身到薄数据线', lib.routes.length <= 5 && lib.routes.every((r) => r.来源 && r.更新 && r.置信))
  ok('L3 全有分', lib.routes.every((r) => r.分?.代表性 && r.分?.难度 && r.必看?.length && r.可砍?.length && r.耗时 && r.补给))
  ok('L2 模式 8 条', lib.patterns.length === 8 && lib.patterns.every((p) => p.命中?.length >= 4 && p.必看?.length))
  const hit = await researchQuery({ query: '甘南6天徒步星空' })
  ok('L3 地名优先', /线路库「甘南/.test(hit.brief) && /来源/.test(hit.brief))
  const pat = await researchQuery({ query: '千岛湖3天环湖骑行' })
  ok('库外模式兜底', /模式参考「湖环线」/.test(pat.brief) && /非本线实测/.test(pat.brief))
  const sea = await researchQuery({ query: '三亚5天看海亲子' })
  ok('三亚命中海岛模式', /模式参考「海岛亲子线」/.test(sea.brief))
  const miss = await researchQuery({ query: '巴黎5天' })
  ok('无关联不误报', !/线路库|模式参考/.test(miss.brief))
}

// 4. 意图：点名对格 + 没点名不对格
{
  const trip = { title: 't', days: [{ slots: [{ kind: 'spot', name: '桑科草原车览' }, { kind: 'spot', name: '拉卜楞寺转经' }] }] }
  const r1 = resolveTargets('把桑科草原的图换了', trip, { photoAsk: true })
  ok('点名命中', r1.names.includes('桑科草原车览'))
  const r2 = resolveTargets('修改每日行程的景点大图', trip, { photoAsk: true })
  ok('没点名不对格', r2.names.length === 0)
}

// 5. 交通：城际走驾车 + 按人格选步行/公交；补距离 / 公交票价 / 打车估价（fetch 打桩，离线）
{
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const u = String(url)
    const j = (o) => ({ json: async () => o })
    if (u.includes('direction/driving')) {
      return j({ route: { taxi_cost: '128', paths: [{ duration: '5400', distance: '168000' }] } })
    }
    if (u.includes('transit/integrated')) {
      return j({ route: { transits: [{ duration: '1500', distance: '3200', cost: '4' }] } })
    }
    if (u.includes('place/text')) {
      return j({ pois: [{ name: '清水寺', type: '风景名胜', biz_ext: { cost: '400', opentime: '06:00-18:00' } }] })
    }
    // 步行：30 分钟 = 1800s，旅居阈值 1200s 会转公交；探秘阈值 5400s 保留步行
    return j({ route: { paths: [{ duration: '1800', distance: '2200' }] } })
  }
  try {
    const mk = (lat, lng, name) => ({ name, lat, lng })
    const t1 = { title: 'x', persona: 'stay', days: [{ slots: [mk(35.0, 102.9, 'A'), mk(33.5, 102.9, 'B')] }] }
    await enrichTripTransport(t1, 'K')
    const leg1 = t1.days[0].slots[1].transport
    ok('城际自驾', leg1.mode === '自驾/包车' && leg1.intercity === true)
    ok('城际有距离', /公里|米/.test(leg1.distance || ''))
    ok('城际有打车估价', /打车约 ¥/.test(leg1.fare || ''))
    const t2 = { title: 'x', persona: 'stay', days: [{ slots: [mk(31.0, 121.4, 'A'), mk(31.01, 121.41, 'B')] }] }
    await enrichTripTransport(t2, 'K')
    const leg2 = t2.days[0].slots[1].transport
    ok('旅居转公交', leg2.mode === '公交/地铁')
    ok('公交票价回填', /公交约 ¥4/.test(leg2.fare || ''))
    ok('公交带打车对照', /打车约 ¥/.test(leg2.fare || ''))
    ok('公交有距离', /公里|米/.test(leg2.distance || ''))
    const t3 = { title: 'x', persona: 'trek', days: [{ slots: [mk(31.0, 121.4, 'A'), mk(31.01, 121.41, 'B')] }] }
    await enrichTripTransport(t3, 'K')
    const leg3 = t3.days[0].slots[1].transport
    ok('探秘保留步行', leg3.mode === '步行')
    ok('步行免费并给打车对照', /免费/.test(leg3.fare || '') && /打车约 ¥/.test(leg3.fare || ''))
    const t4 = { title: '京都4日', days: [{ slots: [{ kind: 'spot', name: '清水寺', lat: 35, lng: 135 }] }] }
    await enrichTripTickets(t4, 'K')
    ok('景点门票回填', /门票参考约 ¥400/.test(t4.days[0].slots[0].ticketPrice || ''))
    ok('景点营业时间顺带补', t4.days[0].slots[0].openingHours === '06:00-18:00')
  } finally {
    globalThis.fetch = realFetch
  }
}

// 5b. 无任何地图 Key：本地直线估算仍补距离与打车价
{
  const mk = (lat, lng, name) => ({ name, lat, lng })
  const t = { title: '上海', persona: 'stay', days: [{ slots: [mk(31.23, 121.47, 'A'), mk(31.24, 121.49, 'B')] }] }
  await enrichTripTransport(t, {})
  const leg = t.days[0].slots[1].transport
  ok('无 Key 仍有交通', !!leg && !!leg.mode && !!leg.distance)
  ok('无 Key 有打车估价', /打车约 ¥|免费/.test(leg.fare || ''))
  ok('无 Key 标记本地估算', (t.dataSources || []).some((s) => s && s.name === '本地路网估算'))
}

// 6. 改天必见：overview 每次从 days 重建 + 收据验货 + 本地 kind 句式 + 换图对比
{
  const t = normalizeTrip({ ...BASE, days: [dayWith('夏河宾馆')] })
  const edited = JSON.parse(JSON.stringify(t))
  edited.days[0].slots[4].name = '津阳口农家'
  const again = normalizeTrip(edited)
  ok('改住宿名总览同步', again.overview[0].stay === '津阳口农家')
}
{
  const t = { title: 't', days: [{ slots: dayWith('夏河宾馆').slots }] }
  const r = applyChanges(t, [{ day: 1, slot: 5, set: { name: '津阳口农家' } }])
  ok('补丁带新名清单', r.touched.includes('津阳口农家') && r.applied.length === 1)
  ok('验货找得到上页的名', findUnseenInHtml(r.touched, '<div>津阳口农家</div>').length === 0)
  ok('验货抓得出没上页的名', findUnseenInHtml(r.touched, '<div>夏河宾馆</div>').join() === '津阳口农家')
}
{
  const c = inferChangesFromText('D1住宿改成津阳口农家')
  ok('本地住宿句式直改', c.length === 1 && c[0].day === 1 && c[0].kind === 'stay' && c[0].set.name === '津阳口农家')
}
{
  const t = { title: 't', days: [{ slots: [{ kind: 'spot', name: 'a', photo: 'http://x/1.jpg' }], dining: [] }], hotelAreas: [] }
  const same = JSON.stringify(collectPhotos(t)) === JSON.stringify(collectPhotos(JSON.parse(JSON.stringify(t))))
  const other = JSON.parse(JSON.stringify(t))
  other.days[0].slots[0].photo = 'http://x/2.jpg'
  const diff = JSON.stringify(collectPhotos(t)) !== JSON.stringify(collectPhotos(other))
  ok('换图前后对比可判', same && diff)
}

// 7. 改天/换图的意图路由：配图请求不许跑进改表分支（这是"模型答了但页面不动"的根因）
{
  const photoTrip = { title: '西安', days: [
    { slots: [{ kind: 'route', name: '登山口线路' }, { kind: 'spot', name: '人头山顶' }, { kind: 'spot', name: '沟内岔口' }, { kind: 'spot', name: '碎石坡' }, { kind: 'stay', name: '一方小院' }, { kind: 'food', name: '农家饭' }] },
    { slots: [{ kind: 'route', name: 'r2' }, { kind: 'spot', name: '翠云廊' }, { kind: 'spot', name: '午休' }, { kind: 'spot', name: '剑门关' }, { kind: 'stay', name: '一方小院' }, { kind: 'food', name: 'f2' }] },
    { slots: [{ kind: 'route', name: 'r3' }, { kind: 'spot', name: '法门寺' }, { kind: 'spot', name: '午休' }, { kind: 'spot', name: '乾陵' }, { kind: 'stay', name: 's3' }, { kind: 'food', name: 'f3' }] },
  ] }
  ok('图片二字算配图', wantsPhotos('优化day1、day2的景点图片') && !wantsTripEdit('优化day1、day2的景点图片'))
  ok('照片不对也算配图', wantsPhotos('day1 和day2 的一方小院图片不对，请更换。'))
  ok('改名仍走改表', wantsTripEdit('把day2的人头山换成翠华山') && !wantsPhotos('把day2的人头山换成翠华山'))
  ok('新增带补图两边都走', wantsTripEdit('新增D2乾陵景点，并补图') && wantsPhotos('新增D2乾陵景点，并补图'))
  ok('多天全认', JSON.stringify(mentionedDays('优化day1、day2的景点图片')) === '[1,2]')
  ok('第N格不当天', JSON.stringify(mentionedDays('D1第5格改成津阳口农家')) === '[1]')
  ok('第2、3天并列', JSON.stringify(mentionedDays('第2、3天的图')) === '[2,3]')
  const req = collectPhotoRequest('优化day1、day2的景点图片', photoTrip)
  ok('配图只收点名的天', JSON.stringify(req.days) === '[1,2]')
  ok('景点图只收景点格', req.names.length > 0 && !req.names.includes('一方小院') && !req.names.includes('农家饭'))
  ok('用户给的检索词收下', explicitPhotoQuery('请去百度上搜索"终南山扯袍峪人头山"然后抓取图片更换') === '终南山扯袍峪人头山')
}
// 8. 换图逐格收据：换上了说换上，搜不到说搜不到
{
  const before = { days: [{ slots: [{ kind: 'spot', name: '甲景点', photo: 'http://x/old.jpg' }, { kind: 'spot', name: '乙景点' }, { kind: 'spot', name: '午休' }] }] }
  const after = { days: [{ slots: [{ kind: 'spot', name: '甲景点', photo: 'http://x/new.jpg' }, { kind: 'spot', name: '乙景点' }, { kind: 'spot', name: '午休' }] }] }
  const o = photoOutcome(before, after, { days: [1], kinds: ['spot'] })
  ok('换上的报换上', o.changed.join() === '甲景点')
  ok('没搜到的报没搜到', o.missing.join() === '乙景点')
}
// 9. 天范围隔离：点名 day2 换图，绝不碰 day1/day3 的图（fetch 全打桩失败，保守断言）
{
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, status: 404, headers: { get: () => '' }, text: async () => '', json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) })
  try {
    const t = { title: '西安3天', hotelAreas: [], days: [
      { theme: 'D1 西安', slots: [{ kind: 'spot', name: '大唐不夜城', photo: 'http://img0.baidu.com/D1KEEP', photos: ['http://img0.baidu.com/D1KEEP'] }] },
      { theme: 'D2 西安', slots: [{ kind: 'spot', name: '人头山顶' }] },
      { theme: 'D3 西安', slots: [{ kind: 'spot', name: '乾陵', photo: 'http://img0.baidu.com/D3KEEP', photos: ['http://img0.baidu.com/D3KEEP'] }] },
    ] }
    await enrichTripPhotos(t, { replacePhotos: true, photoDays: [2], photoQuery: '终南山人头山' })
    ok('只改点名天·D1原图不动', t.days[0].slots[0].photo === 'http://img0.baidu.com/D1KEEP')
    ok('只改点名天·D3原图不动', t.days[2].slots[0].photo === 'http://img0.baidu.com/D3KEEP')
  } finally {
    globalThis.fetch = realFetch
  }
}

// 10. 改表不挑模型脾气：补丁平铺也收、模型只嘴上说改好也真改（"模型答了页面不动"的根因）
{
  const base = () => ({ title: 't', days: [
    { slots: [{ kind: 'route', name: '线路A' }, { kind: 'spot', name: '兵马俑' }, { kind: 'spot', name: '午休' }, { kind: 'spot', name: '华清宫' }, { kind: 'stay', name: '酒店A' }, { kind: 'food', name: '晚餐A' }], dining: [{ meal: '午餐', place: '午A' }] },
    { slots: [{ kind: 'route', name: '线路B' }, { kind: 'spot', name: '人头上（人头山）顶' }, { kind: 'spot', name: '午休' }, { kind: 'spot', name: '碎石坡' }, { kind: 'stay', name: '一方小院' }, { kind: 'food', name: '农家饭' }], dining: [{ meal: '午餐', place: '午B' }] },
  ] })
  const landed = (raw, userText) => {
    const env = extractEnvelope(raw)
    if (!env) return { applied: [], via: 'none' }
    const r1 = applyReplaceDays(base(), env.replaceDays || [])
    const r2 = applyChanges(r1.trip, env.changes)
    let applied = [...r1.applied, ...r2.applied]
    if (applied.length) return { applied, via: 'patch' }
    const res = inferEditFrom([userText, env.reply])
    const a = applyAdds(r2.trip, res.adds)
    const b = applyChanges(a.trip, res.changes)
    applied = [...a.applied, ...b.applied]
    return { applied, via: applied.length ? 'rescue' : 'none' }
  }
  const ask = '把day2的人头山换成翠华山'
  const flat = landed('{"reply":"好","changes":[{"day":2,"slot":2,"name":"翠华山"}]}', ask)
  ok('补丁平铺无set也收', flat.via === 'patch' && flat.applied.join().includes('翠华山'))
  const flatMeal = landed('{"reply":"好","changes":[{"day":2,"meal":"午餐","place":"新面馆"}]}', ask)
  ok('餐补丁平铺也收', flatMeal.via === 'patch' && flatMeal.applied.join().includes('新面馆'))
  const flatCraft = landed('{"reply":"好","changes":[{"day":2,"kind":"craft","level":"轻"}]}', ask)
  ok('规划条平铺也收', flatCraft.via === 'patch')
  const claim = landed('{"reply":"我已经把第二天的人头山换成翠华山了","changes":[]}', ask)
  ok('只嘴上说改好也真改', claim.via === 'rescue' && claim.applied.join().includes('翠华山'))
  const askBack = landed('{"reply":"请问你想改哪一天？","changes":[]}', ask)
  ok('模型反问也按原话改', askBack.via === 'rescue')
  const plain = landed('已把第二天的人头山换成翠华山。', ask)
  ok('模型回纯文本也真改', plain.via === 'rescue')
  ok('没落地不转述假话', stripEditClaim('我已经把人头山换成翠华山了。建议顺路看西岳庙。') === '建议顺路看西岳庙。')
  const nothing = landed('{"reply":"请问你想改哪一天？","changes":[]}', '这个行程怎么样')
  ok('真没指令就不硬改', nothing.via === 'none')
}

// 11. 粘贴/拖入的图：落到点名的那一格，且不被后续批量补图冲掉
{
  const mk = () => ({ title: '西安', days: [
    { slots: [{ kind: 'route', name: '线路A' }, { kind: 'spot', name: '兵马俑' }, { kind: 'spot', name: '午休' }, { kind: 'spot', name: '华清宫' }, { kind: 'stay', name: '酒店A' }, { kind: 'food', name: '晚餐A' }], dining: [{ meal: '午餐', place: '午A' }] },
    { slots: [{ kind: 'route', name: '线路B' }, { kind: 'spot', name: '人头上（人头山）顶' }, { kind: 'spot', name: '午休' }, { kind: 'spot', name: '碎石坡' }, { kind: 'stay', name: '一方小院' }, { kind: 'food', name: '农家饭' }], dining: [{ meal: '午餐', place: '午B' }] },
  ] })
  const U = '/travel-assets/uploads/abc.png'
  const byCell = applyPhotoTo(mk(), [U], 'D2第2格用这张图')
  ok('贴图认第几格', byCell.applied.length === 1 && byCell.trip.days[1].slots[1].photo === U)
  ok('贴图不误伤别格', !byCell.trip.days[0].slots[1].photo && !byCell.trip.days[1].slots[3].photo)
  const byAlias = applyPhotoTo(mk(), [U], '人头山用这张图')
  ok('贴图认括号里的别名', byAlias.trip.days[1].slots[1].photo === U)
  const byName = applyPhotoTo(mk(), [U], '这张给一方小院')
  ok('贴图认住宿点名', byName.trip.days[1].slots[4].photo === U)
  const vague = applyPhotoTo(mk(), [U], 'D2的图用这张')
  ok('说不清就按本机问法问', !vague.applied.length && /答案：A\./.test(vague.ask))
  ok('问句选项不撞字母', new Set(vague.ask.match(/[A-F](?=\.)/g)).size === (vague.ask.match(/[A-F](?=\.)/g) || []).length)
}
{
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, status: 404, headers: { get: () => '' }, text: async () => '', json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) })
  try {
    const U = '/travel-assets/uploads/abc.png'
    const mk = () => ({ title: '西安', hotelAreas: [], days: [{ theme: 'D1 西安', slots: [{ kind: 'spot', name: '兵马俑', photo: U, photos: [U] }] }] })
    const sweep = mk()
    await enrichTripPhotos(sweep, { replacePhotos: true, photoKinds: ['spot'] })
    ok('批量补图不冲用户的图', sweep.days[0].slots[0].photo === U)
    const byDay = mk()
    await enrichTripPhotos(byDay, { replacePhotos: true, photoDays: [1] })
    ok('按天补图不冲用户的图', byDay.days[0].slots[0].photo === U)
  } finally {
    globalThis.fetch = realFetch
  }
}

// 12. 带图这一轮分流：贴进格子（本机、不花钱）还是送给模型看（烧 token）
{
  const look = ['这是哪', '这张图是哪个景点', '看看这张图', '图里写的什么', '这张截图里的时间是几点', '根据这张图规划一下', '认一下这是什么地方']
  const place = ['用这张图', 'D2第2格用这张图', '人头山用这张图', '这张给一方小院', '把兵马俑换成这张', '第3格配上这张', '']
  ok('问图走模型', look.every((t) => wantsVision(t, true)))
  ok('贴图不走模型', place.every((t) => !wantsVision(t, true)))
  ok('没出页时图没处贴，只能是让我看', wantsVision('', false) && wantsVision('这是哪', false))
}
{
  ok('外链原样交给上游', loadImageForModel('https://x.com/a.jpg').remote === 'https://x.com/a.jpg')
  for (const bad of ['/travel-assets/../../../etc/passwd', '/travel-assets/%2e%2e%2f%2e%2e%2fetc/passwd', '/etc/passwd', 'file:///etc/passwd', '']) {
    assert.throws(() => loadImageForModel(bad), undefined, `应拦下 ${bad}`)
  }
  ok('越界/怪路径一律拦下', true)

  // 自带一张 1×1 PNG 当样本，不蹭运行时留下的上传文件
  const dir = new URL('../travel-assets/uploads/', import.meta.url)
  const name = '__golden-fixture.png'
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(new URL(name, dir), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
  try {
    const img = loadImageForModel(`/travel-assets/uploads/${name}`)
    ok('本机图读成 base64 带正确 mime', img.mime === 'image/png' && img.base64.length > 0 && !img.remote)
    const base = [{ role: 'system', content: 'S' }, { role: 'user', content: '这是哪' }]
    const oa = attachImages(base, [img], 'openai').at(-1)
    ok('OpenAI 形状对', oa.content[0].type === 'image_url' && oa.content[0].image_url.url.startsWith('data:image/png;base64,') && oa.content[1].text === '这是哪')
    const an = attachImages(base, [img], 'anthropic').at(-1)
    ok('Anthropic 形状对', an.content[0].type === 'image' && an.content[0].source.type === 'base64' && an.content[0].source.media_type === 'image/png')
    ok('没图就不动消息', attachImages(base, [], 'openai') === base)
    const trailing = attachImages([{ role: 'user', content: '这是哪' }, { role: 'assistant', content: 'A' }], [img], 'openai')
    ok('图挂在用户那条上，不挂给助手', trailing[0].content[0].type === 'image_url' && trailing[1].content === 'A')
  } finally {
    fs.rmSync(new URL(name, dir), { force: true })
  }
}

// 13. zip 拆包：自己现做一个真压缩包喂进去（stored + deflate 两种都要认）
{
  // 按 ZIP 规范手搓一个包：本地头 + 数据 ... + 中央目录 + EOCD
  const crc = (buf) => {
    let c = ~0
    for (const b of buf) {
      c ^= b
      for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
    }
    return ~c >>> 0
  }
  const makeZip = (files) => {
    const locals = []
    const centrals = []
    let at = 0
    for (const f of files) {
      const name = Buffer.from(f.name, 'utf8')
      const raw = Buffer.from(f.text, 'utf8')
      const body = f.method === 8 ? zlib.deflateRawSync(raw) : raw
      const lh = Buffer.alloc(30)
      lh.writeUInt32LE(0x04034b50, 0)
      lh.writeUInt16LE(20, 4)
      lh.writeUInt16LE(f.method, 8)
      lh.writeUInt32LE(crc(raw), 14)
      lh.writeUInt32LE(body.length, 18)
      lh.writeUInt32LE(raw.length, 22)
      lh.writeUInt16LE(name.length, 26)
      locals.push(lh, name, body)
      const cd = Buffer.alloc(46)
      cd.writeUInt32LE(0x02014b50, 0)
      cd.writeUInt16LE(20, 6)
      cd.writeUInt16LE(f.method, 10)
      cd.writeUInt32LE(crc(raw), 16)
      cd.writeUInt32LE(body.length, 20)
      cd.writeUInt32LE(raw.length, 24)
      cd.writeUInt16LE(name.length, 28)
      cd.writeUInt32LE(at, 42)
      centrals.push(cd, name)
      at += lh.length + name.length + body.length
    }
    const localBuf = Buffer.concat(locals)
    const cdBuf = Buffer.concat(centrals)
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(files.length, 8)
    eocd.writeUInt16LE(files.length, 10)
    eocd.writeUInt32LE(cdBuf.length, 12)
    eocd.writeUInt32LE(localBuf.length, 16)
    return Buffer.concat([localBuf, cdBuf, eocd])
  }
  const asFile = (name, buf) => ({ name, size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) })

  const zip = makeZip([
    { name: '行程.md', text: '# 西安六天\nD1 兵马俑', method: 8 },
    { name: '备注.txt', text: '忌口：不吃辣', method: 0 },
    { name: '__MACOSX/._行程.md', text: 'junk', method: 0 },
    { name: '.DS_Store', text: 'junk', method: 0 },
    { name: 'docs/', text: '', method: 0 },
  ])
  const got = await readZip(asFile('资料.zip', zip))
  ok('zip 认 deflate 压缩的条目', got.find((e) => e.name === '行程.md')
    && new TextDecoder().decode(got.find((e) => e.name === '行程.md').bytes) === '# 西安六天\nD1 兵马俑')
  ok('zip 认未压缩(stored)的条目', got.find((e) => e.name === '备注.txt')
    && new TextDecoder().decode(got.find((e) => e.name === '备注.txt').bytes) === '忌口：不吃辣')
  ok('zip 跳过 __MACOSX/隐藏项/目录项', got.length === 2)
  ok('zip 条目名按 UTF-8 解', got.every((e) => /^(行程\.md|备注\.txt)$/.test(e.name)))

  await assert.rejects(() => readZip(asFile('坏.zip', Buffer.from('not a zip at all'))), /不像个 zip/)
  ok('残包/非 zip 明确报错不假装收下', true)

  const many = makeZip(Array.from({ length: 8 }, (_, i) => ({ name: `f${i}.txt`, text: `x${i}`, method: 0 })))
  ok('maxEntries 封顶', (await readZip(asFile('多.zip', many), { maxEntries: 3 })).length === 3)
}

{
  const empty = { trip: null, planDraft: '', bubbles: [] }
  ok('会话：空会话不存', isEmptySession(empty) && sessionStage(empty) === 'empty')
  ok('会话：有大纲是 plan，有行程是 page', sessionStage({ ...empty, planDraft: 'D1…' }) === 'plan' && sessionStage({ ...empty, trip: { title: '西安' } }) === 'page')
  ok('会话标题：优先行程名，其次第一句用户话', sessionTitle({ trip: { title: '西安六日' }, bubbles: [] }) === '西安六日'
    && sessionTitle({ trip: null, bubbles: [{ role: 'assistant', text: '你好' }, { role: 'user', text: '成都  4天\n两人' }] }) === '成都 4天 两人'
    && sessionTitle({ trip: null, bubbles: [] }) === '新行程')
  ok('会话 id 不撞', newSessionId() !== newSessionId())
}

// 任务判断：目的地或人数变了是新任务，不带历史；其余都是同一任务
{
  const turn = (taskPlaces, taskPeople, nowPlaces, nowPeople) => ({ task: { places: taskPlaces, people: taskPeople }, now: { places: nowPlaces, people: nowPeople } })
  ok('任务：换了一个目的地是新任务', isNewTask(turn(['甲景点'], 3, ['乙景点'], null), '去乙景点玩'))
  ok('任务：城市和城市里的景点不算同一个目的地', isNewTask(turn(['丙城'], null, ['甲景点'], null), '去甲景点'))
  ok('任务：多加一个目的地也是新任务', isNewTask(turn(['甲景点'], null, ['甲景点', '乙景点'], null), '甲景点和乙景点都去'))
  ok('任务：同一组目的地只是写法、顺序不同仍是同一任务', !isNewTask(turn(['甲景点', '乙景点'], 3, ['「乙景点」', '甲景点 '], null), '还是甲景点和乙景点'))
  ok('任务：人数变了是新任务', isNewTask(turn(['甲景点'], 3, [], 2), '这次两个人'))
  ok('任务：这句没提目的地和人数就是同一任务', !isNewTask(turn(['甲景点'], 3, [], null), '晚饭换清淡一点'))
  ok('任务：认不出当前任务的目的地时不算变', !isNewTask(turn([], null, ['乙景点'], null), '去乙景点'))
  ok('任务：指着某一天某一格说话一定是同一任务', !isNewTask(turn(['甲景点'], 3, ['乙景点'], 2), 'D2第3格换成乙景点'))
  ok('人数：常见说法都认', countPeople('一家三口') === 3 && countPeople('两大一小') === 3 && countPeople('6个人去') === 6 && countPeople('两人轻装') === 2
    && countPeople('人均3000元') === null && countPeople('晚饭换一家') === null)
  ok('天数：第N天不算天数', statedDays('改成两日游') === 2 && statedDays('第3天轻松点') === null && statedDays('5天4晚') === 5)
  const parsed = parseTurn('{"task":{"places":["甲景点"],"people":3},"now":{"places":["乙景点"],"people":"x"},"action":"edit","prefs":["不吃辣","膝盖不好","不吃辣"]}')
  ok('解析：目的地和人数照收，认不出的人数当没说', parsed?.task.people === 3 && parsed.now.people === null && parsed.now.places.join() === '乙景点')
  ok('解析：偏好去重', parsed?.prefs.join() === '不吃辣,膝盖不好')
  ok('解析：回坏了不认', parseTurn('好的') === null && parseTurn('{"action":"whatever"}') === null)
  const off = localTurn('一家三口去甲景点', '这次两个人去', 3)
  ok('兜底：只比人数，目的地当作没变', off.source === 'local' && isNewTask(off, '这次两个人去') && !isNewTask(localTurn('一家三口去甲景点', '去乙景点', 3), '去乙景点'))
  ok('兜底：同一任务里分提问、换图、改天数、改行程', localTurn('', '这天累不累？', 3).action === 'ask' && localTurn('', 'D1的图换一张', 3).action === 'photos'
    && localTurn('', '改成两日游', 3).action === 'replan' && localTurn('', '晚饭换清淡一点', 3).action === 'edit')
  const oldTrip = { days: [{ slots: [{ name: '市区→甲山口→乙寺山下' }, { name: '乙寺' }, { name: '丙寺' }], dining: [{ place: '丁家小馆（老街）' }] }], hotelAreas: [{ area: '戊镇', options: [{ name: '乙寺农家宿舍' }] }] }
  const names = ['甲山', ...tripNames(oldTrip)]
  const said = ['两晚住甲山', '一晚乙寺、一晚戊镇', '包一辆7座车', '先三寺穿越', '晚上住乙寺农家宿舍', '不吃辣', '膝盖不好少爬坡', '住宿要安静', '带着老人']
  ok('偏好：地名店名、几晚先后、车型同行都不沿用', portablePrefs(said, names).join() === '不吃辣,膝盖不好少爬坡,住宿要安静')
  const scope = (taskPeople, nowPeople, prefs) => ({ task: { places: ['甲山'], people: taskPeople }, now: { places: ['己城'], people: nowPeople }, prefs })
  ok('偏好：筛完没剩就不问，直接生成', planPrefs(scope(6, 2, ['两晚住甲山', '包一辆7座车', '先三寺穿越']), names).mode === 'none')
  ok('偏好：人数没变直接沿用，不打断', planPrefs(scope(2, 2, ['不吃辣']), names).mode === 'carry' && planPrefs(scope(2, null, ['不吃辣']), names).mode === 'carry')
  ok('偏好：人数变了才问', planPrefs(scope(6, 2, ['不吃辣', '两晚住甲山']), names).mode === 'ask' && planPrefs(scope(6, 2, ['不吃辣', '两晚住甲山']), names).prefs.join() === '不吃辣')
  ok('沿用偏好写成一句用户原话', carryLine(['不吃辣', '少走路']) === '沿用上一趟的偏好：不吃辣；少走路' && carryLine([]) === '')
  const routeMsg = buildRouteMessages({ opening: '一家三口去甲景点', head: tripHead({ title: '甲景点三日', days: [{ slots: [{ name: '甲' }] }] }), said: ['不吃辣'], text: '去乙景点' })[0].content
  ok('分流消息：带任务开头、行程概要、之前说过的话和这一句', /任务开头那句：一家三口去甲景点/.test(routeMsg) && /1 天/.test(routeMsg) && /- 不吃辣/.test(routeMsg) && /用户这句：去乙景点/.test(routeMsg))
}

// 多轮脚本：同一任务按现有窗口和压缩带历史；新任务不带历史
{
  const flat = (msgs) => msgs.map((m) => m.content).join('\n')
  const session = () => ({ bubbles: [] })
  const say = (s, text, reply = '好的。') => {
    s.bubbles.push({ role: 'user', text }, { role: 'assistant', text: reply })
  }
  const planMsgs = (s, text) => buildPlanMessages({ brief: '', bubbles: s.bubbles, planDraft: 'D1 成都 宽窄巷子', text })
  const chatMsgs = (s, text, limit = 4) => buildChatMessages({ digest: '（摘要）', bubbles: s.bubbles, extra: [{ role: 'user', text }], limit })

  const s1 = session()
  say(s1, '膝盖不好、不吃辣、6 个人，去成都', 'D1 成都 …')
  say(s1, '偏人文和美食，想拍一次日出', 'D1 成都 …')
  const p1 = flat(planMsgs(s1, '改成4天3晚'))
  ok('同一任务：出大纲带着之前的用户原话', /膝盖不好、不吃辣、6 个人，去成都/.test(p1) && /偏人文和美食，想拍一次日出/.test(p1))
  ok('同一任务：本句不在「之前说过的话」里重复', (p1.match(/改成4天3晚/g) || []).length === 1)
  ok('上下文不再注入约束和画像', !/本趟硬约束|跨行程画像/.test(p1))
  ok('新任务：出大纲只有这一句', buildPlanMessages({ brief: '', bubbles: [], planDraft: '', text: '去乙景点' }).length === 1)
  ok('新任务：出页不带旧对话', !/膝盖不好/.test(flat(buildFillMessages({ brief: '', bubbles: [], plan: 'D1 乙景点' }))))

  const answered = '对以下问题的答复（按选项写入，不要再追问同一批）：\n1. 要不要去掉锦里，换成文殊院\n→ 保留锦里\n2. 住宿要连住吗\n→ A.连住'
  ok('点选答复：原话包里只留选项', userPack([{ role: 'user', text: answered }]).join() === '点选：保留锦里；A.连住')

  const s6 = session()
  say(s6, '晚饭想吃那家陈麻婆豆腐总店')
  s6.bubbles.push({ role: 'user', text: 'D2第2格改成文殊院' }, { role: 'assistant', text: '已写入页面：D2 第2格 → 文殊院' })
  for (let i = 0; i < 10; i++) say(s6, `第${i + 1}个随便问问：这里远不远`, '不远，步行十分钟。')
  const c10 = flat(chatMsgs(s6, '我前面说的那家店几点开门'))
  ok('滚动摘要：第13轮还记得最早那家店', /更早的对话/.test(c10) && /陈麻婆豆腐总店/.test(c10))
  ok('滚动摘要：带上已落到页面的改动', /已改：D2 第2格 → 文殊院/.test(c10))
  for (let i = 0; i < 40; i++) say(s6, `再问一句第${i}次：这里远不远呀`, '不远。')
  const c50 = flat(chatMsgs(s6, '还有吗'))
  ok('滚动摘要：50轮后上下文不线性增长', c50.length < 1400 && c50.length - c10.length < 400)
  ok('原话包封顶约 600 字', userPack(s6.bubbles).join('').length <= 600)
  const w = splitWindow(s6.bubbles, 4)
  ok('窗口切分：窗口+窗口外不重不漏', w.window.length === 4 && w.older.length === s6.bubbles.length - 4)
}

// 7. FILL 后质检：三餐店名、规划条、住宿注记
{
  const bare = {
    days: [{ theme: 'D1', slots: dayWith('待定').slots }],
  }
  const bareIssues = qualityChecklist(bare)
  ok('质检：没店名、没规划条、没住宿都会被点名', bareIssues.some((x) => x.includes('早餐没有具体店名')) && bareIssues.some((x) => x.includes('缺负荷')) && bareIssues.some((x) => x.includes('没有住宿片区')))

  const filled = normalizeTrip({
    ...BASE,
    days: [{
      theme: 'D1',
      slots: dayWith('成都宾馆').slots,
      dining: [
        { meal: '早餐', place: '宽窄巷子蒸饺' },
        { meal: '午餐', place: '鹤鸣茶社' },
        { meal: '晚餐', place: '陈麻婆豆腐' },
      ],
      craft: {
        load: { level: '轻', walk: '少走路', why: '收尾' },
        rain: { cut: '锦里', keep: '茶馆', instead: '改室内' },
        park: { leave: '宽窄巷子停车场', then: '停稳再走', pickup: '原处取车' },
      },
    }],
    hotelAreas: [{
      area: '宽窄巷子',
      options: [{ tier: '中档', name: '成都宽窄巷子亚朵酒店', access: { note: '适老：电梯', status: '待核实' } }],
    }],
  })
  ok('质检：三餐、规划条、住宿注记都在则通过', qualityChecklist(filled).length === 0)

  const placeholders = qualityChecklist({
    days: [{
      dining: [
        { meal: '早餐', place: '住宿店内或就近清淡早餐' },
        { meal: '午餐', place: '景点附近午餐' },
        { meal: '晚餐', place: '当日晚餐' },
      ],
      craft: filled.days[0].craft,
    }],
    hotelAreas: filled.hotelAreas,
  })
  ok('质检：占位餐名不算已填', ['早餐', '午餐', '晚餐'].every((meal) => placeholders.some((x) => x.includes(`${meal}没有具体店名`))))

  const generic = normalizeTrip({
    ...BASE,
    days: [{ theme: 'D1', slots: dayWith('成都宾馆').slots }],
    hotelAreas: [{ area: '宽窄巷子', options: [{ tier: '中档', name: '成都宽窄巷子亚朵酒店' }] }],
  })
  const genericIssues = qualityChecklist(generic)
  ok('质检：归一化后仍是占位的午餐继续被点名', genericIssues.includes('D1 午餐没有具体店名'))
  ok('质检：程序补上的规划条和住宿注记不再报缺', !genericIssues.some((x) => /缺负荷|缺雨天|缺停车|缺适老/.test(x)))
}

// 9. 通用规则：账号隔离、当日雨备、任意地点的开放时间
{
  ok('邮箱不像邮箱就不收', normalizeEmail('jia') === '' && normalizeEmail('13800138000') === '')

  const rainTrip = {
    startDate: '2026-10-01',
    days: [
      { slots: [{ name: '甲点' }] },
      { slots: [{ name: '乙点' }, { name: '丙点' }], craft: { rain: { cut: '丙点', instead: '改去室内' } } },
    ],
  }
  const dry = todayAdvice(rainTrip, { now: new Date(2026, 9, 2), rain: false })
  const wet = todayAdvice(rainTrip, { now: new Date(2026, 9, 2), rain: true })
  ok('当日对上第二天', dry.inTrip && dry.dayLabel === 'D2' && /乙点/.test(dry.detail))
  ok('下雨改雨备', wet.headline.includes('改雨备') && /丙点/.test(wet.detail) && /室内/.test(wet.detail))
  ok('日期对不上就明说', todayAdvice(rainTrip, { now: new Date(2026, 10, 1) }).headline === '今天不在这趟日期里')

  const parsed = parseOpenText('周一闭馆 09:00-17:00')
  ok('开放时间文本能拆出窗口和闭馆日', parsed.open === '09:00-17:00' && parsed.closedWeekdays.join() === '1')
  ok('没有时刻的句子不造窗口', parseOpenText('随时可看') == null)
  const windows = [{ name: '甲馆', open: '09:00-17:00', from: '2026-10-01', to: '2026-10-07' }]
  const late = hoursIssues({
    startDate: '2026-10-03',
    days: [{ slots: [{ name: '甲馆', time: '18:00' }] }],
  }, windows)
  ok('任意地点排在窗口外会被拦住', late.some((item) => item.includes('甲馆') && item.includes('09:00-17:00')))
  const daytime = hoursIssues({
    startDate: '2026-10-03',
    days: [{ slots: [{ name: '甲馆', time: '10:00' }] }],
  }, windows)
  ok('窗口内不误伤', daytime.length === 0)
  const outside = hoursIssues({
    startDate: '2026-11-03',
    days: [{ slots: [{ name: '甲馆', time: '19:00' }] }],
  }, windows)
  ok('日期不在窗口范围内不拦', outside.length === 0)
  const monday = hoursIssues({
    startDate: '2026-10-05',
    days: [{ slots: [{ name: '乙馆', time: '10:00' }] }],
  }, [{ name: '乙馆', closedWeekdays: [1] }])
  ok('闭馆日对任意地点生效', monday.some((item) => item.includes('乙馆') && item.includes('闭馆日')))
  ok('没带开放时间就不查', qualityChecklist({ startDate: '2026-10-03', days: [{ slots: [{ name: '甲馆', time: '19:00' }] }] }).every((item) => !item.includes('开放到')))
}

const file = path.join(os.tmpdir(), `tm-users-${Date.now()}.sqlite`)
const sink = []
async function oneCode(purpose, account) {
  sink.length = 0
  const sent = await requestVerify({ purpose, account, file, sink, minInterval: 0 })
  if (!sent.ok) throw new Error(sent.error || '验证码没发出')
  return sink[0].code
}
const mail = 'jia@example.com'
const other = 'yi@example.com'
const pass = 'travel-pass-1'
const otherPass = 'trek-pass-22'
const mailCode = await oneCode('register', mail)
const first = await registerUser({ account: mail, code: mailCode, password: pass, file })
const otherCode = await oneCode('register', other)
const second = await registerUser({ account: other, code: otherCode, password: otherPass, file })
ok('两个邮箱各自注册', first.ok && first.username === mail && second.ok && second.username === other && !('profile' in first))
ok('手机号不能当账号', (await registerUser({ account: '13800138000', code: '000000', password: pass, file })).error === '请填写邮箱')
ok('验证码不对注册不了', (await registerUser({ account: 'bing@example.com', code: '000000', password: pass, file })).ok === false)
ok('密码太短注册不了', (await registerUser({ account: 'bing@example.com', code: '000000', password: 'short', file })).error === '密码至少 8 位')
ok('密码不对就登录不了', (await loginUser({ account: mail, password: otherPass, file })).error === '密码不对')
const again = await loginUser({ account: mail, password: pass, file })
ok('邮箱和密码对了就登录成功', again.ok && sessionUser(again.token, file).username === mail)
ok('用过的验证码不能再注册', (await registerUser({ account: mail, code: mailCode, password: pass, file })).ok === false)
ok('两个账号的登录状态互不串', sessionUser(second.token, file).username === other)
const raw = fs.readFileSync(file, 'utf8')
ok('验证码和密码不明文落在数据库', raw.startsWith('SQLite format 3') && !raw.includes(mailCode) && !raw.includes(pass) && !raw.includes(otherPass))

const askPlan = '人格：旅居\nD1 2026-10-12：岚山 / 竹林 / 午休 / 天龙寺 / 住岚山 / 早·A / 午·B / 晚·C\n住宿片区：岚山\n待确认：\n1. 樱花季具体日期定了吗？花期决定岚山与奈良公园哪天去。\n答案：A.定了 B.没定'
ok('大纲兜底标题不拿待确认问句', tripFromPlan(askPlan).title === '1 日行程')
ok('大纲兜底标题用用户第一句话', tripFromPlan(askPlan, '京都、奈良5天4晚、两人，偏寺庙、樱花、咖啡和人文古迹和，住町屋').title === '京都奈良 5 日 · 寺庙与樱花')
ok('第一句话标题：目的地带周边、主题取前两项', askTitle('深圳周边3天2晚、一家三口，偏亲子与海边，住较场尾', 3) === '深圳周边 3 日 · 亲子与海边')
ok('第一句话认不出目的地就不硬凑', askTitle('帮我规划一下下个月出去玩的行程，想轻松一点的那种安排', 2) === '')
ok('模型写成问句的标题会被换掉', tripTitle({ title: '1. 樱花季具体日期定了吗？', days: [{ theme: '京都岚山' }, { theme: '奈良' }] }) === '京都 2 日行程')
ok('正常标题原样保留', tripTitle({ title: '京都奈良 5 日寺社之旅', days: [{}] }) === '京都奈良 5 日寺社之旅')

const noon = Date.parse('2026-10-11T04:00:00Z')
ok('没登录不能用服务端模型', takeQuota('', 2, { file, now: noon }).ok === false)
ok('登录后按次计数', takeQuota(again.token, 2, { file, now: noon }).used === 1 && takeQuota(again.token, 2, { file, now: noon }).used === 2)
ok('失败可退回额度', refundQuota(again.token, { file, now: noon }).used === 1 && quotaLeft(again.token, 2, { file, now: noon }) === 1)
ok('退回后再扣仍计数', takeQuota(again.token, 2, { file, now: noon }).used === 2)
ok('当天用满就拒绝', takeQuota(again.token, 2, { file, now: noon }).ok === false && quotaLeft(again.token, 2, { file, now: noon }) === 0)
ok('另一个账号的次数不受影响', quotaLeft(second.token, 2, { file, now: noon }) === 2)
ok('第二天次数重置', quotaLeft(again.token, 2, { file, now: noon + 24 * 3600 * 1000 }) === 2)

const fakeServer = { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-server-secret-0000000000', baseUrl: '' }
const yes = () => ({ ok: true })
const picked = pickModel({ apiKey: '', messages: [1] }, 'tok', 'plan', { server: fakeServer, quota: yes })
ok('没填密钥时用服务端模型', picked.apiKey === fakeServer.apiKey && picked.model === 'deepseek-chat')
ok('自己填了密钥就用自己的，不扣服务端次数', pickModel({ apiKey: 'sk-own-key-1234567890abcd', model: 'm', provider: 'openai' }, '', 'plan', { server: fakeServer, quota: () => { throw new Error('不该计次') } }).provider === 'openai')
ok('服务端次数用完给出提示', (() => { try { pickModel({ apiKey: '' }, 'tok', 'plan', { server: fakeServer, quota: () => ({ ok: false, error: '今天的 2 次免费额度已经用完' }) }); return false } catch (err) { return /用完/.test(err.message) } })())
ok('分流请求单独封顶，不占用户次数', (() => {
  const calls = []
  pickModel({ apiKey: '' }, 'tok', 'route', { server: fakeServer, quota: (t, limit, opts) => { calls.push({ limit, bucket: opts?.bucket }); return { ok: true } } })
  return calls.length === 1 && calls[0].bucket === 'route' && calls[0].limit > 10
})())
ok('分流请求伪装不了：封顶后同样拦下', takeQuota(again.token, 1, { file, now: noon, bucket: 'route' }).ok && takeQuota(again.token, 1, { file, now: noon, bucket: 'route' }).ok === false && quotaLeft(again.token, 2, { file, now: noon }) === 0)
ok('服务端没配模型时仍要求填 API Key', (() => { try { pickModel({ apiKey: '' }, 'tok', 'plan', { server: null }); return false } catch (err) { return /API Key/.test(err.message) } })())

const savedEnv = { ...process.env }
Object.assign(process.env, {
  LLM_PROVIDER: 'deepseek', LLM_MODEL: 'deepseek-chat', LLM_API_KEY: 'sk-env-secret-123456789',
  AMAP_KEY: 'amap-secret-1', TIANDITU_KEY: 'tdt-secret-1',
  SEARCH_KEY: 'search-secret-1', SEARCH_PROVIDER: 'bocha',
  SEARCH_FALLBACK_KEY: 'fallback-secret-1', SEARCH_FALLBACK_PROVIDER: 'tavily',
  LLM_DAILY_LIMIT: '30',
})
const pub = JSON.stringify(publicConfig())
ok('配置接口只说配没配，不回传密钥', pub.includes('"amap":true') && pub.includes('"tianditu":true') && pub.includes('"dailyLimit":30') && !/secret/.test(pub))
const keys = dataKeys({ amapKey: '', tiandituKey: '', searchKey: '' })
ok('地图和搜索没填时用服务端的', keys.amapKey === 'amap-secret-1' && keys.tiandituKey === 'tdt-secret-1' && keys.searchKey === 'search-secret-1' && keys.searchProvider === 'bocha')
ok('搜索备用从服务端带出', keys.searchFallbackKey === 'fallback-secret-1' && keys.searchFallbackProvider === 'tavily')
ok('用户自己填的地图和搜索优先', dataKeys({ amapKey: 'mine', searchKey: 'mine2', searchProvider: 'tavily' }).searchProvider === 'tavily' && dataKeys({ amapKey: 'mine' }).amapKey === 'mine')
ok('用户只填主源时仍带服务端备用', dataKeys({ searchKey: 'mine2', searchProvider: 'bocha' }).searchFallbackKey === 'fallback-secret-1')
for (const key of ['LLM_PROVIDER', 'LLM_MODEL', 'LLM_API_KEY', 'AMAP_KEY', 'TIANDITU_KEY', 'SEARCH_KEY', 'SEARCH_PROVIDER', 'SEARCH_FALLBACK_KEY', 'SEARCH_FALLBACK_PROVIDER', 'LLM_DAILY_LIMIT']) {
  if (key in savedEnv) process.env[key] = savedEnv[key]
  else delete process.env[key]
}

{
  const origFetch = globalThis.fetch
  const called = []
  globalThis.fetch = async (url) => {
    const u = String(url)
    called.push(u)
    if (u.includes('bochaai')) {
      return { ok: false, status: 401, json: async () => ({ message: '额度不足' }) }
    }
    if (u.includes('tavily')) {
      return { ok: true, status: 200, json: async () => ({ results: [{ title: '备用命中', content: 'ok', url: 'https://example.com' }] }) }
    }
    return { ok: false, status: 500, json: async () => ({}) }
  }
  const hits = await searchWeb('测试查询', {
    searchKey: 'bocha-key',
    searchProvider: 'bocha',
    searchFallbackKey: 'tavily-key',
    searchFallbackProvider: 'tavily',
  })
  globalThis.fetch = origFetch
  ok('博查失败自动回退 Tavily', hits.length === 1 && hits[0].title === '备用命中' && called.some((u) => u.includes('bochaai')) && called.some((u) => u.includes('tavily')))
}

const smtp = await new Promise((resolve) => {
  const letters = []
  let mode = 'cmd'
  let data = ''
  const server = net.createServer((socket) => {
    socket.write('220 ready\r\n')
    socket.on('data', (buf) => {
      const text = buf.toString()
      if (mode === 'data') {
        data += text
        if (data.includes('\r\n.\r\n')) {
          letters.push(data)
          mode = 'cmd'
          data = ''
          socket.write('250 ok\r\n')
        }
        return
      }
      const line = text.trim()
      if (/^DATA/i.test(line)) {
        mode = 'data'
        socket.write('354 go\r\n')
      } else if (/^QUIT/i.test(line)) socket.write('221 bye\r\n')
      else socket.write('250 ok\r\n')
    })
  })
  server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, letters }))
})
await sendMail({ to: mail, code: '654321', host: '127.0.0.1', port: smtp.port, secure: false, user: '', pass: '', from: 'code@example.com' })
await new Promise((resolve) => smtp.server.close(resolve))
ok('邮件验证码能从 SMTP 发出去', smtp.letters.some((letter) => letter.includes('654321') && letter.includes(mail)))

console.log(`\nGOLDEN ALL PASS (${n})`)
