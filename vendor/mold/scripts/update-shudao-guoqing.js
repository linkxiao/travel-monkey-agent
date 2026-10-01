const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'shudao-trip.json');
const trip = JSON.parse(fs.readFileSync(file, 'utf8'));

const weekdays = { '2026-10-01': '周四', '2026-10-02': '周五', '2026-10-03': '周六', '2026-10-04': '周日', '2026-10-05': '周一', '2026-10-06': '周二', '2026-10-07': '周三' };

trip.title = '蜀道·汉中·西安 7 天 6 晚';
trip.startDate = '2026-10-01';

trip.preTrip.weather.summary = '国庆档 10/1–10/7：川北剑阁约 14–21°C，汉中约 13–20°C，西安约 10–20°C；昼夜温差大，古道与秦岭多秋雨薄雾，红叶正当时，景区人流为全年峰值。';
trip.preTrip.weather.typhoon = '无台风。10 月初川北/陕南常见阴雨，石板湿滑；出发前 3 天看「剑阁天气」「汉中天气」「西安天气」及山洪地质灾害预警。国庆高速免费但拥堵，10/1 北上 G5 务必预留缓冲。';
trip.preTrip.ticketTip = '国庆机票/租车/酒店建议提前 30–45 天锁定。剑门关门票+猿猱道/鸟道提前 1–7 天「剑门关旅游区」公众号实名预约（假期额度紧）；兵马俑提前 1–7 天官微预约，建议准点开抢。返程西安→深圳/北京同样尽早订晚班。';
trip.preTrip.apps = ['高德地图（自驾+路况）', '航旅纵横 / 航司 App', '铁路 12306', '神州/一嗨租车（双流取还）', '剑门关旅游区', '秦始皇帝陵博物院', '两步路/六只脚', '四川天气 / 陕西天气'];
trip.preTrip.payment = '微信/支付宝全线通用；汉阳镇、大朝驿、昭化小店建议另备 300–500 元现金。租车需国内驾照原件+信用卡预授权。';

trip.flights = {
  booked: [],
  candidates: [
    { label: '深圳出发 南航 CZ3457', code: 'CZ3457', time: '深圳宝安 SZX 07:50 → 成都双流 CTU 10:25', note: '直飞约 2h35m，落双流最利于北上 G5。取车+出城约 40–60 分钟，11:30 前上路，15:00 前可到汉阳。国庆参考 ¥900–2500。优先选双流，勿落天府（南边，多绕 1h+）。' },
    { label: '深圳出发 深航 ZH9401', code: 'ZH9401', time: '深圳宝安 SZX 08:00 → 成都双流 CTU 10:40', note: '与国航 CA3701 等共享，直飞约 2h40m。时刻略紧，行李少、提前约好机场取车才稳。备选：川航 3U6796 06:50→天府 09:25（早但天府出发多绕）。' },
    { label: '北京出发 南航 CZ6161', code: 'CZ6161', time: '北京大兴 PKX 08:00 → 成都双流 CTU 11:10', note: '直飞约 3h10m，落双流。取车后 11:50 上路，15:00 卡点，国庆堵车可能迟到。更稳：9/30 晚飞成都住一晚，10/1 上午从容北上。' },
    { label: '返程 西安→深圳 春秋 9C8754 / 南航 CZ3279', code: '9C8754', time: '西安咸阳 XIY 约 20:00 → 深圳宝安 SZX 约 23:00（班次请核实）', note: '10/7 三寺走缩短线后赶晚班。另有川航 3U、东航 MU 下午–晚间多班，直飞约 2.5–3h，国庆参考 ¥800–2200。北京早班若只能落天府（如 HU7147 PEK 07:55→TFU 10:55），北上多绕 1h，15:00 汉阳会偏紧。' },
    { label: '返程 西安→北京 国航 CA1236 / 东航 MU2104', code: 'CA1236', time: '西安咸阳 XIY 约 19:35 → 北京首都 PEK 约 21:50', note: '京线班次密：CA1224 约 15:30（需上午结束三寺）、HU7338 约 20:05。直飞约 2h10–2h40，国庆参考 ¥700–2000。' }
  ]
};

