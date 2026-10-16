const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mapJs = fs.readFileSync(path.join(root, 'travel-plan-viz/assets/map.js'), 'utf8');
const remindersJs = fs.readFileSync(path.join(root, 'travel-plan-viz/assets/reminders.js'), 'utf8');
const baseCss = fs.readFileSync(path.join(__dirname, 'trip-style.css'), 'utf8');

function renderTrip(trip) {
  if (!trip || typeof trip !== 'object') throw new Error('trip 不是对象');
  if (!trip.title) throw new Error('缺 trip.title');
  const ui = Object.assign({
    heroEyebrow: '定制行程',
    heroBanner: 'travel-assets/xian/banner-user-forest3.jpg',
    heroBadge: '线路 · 景点 · 住宿',
    heroSub: '',
    overviewLead: '',
    preTripTitle: '行前须知',
    weatherLabel: '天气',
    dayHeaderStyle: 'day-date',
    flightLead: '以下为参考班次，待选 · 请自行核实预订，价格仅为区间。',
    hotelLead: '按住的片区列经济 / 中档 / 高端三家不同店（店名+位置，参考不能代订）。对不上真店就不凑。',
  }, trip.ui || {});
  const css = baseCss + (ui.themeCss || '');
  const preTrip = trip.preTrip || { weather: { summary: '', typhoon: '' }, transport: '', packing: '', payment: '', apps: [], ticketTip: '' };
  const apps = (preTrip.apps || []).map((a) => `<span class="pill">${esc(a)}</span>`).join('\n              ');

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function splitDots(s) {
  return String(s || '').split(/\s*[·•]\s*/).filter(Boolean).map(esc).join('<span class="sep" aria-hidden="true"></span>');
}

  const endDate = (trip.days && trip.days.length) ? trip.days[trip.days.length - 1].date : (trip.startDate || '');
  const firstDay = trip.days && trip.days[0];
  const lastDay = trip.days && trip.days[trip.days.length - 1];
  const startBadge = ui.startBadge || ((trip.startDate || '') + ' ' + ((firstDay && firstDay.weekday) || ''));
  const endBadge = ui.endBadge || (endDate ? String(endDate).slice(5) + ' ' + ((lastDay && lastDay.weekday) || '') : '');

function prettyDotDate(iso) {
  var p = String(iso || '').split('-');
  if (p.length < 3) return iso;
  return p[0] + '.' + parseInt(p[1], 10) + '.' + parseInt(p[2], 10);
}

const overviewHtml = (trip.overview && trip.overview.length)
  ? `<div class="section overview-section">
    <div class="section-header">
      <div class="section-title">行程概览</div>
    </div>
    <div class="section-body">
      <p class="overview-lead">${esc(ui.overviewLead || (trip.title + '：按日看线路、景点、住宿与餐饮。'))}</p>
      ${trip.overview.map(function (o) {
        return '<div class="overview-card">'
          + '<div class="overview-head"><span class="overview-day">Day ' + o.day + '</span>'
          + '<span class="overview-date">' + esc(o.date) + '</span></div>'
          + '<div class="overview-grid">'
          + '<div class="overview-cell"><span class="ov-k ov-route">线路</span><span>' + esc(o.route) + '</span></div>'
          + '<div class="overview-cell"><span class="ov-k ov-spot">景点</span><span>' + esc(o.spots || o.highlights || '') + '</span></div>'
          + '<div class="overview-cell"><span class="ov-k ov-stay">入住</span><span>' + esc(o.stay) + '</span></div>'
          + '<div class="overview-cell"><span class="ov-k ov-food">餐饮</span><span>' + esc(o.food || '') + '</span></div>'
          + '</div>'
          + (o.distance ? '<div class="overview-meta">区间 ' + esc(o.distance) + '</div>' : '')
          + (o.load || o.rain || o.park
            ? '<div class="overview-meta">负荷 ' + esc(o.load || '中') + (o.rain ? '，雨天可砍 ' + esc(o.rain) : '') + (o.park ? '，停车 ' + esc(o.park) : '') + '</div>'
            : '')
          + '</div>';
      }).join('\n      ')}
    </div>
  </div>`
  : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#14181f">
<title>${esc(trip.title)} · 行程计划</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,400..700&family=Noto+Sans+SC:wght@300;400;500;700&display=swap" rel="stylesheet">
<style>
${css}
.hero{
  background-image:
    linear-gradient(180deg,rgba(6,8,12,.55) 0%,rgba(6,8,12,.18) 42%,rgba(6,8,12,.55) 100%),
    url('${ui.heroBanner}');
}
</style>
</head>
<body>
<div class="page-wrap">

  <div class="hero">
    <div class="hero-eyebrow">${splitDots(ui.heroEyebrow)}</div>
    <div class="hero-title">${esc(trip.title)}</div>
    ${ui.heroSub ? `<div class="hero-sub">${splitDots(ui.heroSub)}</div>` : ''}
    <div class="hero-dates">
      <div class="hero-badge">${esc(startBadge)} — ${esc(endBadge)}</div>
      <div class="hero-badge">${esc(trip.days ? trip.days.length : 0)} 天</div>
      <div class="hero-badge">${splitDots(ui.heroBadge)}</div>
    </div>
  </div>

  <div class="spacer"></div>
  <div class="checklist-wrap">
    <div class="checklist-title">出发前待办</div>
    <div id="checklist-container"></div>
  </div>

  ${overviewHtml}

  <div class="section">
    <div class="section-header">
      <div class="section-title">${esc(ui.preTripTitle)}</div>
    </div>
    <div class="section-body">
      <div class="info-grid">
        <div class="info-row">
          <div class="info-row-body">
            <div class="info-label">${esc(ui.weatherLabel)}</div>
            <div class="info-text">${esc((preTrip.weather && preTrip.weather.summary) || '')}</div>
            <div class="typhoon-alert">${esc((preTrip.weather && preTrip.weather.typhoon) || '')}</div>
          </div>
        </div>
        <div class="info-row">
          <div class="info-row-body">
            <div class="info-label">交通出行</div>
            <div class="info-text">${esc(preTrip.transport || '')}</div>
          </div>
        </div>
        <div class="info-row">
          <div class="info-row-body">
            <div class="info-label">穿搭装备</div>
            <div class="info-text">${esc(preTrip.packing || '')}</div>
          </div>
        </div>
        <div class="info-row">
          <div class="info-row-body">
            <div class="info-label">支付方式</div>
            <div class="info-text">${esc(preTrip.payment || '')}</div>
          </div>
        </div>
        <div class="info-row">
          <div class="info-row-body">
            <div class="info-label">必备 App</div>
            <div class="app-pills">
              ${apps}
            </div>
          </div>
        </div>
        <div class="info-row">
          <div class="info-row-body">
            <div class="info-label">购票时机</div>
            <div class="info-text">${esc(preTrip.ticketTip || '')}</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-header">
      <div class="section-title">大交通</div>
    </div>
    <div class="section-body">
      <p class="section-lead">${esc(ui.flightLead)}</p>
      <div id="flights-container"></div>
    </div>
  </div>

  <div class="section">
    <div class="section-header">
      <div class="section-title">住宿</div>
    </div>
    <div class="section-body">
      <p class="section-lead">${esc(ui.hotelLead)}</p>
      <div id="hotels-container"></div>
    </div>
  </div>

  <div class="disclaimer-box">
    <div id="disclaimer-text">${esc(trip.disclaimer || '本页信息为参考，出行前请以官方为准。')}</div>
    ${Array.isArray(trip.dataSources) && trip.dataSources.length
      ? `<div class="data-sources" id="data-sources">数据来源：${esc(trip.dataSources.map((s) => (s.name || '') + (s.scope ? '（' + s.scope + '）' : '')).filter(Boolean).join('；'))}</div>`
      : '<div class="data-sources" id="data-sources" hidden></div>'}
  </div>

  <div class="map-section">
    <div class="section-header">
      <div class="section-title">行程地图</div>
    </div>
    <div id="map"></div>
  </div>

  <div id="timeline-container"></div>

  <div class="section">
    <div class="section-header">
      <div class="section-title">全程贴士</div>
    </div>
    <div class="section-body">
      <div class="tips-list" id="tips-container"></div>
    </div>
  </div>

  <div class="page-footer">
    <div>${esc(trip.title)}　${esc(trip.startDate)} 至 ${esc(endDate)}</div>
    <div class="page-footer-note">信息仅供参考，出行前请务必核实。改了出发日期，待办截止日会跟着重算。</div>
  </div>

</div>

<script>
${remindersJs}
</script>
<script>
${mapJs}
</script>
<script id="trip-data" type="application/json">
${JSON.stringify(trip)}
</script>
<script>
const trip = JSON.parse(document.getElementById('trip-data').textContent);
const mapPoints = [];
trip.days.forEach(function (day) {
  (day.slots || []).forEach(function (s) {
    mapPoints.push({ lat: s.lat, lng: s.lng, name: s.name, time: s.time });
  });
});

var periodLabel = { morning: '上午', noon: '下午', evening: '晚间' };
function slotFallbackEmoji(name) {
  if (!name) return '📍';
  if (name.includes('机场') || name.includes('飞机')) return '✈️';
  if (name.includes('高铁') || name.includes('自驾') || name.includes('G5')) return '🚗';
  if (name.includes('剑门')) return '🏯';
  if (name.includes('草堂') || name.includes('花径') || name.includes('红墙')) return '🎋';
  if (name.includes('茶社') || name.includes('鹤鸣') || name.includes('品茶') || name.includes('冥想')) return '🍵';
  if (name.includes('锦里')) return '🏮';
  if (name.includes('九眼') || name.includes('锦江')) return '🌉';
  if (name.includes('亚朵')) return '🏨';
  if (name.includes('抄手') || name.includes('翠云') || name.includes('古柏')) return '🌲';
  if (name.includes('昭化') || name.includes('天雄') || name.includes('葭萌')) return '🏮';
  if (name.includes('大朝')) return '🛖';
  if (name.includes('出师')) return '🎭';
  if (name.includes('汉桂')) return '🌼';
  if (name.includes('武侯')) return '🏯';
  if (name.includes('马超')) return '⚔️';
  if (name.includes('汉中') || name.includes('古汉') || name.includes('拜将')) return '👑';
  if (name.includes('褒斜') || name.includes('石门') || name.includes('栈道')) return '🌉';
  if (name.includes('城墙') || name.includes('永宁')) return '🧱';
  if (name.includes('兵马俑')) return '🪖';
  if (name.includes('雁塔') || name.includes('不夜城') || name.includes('佛祖')) return '🗼';
  if (name.includes('华清') || name.includes('长恨')) return '💃';
  if (name.includes('汉唐驿')) return '🏨';
  if (name.includes('寺')) return '🛕';
  if (name.includes('豆腐')) return '🍲';
  return '📍';
}

function renderChecklist() {
  var floor = trip.checklistStart || '2026-09-01';
  var reminders = computeReminders(trip.startDate, trip.reminders).map(function (r) {
    if (r.deadline < floor) return { item: r.item, leadDays: r.leadDays, deadline: floor };
    return r;
  }).sort(function (a, b) {
    return a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0;
  });
  document.getElementById('checklist-container').innerHTML = renderChecklistHTML(reminders);
}

function renderFlights() {
  var html = '';
  var flights = trip.flights || {};
  (flights.booked || []).forEach(function (f) {
    html += '<div class="flight-candidate is-booked">'
      + '<div class="flight-top"><span class="flight-label">' + escapeHTML(f.label) + '</span>'
      + '<span class="flight-tag">已预订</span></div>'
      + '<div class="flight-time">' + escapeHTML(f.time || '') + '</div></div>';
  });
  (flights.candidates || []).forEach(function (f) {
    html += '<div class="flight-candidate">'
      + '<div class="flight-top"><span class="flight-label">' + escapeHTML(f.label) + '</span>'
      + '<span class="flight-tag">待选，请自行核实</span></div>'
      + '<div class="flight-time">' + escapeHTML(f.time || '') + '</div>'
      + '<div class="flight-note">' + escapeHTML(f.note || '') + '</div></div>';
  });
  document.getElementById('flights-container').innerHTML = html;
}

function renderCarousel(urls, alt) {
  if (!urls || !urls.length) return '';
  if (urls.length === 1) {
    return '<img class="hotel-thumb" src="' + escapeHTML(urls[0]) + '" alt="' + escapeHTML(alt) + '" onerror="this.style.display=\\'none\\'">';
  }
  var html = '<div class="photo-carousel" data-interval="3800"><div class="carousel-track">';
  urls.forEach(function (u, i) {
    html += '<div class="carousel-slide"><img src="' + escapeHTML(u) + '" alt="' + escapeHTML(alt) + ' ' + (i + 1) + '" draggable="false" onerror="this.style.display=\\'none\\'"></div>';
  });
  html += '</div><div class="carousel-dots">';
  urls.forEach(function (_, i) {
    html += '<button type="button" class="carousel-dot' + (i === 0 ? ' on' : '') + '" aria-label="第' + (i + 1) + '张"></button>';
  });
  return html + '</div></div>';
}

function initCarousels() {
  document.querySelectorAll('.photo-carousel').forEach(function (el) {
    var track = el.querySelector('.carousel-track');
    var dots = el.querySelectorAll('.carousel-dot');
    var n = dots.length;
    if (!track || n < 2) return;
    var i = 0;
    var timer;
    function go(k) {
      i = (k + n) % n;
      track.style.transform = 'translate3d(' + (-i * el.clientWidth) + 'px,0,0)';
      dots.forEach(function (d, di) { d.classList.toggle('on', di === i); });
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function start() {
      stop();
      timer = setInterval(function () { go(i + 1); }, parseInt(el.getAttribute('data-interval'), 10) || 3800);
    }
    dots.forEach(function (d, di) {
      d.addEventListener('click', function () { go(di); start(); });
    });
    el.addEventListener('pointerenter', stop);
    el.addEventListener('pointerleave', start);
    var sx = 0;
    el.addEventListener('touchstart', function (e) { sx = e.changedTouches[0].clientX; stop(); }, { passive: true });
    el.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 40) go(dx > 0 ? i - 1 : i + 1);
      start();
    }, { passive: true });
    window.addEventListener('resize', function () { go(i); });
    start();
  });
}

