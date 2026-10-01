const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'shudao-trip-zhongqiu.json');
const trip = JSON.parse(fs.readFileSync(file, 'utf8'));
const day6 = trip.days[5];

trip.preTrip.apps = [
  '高德地图（自驾+路况）',
  '航旅纵横 / 航司 App',
  '杜甫草堂博物馆',
  '神州/一嗨租车（双流取还）',
  '剑门关旅游区',
  '两步路/六只脚',
  '四川天气 / 陕西天气',
  '华清宫景区',
];
trip.preTrip.ticketTip = '中秋机票/亚朵草堂店/汉唐驿从 9 月 1 日起锁定。杜甫草堂官微提前预约（全票参考 ¥50）。剑门关门票提前 1–7 天预约。《出师表》在勉县诸葛古镇锦冠剧场，提前 1–7 天公众号核场次（工作日多见日场约 14:00，夜场以当日为准）。返程西安晚班尽早订。';
trip.preTrip.packing = '冲锋衣/薄外套 + 速干长袖 + 防滑徒步鞋（抄手铺石板湿滑）+ 登山杖；草堂/锦里可穿舒适运动鞋。备盖碗茶保温杯便于古道下品茶。';

trip.flights.candidates[0].note = '直飞约 2h35m，落双流最利于入城。取车后先放亚朵杜甫草堂店，中午赶花径红墙。中秋参考 ¥900–2500。勿落天府。';
trip.flights.candidates[1].note = '与国航 CA3701 等共享。行李少可直奔草堂；北京线若 11:10 后到，花径可能延到 13:30。备选：9/24 夜抵更从容。';
trip.flights.candidates[2].note = '直飞约 3h10m，落双流约 11:10，赶草堂偏紧。更稳：9/24 晚飞成都，9/25 上午从容逛花径。';

trip.hotelAreas = [
  {
    area: '成都青羊 · 亚朵酒店杜甫草堂店（9/25 一晚）',
    reason: '9/25 夜宿浣花溪/草堂片区，次日一早北上剑阁不用折返城东。步行可达草堂，回酒店卸行李再去鹤鸣/锦里。',
    options: [
      {
        tier: '中档',
        name: '亚朵酒店成都杜甫草堂店',
        priceRange: '约 ¥450–900/晚（中秋上浮）',
        note: '主选。近青华路/草堂北门，早餐稳，适合首晚汇合。图为风格示意，以订房相册为准。',
        photo: 'travel-assets/xian/atour-dufu-hotel.jpg',
      },
      {
        tier: '经济',
        name: '全季 / 如家（草堂或人民公园店）',
        priceRange: '约 ¥280–520/晚',
        note: '亚朵满房时的备选，地铁 4 号线草堂北路站方便',
        photo: 'travel-assets/xian/atour-dufu-hotel.jpg',
      },
      {
        tier: '高端',
        name: '成都博舍 / 方所附近精品',
        priceRange: '约 ¥900–1600/晚',
        note: '若想住宽窄/太古里，次日出发会多绕 20–30 分钟',
        photo: 'travel-assets/xian/hantangyi-tang-courtyard.jpg',
      },
    ],
  },
  {
    area: '剑阁汉阳镇 · 抄手铺起点（9/26 一晚）',
    reason: '9/26 走完抄手铺后就近住汉阳，不用再折剑门关镇。距翠云廊 3–5km、剑门关约 9km。',
    options: trip.hotelAreas.find(function (a) { return a.area.indexOf('汉阳') !== -1; }).options,
  },
  {
    area: '剑门关镇 · 南门/古镇（9/27 一晚）',
    reason: '9/27 走完关楼后住南门吃豆腐宴。次日一早自驾汉中，不必再走剑昭段。',
    options: trip.hotelAreas.find(function (a) { return a.area.indexOf('剑门关镇') !== -1; }).options,
  },
  {
    area: '汉中汉台区 · 中心广场 / 天汉大道（9/28 一晚）',
    reason: '9/28 武侯祠+汉桂+《出师表》后回城住。次日北上褒斜古道约 25 分钟，再翻秦岭去西安。',
    options: trip.hotelAreas.find(function (a) { return a.area.indexOf('汉台') !== -1; }).options,
  },
  trip.hotelAreas.find(function (a) { return a.area.indexOf('汉唐驿') !== -1; }),
];

