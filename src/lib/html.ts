export function extractHtml(text: string): string | null {
  const fenced = text.match(/```html\s*([\s\S]*?)```/i)
  if (fenced && /<!DOCTYPE html/i.test(fenced[1])) return fenced[1].trim()

  const start = text.search(/<!DOCTYPE html/i)
  if (start < 0) return null
  const end = text.toLowerCase().lastIndexOf('</html>')
  if (end < start) return text.slice(start).trim()
  return text.slice(start, end + 7).trim()
}

export function pageTitle(html: string): string {
  const m = html.match(/<title>([^<]+)<\/title>/i)
  return (m && m[1].trim()) || 'Travel Monkey 行程'
}

const MOBILE_CHECKLIST_FIX = `<style data-tm-mobile-checklist="1">
@media(max-width:720px){
  .todo-item{
    grid-template-columns:20px minmax(0,1fr)!important;
    grid-template-areas:"check deadline" "check text"!important;
    align-items:start!important;
    column-gap:12px!important;
    row-gap:7px!important;
    padding:16px 0!important;
  }
  .todo-item input[type="checkbox"]{
    grid-area:check!important;
    margin-top:2px!important;
  }
  .todo-deadline{
    grid-area:deadline!important;
    justify-self:start!important;
    display:inline-flex!important;
    align-items:center!important;
    min-height:22px;
    padding:2px 8px!important;
    border:1px solid rgba(255,255,255,.16);
    border-radius:999px;
    background:rgba(255,255,255,.07);
    white-space:nowrap!important;
    line-height:1.3!important;
  }
  .todo-text{
    grid-area:text!important;
    min-width:0!important;
    line-height:1.7!important;
    overflow-wrap:break-word!important;
    word-break:normal!important;
  }
}
</style>`

const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const ESRI_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'

// 已生成的页面把 OSM 写死在脚本里。这条网络访问 OSM 会 TLS 失败，地图区域一片空白并刷满报错。
function stabilizeMapTiles(html: string) {
  if (!html.includes(OSM_TILES) || html.includes('arcgisonline.com')) return html
  return html.replaceAll(OSM_TILES, ESRI_TILES)
}

export function repairMobileChecklist(html: string): string {
  html = stabilizeMapTiles(html)
  if (!html.includes('todo-item') || html.includes('data-tm-mobile-checklist=')) return html
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${MOBILE_CHECKLIST_FIX}\n</head>`)
  return `${MOBILE_CHECKLIST_FIX}\n${html}`
}

export function downloadText(filename: string, content: string, type = 'text/html;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function safeFilename(title: string) {
  return title.replace(/[\\/:*?"<>|]+/g, '').slice(0, 40) || 'travel-monkey-trip'
}
