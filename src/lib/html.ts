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
