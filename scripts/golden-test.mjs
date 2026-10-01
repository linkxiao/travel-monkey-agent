// Golden 回归集：内容稳的证据链（离线可跑，不调外部网络）。
// 跑法：npm run golden
import assert from 'node:assert'
import fs from 'node:fs'
import { normalizeTrip } from '../server/viz.mjs'
import { researchQuery } from '../server/research.mjs'
import { resolveTargets } from '../src/lib/target.ts'
import { applyAdds, applyChanges, applyPhotoTo, applyReplaceDays, collectPhotoRequest, collectPhotos, explicitPhotoQuery, extractEnvelope, findUnseenInHtml, inferChangesFromText, inferEditFrom, photoOutcome, stripEditClaim, wantsPhotos, wantsTripEdit } from '../src/lib/trip.ts'
import { mentionedDays } from '../src/lib/target.ts'
import zlib from 'node:zlib'
import { wantsVision } from '../src/lib/attach.ts'
import { readZip } from '../src/lib/zip.ts'
import { avoidHits, extractFacts, factsBlock, learnFromModel, learnFromUser, mergeFacts, modelDrops, normalizeModelFacts, planAvoidHits, removeFact, takeMemo } from '../src/lib/memory.ts'
import { buildChatMessages, buildPlanMessages, splitWindow, userPack } from '../src/lib/context.ts'
import { isEmptySession, newSessionId, sessionStage, sessionTitle } from '../src/lib/session.ts'
import { attachImages, loadImageForModel } from '../server/images.mjs'
import { enrichTripPhotos } from '../server/photos.mjs'
import { enrichTripTransport } from '../server/transport.mjs'

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