trip.hotelAreas = [
  {
    area: '剑阁汉阳镇 · 抄手铺起点',
    reason: '10/1 夜宿徒步起点。汉阳距翠云廊约 3–5km、剑门关约 9km，次日可从全民健身中心直接进古道。国庆房极少，务必与金色家园/未见山提前锁房；满房再退到剑门关镇。',
    options: [
      { tier: '经济', name: '汉阳镇向家湾农家客栈', priceRange: '约 ¥180–350/晚（国庆可能上浮）', note: '108 国道沿线，柴火灶，停车方便，适合早起进古道' },
      { tier: '中档', name: '金色家园民宿（汉阳镇向家湾）', priceRange: '约 ¥400–800/晚', note: '闲置小学改建，距翠云廊约 5km、剑门关约 9km，晚餐可吃招牌柴火鸡' },
      { tier: '高端', name: '剑山未见山民宿', priceRange: '约 ¥700–1400/晚', note: '山野度假，可派车接送汉阳/翠云廊，适合汇合后想洗个好澡的一晚' }
    ]
  },
  {
    area: '剑门关镇 · 南门/古镇',
    reason: '10/2 夜宿。走完抄手铺+关楼后住南门，次日打车北门开剑昭段；行李可请民宿转到昭化。',
    options: [
      { tier: '经济', name: '剑阁姜太公客栈', priceRange: '约 ¥250–480/晚', note: '南门口碑店，老板熟徒步线，有电梯' },
      { tier: '中档', name: '濛朵小舍 / 蜀门客栈', priceRange: '约 ¥450–850/晚', note: '龙剑街，步行吃豆腐宴' },
      { tier: '高端', name: '剑门关雄关悠谷度假酒店', priceRange: '约 ¥900–1600/晚', note: '景区配套，国庆价格高、宜早订' }
    ]
  },
  {
    area: '昭化古城 · 城内巷弄',
    reason: '10/3 徒步终点即入住，晨起逛古城再自驾汉中。',
    options: [
      { tier: '经济', name: '昭化古城客栈（南门巷一带）', priceRange: '约 ¥200–400/晚', note: '石板街内，夜游空城方便' },
      { tier: '中档', name: '花筑·詹霖小筑 / 辜家大院', priceRange: '约 ¥450–850/晚', note: '院落民宿，拍照出片' },
      { tier: '高端', name: '葭萌驿酒店', priceRange: '约 ¥700–1300/晚', note: '太守街，古城内品质最高一档' }
    ]
  },
  {
    area: '汉中汉台区 · 中心广场 / 天汉大道',
    reason: '10/4 夜宿。近古汉台、拜将坛、丁字街；次日北上石门约 25 分钟。',
    options: [
      { tier: '经济', name: '汉中东珅国宾大酒店（古汉台店）', priceRange: '约 ¥280–500/晚', note: '近古汉台，吃面皮不用跑' },
      { tier: '中档', name: '汉中天汉景逸酒店', priceRange: '约 ¥500–850/晚', note: '天汉大道，去湿地和夜市方便' },
      { tier: '高端', name: '汉中北岸云憬酒店', priceRange: '约 ¥800–1500/晚', note: '天汉长街滨江，2024 开业' }
    ]
  },
  {
    area: '西安 · 南门/钟楼 或 大雁塔',
    reason: '10/5–10/6 两晚。南门方便城墙与洒金桥；大雁塔方便不夜城与兵马俑直通车。10/7 早出发三寺，行李寄存在酒店最省心。',
    options: [
      { tier: '经济', name: '全季 / 如家（永宁门或大雁塔店）', priceRange: '约 ¥350–650/晚', note: '国庆涨价仍相对好订，地铁口寄行李' },
      { tier: '中档', name: '西安钟楼诺富特酒店', priceRange: '约 ¥800–1400/晚', note: '钟鼓楼，吃洒金桥、上城墙都近' },
      { tier: '高端', name: '西安香格里拉 / 君悦（南门外或曲江）', priceRange: '约 ¥1800–3200/晚', note: '走完蜀道的收官之选，国庆宜 45 天前订' }
    ]
  }
];

trip.tips = [
  '10/1 必须赶 15:00 到汉阳：请订「上午抵达成都双流」的航班，天府机场在城南，北上剑阁多绕 1 小时以上。当天从深圳/北京坐高铁赶不上。',
  '更稳的汇合：9/30 两人先飞成都住一晚，10/1 10:00 双流取车北上，国庆 G5 堵车也不慌。',
  '抄手铺段在剑门关南（汉阳起点），剑昭段在北。10/2 走南线，10/3 走北线到昭化，不是同一条路。',
  '10/3 剑昭段 27km，轻装；大件请民宿/司机转到昭化。体力一般可打车到大朝驿再走后 14km。',
  '国庆高速免费但剑门关/兵马俑/西安城墙都是峰值，门票预约失败就走古道村道段或小雁塔备用。',
  '10/7 全天三寺（8–10h）与晚班飞机冲突。默认走净业寺+卧佛寺缩短线，14:00 前出山赶 19:00 后航班；订了 15:30 京线就放弃穿越、上午只留城墙。',
  '汉阳柴火鸡、剑门豆腐、昭化肥肠、汉中热面皮、洒金桥泡馍是五站必吃锚点。'
];

