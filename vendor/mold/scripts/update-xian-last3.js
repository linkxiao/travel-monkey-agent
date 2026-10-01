const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, 'shudao-trip.json');
const trip = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const fp = (name) =>
  'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(name) + '?width=800';
const loc = (name) => 'travel-assets/xian/' + name;

const IMG = {
  wall: fp("City wall of Xi'an.jpg"),
  huaqing: fp('华清宫.jpg'),
  huaqing2: fp('华清池景区.jpg'),
  huaqingShow: fp('Huaqing Hot Springs - Emperor Xuanzong of Tang Dynasty (17) (50439876721).jpg'),
  xiangji: fp('Xiangji Temple 2018-5.jpg'),
  xiangji2: fp('Xiangji Temple (3).jpg'),
  pagoda: fp('Giant Wild Goose Pagoda.jpg'),
  xuanzang: fp("Statue of Xuanzang in front of Giant Wild Goose Pagoda. Xi'an. 2011.jpg"),
  xuanzangGold: fp("Golden statue of Xuanzang. Giant Wild Goose Pagoda, Xi'an.jpg"),
  pagodaNight: fp('夜间西安大雁塔 01.jpg'),
  pagodaNightPark: fp('Great wild goose pagoda by night from park.jpg'),
  roujiamo: fp('普通腊汁肉夹馍 01.jpg'),
  paomo: fp('Yangrou Paomo.JPG'),
  liangpi: fp('Shanxi Liangpi 陕西 凉皮.jpg'),
  shimen: fp('Hanzhong baoheriver.jpg'),
  sunset: loc('dayanta-sunset.jpg'),
  buddhaSpot: loc('dayanta-buddha-pagoda-spot.jpg'),
  inn: loc('hantangyi-tang-courtyard.jpg'),
  farm: loc('huangyusi-farmstay.jpg'),
};

const retSz = trip.flights.candidates.find((f) => f.code === '9C8754');
if (retSz) {
  retSz.time = '西安咸阳 XIY 约 19:00–21:00 → 深圳宝安 SZX（班次请核实）';
  retSz.note =
    '10/7 上午雁塔机位、中午香积寺礼佛后赶机场：香积寺→XIY 约 70–90 分钟，建议 16:00 前到场，优先 18:30 以后起飞。春秋 9C / 南航 CZ / 川航 3U 晚班，直飞约 2.5–3h，国庆参考 ¥800–2200。';
}
const retBj = trip.flights.candidates.find((f) => f.code === 'CA1236');
if (retBj) {
  retBj.note =
    '10/7 走完香积寺再飞：优先 CA1236 约 19:35 或 HU/MU 20:00 后。15:30 京线太紧，除非放弃雁塔或香积寺其中一站。直飞约 2h10–2h40，国庆参考 ¥700–2000。';
}

trip.hotelAreas = trip.hotelAreas.filter((a) => !a.area.includes('南门/钟楼') && !a.area.includes('黄峪'));
trip.hotelAreas.push(
  {
    area: '西安钟楼 · 汉唐驿（10/5 一晚）',
    reason:
      '10/5 入驻汉唐驿·唐风美学民宿（新城区南长巷 7 号，近钟楼/新城广场，不是长安区）。步行约 12–18 分钟到永宁门；次日一早南下沣峪口约 50–70 分钟。国庆只订这一晚。',
    options: [
      {
        tier: '中档',
        name: '汉唐驿·唐风美学民宿（南长巷 7 号）',
        priceRange: '约 ¥500–1100/晚（国庆上浮）',
        note: '2021 唐风改造，钟楼地铁站步行约 7 分钟，回民街约 11 分钟。院落图为风格示意，订房看携程/Booking 实拍。',
        photo: IMG.inn,
      },
      {
        tier: '经济',
        name: '全季 / 如家（永宁门或钟楼店）',
        priceRange: '约 ¥350–650/晚',
        note: '汉唐驿满房时的备选，地铁口寄行李方便',
        photo: IMG.inn,
      },
      {
        tier: '高端',
        name: '西安钟楼诺富特酒店',
        priceRange: '约 ¥800–1400/晚',
        note: '若汉唐驿无房，仍可夜逛永宁门',
        photo: IMG.wall,
      },
    ],
  },
  {
    area: '黄峪寺村 · 山中农家（10/6 一晚）',
    reason:
      '2012 扶贫搬迁后山上仅约 10 户，接待能力极有限。务必出发前电话确认当晚开门、几张床、能否包晚饭。订不到就宿滦镇/黄峪沟口，不要摸黑继续走。',
    options: [
      {
        tier: '经济',
        name: '黄峪寺村农家乐（山上，电话现订）',
        priceRange: '约 ¥80–200/床 或 ¥200–400/间',
        note: '设施简陋：热水/被褥/信号以当天为准。板栗、野菜、柴火灶。不要进标「危房」的空屋。',
        photo: IMG.farm,
      },
      {
        tier: '经济',
        name: '滦镇 / 黄峪沟口农家',
        priceRange: '约 ¥150–350/晚',
        note: '山上满房时的安全备选，次日再上沟或直接去雁塔',
        photo: IMG.farm,
      },
      {
        tier: '中档',
        name: '终南逸民宿（太乙杏园，偏离本线）',
        priceRange: '约 ¥400–900/晚',
        note: '品质更好但在翠华山脚，不是黄峪寺本村；仅当放弃夜宿山上时考虑',
        photo: IMG.farm,
      },
    ],
  }
);