trip.tips = [
  '9/25 不再赶汉阳：中午草堂、下午鹤鸣、傍晚锦里、夜里九眼桥，住亚朵杜甫草堂店。北京航班若晚于 11:00 落地，花径可延后，鹤鸣茶座先占。',
  '9/26 务必 07:00 前离开成都，G5 约 260–280km / 3.5–5.5h，中午前到汉阳才能把抄手铺+古柏品茶走完。',
  '本线已减去剑昭段 27km。抄手铺在剑门关南，剑门关楼在北，仍是两段；昭化改为路过或不去。',
  '千年汉桂「护墓双桂」在定军山武侯墓，与武侯祠隔汉江，不是成都武侯祠，也不是祠内那棵旱莲。两处同属勉县，下午可连看。',
  '《出师表》在诸葛古镇锦冠剧场（武侯祠旁）。9/28 周一多见日场约 14:00，夜场以官微为准——先核场次再决定先看戏还是先进祠。',
  '汉中晚饭突出汉江鱼：黄辣丁、清蒸鲢鱼、浆水鱼，面皮可当配菜。',
  '9/30 上午雁塔、中午香积寺、下午飞机。返程优先 18:30 后，香积寺→XIY 预留 90 分钟。',
];

trip.reminders = [
  { item: '深圳/北京 → 成都双流 中秋机票（优先 11:00 前落地）', leadDays: 24 },
  { item: '西安 → 深圳 / 北京 返程晚班机票（9/30）', leadDays: 24 },
  { item: '亚朵杜甫草堂店 + 汉阳 + 剑门关 + 汉中 + 汉唐驿（中秋 5 晚）', leadDays: 24 },
  { item: '成都双流租车（一嗨/神州，还车可协商西安）', leadDays: 21 },
  { item: '杜甫草堂门票预约（官微，全票参考 ¥50）', leadDays: 7 },
  { item: '剑门关门票及猿猱道/鸟道预约', leadDays: 7 },
  { item: '诸葛古镇《出师表》演出票（先核 9/28 场次）', leadDays: 7 },
  { item: '汉唐驿·唐风美学民宿 9/29 一晚（南长巷 7 号）', leadDays: 24 },
  { item: '华清宫《长恨歌》演出票（若选方案B，官微约提前 9 天）', leadDays: 9 },
];

trip.ui.heroBadge = '草堂 · 抄手铺 · 武侯祠';
trip.ui.overviewLead = '6天5晚主线：成都一日（草堂 / 鹤鸣 / 锦里 / 九眼桥）→ 汉阳抄手铺 → 剑门关 → 勉县武侯祠与汉桂、《出师表》→ 褒斜古道入长安 → 雁塔 / 香积寺返程。';