function renderHotels() {
  var tierMap = { '经济': 'tier-economy', '中档': 'tier-mid', '高端': 'tier-luxury' };
  var areas = (trip.hotelAreas || []).filter(function (area) {
    return (area.options || []).some(function (opt) { return opt && opt.name && !/参考$|同片区|待定住宿/.test(opt.name); });
  });
  if (!areas.length) {
    document.getElementById('hotels-container').innerHTML = '<p class="section-lead">没有核实到可点名的酒店，不在这里用景点图凑三档。</p>';
    return;
  }
  var html = '';
  areas.forEach(function (area, ai) {
    if (ai > 0) html += '<div class="divider"></div>';
    html += '<div class="hotel-area"><div class="hotel-area-name">' + escapeHTML(area.area || '') + '</div>'
      + '<div class="hotel-area-reason">' + escapeHTML(area.reason || '') + '</div><div class="hotel-options">';
    (area.options || []).forEach(function (opt) {
      var thumbs = (opt.photos && opt.photos.length) ? opt.photos : (opt.photo ? [opt.photo] : []);
      html += '<div class="hotel-option">';
      if (thumbs.length) html += renderCarousel(thumbs, opt.name);
      html += '<div class="hotel-meta"><span class="hotel-tier ' + (tierMap[opt.tier] || 'tier-economy') + '">' + escapeHTML(opt.tier) + '</span>'
        + '<div class="hotel-body"><div class="hotel-name">' + escapeHTML(opt.name) + '</div>'
        + '<div class="hotel-price">' + escapeHTML(opt.priceRange) + '</div>'
        + '<div class="hotel-note">' + escapeHTML(opt.note) + '</div>'
        + (opt.access && opt.access.note ? '<div class="hotel-note">' + escapeHTML(opt.access.note) + '</div>' : '')
        + renderActionLink(opt.actionLink, '查看') + '</div></div></div>';
    });
    html += '</div></div>';
  });
  if (trip.budget && trip.budget.tiers) {
    html += '<div class="divider"></div><div class="hotel-area"><div class="hotel-area-name">住宿预算' + (trip.budget.nights ? '（' + escapeHTML(String(trip.budget.nights)) + ' 晚）' : '') + '</div>'
      + '<div class="hotel-area-reason">' + escapeHTML(trip.budget.note || '按三档中间价估算，仅参考。') + '</div><div class="hotel-options">';
    trip.budget.tiers.forEach(function (t) {
      html += '<div class="hotel-option"><div class="hotel-meta"><span class="hotel-tier ' + (tierMap[t.tier] || 'tier-economy') + '">' + escapeHTML(t.tier) + '</span>'
        + '<div class="hotel-body"><div class="hotel-price">' + escapeHTML(t.total || '') + '</div></div></div></div>';
    });
    html += '</div></div>';
  }
  document.getElementById('hotels-container').innerHTML = html;
}