trip.tips = trip.tips.map((t) => {
  if (t.includes('10/7 全天三寺')) {
    return '10/6 走完三寺并夜宿黄峪寺；10/7 上午大雁塔机位、中午香积寺、下午飞机。返程优先 18:30 后航班，香积寺→XIY 预留 90 分钟+安检 2.5h。';
  }
  return t;
});
if (!trip.tips.some((t) => t.includes('汉唐驿'))) {
  trip.tips.push(
    '10/5 晚二选一：轻松走永宁门（酒店步行可达）；或赶华清宫《长恨歌》第一场（临潼，车程约 1h，票不含白天门票，提前约 9 天官微抢）。'
  );
  trip.tips.push(
    '三寺风险真实存在但可控：黄沙岭滑、岔路、信号差、山上住宿极简。白天走完、头灯+离线轨迹、不进危房、17:00 前落村。'
  );
}

const extraReminders = [
  { item: '汉唐驿·唐风美学民宿 10/5 一晚（南长巷 7 号）', leadDays: 45 },
  { item: '黄峪寺村农家乐 10/6 电话确认床位与晚饭', leadDays: 14 },
  { item: '华清宫《长恨歌》演出票（若选方案B，官微约提前 9 天 9:30）', leadDays: 9 },
];
extraReminders.forEach((r) => {
  if (!trip.reminders.some((x) => x.item === r.item)) trip.reminders.push(r);
});
if (!trip.preTrip.apps.includes('华清宫景区')) trip.preTrip.apps.push('华清宫景区');