const day1 = {
  date: '2026-09-25',
  weekday: '',
  theme: '双城汇合 · 成都一日',
  tips: [
    '中秋假期首日。目标中午进杜甫草堂打卡花径红墙，下午人民公园鹤鸣茶社喝茶看变脸，傍晚锦里吃烟火，饭后九眼桥看「江船火独明」。当晚住亚朵杜甫草堂店，次日早走。',
    '草堂机位：红墙夹道 + 竹影 + 石径，人走在三分线成「倩影」。节假日人多，侧拍或等空隙，不必和网红队抢同一墙面。',
  ],
  alternatives: [
    {
      label: '方案A 9/25 午前抵双流（默认）',
      summary: '深圳 CZ3457 10:25 落地，取车后直奔草堂，12:00–14:30 花径，15:00 鹤鸣。',
    },
    {
      label: '方案B 9/24 夜抵成都（更稳）',
      summary: '两人先住亚朵/草堂片区，9/25 开门进草堂，红墙人少、鹤鸣能占临湖位。',
    },
  ],
  slots: [
    {
      period: 'morning',
      name: '深圳 / 北京 → 成都双流机场',
      time: '06:50–11:10（分城出发）',
      lat: 30.5785,
      lng: 103.947,
      photo: 'travel-assets/xian/chengdu-airport-plane.jpg',
      rating: 0,
      review: '深圳优先 CZ3457（07:50–10:25 CTU）。北京 CZ6161（08:00–11:10）偏紧，能改更早或 9/24 先到最好。落地取车，行李先送亚朵再进草堂。',
      openingHours: '机场全天',
      ticketPrice: '中秋机票参考 ¥900–2500（非实时）',
      transport: { mode: '直飞，优先双流 CTU', fare: '参考区间见航班区', duration: '深圳约 2h35m / 北京约 3h10m' },
      needsBooking: true,
      leadDays: 24,
    },
    {
      period: 'noon',
      name: '杜甫草堂 · 花径红墙',
      time: '12:00–14:30',
      lat: 30.6602,
      lng: 104.0286,
      photo: 'travel-assets/xian/dufu-redwall-path.jpg',
      rating: 4.8,
      review: '最佳机位在花径：红墙夹道、竹林漏光、石径纵深，人走成「倩影」。东端匾额「花径」，尽头青花碎瓷「草堂」影壁。杜诗「花径不曾缘客扫」的现场。',
      openingHours: '约 09:00–18:00（17:00 停售；节假日或延至 18:30）',
      ticketPrice: '全票参考 ¥50，学生半价；官微提前预约',
      transport: { mode: '双流打车或地铁 4 号线草堂北路站', fare: '打车约 ¥40–70', duration: '约 40–60 分钟' },
      seasonal: '中秋前后桂花与竹影同框，红墙最出片',
      needsBooking: true,
      leadDays: 7,
      gallery: [
        { kind: 'photo', url: 'travel-assets/xian/dufu-redwall-path.jpg', caption: '花径红墙：红墙、竹林、古径、倩影' },
        { kind: 'spot', url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Du%20Fu%20Thatched%20Cottage.jpg?width=1600', caption: '草堂园林实拍参考（Wikimedia）' },
        { kind: 'hotel', url: 'travel-assets/xian/atour-dufu-hotel.jpg', caption: '今晚：亚朵酒店杜甫草堂店' },
      ],
    },
    {
      period: 'evening',
      name: '鹤鸣茶社 · 非遗下午茶与变脸',
      time: '15:00–17:30',
      lat: 30.6579,
      lng: 104.0558,
      photo: 'travel-assets/xian/heming-tea-bianlian.jpg',
      rating: 4.6,
      review: '人民公园内，1923 年开张的百年茶馆。盖碗茶约 ¥16–35 续水，长嘴壶掺茶是非遗功夫。戏园另票约 ¥58–88，看川剧变脸/吐火；看完可端茶杯回湖边座。',
      openingHours: '茶社约 08:00–22:00；变脸场次以现场告示为准，末场常在傍晚',
      ticketPrice: '茶位约 ¥16–40；戏园套票约 ¥58–88（含茶）',
      transport: { mode: '草堂打车或地铁 2 号线人民公园站 B 口', fare: '打车约 ¥15–25', duration: '约 15–20 分钟' },
      seasonal: '中秋下午人满，临湖位早点占；也可先看戏再喝茶',
      needsBooking: false,
      leadDays: 0,
      gallery: [
        { kind: 'spot', url: 'travel-assets/xian/heming-tea-bianlian.jpg', caption: '鹤鸣茶社：盖碗茶与川剧变脸' },
        { kind: 'food', url: 'travel-assets/xian/heming-tea-bianlian.jpg', caption: '非遗下午茶 · 长嘴壶掺茶' },
      ],
    },
    {
      period: 'evening',
      name: '锦里烟火 · 九眼桥江船夜色',
      time: '18:00–21:30',
      lat: 30.6467,
      lng: 104.0483,
      photo: 'travel-assets/xian/jinli-night-smoke.jpg',
      rating: 4.6,
      review: '傍晚锦里寻人间烟火：三大炮、钟水饺、糖油果子就够。饭后东去九眼桥，看锦江灯火与夜船，应一句「江船火独明」。回亚朵草堂店约 25–40 分钟。',
      openingHours: '锦里街区全天；九眼桥夜景约 19:00 后最亮',
      ticketPrice: '两处免费（餐饮另计）',
      transport: { mode: '鹤鸣打车至锦里，再打车九眼桥', fare: '各约 ¥15–30', duration: '锦里约 15 分钟；九眼桥再约 15 分钟' },
      seasonal: '中秋夜锦里拥挤，桥上风大加外套',
      needsBooking: false,
      leadDays: 0,
      gallery: [
        { kind: 'spot', url: 'travel-assets/xian/jinli-night-smoke.jpg', caption: '锦里：灯笼与街巷烟火' },
        { kind: 'spot', url: 'travel-assets/xian/jiuyanqiao-night-boats.jpg', caption: '九眼桥：江船火独明' },
        { kind: 'hotel', url: 'travel-assets/xian/atour-dufu-hotel.jpg', caption: '夜宿亚朵杜甫草堂店' },
      ],
    },
  ],
  dining: [
    {
      meal: '午餐',
      place: '杜甫草堂周边 / 浣花溪简餐',
      hours: '约 11:30–13:30',
      dishes: [
        { name: '担担面 / 钟水饺', price: '¥18–28' },
        { name: '三合泥或冰粉', price: '¥8–12' },
      ],
    },
    {
      meal: '下午茶',
      place: '鹤鸣茶社（人民公园）',
      hours: '约 15:00–17:30',
      photo: 'travel-assets/xian/heming-tea-bianlian.jpg',
      dishes: [
        { name: '盖碗茶（茉莉 / 碧潭飘雪）', price: '¥16–35' },
        { name: '瓜子 / 茶点六宫格', price: '¥16–36' },
      ],
    },
    {
      meal: '晚餐',
      place: '锦里小吃一串',
      hours: '约 17:30–20:00',
      photo: 'travel-assets/xian/jinli-night-smoke.jpg',
      dishes: [
        { name: '三大炮', price: '¥15–25' },
        { name: '钟水饺', price: '¥18–28' },
        { name: '糖油果子', price: '¥10–15' },
      ],
    },
  ],
};

const oldD2 = trip.days[1];
const day2 = {
  date: '2026-09-26',
  weekday: '',
  theme: '自驾汉阳 · 抄手铺品茗冥想',
  tips: [
    '07:00 前离开亚朵，G5 北上剑阁汉阳镇。中午前到全民健身中心进抄手铺段。途中看急递铺、张飞柏/皇柏、古柏王，在千年古柏下品一壶茶、坐下来冥想 15–20 分钟，不必赶完全程。',
    '今晚住汉阳。剑门关楼留明天，腿不至于一天走废。',
  ],
  alternatives: [
    {
      label: '方案A 抄手铺精华 + 古柏品茶（推荐）',
      summary: '汉阳→抄手铺约 8–10km，中途在最粗的一棵皇柏下喝茶冥想，原路或民宿接回汉阳。',
    },
    {
      label: '方案B 翠云廊收费段',
      summary: '下雨或迟到则走景区看古柏王、鸳鸯柏（参考 ¥50），强度低，仍可在树下品茶。',
    },
  ],
  slots: [
    {
      period: 'morning',
      name: '成都自驾 G5 → 剑阁汉阳镇',
      time: '07:00–11:30',
      lat: 32.152,
      lng: 105.548,
      photo: 'travel-assets/xian/g5-mountain-highway.jpg',
      rating: 4.6,
      review: '从草堂/亚朵上绕城再转 G5，约 260–280km。中秋假期（约 9/25–27）小型客车或免费但车多，预留到 5.5h。金子山或剑门关出口下到汉阳。',
      openingHours: '高速全天',
      ticketPrice: '中秋假期（约 9/25–27）小型客车高速免费（以当年政策为准）',
      transport: { mode: '自驾 G5 京昆', fare: '油费约 ¥180–250', duration: '约 3.5–5.5 小时' },
      seasonal: '假期首个完整自驾日，早点出门',
      needsBooking: true,
      leadDays: 21,
    },
    {
      period: 'noon',
      name: '抄手铺段 · 急递铺与皇柏',
      time: '12:00–16:00',
      lat: 32.156731,
      lng: 105.551772,
      photo: 'travel-assets/xian/banner-cypress-road.jpg',
      rating: 4.8,
      review: '金牛道急递铺故址：抄手铺是剑州递铺之一，王士祯、曾国藩都在此歇过。张飞种柏是传说，皇柏/古柏王是真的——秦汉以来官道行道树，有的胸径需数人合围。沿途读碑、数年轮，比赶路重要。',
      openingHours: '古道全天；收费景区段约 08:00–17:30',
      ticketPrice: '翠云廊景区参考 ¥50；抄手铺村道段免费',
      transport: { mode: '汉阳镇全民健身中心进古道', fare: '步行免费', duration: '民宿到入口 5–15 分钟' },
      seasonal: '秋日古柏配银杏，是蜀道摄影与静坐的黄金季',
      needsBooking: false,
      leadDays: 0,
      gallery: [
        { kind: 'spot', url: 'travel-assets/xian/banner-cypress-road.jpg', caption: '翠云廊 / 抄手铺皇柏夹道' },
        { kind: 'spot', url: 'travel-assets/xian/chaoshoupu-tea-cypress.jpg', caption: '途中人文：急递铺与古柏年轮' },
      ],
    },
    {
      period: 'evening',
      name: '千年古柏下品茶 · 冥想',
      time: '16:00–17:30',
      lat: 32.1582,
      lng: 105.5535,
      photo: 'travel-assets/xian/chaoshoupu-tea-cypress.jpg',
      rating: 4.9,
      review: '选一棵最粗、根盘最稳的皇柏，支盖碗或保温杯。三五好友对坐，不赶路、不直播。茶后闭眼 15–20 分钟听风过柏林——这是抄手铺和景区打卡最大的差别。',
      openingHours: '古道天黑前离开',
      ticketPrice: '免费（自带茶具）',
      transport: { mode: '徒步至树下，原路或民宿接回汉阳', fare: '接送约 ¥0–30', duration: '回镇 15–40 分钟' },
      seasonal: '石板凉，垫一件冲锋衣再坐',
      needsBooking: false,
      leadDays: 0,
      gallery: [
        { kind: 'photo', url: 'travel-assets/xian/chaoshoupu-tea-cypress.jpg', caption: '古柏下三五好友品茶' },
        { kind: 'photo', url: 'travel-assets/xian/chaoshoupu-meditation-cypress.jpg', caption: '古树下冥想' },
      ],
    },
  ],
  dining: [
    {
      meal: '午餐',
      place: '汉阳镇 / 抄手铺农家',
      hours: '约 11:30–13:00',
      dishes: [
        { name: '手擀面 / 蛋炒饭', price: '¥15–25' },
        { name: '腊肉炒时蔬', price: '¥38' },
      ],
    },
    {
      meal: '晚餐',
      place: '金色家园民宿 / 汉阳镇农家 · 柴火鸡',
      hours: '约 17:30–20:30（提前说人数）',
      dishes: [
        { name: '剑门关柴火鸡（3–4 人份）', price: '¥120–180' },
        { name: '酸菜豆花稀饭', price: '¥8–15' },
        { name: '剑门豆腐干', price: '¥18–28' },
      ],
    },
  ],
};

const day3 = {
  date: '2026-09-27',
  weekday: '',
  theme: '剑门雄关 · 豆腐夜宴',
  tips: [
    '今天只走剑门关，不再走剑昭段。上午关楼/栈道，猿猱道有余力再约。晚上南门豆腐宴，住剑门关镇。',
  ],
  alternatives: oldD2.alternatives,
  slots: [
    Object.assign({}, oldD2.slots[1], { period: 'morning', time: '08:30–11:30' }),
    {
      period: 'noon',
      name: '关楼远眺 · 剑山红叶',
      time: '11:30–15:30',
      lat: 32.2165,
      lng: 105.5642,
      photo: 'https://commons.wikimedia.org/wiki/Special:FilePath/%E5%89%91%E9%97%A8%E5%85%B3%E4%BB%BF%E5%8F%A4%E6%A0%88%E9%81%93%20-%20panoramio.jpg?width=1600',
      rating: 4.6,
      review: '关楼上看「剑门天下壮」。下午人少一些，可慢慢走仿古栈道，不必再北上剑昭。',
      openingHours: '约 07:00–18:30（16:00 前后停售）',
      ticketPrice: '已含在上午门票',
      transport: { mode: '景区内步行', fare: '免费', duration: '随走随停' },
      needsBooking: false,
      leadDays: 0,
    },
    oldD2.slots[2],
  ],
  dining: oldD2.dining,
};

const day4 = {
  date: '2026-09-28',
  weekday: '',
  theme: '入汉中 · 武侯汉桂 · 出师表',
  tips: [
    '08:00 剑门关出发走 G5，中午前到勉县。千年汉桂在定军山武侯墓（护墓双桂，传蜀汉炎兴元年栽，树龄约 1700 年），与武侯祠隔汉江，下午连看。',
    '《出师表》在诸葛古镇锦冠剧场。9/28 周一常见日场约 14:00（约 70 分钟），夜场/17:00 场以官微为准。若只有日场：先看戏，再进祠看汉桂。',
  ],
  alternatives: [
    {
      label: '方案A 日场《出师表》→ 武侯祠 + 汉桂（周一稳妥）',
      summary: '13:30 入场看戏，15:30 后走武侯祠正殿/唐碑，再过江看武侯墓护墓双桂。',
    },
    {
      label: '方案B 先祠墓、夜场看戏',
      summary: '仅当官微确认有傍晚/夜场时。13:00 进祠，17:00 前看完汉桂，晚上看《出师表》。',
    },
  ],
  slots: [
    {
      period: 'morning',
      name: '剑门关 → 汉中 / 勉县（G5）',
      time: '08:00–12:00',
      lat: 32.7,
      lng: 106.2,
      photo: 'travel-assets/xian/g5-mountain-highway.jpg',
      rating: 0,
      review: '剑门至关中南缘，隧道群连续。可在宁强或汉中午饭后西去勉县（汉中市区→武侯镇约 40–50km / 50–70 分钟）。',
      openingHours: '高速全天',
      ticketPrice: '过路费参考 ¥80–130（假期后或恢复收费）',
      transport: { mode: '自驾 G5', fare: '油费+过路费约 ¥150–220', duration: '约 3–3.5 小时 / 约 200km' },
      needsBooking: false,
      leadDays: 0,
    },
    {
      period: 'noon',
      name: '勉县武侯祠 · 正殿与古柏',
      time: '13:00–15:30（若先看戏则 15:30–17:00）',
      lat: 33.151658,
      lng: 106.631102,
      photo: 'travel-assets/xian/wuhou-mianxian-courtyard.jpg',
      rating: 4.7,
      review: '全国最早官立武侯祠（后主景耀六年诏建），定军山下武侯坪。正殿、唐碑、千年古柏是核心。与成都武侯祠不是一处。祠内还有古旱莲；汉桂在隔江武侯墓。',
      openingHours: '旺季约 08:00–18:00',
      ticketPrice: '旺季参考 ¥50–60',
      transport: { mode: '汉中市区自驾西行至武侯镇诸葛古镇', fare: '油费约 ¥30–50', duration: '约 50–70 分钟' },
      seasonal: '中秋前后桂香，人少于国庆',
      needsBooking: false,
      leadDays: 0,
      gallery: [
        { kind: 'spot', url: 'travel-assets/xian/wuhou-mianxian-courtyard.jpg', caption: '武侯祠中轴庭院（高清）' },
        { kind: 'spot', url: 'travel-assets/xian/wuhou-mianxian-steles.jpg', caption: '古柏、碑石与大殿（高清）' },
        { kind: 'spot', url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Main%20hall%20of%20the%20Temple%20of%20Marquis%20Wu%2C%20Mianxian%20(20250114121429).jpg?width=2560', caption: '正殿实拍（Wikimedia · 2025）' },
      ],
    },
    {
      period: 'noon',
      name: '武侯墓 · 千年汉桂（护墓双桂）',
      time: '15:30–16:40',
      lat: 33.1368,
      lng: 106.6715,
      photo: 'travel-assets/xian/wuhou-hangui-twin.jpg',
      rating: 4.8,
      review: '定军山下诸葛亮真墓。墓冢西侧两株汉桂，传蜀汉炎兴元年（263）栽植，碳十四约 1700 年，高逾 19 米、冠幅 20 余米，花橙黄，旧有「十里定军草木香」。寓「孤忠丹心扶炎汉」。8–9 月盛花，中秋仍可闻余香。',
      openingHours: '旺季约 08:00–18:00',
      ticketPrice: '参考 ¥50（与武侯祠分开检票）',
      transport: { mode: '武侯祠过汉江至定军山镇，约 10–15 分钟', fare: '油费可忽略', duration: '约 8–12km' },
      seasonal: '汉桂主花期多在农历八月，9 月末仍有余香与古干可拍',
      needsBooking: false,
      leadDays: 0,
      gallery: [
        { kind: 'spot', url: 'travel-assets/xian/wuhou-hangui-twin.jpg', caption: '护墓双桂：墓旁两株千年汉桂' },
        { kind: 'spot', url: 'travel-assets/xian/wuhou-hangui-blossom.jpg', caption: '汉桂花：橙黄细蕊' },
      ],
    },
    {
      period: 'evening',
      name: '诸葛古镇 · 《出师表》演出',
      time: '以官微为准 · 常见 14:00 或傍晚场',
      lat: 33.1508,
      lng: 106.6328,
      photo: 'travel-assets/xian/chushi-biao-show.jpg',
      rating: 4.6,
      review: '锦冠剧场开合舞台：七擒、木牛流马、空城计、五丈原。约 60–70 分钟。票价参考 ¥120–200。先核 9/28 场次，再排祠墓顺序。',
      openingHours: '以当日场次为准；需提前入场兑票',
      ticketPrice: '参考 ¥120–200（分区）',
      transport: { mode: '武侯祠步行至诸葛古镇锦冠剧场', fare: '免费', duration: '5–10 分钟' },
      seasonal: '节后周一可能仅日场',
      needsBooking: true,
      leadDays: 7,
      gallery: [
        { kind: 'spot', url: 'travel-assets/xian/chushi-biao-show.jpg', caption: '《出师表》开合剧场（高清示意）' },
        { kind: 'food', url: 'travel-assets/xian/hanzhong-river-fish.jpg', caption: '散场后：汉中特色鱼' },
      ],
    },
  ],
  dining: [
    {
      meal: '午餐',
      place: '宁强服务区 / 勉县简餐',
      hours: '约 11:30–13:00',
      dishes: [
        { name: '盖浇饭 / 面', price: '¥25–40' },
        { name: '汉中热面皮（若已进城）', price: '¥8–12' },
      ],
    },
    {
      meal: '晚餐',
      place: '诸葛古镇 / 汉台区 · 汉江鱼为主',
      hours: '约 17:30–20:30',
      photo: 'travel-assets/xian/hanzhong-river-fish.jpg',
      dishes: [
        { name: '麻辣黄辣丁（汉中招牌鱼）', price: '¥68–98', photo: 'travel-assets/xian/hanzhong-river-fish.jpg' },
        { name: '清蒸汉江鲢鱼 / 浆水鱼', price: '¥78–128' },
        { name: '热面皮 + 菜豆腐（配菜）', price: '¥8–15' },
      ],
    },
  ],
};

const oldD5 = JSON.parse(JSON.stringify(trip.days[4]));
oldD5.theme = '褒斜古道 · 入驻汉唐驿 · 夜游二选一';
oldD5.tips[0] = '9/29 走褒斜古道石门段（不是只看一座仿古栈道）。11 点前离开汉中，翻秦岭预留 4–5.5h，16:00 前后入驻汉唐驿。晚上永宁门或《长恨歌》，不要两头跑。';
oldD5.slots[0].name = '褒斜古道（石门段）';
oldD5.slots[0].photo = 'travel-assets/xian/baoxie-ancient-road.jpg';
oldD5.slots[0].review = '褒斜道是先秦连接汉中与关中的北栈：褒谷南口至斜谷。石门是世界上最早的人工通车隧洞，摩崖「石门十三品」原石多在汉中市博物馆。走栈道+河谷，理解这条比金牛道更北的官道。';
oldD5.slots[0].gallery = [
  { kind: 'spot', url: 'travel-assets/xian/baoxie-ancient-road.jpg', caption: '褒斜古道石门段栈道（高清）' },
  { kind: 'spot', url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Hanzhong%20baoheriver.jpg?width=1600', caption: '褒河谷 / 高峡平湖' },
  { kind: 'food', url: 'travel-assets/xian/hanzhong-river-fish.jpg', caption: '褒河鲜鱼（午餐可再点）' },
];
oldD5.dining[0].place = '褒河谷农家 · 汉中特色鱼';
oldD5.dining[0].photo = 'travel-assets/xian/hanzhong-river-fish.jpg';
oldD5.dining[0].dishes = [
  { name: '麻辣黄辣丁 / 褒河鱼', price: '¥58–98', photo: 'travel-assets/xian/hanzhong-river-fish.jpg' },
  { name: '浆水面', price: '¥12–18' },
];

trip.days = [day1, day2, day3, day4, oldD5, day6];

trip.overview = [
  {
    day: 1,
    date: '2026.9.25',
    route: '深圳 / 北京 → 双流 → 杜甫草堂 → 鹤鸣茶社 → 锦里 → 九眼桥',
    distance: '空中约 2.5–3.1h + 市区打车约 20–30km',
    highlights: '花径红墙 · 非遗盖碗茶与变脸 · 锦里烟火 · 江船火独明',
    stay: '亚朵酒店杜甫草堂店',
  },
  {
    day: 2,
    date: '2026.9.26',
    route: '成都 → G5 → 汉阳 → 抄手铺段 → 古柏品茶冥想',
    distance: '自驾约 260–280km / 3.5–5.5h + 徒步约 8–10km',
    highlights: '急递铺 · 皇柏 · 古树下品茶与冥想',
    stay: '汉阳镇',
  },
  {
    day: 3,
    date: '2026.9.27',
    route: '汉阳 → 剑门关景区 → 古镇豆腐宴',
    distance: '接驳约 9–15km + 景区内步行',
    highlights: '剑门关楼 · 仿古栈道 · 豆腐宴',
    stay: '剑门关镇',
  },
  {
    day: 4,
    date: '2026.9.28',
    route: '剑门 → G5 → 勉县武侯祠 → 武侯墓汉桂 → 《出师表》',
    distance: '自驾约 200km + 勉县区内约 15km',
    highlights: '天下第一武侯祠 · 千年汉桂 · 出师表 · 汉江鱼',
    stay: '汉中汉台区',
  },
  {
    day: 5,
    date: '2026.9.29',
    route: '褒斜古道石门段 → G5 翻秦岭 → 西安汉唐驿 → 永宁门或《长恨歌》',
    distance: '汉中→石门约 25km + 汉中→西安约 270km / 3.5–5.5h',
    highlights: '褒斜道 / 石门十三品所在 · 汉唐驿 · 永宁门 / 长恨歌',
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

fs.writeFileSync(file, JSON.stringify(trip, null, 2));
console.log('Updated', file, 'days=', trip.days.map(function (d) { return d.date + ' ' + d.theme; }).join(' | '));