function renderActionLink(link, fallbackLabel) {
  if (!link || !link.url) return '';
  var label = link.label || fallbackLabel || '查看';
  return '<a class="action-link" href="' + escapeHTML(link.url) + '" target="_blank" rel="noopener">' + escapeHTML(label) + '</a>';
}

function renderDisclaimer() {
  document.getElementById('disclaimer-text').textContent = trip.disclaimer;
  var box = document.getElementById('data-sources');
  if (!box) return;
  var src = Array.isArray(trip.dataSources) ? trip.dataSources : [];
  if (!src.length) {
    box.hidden = true;
    box.textContent = '';
    return;
  }
  box.hidden = false;
  box.textContent = '数据来源：' + src.map(function (s) {
    return (s.name || '') + (s.scope ? '（' + s.scope + '）' : '');
  }).filter(Boolean).join('；');
}

function renderSlotCard(slot) {
  var periodClass = 'period-' + slot.period;
  var label = periodLabel[slot.period] || slot.period;
  var fallback = slotFallbackEmoji(slot.name);
  var html = '<div class="slot-card ' + periodClass + (slot.kind ? ' card-' + slot.kind : '') + '">';
  html += '<div class="slot-period-bar"></div>';
  var heroPhotos = (slot.photos && slot.photos.length) ? slot.photos : (slot.photo ? [slot.photo] : []);
  html += '<div class="slot-img-wrap' + (heroPhotos.length ? '' : ' img-fallback') + '"' + (heroPhotos.length ? '' : ' data-emoji="' + fallback + '"') + '>';
  if (heroPhotos.length > 1) {
    html += renderCarousel(heroPhotos, slot.name);
  } else if (heroPhotos.length === 1) {
    html += '<img src="' + escapeHTML(heroPhotos[0]) + '" alt="' + escapeHTML(slot.name) + '" '
      + 'onerror="this.style.display=\\'none\\';var p=this.parentElement;p.classList.add(\\'img-fallback\\');p.setAttribute(\\'data-emoji\\',\\'' + fallback + '\\');if(!p.querySelector(\\'.fallback-text\\')){var s=document.createElement(\\'span\\');s.className=\\'fallback-text\\';s.style.cssText=\\'font-size:56px;line-height:1\\';s.textContent=\\'' + fallback + '\\';p.appendChild(s);}">';
  }
  html += '</div>';
  html += '<div class="slot-body">';
  var kindLabel = { route: '线路', spot: '景点', stay: '入住', food: '餐饮', depart: '返程' };
  var kindText = kindLabel[slot.kind] || '';
  html += '<div class="slot-tags">'
    + (kindText ? '<span class="slot-kind kind-' + slot.kind + '">' + kindText + '</span>' : '')
    + (label ? '<span class="slot-period">' + escapeHTML(label) + '</span>' : '')
    + '</div>';
  html += '<div class="slot-name-row"><div class="slot-name">' + escapeHTML(slot.name)
    + (slot.cuttable ? '<span class="slot-cut">雨可砍</span>' : '') + '</div>';
  if (slot.rating && slot.rating > 0) {
    html += '<div class="slot-rating"><span class="slot-rating-star">★</span><span class="slot-rating-num">' + slot.rating.toFixed(1) + '</span></div>';
  }
  html += '</div>';
  if (slot.time) html += '<div class="slot-time">' + escapeHTML(slot.time) + '</div>';
  if (slot.needsBooking) html += reminderBadgeHTML(slot.leadDays);
  html += '<div class="slot-review">' + escapeHTML(slot.review) + '</div>';
  html += '<div class="slot-meta">';
  if (slot.openingHours) html += '<div class="meta-row"><span class="meta-label">营业　</span>' + escapeHTML(slot.openingHours) + '</div>';
  if (slot.closedDays) html += '<div class="meta-row"><span class="meta-label">休息　</span>' + escapeHTML(slot.closedDays) + '</div>';
  if (slot.ticketPrice) html += '<div class="meta-row"><span class="meta-label">门票　</span>' + escapeHTML(slot.ticketPrice) + '</div>';
  if (slot.transport) {
    var ride = [slot.transport.mode, slot.transport.distance, slot.transport.fare, slot.transport.duration].filter(Boolean).map(escapeHTML).join('，');
    if (ride) html += '<div class="meta-row"><span class="meta-label">交通　</span>' + ride + '</div>';
    html += renderActionLink(slot.transport.actionLink, '导航');
  }
  if (slot.seasonal) html += '<div class="seasonal-tag">' + escapeHTML(slot.seasonal) + '</div>';
  html += '</div>';
  html += renderGallery(slot.gallery);
  html += '</div></div>';
  return html;
}

