# Travel Monkey

网页版行程 Agent：左侧输入 + 选模型，右侧即时预览，支持分享、导出长图和单文件 H5。

新行程先定人格（旅居 / 带队 / 探秘），再出短计划，确认后再出页。每天强制早餐、午餐、晚餐。每个住宿片区推荐经济 / 中档 / 高端各一家（参考，不能代订）。配图先高德店图（店名对得上才用），没有再百度/维基公开检索，对不上就留空。高德补坐标、天气和点到点导航；飞猪**不能代订**。换皮用本地主题包，校验失败回退陶土模具。

1. **新行程**：先选人格，服务端调研一次（高德 / 搜索）。模型先写短计划（含早/午/晚）。
2. 点 **确认出页**（或说「确认出页」）才填 trip JSON 并渲染。每天 `dining` 必须有三餐。继续打字则改计划，不重调研。
3. 程序按目的地选一套主题皮，叠在模具上。`validateAll` 失败回退陶土宣纸。
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

## 密钥

两种方式都支持，用户自己填的优先：

- **服务端统一配置**：在 `.env` 填 `LLM_PROVIDER` / `LLM_MODEL` / `LLM_API_KEY`（见 `.env.example`）后，页面不再显示模型和密钥输入框，改为「模型已就绪」。服务端模型只给登录用户用，每人每天 `LLM_DAILY_LIMIT` 次（默认 10，北京时间零点重置；内部分流请求不计次）。`TIANDITU_KEY` / `AMAP_KEY`、`SEARCH_PROVIDER` / `SEARCH_KEY`（可选 `SEARCH_FALLBACK_PROVIDER` / `SEARCH_FALLBACK_KEY`，主源失败自动换备用）配了之后，页面上对应的输入项也会隐藏。`/api/config` 只返回「配没配」，不回传任何密钥。
- **用户自己填**：服务端没配，或用户点「改用自己的模型密钥」时，在页面填写，只存在浏览器本地，每次请求随 `/api/chat` 带给服务端转发，服务端不落盘。
  - **模型 API Key**
  - **地图（推荐天地图 `TIANDITU_KEY`，可选高德 `AMAP_KEY`）**：优先级 高德 > 天地图 > 本地直线估算。天地图个人可申请、国内稳定；高德能力更全但认证更麻烦
  - **联网搜索（推荐博查，或 Tavily / Serper）**：航班、酒店片区、当季活动等公开信息摘要；不会代下单

没有地图 Key 时仍可出页：程序按坐标估算距离与打车价（非实测路网）；景点坐标/酒店价仍多为模型参考。

## 模型

- **OpenRouter**：一把 Key 覆盖 Claude / GPT / Gemini / Grok / DeepSeek / Qwen / Kimi 等
- 也可直连 OpenAI、Anthropic、Gemini、xAI、DeepSeek、通义、Kimi、智谱、硅基流动
- 自定义：任何 OpenAI 兼容 `/v1`

## 导出

- **导出 H5**：下载可离线打开的单文件网页
- **导出图片**：把右侧预览打成 JPG 长图
- **分享**：系统分享 / 复制 HTML / 下载后发给同伴

## 评测与能力沉淀

尺子和当前得分见 [docs/EVAL.md](docs/EVAL.md)；上下文与多轮会话的专项标准见 [docs/MEMORY.md](docs/MEMORY.md)（记忆功能已于 10-11 下线，目的地或人数变了就新开一趟）。改动脉络、Prompt/Skill/程序工具/第三方能力，以及每项能力推动 EVAL 哪一维、是否成为资产，见 [docs/CAPABILITY.md](docs/CAPABILITY.md)。复评用 Skill [changting-eval](.cursor/skills/changting-eval/SKILL.md)。