// 5. 交通：城际走驾车 + 按人格选步行/公交（fetch 打桩，离线）
{
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const u = String(url)
    const j = (o) => ({ json: async () => o })
    if (u.includes('direction/driving')) return j({ route: { paths: [{ duration: '5400' }] } })
    if (u.includes('transit/integrated')) return j({ route: { transits: [{ duration: '1500' }] } })
    return j({ route: { paths: [{ duration: '1800' }] } })
  }
  try {
    const mk = (lat, lng, name) => ({ name, lat, lng })
    const t1 = { title: 'x', persona: 'stay', days: [{ slots: [mk(35.0, 102.9, 'A'), mk(33.5, 102.9, 'B')] }] }
    await enrichTripTransport(t1, 'K')
    ok('城际自驾', t1.days[0].slots[1].transport.mode === '自驾/包车' && t1.days[0].slots[1].transport.intercity === true)
    const t2 = { title: 'x', persona: 'stay', days: [{ slots: [mk(31.0, 121.4, 'A'), mk(31.01, 121.41, 'B')] }] }
    await enrichTripTransport(t2, 'K')
    ok('旅居转公交', t2.days[0].slots[1].transport.mode === '公交/地铁')
    const t3 = { title: 'x', persona: 'trek', days: [{ slots: [mk(31.0, 121.4, 'A'), mk(31.01, 121.41, 'B')] }] }
    await enrichTripTransport(t3, 'K')
    ok('探秘保留步行', t3.days[0].slots[1].transport.mode === '步行')
  } finally {
    globalThis.fetch = realFetch
  }
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
  const has = (facts, key, value) => facts.some((f) => f.key === key && f.value === value)

  const t1 = extractFacts('我膝盖不好、不吃辣，6个人去西安，国庆5天4晚，从深圳出发，没车')
  ok('约束：身体/忌口/人数一次抽齐', has(t1, 'body', '膝盖不好') && has(t1, 'diet', '不吃辣') && has(t1, 'party', '6人'))
  ok('约束：日期/天数/出发地/交通', has(t1, 'dates', '国庆') && has(t1, 'length', '5天4晚') && has(t1, 'origin', '从深圳出发') && has(t1, 'transport', '没车'))

  const t2 = extractFacts('一家三口带老人，海鲜过敏，酒店要有电梯，人均3000元')
  ok('约束：家庭构成/过敏/住宿/人均', has(t2, 'party', '一家三口') && has(t2, 'party', '带老人') && has(t2, 'diet', '海鲜过敏') && has(t2, 'stay', '电梯') && has(t2, 'budget', '人均3000元'))

  ok('约束：问句不当约束', extractFacts('酒店有电梯吗？要不要自驾？').length === 0)
  ok('约束：第N天/前两天不当天数', !extractFacts('第3天改轻松点，前两天别太赶').some((f) => f.key === 'length'))
  ok('约束：日期区间', has(extractFacts('10月3日到10月8日去'), 'dates', '10月3日—10月8日'))
  ok('约束：改行程的话不误抽', extractFacts('D2第2格改成翠华山').length === 0)

  // 验收：第 1 轮说的三条，第 3 轮改天数后还在
  let board = mergeFacts([], extractFacts('膝盖不好、不吃辣、6 个人，去成都'))
  board = mergeFacts(board, extractFacts('偏人文和美食'))
  board = mergeFacts(board, extractFacts('改成4天3晚'))
  const block = factsBlock(board)
  ok('验收：三轮后硬约束全在注入块里', /膝盖不好/.test(block) && /不吃辣/.test(block) && /6人/.test(block) && /4天3晚/.test(block))

  board = mergeFacts(board, extractFacts('改成5天'))
  ok('天数单值：新的顶掉旧的', board.filter((f) => f.key === 'length').length === 1 && has(board, 'length', '5天'))
  board = mergeFacts(board, extractFacts('又加了两个朋友，8个人'))
  ok('人数单值：8人顶掉6人', board.filter((f) => f.key === 'party').map((f) => f.value).join() === '8人')
  ok('人数换新时带老人之类并存', mergeFacts(extractFacts('带老人，6个人'), extractFacts('8个人')).map((f) => f.value).sort().join() === '8人,带老人')
  board = mergeFacts(board, extractFacts('不吃辣'))
  ok('同一条不重复记', board.filter((f) => f.key === 'diet').length === 1)
  ok('删掉一条后注入块里没了', !/不吃辣/.test(factsBlock(removeFact(board, { key: 'diet', value: '不吃辣' }))))
  ok('没约束时不注入', factsBlock([]) === '')
  ok('注入块按类别分行', /^- 同行：8人$/m.test(factsBlock(board)) && /^- 忌口：不吃辣$/m.test(factsBlock(board)))

  const mf = normalizeModelFacts([{ k: '忌口', v: '不吃香菜' }, { key: 'body', value: '晕车' }, { k: '心情', v: '开心' }, 'x', { k: '同行', v: '' }])
  ok('模型 facts：认中英文键、丢未知类别和空值', mf.length === 2 && has(mf, 'diet', '不吃香菜') && has(mf, 'body', '晕车') && mf.every((f) => f.source === 'model'))
  const env = extractEnvelope('{"reply":"好","changes":[],"facts":[{"k":"预算","v":"预算5000"}]}')
  ok('改表回复带出 facts', env && env.facts.length === 1 && normalizeModelFacts(env.facts)[0].key === 'budget')

  const big = mergeFacts([], Array.from({ length: 20 }, (_, i) => ({ key: 'stay', value: `要求${i}号`, source: 'user', at: i })))
  ok('约束板封顶 16 条', big.length === 16 && big[15].value === '要求19号')

  const empty = { trip: null, planDraft: '', bubbles: [], facts: [] }
  ok('会话：空会话不存', isEmptySession(empty) && sessionStage(empty) === 'empty')
  ok('会话：只有约束也算有内容', !isEmptySession({ ...empty, facts: t1 }))
  ok('会话：有大纲是 plan，有行程是 page', sessionStage({ ...empty, planDraft: 'D1…' }) === 'plan' && sessionStage({ ...empty, trip: { title: '西安' } }) === 'page')
  ok('会话标题：优先行程名，其次第一句用户话', sessionTitle({ trip: { title: '西安六日' }, bubbles: [] }) === '西安六日'
    && sessionTitle({ trip: null, bubbles: [{ role: 'assistant', text: '你好' }, { role: 'user', text: '成都  4天\n两人' }] }) === '成都 4天 两人'
    && sessionTitle({ trip: null, bubbles: [] }) === '新行程')
  ok('会话 id 不撞', newSessionId() !== newSessionId())
}

