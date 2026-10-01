const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, 'shudao-trip.json');
const trip = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const loc = (name) => 'travel-assets/xian/' + name;
const hd = (url) => (typeof url === 'string' ? url.replace(/\?width=\d+/, '?width=1600') : url);

trip.title = '长亭古道之旅（先秦蜀道、汉中、长安）';
trip.checklistStart = '2026-09-01';

trip.reminders.forEach((r) => {
  if (r.leadDays > 30) r.leadDays = 30;
});

const P = {
  cypress: loc('banner-cypress-road.jpg'),
  plane: loc('chengdu-airport-plane.jpg'),
  cabin: loc('dashao-wood-inn.jpg'),
  lantern: loc('zhaohua-lanterns.jpg'),
  highway: loc('g5-mountain-highway.jpg'),
  courtyard: loc('jianmen-courtyard-inn.jpg'),
  hzHotel: loc('hanzhong-city-hotel.jpg'),
  inn: loc('hantangyi-tang-courtyard.jpg'),
  farm: loc('huangyusi-farmstay.jpg'),
  zhaohua: 'https://commons.wikimedia.org/wiki/Special:FilePath/' +
    encodeURIComponent('Zhaohua, Guangyuan, Sichuan, China - panoramio (19).jpg') + '?width=1600',
};

const hotelByArea = [
  [P.cabin, P.courtyard, P.cypress],
  [P.courtyard, P.cabin, P.cypress],
  [P.lantern, P.zhaohua, P.courtyard],
  [P.hzHotel, P.hzHotel, P.inn],
  [P.inn, P.inn, P.zhaohua],
  [P.farm, P.farm, P.farm],
];

trip.hotelAreas.forEach((area, i) => {
  const photos = hotelByArea[i] || [P.courtyard];
  area.options.forEach((opt, j) => {
    opt.photo = hd(opt.photo || photos[j] || photos[0]);
  });
});

function photoForSlot(slot) {
  const n = slot.name || '';
  if (n.includes('机场') || n.includes('飞机')) return P.plane;
  if (n.includes('高铁') || n.includes('自驾') || n.includes('G5')) return P.highway;
  if (n.includes('抄手') || n.includes('翠云') || n.includes('古柏') || n.includes('汉阳')) return P.cypress;
  if (n.includes('大朝')) return P.cabin;
  if (n.includes('昭化') || n.includes('天雄') || n.includes('葭萌')) return P.lantern;
  if (n.includes('汉唐驿')) return P.inn;
  if (n.includes('黄峪') || n.includes('净业') || n.includes('卧佛')) return P.farm;
  return slot.photo || '';
}

trip.days.forEach((day) => {
  (day.slots || []).forEach((slot) => {
    if (!slot.photo) slot.photo = photoForSlot(slot);
    else if (slot.photo.startsWith('http')) slot.photo = hd(slot.photo);
    if (/机场|飞机/.test(slot.name)) slot.photo = P.plane;
    if (/大朝驿/.test(slot.name)) slot.photo = P.cabin;
    if (/昭化|天雄/.test(slot.name)) slot.photo = slot.name.includes('高速') ? P.highway : P.lantern;
    if (/翠云|抄手|汉阳镇/.test(slot.name)) slot.photo = P.cypress;
    if (/自驾 G5|G5 京昆/.test(slot.name)) slot.photo = P.highway;
    (slot.gallery || []).forEach((g) => {
      if (g.url && g.url.startsWith('http')) g.url = hd(g.url);
    });
  });
  (day.dining || []).forEach((d) => {
    if (d.photo && d.photo.startsWith('http')) d.photo = hd(d.photo);
    (d.dishes || []).forEach((dish) => {
      if (dish.photo && dish.photo.startsWith('http')) dish.photo = hd(dish.photo);
    });
  });
});

fs.writeFileSync(jsonPath, JSON.stringify(trip, null, 2) + '\n');
console.log('Visuals + checklist floor updated.');
