# Travel Monkey

网页版行程 Agent：左侧输入 + 选模型，右侧即时预览，支持分享、导出长图和单文件 H5。

新行程先定人格（旅居 / 带队 / 探秘），再出短计划，确认后再出页。每天强制早餐、午餐、晚餐。每个住宿片区推荐经济 / 中档 / 高端各一家（参考，不能代订）。配图先高德店图（店名对得上才用），没有再百度/维基公开检索，对不上就留空。高德补坐标、天气和点到点导航；飞猪**不能代订**。换皮用本地主题包，校验失败回退陶土模具。

1. **新行程**：先选人格，本机调研一次（高德 / 搜索）。模型先写短计划（含早/午/晚）。
2. 点 **确认出页**（或说「确认出页」）才填 trip JSON 并渲染。每天 `dining` 必须有三餐。继续打字则改计划，不重调研。
3. 本机按目的地选一套主题皮，叠在模具上。`validateAll` 失败回退陶土宣纸。
4. 有高德 Key 时，出页后补相邻点交通，并用官方 `uri.amap.com` 导航链接（不手拼飞猪预订链）。
5. **改某一天**：不重规划、不重调研、不换皮。点「换皮」只重渲染。

```bash
cd travel-monkey-agent
npm install
npm run dev
```

打开 http://127.0.0.1:5177

生产：`npm run build && npm start`（默认端口 5177，可用 `PORT` 改）。

## 目录自包含

运行时不再依赖仓库外的目录。`vendor/mold` 是 travel-plan-viz 的完整副本（出页脚本、校验、坐标、契约、调研/美学/移植说明、样例页、种子 JSON、单测），许可见 `vendor/mold/LICENSE`（Copyright 2026 zexuanw958-svg，MIT）。种子页在 `seed/shudao-zhongqiu.html`，配图在 `travel-assets/xian/`。用户粘贴的图片写入 `travel-assets/uploads/`，不进版本库。

## 密钥（都只存在本机）

- **模型 API Key**：经 `/api/chat` 转发
- **高德 Web 服务 Key**（可选）：地理编码 / POI / 天气 / 步行或公交路线；坐标转 WGS-84
- **Tavily 或 Serper Key**（可选）：航班、酒店、时令公开页摘要。没有飞猪官方预订接口，不会代下单

没有高德/搜索 Key 时仍可规划并出页，数据标「参考」。

## 模型

- **OpenRouter**：一把 Key 覆盖 Claude / GPT / Gemini / Grok / DeepSeek / Qwen / Kimi 等
- 也可直连 OpenAI、Anthropic、Gemini、xAI、DeepSeek、通义、Kimi、智谱、硅基流动
- 自定义：任何 OpenAI 兼容 `/v1`

## 导出

- **导出 H5**：下载可离线打开的单文件网页
- **导出图片**：把右侧预览打成 JPG 长图
- **分享**：系统分享 / 复制 HTML / 下载后发给同伴

## 评测与能力沉淀

尺子和当前得分见 [docs/EVAL.md](docs/EVAL.md)。改动脉络、Prompt/Skill/本机工具/第三方能力，以及它们分别服务体验、意图、对话持续、长期沉淀，见 [docs/CAPABILITY.md](docs/CAPABILITY.md)。复评用 Skill [changting-eval](.cursor/skills/changting-eval/SKILL.md)。