trip.days[4] = {
  date: '2026-10-05',
  weekday: '周一',
  theme: '石门栈道 · 入驻汉唐驿 · 夜游二选一',
  tips: [
    '10/5 周一博物馆多闭馆，排石门外。11 点前离开汉中，国庆翻秦岭预留 4.5–5.5h，16:00 前后入驻汉唐驿。晚上只做一件事：永宁门夜逛，或赶华清宫《长恨歌》——不要两头跑。',
    '若选《长恨歌》：17:00 前出发临潼（约 1h），第一场常见 19:10 左右（你记的 19:30 作目标，以华清宫官微当日场次为准）；散场地铁 9 号线或返程大巴回钟楼。演出票不含华清宫日票。',
  ],
  alternatives: [
    {
      label: '方案A 永宁门夜逛（轻松，默认）',
      summary: '汉唐驿步行 12–18 分钟到南门。上城墙看灯，晚饭洒金桥泡馍/灌汤包。适合翻秦岭后不想再开车的人。',
    },
    {
      label: '方案B 华清宫《长恨歌》约 19:10–19:30',
      summary:
        '九龙湖实景舞剧约 70 分钟。提前约 9 天 9:30「华清宫景区」官微抢票，中区 8–12 排较好。市区→临潼约 1h。国庆热门场很容易没票。',
    },
  ],
  slots: [
    {
      period: 'morning',
      name: '汉中石门栈道风景区',
      time: '08:15–11:00',
      lat: 33.22552,
      lng: 106.923825,
      photo: IMG.shimen,
      rating: 4.5,
      review:
        '世界最早人工通车隧洞「石门」所在。高峡平湖 + 仿汉栈道，一上午走完再北上西安。',
      openingHours: '旺季 08:15–19:00（约 17:40 停售）',
      ticketPrice: '参考 ¥50（含船以现场为准）',
      transport: { mode: '汉台区自驾/打车至河东店镇', fare: '打车约 ¥40–60', duration: '约 25 分钟' },
      needsBooking: false,
      leadDays: 0,
      gallery: [
        { kind: 'spot', url: IMG.shimen, caption: '褒河 / 石门一带高峡平湖' },
        { kind: 'hotel', url: IMG.inn, caption: '今晚入驻：汉唐驿唐风院落（风格示意）' },
        { kind: 'food', url: IMG.liangpi, caption: '汉中热面皮 / 陕西凉皮同类' },
      ],
    },
    {
      period: 'noon',
      name: '入驻汉唐驿·唐风美学民宿',
      time: '11:30 出发 · 16:00 前后入住',
      lat: 34.2628,
      lng: 108.9472,
      photo: IMG.inn,
      rating: 4.6,
      review:
        '新城区南长巷 7 号（新城广场南侧），近钟楼，不是长安区。G5 约 270km 翻秦岭后先洗澡卸行李。若晚上去《长恨歌》，入住从简，17:00 前再出门。',
      openingHours: '全天入住（提前锁房）',
      ticketPrice: '参考 ¥500–1100/晚（国庆非实时）',
      transport: { mode: '自驾 G5 京昆 → 西安绕城下钟楼', fare: '油费+过路费约 ¥200–280', duration: '约 3.5–5.5 小时' },
      needsBooking: true,
      leadDays: 45,
      gallery: [
        { kind: 'hotel', url: IMG.inn, caption: '唐风院落风格示意（以订房相册为准）' },
        { kind: 'spot', url: IMG.wall, caption: '酒店南侧不远即永宁门城墙' },
        { kind: 'food', url: IMG.paomo, caption: '步行范围内：羊肉泡馍' },
      ],
    },
    {
      period: 'evening',
      name: '夜游二选一：永宁门 / 华清宫《长恨歌》',
      time: '方案A 17:30–21:00 · 方案B 17:00 出发观演约 19:10–20:20',
      lat: 34.256889,
      lng: 108.937844,
      photo: IMG.wall,
      rating: 4.7,
      review:
        'A：南门亮灯 + 洒金桥正餐，别在回民街主街被拉客。B：华清宫九龙湖《长恨歌》，身份证入场，小雨常演、大风大雨可能取消；中区视角完整。两场都去会把人拖垮。',
      openingHours: '城墙南门约 08:00–22:00；《长恨歌》以官微当日场次为准',
      ticketPrice: '城墙参考 ¥54；《长恨歌》约 ¥200–988（分区）',
      transport: {
        mode: 'A 步行/地铁永宁门；B 打车或地铁 9 号线华清池站',
        fare: 'A 免费–¥5；B 打车约 ¥80–130 / 地铁约 ¥7',
        duration: 'A 步行 15 分钟；B 约 60–75 分钟',
      },
      seasonal: '10 月夜凉，城墙风大；九龙湖露天记得加外套',
      needsBooking: true,
      leadDays: 9,
      gallery: [
        { kind: 'spot', url: IMG.wall, caption: '永宁门 / 西安城墙（方案A）' },
        { kind: 'spot', url: IMG.huaqing, caption: '华清宫实景（方案B 演出地）' },
        { kind: 'food', url: IMG.paomo, caption: '洒金桥老米家泡馍一类' },
      ],
    },
  ],
  dining: [
    {
      meal: '午餐',
      place: '石门水库旁农家 · 褒河鲜鱼',
      hours: '约 10:00–15:00',
      photo: IMG.shimen,
      dishes: [
        { name: '麻辣黄辣丁 / 石门鱼', price: '¥58–88' },
        { name: '浆水面', price: '¥12–18', photo: IMG.liangpi },
      ],
    },
    {
      meal: '晚餐',
      place: '方案A 洒金桥 · 老米家泡馍 / 贾三灌汤包；方案B 临潼简餐后进场',
      hours: '约 10:00–22:00',
      photo: IMG.paomo,
      dishes: [
        { name: '羊肉泡馍', price: '¥38–58', photo: IMG.paomo },
        { name: '腊汁肉夹馍', price: '¥12–18', photo: IMG.roujiamo },
        { name: '甑糕', price: '¥12' },
      ],
    },
  ],
};

