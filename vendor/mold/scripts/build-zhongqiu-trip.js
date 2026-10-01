const fs = require('fs');
const path = require('path');

const src = JSON.parse(fs.readFileSync(path.join(__dirname, 'shudao-trip.json'), 'utf8'));
const trip = JSON.parse(JSON.stringify(src));

const DATE_MAP = {
  '2026-10-01': '2026-09-25',
  '2026-10-02': '2026-09-26',
  '2026-10-03': '2026-09-27',
  '2026-10-04': '2026-09-28',
  '2026-10-05': '2026-09-29',
  '2026-10-07': '2026-09-30',
};

function remapText(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/9\/30 晚飞/g, '9/24 晚飞')
    .replace(/9\/30 夜抵/g, '9/24 夜抵')
    .replace(/9\/30 先到/g, '9/24 先到')
    .replace(/9\/30 两人/g, '9/24 两人')
    .replace(/9\/30 先飞/g, '9/24 先飞')
    .replace(/10\/1–10\/7/g, '9/25–9/30')
    .replace(/10\/1/g, '9/25')
    .replace(/10\/2/g, '9/26')
    .replace(/10\/3/g, '9/27')
    .replace(/10\/4/g, '9/28')
    .replace(/10\/5/g, '9/29')
    .replace(/10\/7/g, '9/30')
    .replace(/国庆档/g, '中秋档')
    .replace(/国庆首日/g, '中秋假期首日')
    .replace(/国庆高速免费/g, '中秋假期（约 9/25–27）高速免费')
    .replace(/国庆免费通行/g, '中秋假期（约 9/25–27）免费通行')
    .replace(/国庆小型客车高速免费/g, '中秋假期（约 9/25–27）小型客车高速免费')
    .replace(/10 月剑山红叶/g, '9 月末剑山红叶')
    .replace(/10 月夜凉/g, '9 月末夜凉')
    .replace(/10 月初/g, '9 月末')
    .replace(/国庆 G5/g, '中秋 G5')
    .replace(/国庆堵车/g, '假期堵车')
    .replace(/国庆红叶季 \+ 假期车流峰值/g, '中秋前后红叶初染 + 假期车流')
    .replace(/国庆机票/g, '中秋机票')
    .replace(/国庆参考/g, '中秋参考')
    .replace(/国庆上浮/g, '中秋上浮')
    .replace(/国庆可能/g, '中秋可能')
    .replace(/国庆价格/g, '中秋价格')
    .replace(/国庆房/g, '中秋房')
    .replace(/国庆人多/g, '中秋人仍不少')
    .replace(/国庆热门/g, '中秋热门')
    .replace(/国庆安检/g, '返程安检')
    .replace(/国庆只订/g, '中秋只订')
    .replace(/国庆非实时/g, '中秋非实时')
    .replace(/（国庆）/g, '（中秋）')
    .replace(/国庆建议/g, '中秋建议')
    .replace(/全程酒店（国庆）/g, '全程酒店（中秋）');
}

function walk(node) {
  if (Array.isArray(node)) {
    node.forEach(function (item, i) {
      if (typeof item === 'string') node[i] = remapText(item);
      else walk(item);
    });
    return;
  }
  if (!node || typeof node !== 'object') return;
  Object.keys(node).forEach(function (k) {
    if (typeof node[k] === 'string') node[k] = remapText(node[k]);
    else walk(node[k]);
  });
}

walk(trip);

trip.startDate = '2026-09-25';
trip.checklistStart = '2026-09-01';
trip.weekdayHidden = true;
trip.ui = {
  heroEyebrow: '中秋 · 深圳 / 北京出发 · 成都汇合 · 6天5晚',
  heroBanner: 'travel-assets/xian/banner-user-forest3.jpg',
  heroBadge: '抄手铺 · 剑昭 · 武侯祠',
  preTripTitle: '行前须知 · 中秋九月',
  weatherLabel: '9月天气',
  dayHeaderStyle: 'day-date',
  startBadge: '2026.9.25',
  endBadge: '2026.9.30',
};

