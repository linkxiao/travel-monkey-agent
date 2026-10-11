const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mapJs = fs.readFileSync(path.join(root, 'travel-plan-viz/assets/map.js'), 'utf8');
const remindersJs = fs.readFileSync(path.join(root, 'travel-plan-viz/assets/reminders.js'), 'utf8');
const sample = fs.readFileSync(path.join(root, 'samples/chengdu-4d3n-real.html'), 'utf8');
let css = sample.match(/<style>([\s\S]*?)<\/style>/)[1];

const colorMap = [
  ['#f8f8f6', '#f4efe6'],
  ['#f2f2ef', '#ebe3d4'],
  ['#0d0d1a', '#1c1914'],
  ['#2a2a3d', '#3d3428'],
  ['#6b6b82', '#7a6d5c'],
  ['#1b5e20', '#1c3228'],
  ['#388e3c', '#3d5c45'],
  ['#e53935', '#b4532a'],
  ['#ff7043', '#d4784a'],
  ['#b58a2e', '#c4a15a'],
  ['#d4a23a', '#d4b36a'],
  ['#2e7d32', '#2a4a38'],
];
for (const [a, b] of colorMap) css = css.split(a).join(b);
css = css.replace(/rgba\(27,94,32,/g, 'rgba(28,50,40,');
css = css.replace(/rgba\(229,57,53,/g, 'rgba(180,83,42,');
css = css.replace(/rgba\(181,138,46,/g, 'rgba(196,161,90,');
css = css.replace(/background: #e8eaf6;/, 'background: #e4d8c4;');
const baseCss = css;

function renderTrip(trip) {
  if (!trip || typeof trip !== 'object') throw new Error('trip 不是对象');
  if (!trip.title) throw new Error('缺 trip.title');
  const ui = Object.assign({
    heroEyebrow: '行程 · 定制',
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
  const apps = (preTrip.apps || []).map((a, i) => {
  const cls = i % 3 === 1 ? ' teal' : i % 3 === 2 ? ' sakura' : '';
  return `<span class="pill${cls}">${esc(a)}</span>`;
}).join('\n              ');

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
      <div class="section-icon sakura">🧭</div>
      <div class="section-title">行程概览</div>
    </div>
    <div class="section-body">
      <p class="overview-lead">${esc(ui.overviewLead || (trip.title + '：按日看线路、景点、住宿与餐饮。'))}</p>
      ${trip.overview.map(function (o) {
        return '<div class="overview-card">'
          + '<div class="overview-head"><span class="overview-day">Day' + o.day + '</span>'
          + '<span class="overview-date">' + esc(o.date) + '</span></div>'
          + '<div class="overview-grid">'
          + '<div class="overview-cell"><span class="ov-k ov-route">线路</span><span>' + esc(o.route) + '</span></div>'
          + '<div class="overview-cell"><span class="ov-k ov-spot">景点</span><span>' + esc(o.spots || o.highlights || '') + '</span></div>'
          + '<div class="overview-cell"><span class="ov-k ov-stay">入住</span><span>' + esc(o.stay) + '</span></div>'
          + '<div class="overview-cell"><span class="ov-k ov-food">餐饮</span><span>' + esc(o.food || '') + '</span></div>'
          + '</div>'
          + '<div class="overview-meta"><span>区间 ' + esc(o.distance) + '</span></div>'
          + (o.load || o.rain || o.park
            ? '<div class="overview-meta">累 ' + esc(o.load || '') + (o.rain ? ' · 雨砍 ' + esc(o.rain) : '') + (o.park ? ' · 停 ' + esc(o.park) : '') + '</div>'
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
<meta name="theme-color" content="#1c1914">
<title>${esc(trip.title)} · 行程计划</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700;900&family=Bebas+Neue&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet">
<style>
${css}
.page-wrap{max-width:760px!important}
.hero{
  background-image:
    linear-gradient(180deg,rgba(8,10,6,.62) 0%,rgba(8,10,6,.18) 36%,rgba(8,10,6,.08) 58%,rgba(8,10,6,.55) 100%),
    linear-gradient(90deg,rgba(8,10,6,.48) 0%,rgba(8,10,6,.06) 52%,rgba(8,10,6,.28) 100%),
    url('${ui.heroBanner}')!important;
  background-size:cover!important;
  background-position:center 62%!important;
  min-height:440px;
  padding:16px 24px 28px!important;
  display:flex;
  flex-direction:column;
  justify-content:flex-start;
  align-items:flex-start;
}
.hero-petals,.hero::before,.hero::after{display:none!important}
.hero-eyebrow{
  position:relative;
  z-index:1;
  margin-bottom:6px!important;
  color:#f4e8c8!important;
  text-shadow:0 1px 10px rgba(0,0,0,.55);
}
.hero-title{
  font-family:'Noto Sans SC',sans-serif!important;
  font-size:38px!important;
  font-weight:900!important;
  letter-spacing:.08em!important;
  line-height:1.25!important;
  text-shadow:0 2px 16px rgba(0,0,0,.55);
  margin:0;
}
.hero-sub{
  margin-top:8px;
  font-size:16px;
  font-weight:500;
  letter-spacing:.18em;
  color:rgba(255,248,230,.92);
  position:relative;
  z-index:1;
  text-shadow:0 1px 10px rgba(0,0,0,.5);
}
.hero-dates{margin-top:10px!important;z-index:1}
.hero-badge{
  background:rgba(12,14,10,.38)!important;
  border:1px solid rgba(244,232,200,.28)!important;
  backdrop-filter:blur(8px);
}
.slot-img-wrap{height:280px!important}
.slot-gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:0 14px 16px;margin-top:2px}
.gallery-item{margin:0}
.gallery-item img{width:100%;height:168px;object-fit:cover;object-position:center 18%;border-radius:10px;background:#1c1914}
.gallery-item figcaption{font-size:11px;line-height:1.4;color:#7a6d5c;margin-top:5px}
.gallery-kind{display:inline-block;font-size:9px;font-weight:700;letter-spacing:.06em;padding:1px 5px;border-radius:8px;margin-right:3px;background:rgba(180,83,42,.12);color:#8a3a16}
.hotel-option{flex-direction:column!important;align-items:stretch!important;padding:0 0 12px!important;overflow:hidden}
.hotel-thumb{width:100%!important;height:200px!important;object-fit:cover;border-radius:12px 12px 0 0!important;margin:0!important;background:#ebe3d4}
.photo-carousel{position:relative;width:100%;overflow:hidden;background:#ebe3d4}
.hotel-option .photo-carousel{height:200px;border-radius:12px 12px 0 0}
.slot-img-wrap .photo-carousel{position:absolute;inset:0;height:100%;border-radius:0}
.slot-img-wrap img{position:static;inset:auto}
.slot-img-wrap>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.carousel-track{display:flex;flex-wrap:nowrap;height:100%;width:100%;transition:transform .45s ease;will-change:transform}
.carousel-slide{flex:0 0 100%;width:100%;min-width:100%;max-width:100%;height:100%;overflow:hidden;position:relative}
.carousel-slide img{display:block;width:100%;height:100%;max-width:none!important;min-width:0;object-fit:cover;object-position:center;position:absolute!important;inset:0!important}
.carousel-dots{position:absolute;bottom:8px;left:0;right:0;display:flex;justify-content:center;gap:6px;z-index:2}
.carousel-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.45);border:0;padding:0;cursor:pointer}
.carousel-dot.on{background:#fff;width:16px;border-radius:4px}
.hotel-meta{display:flex;gap:10px;align-items:flex-start;padding:10px 12px 0}
.dining-section{
  background:#efe4cf!important;
  margin:12px 14px 18px!important;
  padding:14px 14px 12px!important;
  border-radius:14px!important;
  border-top:none!important;
  box-shadow:inset 0 0 0 1px rgba(180,83,42,.10);
}
.day-craft{
  display:grid;
  grid-template-columns:1fr;
  gap:8px;
  margin:12px 14px 4px;
}
.craft-card{
  background:#efe4cf;
  border-radius:14px;
  padding:12px 13px 11px;
  box-shadow:inset 0 0 0 1px rgba(180,83,42,.10);
}
.craft-card.is-light{box-shadow:inset 0 0 0 1.5px rgba(61,92,69,.28)}
.craft-card.is-heavy{box-shadow:inset 0 0 0 1.5px rgba(180,83,42,.35)}
.craft-kicker{font-size:11px;font-weight:700;letter-spacing:.12em;color:#8a3a16;margin-bottom:4px}
.craft-title{font-family:'Noto Sans SC',sans-serif;font-size:16px;font-weight:800;color:#3d3428;line-height:1.35}
.craft-body{font-size:13px;line-height:1.6;color:#5c4e3d;margin-top:4px}
.slot-cut{display:inline-block;margin-left:6px;font-size:10px;font-weight:800;letter-spacing:.08em;color:#8a3a16;background:rgba(180,83,42,.12);padding:2px 8px;border-radius:999px;vertical-align:middle}
.hike-route{
  background:#efe4cf;
  margin:12px 14px 16px;
  padding:14px 14px 12px;
  border-radius:14px;
  box-shadow:inset 0 0 0 1px rgba(180,83,42,.10);
}
.hike-route-kicker{font-size:11px;font-weight:700;letter-spacing:.14em;color:#8a3a16;margin-bottom:4px}
.hike-route-title{font-family:'Noto Sans SC',sans-serif;font-size:17px;font-weight:800;color:#3d3428;letter-spacing:.04em;line-height:1.35}
.hike-route-meta{font-size:13px;color:#6b3a16;margin:6px 0 8px}
.hike-route-note{font-size:13px;line-height:1.6;color:#5c4e3d;margin-bottom:10px}
.hike-route-map{margin:0 0 12px}
.hike-route-map img{width:100%;height:auto;display:block;border-radius:10px;background:#ebe3d4}
.hike-leg{
  display:flex;align-items:center;justify-content:center;gap:8px;
  margin:2px 0 2px;padding:6px 0;
  font-size:12px;font-weight:700;letter-spacing:.04em;color:#8a3a16;
}
.hike-leg:before,.hike-leg:after{content:'';flex:1;height:1px;background:rgba(180,83,42,.28)}
.hike-stop{
  background:rgba(255,255,255,.45);
  border-radius:12px;
  padding:11px 12px 10px;
  margin-bottom:2px;
}
.hike-stop.on{box-shadow:inset 0 0 0 1.5px rgba(180,83,42,.35);background:rgba(255,248,236,.9)}
.hike-stop-top{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:6px}
.hike-stop-name{font-size:15px;font-weight:800;color:#3d3428}
.hike-stop-kind{font-size:11px;color:#8a3a16;flex-shrink:0}
.hike-stop-row{font-size:12px;line-height:1.55;color:#5c4e3d;margin-top:3px}
.hike-stop-row b{font-weight:700;color:#6b3a16;margin-right:4px}
.hike-stop-hot{display:inline-block;margin-top:6px;font-size:12px;font-weight:700;color:#8a3a16;background:rgba(180,83,42,.12);padding:2px 8px;border-radius:999px}
.dining-header{
  font-size:13px!important;
  color:#6b3a16!important;
  letter-spacing:.12em;
  margin-bottom:12px!important;
  padding-bottom:8px;
  border-bottom:1px solid rgba(180,83,42,.16);
}
.dining-item{
  position:relative;
  background:#fffaf2;
  border-radius:10px;
  padding:12px 12px 10px;
  margin-bottom:10px!important;
  border:1px solid rgba(61,52,40,.07);
}
.dining-item:last-child{margin-bottom:0!important}
.dining-place{font-size:14px}
.dining-photos{display:flex;gap:8px;margin:8px 0 6px;overflow-x:auto}
.dining-photos img{width:160px;height:110px;object-fit:cover;border-radius:10px;flex-shrink:0}
.dish-row{align-items:center!important;padding:7px 0;border-bottom:1px dashed rgba(122,109,92,.22)}
.dish-row:last-child{border-bottom:none;padding-bottom:0}
.dish-name{color:#3d3428;font-weight:500}
.dish-photo{width:48px;height:48px;object-fit:cover;border-radius:8px;margin-right:8px;vertical-align:middle}
.overview-section{margin:0 0 18px}
.overview-lead{font-size:13px;color:var(--ink-mid);line-height:1.65;margin:0 0 14px}
.overview-card{
  background:#fffaf2;
  border:1px solid rgba(180,83,42,.12);
  border-radius:12px;
  padding:12px 14px 11px;
  margin-bottom:10px;
}
.overview-card:last-child{margin-bottom:0}
.overview-head{display:flex;align-items:baseline;gap:10px;margin-bottom:6px}
.overview-day{
  font-family:'Bebas Neue',sans-serif;
  font-size:28px;
  line-height:1;
  letter-spacing:.03em;
  color:#1c1914;
}
.overview-date{font-family:'DM Mono',monospace;font-size:13px;color:#8a3a16}
.overview-route{font-size:14px;font-weight:600;color:#3d3428;line-height:1.5;margin-bottom:6px}
.overview-grid{display:flex;flex-direction:column;gap:6px;margin:4px 0 8px}
.overview-cell{display:flex;align-items:flex-start;gap:8px;font-size:13px;line-height:1.55;color:#3d3428}
.ov-k{
  flex:0 0 36px;
  margin-top:1px;
  font-size:10px;
  font-weight:800;
  letter-spacing:.08em;
  padding:2px 0;
  text-align:center;
  border-radius:6px;
}
.ov-route{background:rgba(61,92,69,.12);color:#2a4a38}
.ov-spot{background:rgba(180,83,42,.12);color:#8a3a16}
.ov-stay{background:rgba(28,50,40,.12);color:#1c3228}
.ov-food{background:rgba(196,161,90,.22);color:#8a6a28}
.overview-meta{font-size:12px;color:#7a6d5c;line-height:1.55}
.overview-stay{font-size:11px;color:#8a3a16;margin-top:6px;letter-spacing:.04em}
.slot-kind{
  font-size:10px;
  font-weight:800;
  letter-spacing:.10em;
  padding:2px 8px;
  border-radius:20px;
}
.slot-kind.kind-route{background:rgba(61,92,69,.14);color:#2a4a38}
.slot-kind.kind-spot{background:rgba(180,83,42,.12);color:#8a3a16}
.slot-kind.kind-stay{background:rgba(28,50,40,.12);color:#1c3228}
.slot-kind.kind-food{background:rgba(196,161,90,.22);color:#8a6a28}
.slot-kind.kind-depart{background:rgba(100,181,246,.16);color:#0d47a1}
.day-block .slots-grid{
  display:grid !important;
  grid-template-columns:1fr;
  gap:0;
  border-left:1px solid var(--border);
  border-right:1px solid var(--border);
}
.day-block .slots-grid .slot-card{
  border-left:none;
  border-right:none;
  min-width:0;
}
@media(min-width:768px){
  .day-block .slots-grid{
    grid-template-columns:1fr 1fr !important;
  }
  .day-block .slots-grid .slot-card:nth-child(odd){
    border-right:1px solid var(--border);
  }
  .day-craft{grid-template-columns:1fr 1fr 1fr;gap:10px}
}
.day-date-inline{
  font-family:'DM Mono',monospace;
  font-size:15px;
  color:rgba(255,255,255,.78);
  letter-spacing:.04em;
}
.optional-tag{
  display:inline-block;
  margin-left:6px;
  font-size:10px;
  font-weight:700;
  letter-spacing:.08em;
  padding:1px 6px;
  border-radius:8px;
  background:rgba(180,83,42,.12);
  color:#8a3a16;
  vertical-align:middle;
}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{overflow-x:hidden}
.page-wrap{
  overflow-x:hidden;
  padding-bottom:calc(60px + env(safe-area-inset-bottom,0px))!important;
}
.section-title,.checklist-title{
  font-family:'Noto Sans SC',sans-serif!important;
  font-weight:800!important;
  letter-spacing:.06em!important;
}
.slot-name,.overview-route,.info-text,.slot-review,.tip-text,.todo-text{
  overflow-wrap:anywhere;
  word-break:break-word;
}
.hero-dates{flex-wrap:wrap}
.info-row:has(.typhoon-alert){grid-column:auto}
.day-weekday{font-family:"Bebas Neue",sans-serif;font-size:28px;letter-spacing:.03em;line-height:1}
.day-header .day-title-row{display:flex;align-items:center;flex-wrap:nowrap;gap:12px}
.day-weekday{flex:0 0 auto}
.day-when{display:flex;flex-direction:column;flex:0 0 auto;line-height:1.3;padding-left:12px;border-left:1px solid rgba(255,255,255,.25)}
.day-when-week{font-size:13px;font-weight:700;color:rgba(255,255,255,.9)}
.day-when-date{font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.04em;color:rgba(255,255,255,.72)}
.day-brief{margin-left:auto;min-width:0;max-width:62%;text-align:right;font-size:14px;font-weight:600;line-height:1.4;color:rgba(255,255,255,.9)}
@media(max-width:720px){
  body{font-size:16px;line-height:1.7}
  .page-wrap{max-width:100%!important}
  .section,.map-section,.day-block,.checklist-wrap,.disclaimer-box{
    margin-left:10px;
    margin-right:10px;
  }
  .hero{
    min-height:300px;
    padding:18px 16px 22px!important;
  }
  .hero-eyebrow{
    font-size:11px!important;
    letter-spacing:.04em!important;
    line-height:1.45;
    max-width:100%;
  }
  .hero-title{
    font-size:28px!important;
    letter-spacing:.04em!important;
    line-height:1.3!important;
  }
  .hero-sub{
    font-size:13px;
    letter-spacing:.08em;
    line-height:1.4;
  }
  .hero-badge{
    font-size:12px;
    padding:5px 10px;
    line-height:1.3;
  }
  .section-header{padding:14px 14px 10px}
  .section-title{font-size:17px!important}
  .section-body{padding:14px 14px}
  .checklist-wrap{padding:16px 14px}
  .checklist-title{font-size:17px!important;margin-bottom:12px}
  .todo-item{padding:12px 12px;gap:12px}
  .todo-item input[type="checkbox"]{width:22px;height:22px;margin-top:2px}
  .todo-text{font-size:14px;line-height:1.55}
  .todo-deadline{font-size:12px}
  .info-label{font-size:12px}
  .info-text,.typhoon-alert{font-size:14px;line-height:1.7}
  .pill{font-size:13px;padding:5px 11px}
  .flight-label{font-size:14px}
  .flight-time,.flight-note{font-size:13px;line-height:1.55}
  .hotel-area-name{font-family:'Noto Sans SC',sans-serif;font-size:15px;font-weight:800;letter-spacing:.04em}
  .hotel-area-reason,.hotel-note{font-size:13px;line-height:1.55}
  .hotel-thumb{height:168px!important}
  .hotel-option .photo-carousel{height:168px}
  .overview-lead{font-size:14px;line-height:1.7}
  .overview-day{font-size:26px}
  .overview-date{font-size:13px}
  .overview-route{font-size:15px;line-height:1.55}
  .overview-cell{font-size:14px;line-height:1.6}
  .overview-meta{font-size:13px;line-height:1.6}
  .overview-stay{font-size:12px}
  .overview-card{padding:12px 12px 11px}
  .day-header{padding:12px 14px 12px}
  .day-title-row{flex-wrap:wrap;gap:4px 10px}
  .day-weekday{font-size:26px;flex:0 0 auto}
  .day-header .day-title-row{gap:10px}
  .day-when{padding-left:10px}
  .day-brief{font-size:13px;max-width:56%}
  .day-tips-banner,.day-alts{padding:10px 14px;font-size:14px;line-height:1.65}
  .day-alt-label{font-size:14px}
  .day-alt-sum{font-size:13px;line-height:1.55}
  .slot-img-wrap{height:auto!important;aspect-ratio:16/10;min-height:200px}
  .slot-img-wrap img{object-position:center 28%}
  .slot-body{padding:14px 14px 16px}
  .slot-name{font-size:17px;line-height:1.4}
  .slot-review{font-size:14px;line-height:1.7}
  .slot-time{font-size:13px}
  .meta-row{align-items:flex-start}
  .meta-text{font-size:13px;line-height:1.55}
  .slot-gallery{
    grid-template-columns:1fr 1fr;
    gap:8px;
    padding:0 12px 14px;
  }
  .gallery-item img{height:132px;object-position:center 30%}
  .gallery-item figcaption{font-size:12px;line-height:1.45}
  .day-block .slots-grid{grid-template-columns:1fr !important}
  .day-block .slots-grid .slot-card:nth-child(odd){border-right:none}
  .hike-route{margin:10px 10px 14px;padding:12px}
  .hike-route-title{font-size:16px}
  .hike-stop-name{font-size:15px}
  .day-craft{margin:10px 10px 2px}
  .craft-title{font-size:15px}
  .dining-section{margin:10px 10px 16px!important;padding:12px!important}
  .dining-header{font-size:13px!important}
  .dining-place{font-size:15px;line-height:1.4}
  .dining-hours,.dish-name,.dish-price{font-size:13px}
  .dish-row{flex-wrap:wrap}
  #map{height:280px!important}
  .tips-list .tip-text,.tip-text{font-size:14px;line-height:1.65}
  .page-footer{padding:16px 16px calc(24px + env(safe-area-inset-bottom,0px));font-size:12px}
}
@media(max-width:380px){
  .hero-title{font-size:24px!important}
  .day-weekday{font-size:26px}
  .slot-gallery{grid-template-columns:1fr}
  .gallery-item img{height:168px}
  .section,.map-section,.day-block,.checklist-wrap,.disclaimer-box{
    margin-left:8px;
    margin-right:8px;
  }
}
</style>
</head>
<body>
<div class="page-wrap">

  <div class="hero">
    <div class="hero-petals">
      <div class="petal"></div><div class="petal"></div>
      <div class="petal"></div><div class="petal"></div>
      <div class="petal"></div>
    </div>
    <div class="hero-eyebrow">${esc(ui.heroEyebrow)}</div>
    <div class="hero-title">${esc(trip.title)}</div>
    <div class="hero-sub">${esc(ui.heroSub || '')}</div>
    <div class="hero-dates">
      <div class="hero-badge">📅 ${esc(startBadge)}</div>
      <div class="hero-badge">→ ${esc(endBadge)}</div>
      <div class="hero-badge">🥾 ${esc(ui.heroBadge)}</div>
    </div>
  </div>

  <div class="spacer"></div>
  ${overviewHtml}
  <div class="checklist-wrap">
    <div class="checklist-title">📋 出发前待办清单</div>
    <div id="checklist-container"></div>
  </div>

  <div class="section">
    <div class="section-header">
      <div class="section-icon sakura">🍂</div>
      <div class="section-title">${esc(ui.preTripTitle)}</div>
    </div>
    <div class="section-body">
      <div class="info-grid">
        <div class="info-row">
          <div class="info-row-icon">🌡️</div>
          <div class="info-row-body">
            <div class="info-label">${esc(ui.weatherLabel)}</div>
            <div class="info-text">${esc((preTrip.weather && preTrip.weather.summary) || '')}</div>
            <div class="typhoon-alert">⚠️ ${esc((preTrip.weather && preTrip.weather.typhoon) || '')}</div>
          </div>
        </div>
        <div class="info-row">
          <div class="info-row-icon">🚇</div>
          <div class="info-row-body">
            <div class="info-label">交通出行</div>
            <div class="info-text">${esc(preTrip.transport || '')}</div>
          </div>
        </div>
        <div class="info-row">
          <div class="info-row-icon">👕</div>
          <div class="info-row-body">
            <div class="info-label">穿搭装备</div>
            <div class="info-text">${esc(preTrip.packing || '')}</div>
          </div>
        </div>
        <div class="info-row">
          <div class="info-row-icon">💳</div>
          <div class="info-row-body">
            <div class="info-label">支付方式</div>
            <div class="info-text">${esc(preTrip.payment || '')}</div>
          </div>
        </div>
        <div class="info-row">
          <div class="info-row-icon">📱</div>
          <div class="info-row-body">
            <div class="info-label">必备 App</div>
            <div class="app-pills">
              ${apps}
            </div>
          </div>
        </div>
        <div class="info-row">
          <div class="info-row-icon">🎟️</div>
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
      <div class="section-icon teal">🚄</div>
      <div class="section-title">大交通参考</div>
    </div>
    <div class="section-body">
      <p style="font-size:12px;color:var(--ink-soft);margin-bottom:12px;">${esc(ui.flightLead)}</p>
      <div id="flights-container"></div>
    </div>
  </div>

  <div class="section">
    <div class="section-header">
      <div class="section-icon indigo">🏨</div>
      <div class="section-title">住宿推荐 · 片区+价位</div>
    </div>
    <div class="section-body">
      <p style="font-size:12px;color:var(--ink-soft);margin-bottom:12px;">${esc(ui.hotelLead)}</p>
      <div id="hotels-container"></div>
    </div>
  </div>

  <div class="disclaimer-box">
    <div class="disclaimer-icon">⚠️</div>
    <div id="disclaimer-text">${esc(trip.disclaimer || '本页信息为参考，出行前请以官方为准。')}</div>
    ${Array.isArray(trip.dataSources) && trip.dataSources.length
      ? `<div class="data-sources" id="data-sources">数据来源：${esc(trip.dataSources.map((s) => (s.name || '') + (s.scope ? '（' + s.scope + '）' : '')).filter(Boolean).join('；'))}</div>`
      : '<div class="data-sources" id="data-sources" hidden></div>'}
  </div>

  <div class="map-section">
    <div class="section-header" style="background:var(--bg-card);border-radius:var(--radius) var(--radius) 0 0;border:1px solid var(--border);border-bottom:none;">
      <div class="section-icon sakura">🗺️</div>
      <div class="section-title">行程地图</div>
    </div>
    <div id="map" style="height:380px;border-radius:0 0 var(--radius) var(--radius);overflow:hidden;border:1px solid var(--border);border-top:none;"></div>
  </div>

  <div id="timeline-container"></div>

  <div class="section">
    <div class="section-header">
      <div class="section-icon sakura">💡</div>
      <div class="section-title">全程实用贴士</div>
    </div>
    <div class="section-body">
      <div class="tips-list" id="tips-container"></div>
    </div>
  </div>

  <div class="page-footer">
    <div class="footer-divider"></div>
    <div>${esc(trip.title)} · ${esc(trip.startDate)}–${esc(endDate)}</div>
    <div style="margin-top:4px;color:#aaa;">信息仅供参考，出行前请务必核实 · 日期可改后续重算提醒</div>
  </div>

</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
${mapJs}
</script>
<script>
${remindersJs}
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
var periodEmoji = { morning: '🌅', noon: '☀️', evening: '🌙' };

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
    html += '<div class="flight-candidate" style="border-left-color:var(--sakura)">'
      + '<div class="flight-top"><span class="flight-label">' + escapeHTML(f.label) + '</span>'
      + '<span class="flight-tag" style="background:rgba(180,83,42,0.12);color:var(--sakura)">已预订</span></div>'
      + '<div class="flight-time">' + escapeHTML(f.time || '') + '</div></div>';
  });
  (flights.candidates || []).forEach(function (f) {
    html += '<div class="flight-candidate">'
      + '<div class="flight-top"><span class="flight-label">' + escapeHTML(f.label) + '</span>'
      + '<span class="flight-tag">待选 · 请自行核实</span></div>'
      + '<div class="flight-time">' + escapeHTML(f.time || '') + '</div>'
      + '<div class="flight-note">' + escapeHTML(f.note || '') + '</div></div>';
  });
  document.getElementById('flights-container').innerHTML = html;
}

function renderCarousel(urls, alt) {
  if (!urls || !urls.length) return '';
  if (urls.length === 1) {
    return '<img class="hotel-thumb" src="' + escapeHTML(urls[0]) + '" alt="' + escapeHTML(alt) + '">';
  }
  var html = '<div class="photo-carousel" data-interval="3800"><div class="carousel-track">';
  urls.forEach(function (u, i) {
    html += '<div class="carousel-slide"><img src="' + escapeHTML(u) + '" alt="' + escapeHTML(alt) + ' ' + (i + 1) + '" draggable="false"></div>';
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
    document.getElementById('hotels-container').innerHTML = '<p style="font-size:13px;color:var(--ink-soft);">没有核实到可点名的酒店，不在这里用景点图凑三档。</p>';
    return;
  }
  var html = '';
  areas.forEach(function (area, ai) {
    if (ai > 0) html += '<div class="divider"></div>';
    html += '<div class="hotel-area"><div class="hotel-area-name">📍 ' + escapeHTML(area.area || '') + '</div>'
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
    html += '<div class="divider"></div><div class="hotel-area"><div class="hotel-area-name">💰 预算信封 · 住宿' + (trip.budget.nights ? '（' + escapeHTML(String(trip.budget.nights)) + '晚）' : '') + '</div>'
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
  var emoji = periodEmoji[slot.period] || '⏰';
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
  html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;">'
    + (kindText ? '<span class="slot-kind kind-' + slot.kind + '">' + kindText + '</span>' : '')
    + '<span style="font-size:10px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;padding:2px 9px;border-radius:20px;'
    + (slot.period === 'morning' ? 'background:rgba(100,181,246,0.15);color:#0d47a1;' :
       slot.period === 'noon' ? 'background:rgba(180,83,42,0.12);color:#8a3a16;' :
       'background:rgba(28,50,40,0.12);color:#1c3228;')
    + '">' + emoji + ' ' + label + '</span></div>';
  html += '<div class="slot-name-row"><div class="slot-name">' + escapeHTML(slot.name)
    + (slot.cuttable ? '<span class="slot-cut">雨可砍</span>' : '') + '</div>';
  if (slot.rating && slot.rating > 0) {
    html += '<div class="slot-rating"><span class="slot-rating-star">★</span><span class="slot-rating-num">' + slot.rating.toFixed(1) + '</span></div>';
  }
  html += '</div>';
  html += '<div class="slot-time">🕐 ' + escapeHTML(slot.time) + '</div>';
  if (slot.needsBooking) html += reminderBadgeHTML(slot.leadDays);
  html += '<div class="slot-review">' + escapeHTML(slot.review) + '</div>';
  html += '<div class="slot-meta">';
  if (slot.openingHours) html += '<div class="meta-row"><span class="meta-icon">🕐</span><span class="meta-text"><span class="meta-label">营业：</span>' + escapeHTML(slot.openingHours) + '</span></div>';
  if (slot.closedDays) html += '<div class="meta-row"><span class="meta-icon">📅</span><span class="meta-text"><span class="meta-label">休息：</span>' + escapeHTML(slot.closedDays) + '</span></div>';
  if (slot.ticketPrice) html += '<div class="meta-row"><span class="meta-icon">🎟️</span><span class="meta-text"><span class="meta-label">门票：</span>' + escapeHTML(slot.ticketPrice) + '</span></div>';
  if (slot.transport) {
    html += '<div class="meta-row"><span class="meta-icon">🚗</span><span class="meta-text"><span class="meta-label">交通：</span>'
      + escapeHTML(slot.transport.mode) + ' · ' + escapeHTML(slot.transport.fare) + ' · ' + escapeHTML(slot.transport.duration) + '</span></div>'
      + renderActionLink(slot.transport.actionLink, '导航');
  }
  if (slot.seasonal) html += '<div class="seasonal-tag">🍂 ' + escapeHTML(slot.seasonal) + '</div>';
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
  html += '<div class="hike-route-kicker">HIKE · 官方徒步段</div>';
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
  var html = '<div class="dining-section"><div class="dining-header">🍽️ 当日餐饮推荐</div>';
  diningArr.forEach(function (d) {
    html += '<div class="dining-item"><div class="dining-meal-row">'
      + '<span class="dining-meal-badge">' + escapeHTML(d.meal) + '</span>'
      + '<span class="dining-place">' + escapeHTML(d.place) + '</span>'
      + (d.soft ? '<span style="font-size:11px;color:var(--ink-soft);">·' + escapeHTML(d.soft) + '</span>' : '') + '</div>'
      + '<div class="dining-hours">⏰ ' + escapeHTML(d.hours) + '</div>';
    if (d.photo) html += '<div class="dining-photos"><img src="' + escapeHTML(d.photo) + '" alt="' + escapeHTML(d.place) + '"></div>';
    html += '<div class="dish-list">';
    (d.dishes || []).forEach(function (dish) {
      html += '<div class="dish-row">';
      if (dish.photo) html += '<img class="dish-photo" src="' + escapeHTML(dish.photo) + '" alt="' + escapeHTML(dish.name) + '">';
      html += '<span class="dish-name">• ' + escapeHTML(dish.name) + '</span><span class="dish-price">' + escapeHTML(dish.price) + '</span></div>';
    });
    html += '</div></div>';
  });
  return html + '</div>';
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
      html += '<div class="day-tips-banner">💡 ' + escapeHTML(tip) + '</div>';
    });
    if (day.alternatives && day.alternatives.length) {
      html += '<div class="day-alts"><div class="day-alts-head">🔀 当日二选一</div>';
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
  (trip.tips || []).forEach(function (tip, i) {
    html += '<div class="tip-item"><div class="tip-num">' + (i + 1) + '</div><div class="tip-text">' + escapeHTML(tip) + '</div></div>';
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
  safe(function () { initTravelMap('map', mapPoints); });
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