trip.days[5] = {
  date: '2026-10-06',
  weekday: '周二',
  theme: '终南三寺穿越 · 夜宿黄峪寺',
  tips: [
    '推荐走向：沣峪口净业寺进 → 黄沙岭 → 卧佛寺 → 黄峪寺村宿。终点即住宿，避免走完再折返。全程约 10–14km、6–8 小时，国庆 10 月 17:30 前后天黑，必须白天落村。',
    '风险（真实存在、可控）：①黄沙岭砂石滑，尤其雨后，必须防滑鞋+登山杖；②岔路多，下两步路/六只脚离线轨迹，别只靠路口口头指路；③沟里信号差，出发前把路线和预计出村时间发给朋友；④山上约 10 户，无诊所、热水不稳，带头灯、充电宝、雨衣、止痛药、水 1.5L+；⑤村内有危房标牌，不要进入；⑥野生动物少见但秋日有虫蛇，勿抄荒草捷径；⑦国庆山里也有穿越客，仍可能迷路——结伴、不赶夜路。',
    '徒步建议：06:45 汉唐驿出发；07:45 沣峪口；轻装，大件寄酒店或放车上（沟口能停则停，沟里土路谨慎）。寺内随喜、不大声。晚饭吃农家土菜，早睡。次日 07:00 下山。',
  ],
  alternatives: [
    {
      label: '方案A 净业寺→卧佛寺→黄峪寺宿（推荐）',
      summary: '顺坡落到住宿点。体力一般可跳过净业寺，从卧佛寺连黄峪寺。',
    },
    {
      label: '方案B 黄峪沟进、原路或环线后仍宿黄峪',
      summary: '想先看翠微宫遗址再连卧佛。若 15:00 还没到卧佛，直接回村，不要硬穿。',
    },
  ],
  slots: [
    {
      period: 'morning',
      name: '净业寺（律宗祖庭）',
      time: '08:00–10:30',
      lat: 34.0168,
      lng: 108.8089,
      photo: IMG.farm,
      rating: 4.6,
      review:
        '终南山沣峪口上行，道宣律师道场。石阶陡、林深，是三寺里最清静的一座。清晨进寺，避开周末穿越团。',
      openingHours: '山路白天；寺院约 08:00–17:00（以现场为准）',
      ticketPrice: '无门票，随喜',
      transport: { mode: '汉唐驿自驾/打车至沣峪口再徒步上山', fare: '打车约 ¥70–110', duration: '车程约 50–70 分钟 + 徒步 40–70 分钟' },
      needsBooking: false,
      leadDays: 0,
      gallery: [
        { kind: 'spot', url: IMG.farm, caption: '终南山村林谷环境（净业寺无稳定公网实拍）' },
        { kind: 'hotel', url: IMG.inn, caption: '今早从汉唐驿出发' },
        { kind: 'food', url: IMG.roujiamo, caption: '出城前打包肉夹馍当早午餐' },
      ],
    },
    {
      period: 'noon',
      name: '卧佛寺（青华山五层楼）',
      time: '11:00–14:00',
      lat: 34.031126,
      lng: 108.835387,
      photo: IMG.farm,
      rating: 4.6,
      review:
        '崖上五层转角楼，底层约 13 米石卧佛为全国室内大石佛之一；侧有传李世民手植白皮松。黄沙岭到此最滑，慢走。',
      openingHours: '寺院约 08:00–17:00（以寺内为准）',
      ticketPrice: '随喜，无固定门票',
      transport: { mode: '黄沙岭徒步', fare: '免费', duration: '约 1–1.5 小时' },
      needsBooking: false,
      leadDays: 0,
      gallery: [
        { kind: 'spot', url: IMG.farm, caption: '青华山林谷（卧佛寺少公网实拍）' },
        { kind: 'hotel', url: IMG.farm, caption: '再走 1–2h 即黄峪寺民宿' },
        { kind: 'food', url: IMG.liangpi, caption: '寺内或村口简餐 / 自带补给' },
      ],
    },
    {
      period: 'evening',
      name: '黄峪寺村夜宿 · 翠微宫遗址',
      time: '15:30 落村 · 夜宿农家',
      lat: 34.04166,
      lng: 108.857418,
      photo: IMG.farm,
      rating: 4.5,
      review:
        '唐太宗翠微宫遗址所在山窝，秋日板栗。山上约 10 户做农家乐：柴火鸡、野菜、土鸡蛋。先确认床和晚饭再卸包。无酒吧、无快递，早睡看星。',
      openingHours: '山村全天（务必天黑前到达）',
      ticketPrice: '无门票；住宿约 ¥80–400',
      transport: { mode: '卧佛寺徒步至黄峪寺村', fare: '免费', duration: '约 1–1.5 小时' },
      seasonal: '10 月初昼夜温差大，山上比市区低 4–6°C',
      needsBooking: true,
      leadDays: 14,
      gallery: [
        { kind: 'hotel', url: IMG.farm, caption: '黄峪寺山村民宿环境示意' },
        { kind: 'spot', url: IMG.farm, caption: '翠微宫遗址所在山窝' },
        { kind: 'food', url: IMG.liangpi, caption: '农家晚饭：野菜、浆水、柴火鸡' },
      ],
    },
  ],
  dining: [
    {
      meal: '早餐',
      place: '汉唐驿打包 / 长安路边',
      hours: '06:30–07:30',
      photo: IMG.roujiamo,
      dishes: [{ name: '胡辣汤 + 肉夹馍', price: '¥12–18', photo: IMG.roujiamo }],
    },
    {
      meal: '午餐',
      place: '自带补给 + 卧佛寺/村口农家',
      hours: '11:30–13:30',
      photo: IMG.liangpi,
      dishes: [
        { name: '自带坚果面包 + 电解质', price: '自备' },
        { name: '浆水面 / 农家小炒（若开门）', price: '¥15–40', photo: IMG.liangpi },
      ],
    },
    {
      meal: '晚餐',
      place: '黄峪寺村农家包饭',
      hours: '约 17:30–19:00',
      photo: IMG.farm,
      dishes: [
        { name: '柴火鸡 / 板栗炖鸡', price: '¥80–150（桌）' },
        { name: '秦岭野菜、土鸡蛋', price: '含在包饭里' },
        { name: '浆水面', price: '¥12–18', photo: IMG.liangpi },
      ],
    },
  ],
};