function renderGallery(items) {
  if (!items || !items.length) return '';
  var kindLabel = { spot: '景点', hotel: '住宿', food: '美食', photo: '机位' };
  var html = '<div class="slot-gallery">';
  items.forEach(function (g) {
    if (!g || !g.url) return;
    html += '<figure class="gallery-item"><img src="' + escapeHTML(g.url) + '" alt="' + escapeHTML(g.caption || '') + '" loading="lazy">'
      + '<figcaption><span class="gallery-kind">' + escapeHTML(kindLabel[g.kind] || '图') + '</span>'
      + escapeHTML(g.caption || '') + '</figcaption></figure>';
  });
  return html + '</div>';
}

function renderHikeRoute(route) {
  if (!route || !route.stops || !route.stops.length) return '';
  var html = '<div class="hike-route">';
  html += '<div class="hike-route-kicker">官方徒步段</div>';
  html += '<div class="hike-route-title">' + escapeHTML(route.title) + '</div>';
  html += '<div class="hike-route-meta">全段 ' + escapeHTML(route.distance || '') + ' · ' + escapeHTML(route.duration || '') + '</div>';
  if (route.note) html += '<div class="hike-route-note">' + escapeHTML(route.note) + '</div>';
  if (route.map) {
    html += '<figure class="hike-route-map"><img src="' + escapeHTML(route.map) + '" alt="' + escapeHTML(route.title) + '"></figure>';
  }
  route.stops.forEach(function (stop, i) {
    if (stop.legLabel && stop.kmFromPrev) {
      html += '<div class="hike-leg">徒步 ' + escapeHTML(stop.legLabel) + ' · ' + stop.kmFromPrev + ' km</div>';
    }
    html += '<div class="hike-stop' + (stop.highlight ? ' on' : '') + '">';
    html += '<div class="hike-stop-top"><div class="hike-stop-name">' + (i + 1) + '. ' + escapeHTML(stop.name) + '</div>';
    if (stop.kind) html += '<div class="hike-stop-kind">' + escapeHTML(stop.kind) + '</div>';
    html += '</div>';
    if (stop.services) html += '<div class="hike-stop-row"><b>配套</b>' + escapeHTML(stop.services) + '</div>';
    if (stop.food) html += '<div class="hike-stop-row"><b>餐饮</b>' + escapeHTML(stop.food) + '</div>';
    if (stop.stay) html += '<div class="hike-stop-row"><b>食宿</b>' + escapeHTML(stop.stay) + '</div>';
    if (stop.nearby) html += '<div class="hike-stop-row"><b>附近</b>' + escapeHTML(stop.nearby) + '</div>';
    if (stop.highlight) html += '<div class="hike-stop-hot">午餐 · ' + escapeHTML(stop.highlight) + '</div>';
    html += '</div>';
  });
  return html + '</div>';
}