// 多轮脚本：模拟 App 的一轮（先记约束，再拼消息），逐轮核对发给模型的内容
{
  const has = (facts, key, value) => facts.some((f) => f.key === key && f.value === value)
  const flat = (msgs) => msgs.map((m) => m.content).join('\n')
  const session = () => ({ facts: [], bubbles: [] })
  const say = (s, text, reply = '好的。') => {
    s.facts = learnFromUser(s.facts, text)
    s.bubbles.push({ role: 'user', text }, { role: 'assistant', text: reply })
  }
  const planMsgs = (s, text) => buildPlanMessages({ brief: '', facts: learnFromUser(s.facts, text), bubbles: s.bubbles, planDraft: 'D1 成都 宽窄巷子', text })
  const chatMsgs = (s, text, limit = 4) => buildChatMessages({ facts: s.facts, digest: '（摘要）', bubbles: s.bubbles, extra: [{ role: 'user', text }], limit })

  // 场景 1：软偏好不在约束板里，靠用户原话带到后面
  const s1 = session()
  say(s1, '膝盖不好、不吃辣、6 个人，去成都', 'D1 成都 …')
  say(s1, '偏人文和美食，想拍一次日出', 'D1 成都 …')
  const p1 = flat(planMsgs(s1, '改成4天3晚'))
  ok('多轮：第3轮出大纲带着硬约束', /膝盖不好/.test(p1) && /不吃辣/.test(p1) && /6人/.test(p1) && /4天3晚/.test(p1))
  ok('多轮：第3轮出大纲带着软偏好原话', /偏人文和美食，想拍一次日出/.test(p1))
  ok('多轮：本句不在「之前说过的话」里重复', (p1.match(/改成4天3晚/g) || []).length === 1)

  // 场景 2：否决清单
  const s2 = session()
  say(s2, '成都3天，不去熊猫基地，人太多')
  ok('否决：记下不去', has(s2.facts, 'avoid', '熊猫基地') && /- 不去：熊猫基地（不要再排进行程）/.test(factsBlock(s2.facts)))
  const tripWith = (name) => ({ days: [{ slots: [{ name: '宽窄巷子' }, { name }], dining: [{ place: '陈麻婆豆腐' }] }] })
  ok('否决：出页后本机查得到又排进来的点', avoidHits(tripWith('成都大熊猫繁育研究基地'), s2.facts).join() === '熊猫基地'
    && avoidHits(tripWith('武侯祠'), s2.facts).length === 0)
  ok('否决：大纲按天行里出现才算，复述「不去」不算', planAvoidHits('D1 成都：熊猫基地 / 锦里', s2.facts).length === 1
    && planAvoidHits('D1 成都：宽窄巷子 / 成都大熊猫繁育研究基地 / 锦里', s2.facts).length === 1
    && planAvoidHits('D1 成都：宽窄巷子 / 锦里 / 住春熙路一带', s2.facts).length === 0
    && planAvoidHits('已按你说的不去熊猫基地\nD1 成都：武侯祠 / 锦里', s2.facts).length === 0)
  say(s2, '还是去熊猫基地吧，孩子想看')
  ok('否决：改口「还是去」就撤掉', !s2.facts.some((f) => f.key === 'avoid'))
  say(s2, '一定要去都江堰')
  say(s2, '算了，都江堰不去了，去掉都江堰')
  ok('必去与不去互斥：后说的赢', has(s2.facts, 'avoid', '都江堰') && !has(s2.facts, 'must', '都江堰'))
  ok('否决：「去掉午休」「删掉D2第3格」「不想去太远的地方」不当地点',
    extractFacts('去掉午休，删掉D2第3格，不想去太远的地方').filter((f) => f.key === 'avoid').length === 0)

  // 场景 3：改口撤约束
  const s3 = session()
  say(s3, '带老人，6个人，不吃辣，酒店要电梯')
  say(s3, '其实能吃辣了')
  ok('改口：能吃辣了 → 撤掉不吃辣', !s3.facts.some((f) => f.key === 'diet'))
  say(s3, '老人不去了')
  ok('改口：老人不去了 → 撤掉带老人，人数保留', !has(s3.facts, 'party', '带老人') && has(s3.facts, 'party', '6人'))
  say(s3, '不带老人，也不需要电梯')
  ok('改口：「不带老人」「不需要电梯」不会反被记成约束', !has(s3.facts, 'party', '带老人') && !s3.facts.some((f) => f.key === 'stay'))
  ok('改口：「不能吃辣」不是改口', learnFromUser(learnFromUser([], '不吃辣'), '我不能吃辣').some((f) => f.key === 'diet'))

  // 场景 4：模型补抽（出大纲 / 聊天回复末尾的「记下：」行）
  const memo = takeMemo('D1 成都：武侯祠 / 锦里\n待确认：…\n记下：忌口=不吃香菜；不去=春熙路；作废=同行:带老人')
  ok('记下行：从显示里去掉', !/记下/.test(memo.text) && /D1 成都/.test(memo.text))
  ok('记下行：新约束与作废都认', has(memo.facts, 'diet', '不吃香菜') && has(memo.facts, 'avoid', '春熙路') && memo.drops.length === 1 && memo.drops[0].key === 'party')
  ok('记下行：作废生效', !has(learnFromModel(learnFromUser([], '带老人'), memo), 'party', '带老人'))
  ok('改表 facts 支持 drop', modelDrops([{ k: '忌口', v: '不吃辣', drop: true }, { k: '忌口', v: '不吃香菜' }]).length === 1)

  // 场景 5：附件里的备注、点选答复
  ok('附件备注也抽', has(learnFromUser([], '看看这个\n附件内容：忌口：不吃辣，从深圳出发'), 'diet', '不吃辣'))
  const answered = '对以下问题的答复（按选项写入，不要再追问同一批）：\n1. 要不要去掉锦里，换成文殊院\n→ 保留锦里\n2. 住宿要连住吗\n→ A.连住'
  const fromAns = learnFromUser(learnFromUser([], '不去锦里'), answered)
  ok('点选答复：只看用户选的，不被模型问句带偏', !has(fromAns, 'avoid', '锦里') && has(fromAns, 'stay', '连住'))
  ok('点选答复：原话包里只留选项', userPack([{ role: 'user', text: answered }]).join() === '点选：保留锦里；A.连住')

  // 场景 6：出页后长对话，窗口外有本机摘要，长度不随轮数涨
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

console.log(`\nGOLDEN ALL PASS (${n})`)