trip.reminders = [
  { item: '深圳/北京 → 成都双流 国庆机票（优先 10:30 前落地）', leadDays: 45 },
  { item: '西安 → 深圳 / 北京 返程晚班机票', leadDays: 45 },
  { item: '汉阳+剑门关+昭化+汉中+西安 全程酒店（国庆）', leadDays: 45 },
  { item: '成都双流租车（一嗨/神州，还车可协商西安）', leadDays: 21 },
  { item: '剑门关门票及猿猱道/鸟道预约', leadDays: 7 },
  { item: '秦始皇兵马俑门票（官微实名，国庆建议开抢）', leadDays: 7 }
];

const day1 = {
  date: '2026-10-01',
  weekday: '周四',
  theme: '双城汇合 · 自驾汉阳',
  tips: [
    '国庆首日。目标 15:00 前到剑阁汉阳镇（抄手铺段起点）。必须早班飞机落双流；落地先取车再上 G5，服务区简餐。高铁当天从深圳/北京出发来不及。'
  ],
  alternatives: [
    { label: '方案A 10/1 早飞双流（默认）', summary: '深圳 CZ3457 10:25 或北京尽量改 10:00 前到 CTU 的航班，11:30 前上路，15:00 到汉阳，傍晚轻走翠云廊。' },
    { label: '方案B 9/30 夜抵成都（更稳）', summary: '两人 9/30 先到成都住双流/城北，10/1 上午从容取车北上，避开航班延误和 G5 午后拥堵。' }
  ],
  slots: [
    {
      period: 'morning',
      name: '深圳 / 北京 → 成都双流机场',
      time: '06:50–11:10（分城出发）',
      lat: 30.5785,
      lng: 103.947,
      photo: '',
      rating: 0,
      review: '深圳优先 CZ3457（07:50–10:25 CTU）或 ZH9401（08:00–10:40 CTU）。北京 CZ6161（08:00–11:10 CTU）偏紧，能改更早或 9/30 先到最好。',
      openingHours: '机场全天',
      ticketPrice: '国庆机票参考 ¥900–2500（非实时）',
      transport: { mode: '直飞，优先双流 CTU', fare: '参考区间见航班区', duration: '深圳约 2h35m / 北京约 3h10m' },
      needsBooking: true,
      leadDays: 45
    },
    {
      period: 'noon',
      name: '双流自驾 G5 → 剑阁汉阳镇',
      time: '11:30–15:00',
      lat: 32.152,
      lng: 105.548,
      photo: 'https://commons.wikimedia.org/wiki/Special:FilePath/%E5%89%91%E9%97%A8%E5%85%B3%20-%20panoramio.jpg?width=600',
      rating: 4.6,
      review: '汉阳镇是抄手铺段正门：全民健身中心进古道。全程高速约 260–280km / 3.5–4h，金子山或剑门关出口下。国庆免费通行但车多。',
      openingHours: '高速全天',
      ticketPrice: '国庆小型客车高速免费（以当年政策为准）',
      transport: { mode: '自驾 G5 京昆', fare: '油费约 ¥180–250', duration: '约 3.5–4 小时（拥堵则 5h）' },
      seasonal: '国庆红叶季 + 假期车流峰值',
      needsBooking: true,
      leadDays: 21
    },
    {
      period: 'evening',
      name: '汉阳镇 · 翠云廊轻走 + 柴火鸡',
      time: '15:30–20:30',
      lat: 32.156731,
      lng: 105.551772,
      photo: 'https://commons.wikimedia.org/wiki/Special:FilePath/%E5%89%91%E9%97%A8%E5%85%B3%20-%20panoramio.jpg?width=600',
      rating: 4.8,
      review: '到达即休整。日落前走翠云廊核心段看古柏王，不必贪抄手铺全程。晚饭锁定汉阳柴火鸡，为明天养腿。',
      openingHours: '翠云廊约 08:00–17:30；餐馆约 17:00–21:00',
      ticketPrice: '翠云廊参考 ¥50；村道段免费',
      transport: { mode: '民宿步行或接送至翠云廊/健身中心', fare: '约 ¥0–20', duration: '5–15 分钟' },
      seasonal: '秋日古柏配银杏，国庆人多，越晚段越好走',
      needsBooking: false,
      leadDays: 0
    }
  ],
  dining: [
    {
      meal: '午餐',
      place: 'G5 德阳/绵阳服务区简餐',
      hours: '服务区全天',
      dishes: [
        { name: '盖浇饭 / 面', price: '¥25–40' },
        { name: '自备面包+水果', price: '自备' }
      ]
    },
    {
      meal: '晚餐',
      place: '金色家园民宿 / 汉阳镇农家 · 柴火鸡',
      hours: '约 17:00–20:30（民宿需提前说人数）',
      dishes: [
        { name: '剑门关柴火鸡（3–4 人份）', price: '¥120–180' },
        { name: '酸菜豆花稀饭', price: '¥8–15' },
        { name: '剑门豆腐干', price: '¥18–28' }
      ]
    }
  ]
};