trip.days[6] = {
  date: '2026-10-07',
  weekday: '周三',
  theme: '雁塔机位 · 香积寺礼佛 · 返程',
  tips: [
    '07:00 黄峪沟下山（徒步约 60–90 分钟到公路），打车去大慈恩寺。目标 09:30 进寺拍「佛祖 + 大雁塔 + 我」。',
    '机位：①大慈恩寺内如来佛前——人站左侧三分线，塔在右侧，前实后虚，这是「三者同框」正解；②南广场玄奘立像，200mm 压缩玄奘与塔；③大悦城 4 楼观景台古今同框。10 月初西安日落约 18:10，下午飞机拍不到真夕阳——页内附图是机位与暮色参考。若一定要夕阳，改走方案B。',
    '11:40 前离开雁塔，中午赶到香积寺（净土宗祖庭，免费，约 08:00–17:00）礼佛祈平安。13:30 后去 XIY，16:00 到场赶 18:30 后航班。',
  ],
  alternatives: [
    {
      label: '方案A 上午雁塔机位 → 中午香积寺 → 下午飞机（默认）',
      summary: '跟你的节奏一致。雁塔用上午侧光，夕阳图作构图参考。',
    },
    {
      label: '方案B 真夕阳：上午香积寺 → 下午雁塔拍到日落 → 20:00 后航班',
      summary: '黄峪寺下山后先去更近的香积寺，15:30 回大慈恩寺等金光。必须订晚班。',
    },
  ],
  slots: [
    {
      period: 'morning',
      name: '大雁塔 · 佛祖与塔三者机位',
      time: '09:30–11:40',
      lat: 34.220156,
      lng: 108.959377,
      photo: IMG.buddhaSpot,
      rating: 4.8,
      review:
        '站在大慈恩寺如来佛前：佛在左前、塔在右后、人站中左，一张拍齐「佛祖、大雁塔和我」。南广场再补一张玄奘金像。登塔另票。夕阳金塔见附图（下午飞机则作构图参考）。',
      openingHours: '寺院约 08:00–17:30（季节微调）',
      ticketPrice: '入寺参考 ¥40，登塔另约 ¥25',
      transport: { mode: '黄峪沟口打车 / 网约车至大慈恩寺', fare: '约 ¥80–130', duration: '下山后约 60–80 分钟' },
      seasonal: '10 月初银杏未全黄，侧光仍干净；国庆人多，开门就进',
      needsBooking: false,
      leadDays: 0,
      gallery: [
        { kind: 'photo', url: IMG.buddhaSpot, caption: '如来佛 + 大雁塔 + 人：三者机位示意' },
        { kind: 'photo', url: IMG.sunset, caption: '夕阳金塔高清参考（真日落约 18:10）' },
        { kind: 'spot', url: IMG.xuanzang, caption: '南广场：玄奘立像与塔同框' },
        { kind: 'spot', url: IMG.xuanzangGold, caption: '玄奘金像特写' },
        { kind: 'spot', url: IMG.pagodaNight, caption: '夜色大雁塔（若改晚班可看）' },
        { kind: 'food', url: IMG.roujiamo, caption: '雁塔/曲江：肉夹馍垫肚子' },
      ],
    },
    {
      period: 'noon',
      name: '香积寺 · 礼佛祈平安',
      time: '12:10–13:30',
      lat: 34.1284,
      lng: 108.9078,
      photo: IMG.xiangji,
      rating: 4.6,
      review:
        '长安区郭杜香积寺村，净土宗祖庭，善导大师供养塔在此。免费免预约，着装得体、随喜功德。王维「不知香积寺」写的就是这里。礼佛后直接去机场，不要再折回钟楼取行李——行李应头天寄汉唐驿或放车上。',
      openingHours: '约 08:00–17:00（客堂 029-85973209）',
      ticketPrice: '免费',
      transport: { mode: '大雁塔打车南下郭杜（无地铁直达）', fare: '约 ¥40–70', duration: '约 35–50 分钟' },
      needsBooking: false,
      leadDays: 0,
      gallery: [
        { kind: 'spot', url: IMG.xiangji, caption: '香积寺山门正面' },
        { kind: 'spot', url: IMG.xiangji2, caption: '寺内殿塔' },
        { kind: 'food', url: IMG.liangpi, caption: '郭杜/长安区：凉皮或素斋简餐' },
      ],
    },
    {
      period: 'evening',
      name: '西安咸阳机场 → 深圳 / 北京',
      time: '16:00 到场 · 18:30 后起飞',
      lat: 34.4371,
      lng: 108.7579,
      photo: IMG.pagodaNightPark,
      rating: 0,
      review:
        '香积寺→XIY 约 70–90 分钟。深圳看 9C/CZ/3U 晚班；北京看 CA1236（约 19:35）或更晚。国庆安检慢，提前 2.5h。',
      openingHours: '依航班',
      ticketPrice: '返程参考 ¥700–2200（非实时）',
      transport: { mode: '打车香积寺→XIY（地铁需先回城，不推荐）', fare: '打车约 ¥100–160', duration: '约 70–90 分钟' },
      needsBooking: true,
      leadDays: 45,
      gallery: [
        { kind: 'spot', url: IMG.pagodaNightPark, caption: '离开前的长安暮色参考' },
        { kind: 'hotel', url: IMG.farm, caption: '今早从黄峪寺下山' },
        { kind: 'food', url: IMG.roujiamo, caption: '机场陕菜 / 肉夹馍' },
      ],
    },
  ],
  dining: [
    {
      meal: '早餐',
      place: '黄峪寺农家早饭后下山',
      hours: '06:30–07:15',
      photo: IMG.farm,
      dishes: [{ name: '鸡蛋饼 / 小米粥', price: '含住宿或 ¥15' }],
    },
    {
      meal: '午餐',
      place: '香积寺附近素斋 / 长安区简餐',
      hours: '约 12:00–13:20',
      photo: IMG.xiangji,
      dishes: [
        { name: '寺院素面或周边凉皮', price: '¥15–28', photo: IMG.liangpi },
        { name: '肉夹馍（出寺后）', price: '¥12–18', photo: IMG.roujiamo },
      ],
    },
  ],
};

fs.writeFileSync(jsonPath, JSON.stringify(trip, null, 2) + '\n');
console.log('Updated last 3 days, hotels, reminders.');