trip.preTrip.weather = {
  summary: '中秋档 9/25–9/30：川北剑阁约 16–24°C，汉中约 15–23°C，西安约 14–24°C；比国庆略暖，昼夜仍有温差。古道与秦岭多秋雨薄雾，银杏刚转色。9/25–27 为假期车流高峰，9/28–30 明显松一些。',
  typhoon: '无台风。9 月末川北/陕南常见阴雨，石板湿滑；出发前 3 天看「剑阁天气」「汉中天气」「西安天气」及山洪地质灾害预警。中秋假期（约 9/25–27）小型客车高速多免费，9/28–30 可能恢复收费，以当年政策为准。',
};

trip.preTrip.packing = '冲锋衣/薄羽绒 + 速干长袖长裤 + 防滑徒步鞋（必带，古道石板湿滑）+ 登山杖 + 头灯 + 防雨罩；早晚凉、午间暖，洋葱式穿衣；备雨衣而非只带伞。';
trip.preTrip.ticketTip = '中秋机票/租车/酒店从 9 月 1 日起锁定。剑门关门票+猿猱道/鸟道提前 1–7 天「剑门关旅游区」公众号实名预约；华清宫《长恨歌》约提前 9 天官微抢。返程西安→深圳/北京尽早订 9/30 晚班。';

trip.hotelAreas = trip.hotelAreas.filter(function (a) {
  return a.area.indexOf('黄峪') === -1;
});
trip.hotelAreas.forEach(function (a) {
  if (a.area.indexOf('汉唐驿') !== -1) {
    a.area = '西安钟楼 · 汉唐驿（9/29 一晚）';
    a.reason = '9/29 入驻汉唐驿·唐风美学民宿（新城区南长巷 7 号，近钟楼/新城广场，不是长安区）。步行约 12–18 分钟到永宁门；次日一早去大雁塔约 20–30 分钟。中秋只订这一晚。';
  }
  if (a.area.indexOf('汉台区') !== -1) {
    a.reason = '9/28 夜宿。下午西去勉县武侯祠约 50–70 分钟；次日北上石门约 25 分钟，再翻秦岭去西安。';
  }
});

trip.reminders = [
  { item: '深圳/北京 → 成都双流 中秋机票（优先 10:30 前落地）', leadDays: 24 },
  { item: '西安 → 深圳 / 北京 返程晚班机票（9/30）', leadDays: 24 },
  { item: '汉阳+剑门关+昭化+汉中+西安 全程酒店（中秋 5 晚）', leadDays: 24 },
  { item: '成都双流租车（一嗨/神州，还车可协商西安）', leadDays: 21 },
  { item: '剑门关门票及猿猱道/鸟道预约', leadDays: 7 },
  { item: '汉唐驿·唐风美学民宿 9/29 一晚（南长巷 7 号）', leadDays: 24 },
  { item: '华清宫《长恨歌》演出票（若选方案B，官微约提前 9 天 9:30）', leadDays: 9 },
];

trip.tips = [
  '9/25 必须赶 15:00 到汉阳：请订「上午抵达成都双流」的航班，天府机场在城南，北上剑阁多绕 1 小时以上。当天从深圳/北京坐高铁赶不上。',
  '更稳的汇合：9/24 两人先飞成都住一晚，9/25 10:00 双流取车北上，中秋 G5 堵车也不慌。',
  '抄手铺段在剑门关南（汉阳起点），剑昭段在北。9/26 走南线，9/27 走北线到昭化，不是同一条路。',
  '9/27 剑昭段 27km，轻装；大件请民宿/司机转到昭化。体力一般可打车到大朝驿再走后 14km。',
  '9/28 汉中下午默认西去勉县武侯祠（全国最早官立武侯祠，与成都武侯祠不是一处）。马超墓在回城路上约 1km，可选。古汉台当天周一且假期后首个工作日，多半闭馆。',
  '9/30 上午雁塔机位、中午香积寺、下午飞机。从汉唐驿出发，返程优先 18:30 后航班，香积寺→XIY 预留 90 分钟+安检 2.5h。',
  '汉阳柴火鸡、剑门豆腐、昭化肥肠、汉中热面皮、洒金桥泡馍是五站必吃锚点。',
  '9/29 晚二选一：轻松走永宁门（酒店步行可达）；或赶华清宫《长恨歌》第一场（临潼，车程约 1h，票不含白天门票，提前约 9 天官微抢）。',
];

