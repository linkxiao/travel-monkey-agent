# 部署到腾讯云 / 阿里云（单机）

适合：**1 台 CVM + Nginx HTTPS + systemd**。不要用 Serverless，不要多实例（SQLite 与本地盘绑死单机）。

## 要求

- Node.js **≥ 22**
- 持久盘挂载项目目录（或至少 `server/.users.sqlite`、`data/shares/`、`travel-assets/uploads/`）
- 出站能访问：国内 LLM、天地图/高德、博查（及备用搜索）、SMTP

## 步骤

1. 机器上安装 Node 22，拉代码，`npm ci && npm run build`
2. 复制 `.env.example` → `.env`，至少填：
   - `LLM_*`、`SMTP_*`、`TIANDITU_KEY` 或 `AMAP_KEY`、`SEARCH_*`
   - **`PUBLIC_BASE_URL=https://你的域名`**（分享链接用；必填）
   - `TRUST_PROXY=1`（仅当前面是可信 Nginx 时打开，才会认 `X-Forwarded-*`）
   - 保持 `HOST=127.0.0.1`（或不写，默认本机）
3. 安装 systemd：参考 `deploy/travel-monkey.service`，改 `WorkingDirectory` / User
4. 安装 Nginx：参考 `deploy/nginx.conf.example`，配证书与 `server_name`
5. `systemctl enable --now travel-monkey`，`nginx -t && systemctl reload nginx`
6. 探活：`curl -sS https://你的域名/healthz` 应返回 `"ok":true`

## 备份

每日拷贝：

- `server/.users.sqlite`（及同目录 `-wal`/`-shm` 若存在）
- `data/shares/`
- `travel-assets/uploads/`（可选）

## 不要做的事

- 不要用 `npm run dev` / Vite 当公网入口
- 不要把 Node 直接 `HOST=0.0.0.0` 暴露 5177
- 未设 `PUBLIC_BASE_URL` 时勿开公网分享
- 密钥曾出现在聊天/截图里的，上线前轮换
