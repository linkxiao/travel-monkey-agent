#!/usr/bin/env node
// 用法：node star-history-chart.js <starred_at.txt> <输出.svg> <owner/repo>
// 从 stargazer 时间戳（每行一个 ISO 时间）绘制星标累计增长图。
// 手绘(xkcd)风格，贴近 star-history.com 原版（其底层为 chart.xkcd）：
// feTurbulence+feDisplacementMap 线条抖动、手写字体栈、同款 #dd4528 红。
// GitHub 自 2026-06-30 起将 starred_at 数据限制为仓库管理员/协作者可读，
// star-history.com 的 README 热链因此失效，故由本仓库 Action 自绘自托管。
const fs = require('fs');

const [, , inputPath, outputPath, REPO] = process.argv;
if (!inputPath || !outputPath || !REPO) {
  console.error('usage: star-history-chart.js <starred_at.txt> <out.svg> <owner/repo>');
  process.exit(1);
}

const stamps = fs.readFileSync(inputPath, 'utf8')
  .trim().split('\n').map(s => new Date(s.trim()).getTime())
  .filter(t => !Number.isNaN(t)).sort((a, b) => a - b);
if (!stamps.length) {
  console.error('no valid timestamps');
  process.exit(1);
}

const RED = '#dd4528';
const INK = '#2d2d2d';
const W = 800, H = 533;
const PAD = { left: 90, right: 45, top: 75, bottom: 70 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

const t0 = stamps[0];
const t1 = Date.now();
const total = stamps.length;

// 自适应 y 轴步长：最多 ~6 档
const steps = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
const yStep = steps.find(s => total / s <= 6) || steps[steps.length - 1];
const yMax = Math.max(yStep, Math.ceil(total / yStep) * yStep);

const x = t => PAD.left + ((t - t0) / (t1 - t0)) * plotW;
const y = n => PAD.top + plotH - (n / yMax) * plotH;

// 累计折线：每个 star 事件一个点，末尾延伸到今天
const pts = stamps.map((t, i) => [x(t), y(i + 1)]);
pts.push([x(t1), y(total)]);
const polyline = pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

// 稀疏圆点标记（约 12 个）
const dotStep = Math.max(1, Math.floor(total / 12));
const dots = [];
for (let i = 0; i < total; i += dotStep) {
  dots.push(`<circle cx="${x(stamps[i]).toFixed(1)}" cy="${y(i + 1).toFixed(1)}" r="4.5" fill="${RED}" stroke="#fff" stroke-width="1.5"/>`);
}
dots.push(`<circle cx="${x(t1).toFixed(1)}" cy="${y(total).toFixed(1)}" r="4.5" fill="${RED}" stroke="#fff" stroke-width="1.5"/>`);

// X 轴刻度：6 个等距时间点；跨度近一年以上时带年份
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longSpan = t1 - t0 > 330 * 24 * 3600 * 1000;
const fmt = t => {
  const d = new Date(t);
  return longSpan
    ? `${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`
    : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const xticks = [];
for (let i = 0; i <= 5; i++) {
  const t = t0 + ((t1 - t0) * i) / 5;
  const anchor = i === 5 ? 'end' : 'middle'; // 末位右对齐，防止贴边裁切
  const tx = i === 5 ? x(t) + 8 : x(t);
  xticks.push(`<line x1="${x(t).toFixed(1)}" y1="${PAD.top + plotH}" x2="${x(t).toFixed(1)}" y2="${PAD.top + plotH + 7}" stroke="${INK}" stroke-width="1.5"/>
    <text x="${tx.toFixed(1)}" y="${PAD.top + plotH + 28}" text-anchor="${anchor}" class="tick">${fmt(t)}</text>`);
}

// Y 轴刻度（手绘风不画网格线，只留刻度）
const yticks = [];
for (let n = 0; n <= yMax; n += yStep) {
  yticks.push(`<line x1="${PAD.left - 7}" y1="${y(n).toFixed(1)}" x2="${PAD.left}" y2="${y(n).toFixed(1)}" stroke="${INK}" stroke-width="1.5"/>
    <text x="${PAD.left - 14}" y="${(y(n) + 5).toFixed(1)}" text-anchor="end" class="tick">${n}</text>`);
}

const today = new Date(t1).toISOString().slice(0, 10);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="xkcdify" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="1" seed="7" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs>
  <style>
    text { font-family: "xkcd Script", "Humor Sans", "Comic Sans MS", "Chalkboard SE", Chalkboard, "Comic Neue", cursive; fill: ${INK}; }
    .tick { font-size: 15px; }
    .legend { font-size: 17px; }
    .axis-label { font-size: 16px; }
    .footnote { font-size: 12px; fill: #8c959f; font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
  </style>
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <g filter="url(#xkcdify)">
    <line x1="${PAD.left}" y1="${PAD.top + plotH}" x2="${PAD.left + plotW}" y2="${PAD.top + plotH}" stroke="${INK}" stroke-width="2"/>
    <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + plotH}" stroke="${INK}" stroke-width="2"/>
    ${xticks.join('\n    ')}
    ${yticks.join('\n    ')}
  </g>
  <g filter="url(#xkcdify)">
    <polyline points="${polyline}" fill="none" stroke="${RED}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots.join('\n    ')}
  </g>
  <circle cx="${PAD.left + 10}" cy="${PAD.top - 28}" r="5.5" fill="${RED}"/>
  <text x="${PAD.left + 24}" y="${PAD.top - 22}" class="legend">${REPO}</text>
  <text x="${PAD.left + plotW}" y="${PAD.top - 22}" text-anchor="end" class="legend">★ ${total}</text>
  <text x="24" y="${H / 2}" text-anchor="middle" transform="rotate(-90 24 ${H / 2})" class="axis-label">GitHub Stars</text>
  <text x="${PAD.left + plotW}" y="${H - 14}" text-anchor="end" class="footnote">data: GitHub API · ${today}</text>
</svg>
`;

fs.writeFileSync(outputPath, svg);
console.log(`OK: ${total} stars → ${outputPath} (yMax=${yMax}, step=${yStep})`);
