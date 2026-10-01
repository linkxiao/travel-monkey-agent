---
name: changting-eval
description: Re-score Travel Monkey against docs/EVAL.md and refresh the snapshot. Use when the user asks to 复评, 评测, 打分, update EVAL, or evaluate Travel Monkey on 标准化 / 旅行专业性 / 实用性 / 稳定性 / 合理性 / 完善程度 / 用户体验 / 路径 / 景点 / 三餐 / 住宿.
---

# Travel Monkey 复评

尺子和得分只在 [docs/EVAL.md](../../../docs/EVAL.md)。本 skill 只规定怎么复评，不另定标准。

工作区在 `icode` 根目录时，源文档是 `changting-agent/docs/EVAL.md`。

## 步骤

1. 通读 `docs/EVAL.md`（怎么打分、锚点、上一份快照）。
2. 对照现码，不要凭记忆：`server/skill-prompt.mjs`、`server/viz.mjs`、`server/transport.mjs`、`server/photos.mjs`、`src/lib/trip.ts`、`src/App.tsx`、模具 `vendor/mold/scripts/gen-shudao-html.js`。
3. 先定性再给分。每项写清：已立住、缺口、实现粒度、是否合理、完善程度（能凑 / 能标 / 能写 / 能列 / 住得对）。
4. 必须覆盖：专业五维、合理性、完善程度、三类用户、四项业务（路径、景点、三餐、住宿）。住宿单独打分，不是餐饮附属。
5. 按 EVAL 算三个均值（四舍五入到 0.1）：工程标准化、用户适配、四项业务。交通默认按已填高德 Key；无 Key 时路径约 3。
6. **先改** `docs/EVAL.md` 的快照（日期、依据、表、一句话、P0 是否仍成立）。
7. 再改画布 [changting-agent-eval.canvas.tsx](/Users/linkxiao/.cursor/projects/Users-linkxiao-Desktop-develop-icode/canvases/changting-agent-eval.canvas.tsx)，与快照数字一致。不要只改画布。
8. 回复三句：阶段、分数相对上次升降、下一刀仍是哪条 P0。不要另起一套维度。