function renderDayCraft(craft) {
  if (!craft || typeof craft !== 'object') return '';
  var load = craft.load || {};
  var rain = craft.rain || {};
  var park = craft.park || {};
  if (!load.level && !rain.cut && !park.leave) return '';
  var loadClass = /偏累|累/.test(load.level) ? ' is-heavy' : (/轻/.test(load.level) ? ' is-light' : '');
  var loadBody = [load.walk, load.why].filter(Boolean).join(' ');
  var rainBody = [rain.instead, rain.keep ? ('留 ' + rain.keep) : ''].filter(Boolean).join(' ');
  var parkBody = [park.then, park.pickup ? ('取车：' + park.pickup) : ''].filter(Boolean).join(' ');
  return '<div class="day-craft">'
    + '<div class="craft-card' + loadClass + '"><div class="craft-kicker">当天累不累</div>'
    + '<div class="craft-title">' + escapeHTML(load.level || '中') + '</div>'
    + (loadBody ? '<div class="craft-body">' + escapeHTML(loadBody) + '</div>' : '') + '</div>'
    + '<div class="craft-card"><div class="craft-kicker">下雨砍什么</div>'
    + '<div class="craft-title">' + escapeHTML(rain.cut || '露天段') + '</div>'
    + (rainBody ? '<div class="craft-body">' + escapeHTML(rainBody) + '</div>' : '') + '</div>'
    + '<div class="craft-card"><div class="craft-kicker">车停哪再走</div>'
    + '<div class="craft-title">' + escapeHTML(park.leave || '停车场或住宿门口') + '</div>'
    + (parkBody ? '<div class="craft-body">' + escapeHTML(parkBody) + '</div>' : '') + '</div>'
    + '</div>';
}

