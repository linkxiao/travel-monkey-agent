export const WELCOME_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Travel Monkey · 等待生成</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700;900&family=Bebas+Neue&display=swap" rel="stylesheet">
<style>
  :root{--ink:#1c1914;--paper:#f4efe6;--sakura:#b4532a;--moss:#1c3228}
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:
    linear-gradient(rgba(28,50,40,.04) 1px,transparent 1px),
    linear-gradient(90deg,rgba(28,50,40,.04) 1px,transparent 1px),#f4efe6;
    background-size:24px 24px;font-family:'Noto Sans SC',sans-serif;color:var(--ink);padding:32px}
  .card{max-width:420px;text-align:center}
  .eyebrow{font-size:11px;letter-spacing:.22em;color:var(--sakura);font-weight:700;margin-bottom:14px}
  h1{font-family:'Bebas Neue',sans-serif;font-size:56px;line-height:.9;letter-spacing:.04em;margin-bottom:16px}
  h1 span{color:var(--sakura)}
  p{font-size:14px;line-height:1.75;color:#5c4e3d}
  .hint{margin-top:22px;font-size:12px;color:#8a7a68}
</style>
</head>
<body>
  <div class="card">
    <div class="eyebrow">TRAVEL MONKEY</div>
    <h1>Travel <span>Monkey</span><br>行程网页</h1>
    <p>先选人格  如：旅居/带队/探秘，再描述行程 如：想去哪，玩几天。系统会给您输出行程大纲，你点击「确认生成」后系统才会生成具体的行程页（此时才消耗token）。</p>
    <p class="hint">先选人格，再说天数、节奏和想去的方向。</p>
  </div>
</body>
</html>`