const oldDays = trip.days;
const shifted = [
  Object.assign({}, oldDays[0], { date: '2026-10-02', weekday: '周五', theme: '抄手铺古道 · 剑门雄关' }),
  Object.assign({}, oldDays[1], { date: '2026-10-03', weekday: '周六' }),
  Object.assign({}, oldDays[2], { date: '2026-10-04', weekday: '周日' }),
  Object.assign({}, oldDays[3], { date: '2026-10-05', weekday: '周一' }),
  Object.assign({}, oldDays[4], { date: '2026-10-06', weekday: '周二' }),
  Object.assign({}, oldDays[5], { date: '2026-10-07', weekday: '周三' })
];

shifted[0].tips = [
  '从住宿地汉阳出发，上午走抄手铺段精华（汉阳→抄手铺，约 8–10km），下午转剑门关关楼/栈道。今晚住剑门关镇南门，勿在普安留宿。'
];
shifted[0].slots[0] = Object.assign({}, oldDays[0].slots[1], {
  period: 'morning',
  time: '08:00–12:00',
  transport: { mode: '汉阳镇全民健身中心进古道', fare: '步行免费', duration: '民宿到入口 5–15 分钟' }
});
shifted[0].slots[1] = Object.assign({}, oldDays[0].slots[0], {
  period: 'noon',
  time: '14:00–17:30',
  transport: { mode: '汉阳/抄手铺打车或民宿接到剑门关南门', fare: '约 ¥30–50', duration: '约 20 分钟' }
});
shifted[0].dining[0] = {
  meal: '午餐',
  place: '汉阳镇 / 抄手铺农家',
  hours: '约 11:00–13:30',
  dishes: [
    { name: '手擀面 / 蛋炒饭', price: '¥15–25' },
    { name: '腊肉炒时蔬', price: '¥38' }
  ]
};

shifted[2].slots[2].closedDays = '周一（本次周日开放）';

shifted[3].tips = [
  '10/5 周一，陕历博/部分博物馆闭馆，故排石门栈道（户外）。11 点前离开汉中，国庆 G5 翻秦岭预留 4.5–5.5h，傍晚进西安。'
];

shifted[4].tips = [
  '10/6 周二，陕历博开放，若兵马俑没约上可改陕历博+小雁塔。7:30 出发临潼，避开旅行团。'
];
shifted[4].alternatives = [
  { label: '方案A 兵马俑 + 大雁塔（推荐）', summary: '世界遗产 + 唐都地标，晚上不夜城。' },
  { label: '方案B 陕历博 + 小雁塔', summary: '周二开馆。陕历博须提前 5 天 17:00 官微抢免费票。' }
];

shifted[5].tips = [
  '返程日。全天三寺与飞机冲突。默认 7:00 出城走净业寺→卧佛寺缩短线，14:00 前出山，回酒店取行李，16:00 前到咸阳赶 19:00 后航班。订了下午 15:30 京线就只登净业寺或改城墙。'
];
shifted[5].alternatives = [
  { label: '方案A 净业寺+卧佛寺缩短线（推荐）', summary: '沣峪口进，两寺连走约 6–8km，中午出山，赶晚班回深圳/北京。' },
  { label: '方案B 全天三寺', summary: '仅当两人当晚都订 20:00 后航班、且接受 17:30 出山再狂奔机场。' }
];
shifted[5].slots[2] = {
  period: 'evening',
  name: '西安咸阳机场 → 深圳 / 北京',
  time: '16:00 到机场 · 19:00–21:00 起飞',
  lat: 34.4371,
  lng: 108.7579,
  photo: '',
  rating: 0,
  review: '地铁 14 号线或打车约 50–70 分钟。深圳看 9C8754 / CZ / 3U 晚班；北京看 CA1236（约 19:35）或 HU/MU 晚班。国庆安检慢，尽量提前 2.5h 到场。',
  openingHours: '依航班',
  ticketPrice: '返程参考 ¥700–2200（非实时）',
  transport: { mode: '地铁 14 号线 / 打车至 XIY', fare: '地铁约 ¥8 / 打车 ¥80–120', duration: '约 50–70 分钟' },
  needsBooking: true,
  leadDays: 45
};
shifted[5].dining[1] = {
  meal: '午餐',
  place: '出山后长安区 / 机场简餐',
  hours: '约 13:30–16:00',
  dishes: [
    { name: '油泼面或肉夹馍打包', price: '¥16–22' },
    { name: '机场陕菜简餐', price: '¥40–70' }
  ]
};

trip.days = [day1].concat(shifted);

fs.writeFileSync(file, JSON.stringify(trip, null, 2));
console.log('updated', trip.title, trip.days.length, 'days');