function renderDining(diningArr) {
  if (!diningArr || !diningArr.length) return '';
  var html = '<div class="dining-section"><div class="dining-header">当日三餐</div><div class="dining-list">';
  diningArr.forEach(function (d) {
    html += '<div class="dining-item"><div class="dining-meal-row">'
      + '<span class="dining-meal-badge">' + escapeHTML(d.meal) + '</span>'
      + '<span class="dining-place">' + escapeHTML(d.place) + '</span>'
      + (d.soft ? '<span class="dining-soft">' + escapeHTML(d.soft) + '</span>' : '') + '</div>'
      + (d.hours ? '<div class="dining-hours">' + escapeHTML(d.hours) + '</div>' : '');
    if (d.photo) html += '<div class="dining-photos"><img src="' + escapeHTML(d.photo) + '" alt="' + escapeHTML(d.place) + '"></div>';
    html += '<div class="dish-list">';
    (d.dishes || []).forEach(function (dish) {
      html += '<div class="dish-row">';
      if (dish.photo) html += '<img class="dish-photo" src="' + escapeHTML(dish.photo) + '" alt="' + escapeHTML(dish.name) + '">';
      html += '<span class="dish-name">' + escapeHTML(dish.name) + '</span><span class="dish-price">' + escapeHTML(dish.price) + '</span></div>';
    });
    html += '</div></div>';
  });
  return html + '</div></div>';
}