const days = trip.days.slice();
const d1 = days[0];
const d2 = days[1];
const d3 = days[2];
const d4 = days[3];
const d5 = days[4];
const d7 = days[6];

[d1, d2, d3, d4, d5, d7].forEach(function (d) {
  if (DATE_MAP[d.date]) d.date = DATE_MAP[d.date];
  d.weekday = '';
});

d4.theme = '葭萌晨光 · 入汉中 · 勉县武侯祠';
d4.tips = [
  '古城精华 1.5–2h 足够：瞻凤门、县署、龙门书院、临清门看太极山水。10:30 前上路走 G5，午饭可放宁强或汉中市区。',
  '下午默认西去勉县：武侯祠在汉中以西约 40–50km / 50–70 分钟，定军山下武侯坪，全国最早官立武侯祠（不是成都那座）。马超墓在回城 108 国道旁，距武侯祠约 1km，可选；17:30 前要到，否则直接回城吃面皮。',
];
d4.alternatives = [
  {
    label: '方案A 武侯祠 + 马超墓（有余力）',
    summary: '15:00 进武侯祠走正殿/唐碑/古柏，17:00 前回程顺路看马超墓（半小时），再回汉台区吃热面皮。',
  },
  {
    label: '方案B 只看武侯祠（默认稳妥）',
    summary: '时间紧或下雨则只走武侯祠，17:30 前出园回城。马超墓留以后。',
  },
  {
    label: '方案C 不去勉县，改逛古汉台+拜将坛',
    summary: '9/28 是周一，博物馆多半闭馆（法定节假日除外，中秋假期通常到 27 日）。除非确认开放，否则不推荐。',
  },
];

d4.slots = d4.slots.filter(function (s) {
  return s.name.indexOf('古汉台') === -1 && s.name.indexOf('拜将坛') === -1;
});

d4.slots.push({
  period: 'evening',
  name: '勉县武侯祠',
  time: '15:00–17:00',
  lat: 33.151658,
  lng: 106.631102,
  photo: 'travel-assets/xian/wuhou-mianxian-courtyard.jpg',
  rating: 4.7,
  review: '全国重点文保、4A，中国最早的官立武侯祠（公元 263 年前后）。定军山下武侯坪，武侯镇。正殿、唐碑、古柏林是核心；与成都武侯祠不是同一处。',
  openingHours: '旺季约 08:00–18:00（季节微调）',
  ticketPrice: '旺季参考 ¥60（以现场/公众号为准）',
  transport: {
    mode: '汉中市区自驾西行，G108 / 高速至武侯镇',
    fare: '油费约 ¥30–50',
    duration: '约 50–70 分钟 / 约 40–50km',
  },
  seasonal: '中秋前后桂花与古柏同框，人少于国庆峰值',
  needsBooking: false,
  leadDays: 0,
  gallery: [
    {
      kind: 'spot',
      url: 'travel-assets/xian/wuhou-mianxian-courtyard.jpg',
      caption: '勉县武侯祠中轴庭院（高清）',
    },
    {
      kind: 'spot',
      url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Main%20hall%20of%20the%20Temple%20of%20Marquis%20Wu%2C%20Mianxian%20(20250114121429).jpg?width=2560',
      caption: '正殿实拍（Wikimedia · 2025 · 高清）',
    },
    {
      kind: 'spot',
      url: 'https://commons.wikimedia.org/wiki/Special:FilePath/%E9%A2%98%E5%8C%BE%20%E6%B1%89%E4%B8%AD%E6%AD%A6%E4%BE%AF%E7%A5%A0.jpg?width=1600',
      caption: '汉中武侯祠题额',
    },
  ],
});