function prettyDotDate(iso) {
  var p = String(iso || '').split('-');
  if (p.length < 3) return iso;
  return p[0] + '.' + parseInt(p[1], 10) + '.' + parseInt(p[2], 10);
}
function pickSlots(slots, kinds) {
  var out = [];
  kinds.forEach(function (k) {
    (slots || []).forEach(function (s) {
      if (s.kind === k) out.push(s);
    });
  });
  return out;
}
function renderTimeline() {
  var html = '';
  trip.days.forEach(function (day, di) {
    var brief = day.brief || day.theme || '';
    var header = '<div class="day-header"><div class="day-title-row">'
      + '<div class="day-weekday">Day' + (di + 1) + '</div>'
      + '<div class="day-when">'
      + (day.weekday ? '<span class="day-when-week">' + escapeHTML(day.weekday) + '</span>' : '')
      + (day.date ? '<span class="day-when-date">' + escapeHTML(prettyDotDate(day.date)) + '</span>' : '')
      + '</div>'
      + (brief ? '<div class="day-brief">' + escapeHTML(brief) + '</div>' : '')
      + '</div></div>';
    html += '<div class="day-block">' + header;
    (day.tips || []).forEach(function (tip) {
      html += '<div class="day-tips-banner">' + escapeHTML(tip) + '</div>';
    });
    if (day.alternatives && day.alternatives.length) {
      html += '<div class="day-alts"><div class="day-alts-head">当日二选一</div>';
      day.alternatives.forEach(function (alt) {
        html += '<div class="day-alt"><div class="day-alt-label">' + escapeHTML(alt.label) + '</div>'
          + '<div class="day-alt-sum">' + escapeHTML(alt.summary) + '</div></div>';
      });
      html += '</div>';
    }
    html += renderHikeRoute(day.hikeRoute);
    html += renderDayCraft(day.craft);
    html += '<div class="slots-grid">';
    pickSlots(day.slots, ['route', 'spot', 'stay', 'depart', 'food']).forEach(function (slot) {
      html += renderSlotCard(slot);
    });
    html += '</div>';
    html += renderDining(day.dining);
    html += '<div class="day-block-footer"></div></div>';
  });
  document.getElementById('timeline-container').innerHTML = html;
  document.querySelectorAll('.img-fallback').forEach(function (el) {
    if (!el.querySelector('.fallback-text')) {
      var span = document.createElement('span');
      span.className = 'fallback-text';
      span.style.cssText = 'font-size:56px;line-height:1;';
      span.textContent = el.getAttribute('data-emoji') || '📍';
      el.appendChild(span);
    }
  });
}