d4.slots.push({
  period: 'evening',
  name: '马超墓（可选）',
  time: '17:00–17:35',
  lat: 33.1548,
  lng: 106.6412,
  photo: 'travel-assets/xian/machao-tomb-mound.jpg',
  rating: 4.3,
  review: '五虎上将真墓，108 国道武侯镇继光村，北依雷峰山、南临汉江。刘备封斄乡侯，祠额「汉斄侯祠」。与武侯祠约 1km，回城顺路；时间紧或过 17:00 可跳过。',
  openingHours: '旺季约 09:00–17:30',
  ticketPrice: '参考 ¥10',
  transport: {
    mode: '武侯祠东行 108 国道，回汉中顺路',
    fare: '油费可忽略',
    duration: '车程约 5–8 分钟 / 约 1km',
  },
  seasonal: '可选停靠，半小时足够看墓冢与毕沅碑',
  needsBooking: false,
  leadDays: 0,
  gallery: [
    {
      kind: 'spot',
      url: 'travel-assets/xian/machao-tomb-mound.jpg',
      caption: '马超墓冢与碑亭（高清示意）',
    },
    {
      kind: 'spot',
      url: 'travel-assets/xian/machao-shrine-courtyard.jpg',
      caption: '汉斄侯祠院落（高清示意）',
    },
  ],
});

d4.dining.splice(1, 0, {
  meal: '午餐',
  place: '宁强服务区 / 汉中市区简餐',
  hours: '约 12:00–14:00',
  dishes: [
    { name: '盖浇饭 / 面', price: '¥25–40' },
    { name: '汉中热面皮（若已进城）', price: '¥8–12' },
  ],
});

d5.tips[0] = '9/29 排石门外。11 点前离开汉中，翻秦岭预留 4–5.5h，16:00 前后入驻汉唐驿。晚上只做一件事：永宁门夜逛，或赶华清宫《长恨歌》——不要两头跑。中秋后工作日城墙人少一些。';

d7.theme = '雁塔机位 · 香积寺礼佛 · 返程';
d7.tips = [
  '今早从汉唐驿出发（南长巷 7 号），打车或地铁到大慈恩寺约 20–30 分钟。目标 09:00 进寺拍「佛祖 + 大雁塔 + 我」。',
  '机位：①大慈恩寺内如来佛前——人站左侧三分线，塔在右侧，前实后虚，这是「三者同框」正解；②南广场玄奘立像，200mm 压缩玄奘与塔；③大悦城 4 楼观景台古今同框。9 月末西安日落约 18:20，下午飞机拍不到真夕阳——页内附图是机位与暮色参考。若一定要夕阳，改走方案B。',
  '11:40 前离开雁塔，中午赶到香积寺（净土宗祖庭，免费，约 08:00–17:00）礼佛祈平安。13:30 后去 XIY，16:00 到场赶 18:30 后航班。',
];
d7.alternatives = [
  {
    label: '方案A 上午雁塔机位 → 中午香积寺 → 下午飞机（默认）',
    summary: '从汉唐驿出发最顺。雁塔用上午侧光，夕阳图作构图参考。',
  },
  {
    label: '方案B 真夕阳：上午香积寺 → 下午雁塔拍到日落 → 20:00 后航班',
    summary: '先去更近的香积寺，15:30 回大慈恩寺等金光。必须订晚班。',
  },
];

const dayan = d7.slots[0];
dayan.time = '09:00–11:40';
dayan.transport = {
  mode: '汉唐驿打车 / 地铁至大慈恩寺',
  fare: '打车约 ¥20–35 / 地铁约 ¥4',
  duration: '约 20–30 分钟',
};
dayan.seasonal = '9 月末银杏未全黄，侧光仍干净；中秋后工作日人少于国庆';

const xiangji = d7.slots[1];
xiangji.review = '长安区郭杜香积寺村，净土宗祖庭，善导大师供养塔在此。免费免预约，着装得体、随喜功德。王维「不知香积寺」写的就是这里。礼佛后直接去机场，不要再折回钟楼取行李——行李应头天寄汉唐驿或放车上。';