function renderTips() {
  var html = '';
  (trip.tips || []).forEach(function (tip) {
    html += '<div class="tip-item"><div class="tip-text">' + escapeHTML(tip) + '</div></div>';
  });
  document.getElementById('tips-container').innerHTML = html;
}

(function init() {
  function safe(fn) { try { fn(); } catch (err) { console.error(err); } }
  safe(renderChecklist);
  safe(renderFlights);
  safe(renderHotels);
  safe(renderDisclaimer);
  safe(renderTimeline);
  safe(renderTips);
  safe(initCarousels);
  // 地图放在 Leaflet 脚本之后初始化，避免 CDN 卡住时整页卡片都不渲染
})();
</script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function () {
  try {
    if (typeof initTravelMap === 'function' && typeof mapPoints !== 'undefined') {
      initTravelMap('map', mapPoints);
    }
  } catch (err) { console.error(err); }
})();
</script>
</body>
</html>
`;
}

module.exports = { renderTrip };

if (require.main === module) {
  const tripArg = process.argv[2];
  const outArg = process.argv[3];
  const tripPath = tripArg
    ? (path.isAbsolute(tripArg) ? tripArg : path.join(__dirname, tripArg))
    : path.join(__dirname, '..', '..', '..', 'seed', 'trips', '01.json');
  const trip = JSON.parse(fs.readFileSync(tripPath, 'utf8'));
  const outPath = outArg
    ? (path.isAbsolute(outArg) ? outArg : path.join(process.cwd(), outArg))
    : path.join(__dirname, '..', '..', '..', 'seed', 'shudao-zhongqiu.html');
  const html = renderTrip(trip);
  fs.writeFileSync(outPath, html);
  console.log('Wrote', outPath, html.length, 'bytes');
}