const airport = d7.slots[2];
airport.review = '香积寺→XIY 约 70–90 分钟。深圳看 9C/CZ/3U 晚班；北京看 CA1236（约 19:35）或更晚。假期返程安检慢，提前 2.5h。';
if (airport.gallery && airport.gallery[1]) {
  airport.gallery[1] = {
    kind: 'hotel',
    url: 'travel-assets/xian/hantangyi-tang-courtyard.jpg',
    caption: '今早从汉唐驿出发',
  };
}

d7.dining[0] = {
  meal: '早餐',
  place: '汉唐驿附近 / 回民街早点',
  hours: '07:30–08:30',
  photo: 'https://commons.wikimedia.org/wiki/Special:FilePath/%E6%99%AE%E9%80%9A%E8%85%8A%E6%B1%81%E8%82%89%E5%A4%B9%E9%A6%8D%2001.jpg?width=1600',
  dishes: [
    {
      name: '胡辣汤 + 肉夹馍',
      price: '¥12–18',
      photo: 'https://commons.wikimedia.org/wiki/Special:FilePath/%E6%99%AE%E9%80%9A%E8%85%8A%E6%B1%81%E8%82%89%E5%A4%B9%E9%A6%8D%2001.jpg?width=1600',
    },
  ],
};

trip.days = [d1, d2, d3, d4, d5, d7];

trip.overview = [
  {
    day: 1,
    date: '2026.9.25',
    route: '深圳 / 北京 → 成都双流 → G5 → 剑阁汉阳镇',
    distance: '空中约 2.5–3.1h + 自驾约 260–280km / 3.5–5.5h',
    highlights: '翠云廊古柏轻走 · 汉阳柴火鸡',
    stay: '汉阳镇',
  },
  {
    day: 2,
    date: '2026.9.26',
    route: '汉阳 → 抄手铺段 → 剑门关景区 → 古镇',
    distance: '徒步约 8–10km + 接驳约 9–15km',
    highlights: '抄手铺皇柏 · 剑门关楼 · 豆腐宴',
    stay: '剑门关镇',
  },
  {
    day: 3,
    date: '2026.9.27',
    route: '剑门关北门 → 高庙铺 / 至公寺 → 大朝驿 → 天雄关 → 昭化',
    distance: '徒步约 27km（可腰站缩短为后 14km）',
    highlights: '剑昭古道 · 大朝驿 · 昭化夜色',
    stay: '昭化古城',
  },
  {
    day: 4,
    date: '2026.9.28',
    route: '昭化晨游 → G5 → 汉中 → 西去勉县武侯祠 → 可选马超墓 → 回城',
    distance: '自驾约 180–220km（昭化–汉中）+ 往返勉县约 80–100km',
    highlights: '昭化精华 · 勉县武侯祠 · 马超墓（可选） · 热面皮',
    stay: '汉中汉台区',
  },
  {
    day: 5,
    date: '2026.9.29',
    route: '石门栈道 → G5 翻秦岭 → 西安汉唐驿 → 永宁门或《长恨歌》',
    distance: '汉中→石门约 25km + 汉中→西安约 270km / 3.5–5.5h',
    highlights: '石门十三品所在 · 汉唐驿 · 永宁门 / 长恨歌',
    stay: '西安钟楼 · 汉唐驿',
  },
  {
    day: 6,
    date: '2026.9.30',
    route: '汉唐驿 → 大雁塔机位 → 香积寺 → 咸阳机场返程',
    distance: '市区约 20–30 分钟 + 雁塔→香积寺约 35–50 分钟 + 香积寺→XIY 约 70–90 分钟',
    highlights: '佛+塔+我机位 · 香积寺礼佛 · 晚班飞机',
    stay: '返程（无住宿）',
  },
];

const out = path.join(__dirname, 'shudao-trip-zhongqiu.json');
fs.writeFileSync(out, JSON.stringify(trip, null, 2));
console.log('Wrote', out, 'days=', trip.days.length, trip.days.map(function (d) { return d.date; }).join(' / '));
