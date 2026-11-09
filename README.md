# Net Check · 网络自检工具箱

网络诊断多页面工具（MPA），参考 [ip.net.coffee](https://ip.net.coffee/) 与 [iptest.us](https://iptest.us/) 的能力实现。每个检测项独立 HTML 与独立 URL，便于搜索引擎逐页收录。骨架与 cert-issuer 同一套 Hono 组织方式：**Hono 做壳，前端原生 ES Module 直连第三方公开接口**；后端只负责返回页面、静态脚本 / 样式和一个健康检查接口，**不转发任何检测请求、不存结果**。

## 功能

- **出口概览**：IPv4 / IPv6 双栈出口并列展示，分别给出归属地、城市、ASN / 组织、ISP、线路类型与风险标记，并标注浏览器默认优先使用的协议栈；另附 Cloudflare 边缘 Trace 卡片，解析 `cdn-cgi/trace` 响应，展示命中边缘节点、协议、TLS 版本、SNI、WARP 等字段。
- **连通性 / 分流测试**：按中国 / 日本 / 美国 / 全球分组，浏览器本地对各站点发起轻量请求并测往返延迟，8 轮取中位数，分组汇总可达数与平均延迟，支持整组刷新；进入该页即启动探测。站点图标由 favicon 聚合代理加载，加载失败自动隐藏、退化为纯文字。
- **DNS 泄露检测**：批量解析随机子域，采集当前递归 DNS 解析器及其归属，与出口位置比对判定泄露。
- **WebRTC 泄露检测**：多 STUN 收集 ICE 候选，区分公网(STUN) / 中继(TURN) / 本地，与出口 IP 比对，多公网出口预警。
- **人机验证展示**：Cloudflare Turnstile（托管 / 隐形 / 非交互）与 Google reCAPTCHA（v3 打分 / v2 复选框 / v2 隐形）各模式 widget 占位展示。

## 技术栈

- 前端：原生 ES Module（`<script type="module">`），无 React/Vue、无打包步骤，模块文件在 `public/src/`。
- 后端骨架：[Hono](https://hono.dev)，`createApp()` 路由工厂，同一份应用分别挂到本地 Node、Cloudflare Workers/Pages、Vercel。
- 本地运行时：`@hono/node-server`。
- 后端不做第三方接口代理；所有探测、归属查询、验证码 SDK 都由浏览器直连公开服务。

## 目录结构

```
net-check/
├── dev.js                  # 本地入口（@hono/node-server），刻意避开 index.js 这个 Vercel 专用名
├── index.js                # Vercel 入口：导出 Hono 实例
├── wrangler.toml           # Cloudflare Workers 配置（main=src/worker.js，assets 绑定 public/）
├── vercel.json
├── public/                 # 前端静态资源目录（也是 Workers/Pages 的静态资产目录）
│   ├── index.html          # 出口概览页（/）
│   ├── connectivity.html   # 连通性 / 分流测试页（/connectivity）
│   ├── dns.html            # DNS 泄露检测页（/dns）
│   ├── webrtc.html         # WebRTC 泄露检测页（/webrtc）
│   ├── captcha.html        # 人机验证展示页（/captcha）
│   └── src/
│       ├── boot-overview.js     # 概览页入口：渲染双栈出口卡片
│       ├── boot-connectivity.js # 连通性页入口：进入即启动探测
│       ├── boot-dns.js         # DNS 页入口
│       ├── boot-webrtc.js      # WebRTC 页入口
│       ├── boot-captcha.js      # 验证码页入口：进入才加载 SDK
│       ├── style.css       # 全局样式
│       ├── api.js          # 第三方接口封装（出口 / lookup / edns）
│       ├── ui.js           # DOM 与数值工具
│       ├── exit.js         # 出口 IP / 归属 / 风险画像
│       ├── trace.js        # Cloudflare 边缘 Trace 卡片解析与渲染
│       ├── sites.js        # 连通性站点清单与分组
│       ├── connectivity.js # 连通性探测引擎
│       ├── dns.js          # DNS 泄露检测
│       ├── webrtc.js       # WebRTC 泄露检测
│       └── captcha.js      # 验证码展示
└── src/                    # 服务端 Hono 模块（静态路由白名单之外，不对外暴露）
    ├── core.js             # createApp()：页面 / 静态资源 / health 路由
    └── worker.js           # Cloudflare Workers/Pages 入口（export default { fetch }）
```

## 路由与页面加载

- 常规多页面（MPA），导航是普通 `<a href>` 整页跳转，无前端路由、无 `pushState`/hash 片段：
  - `/`（`index.html`）出口概览
  - `/connectivity`（`connectivity.html`）连通性 / 分流测试
  - `/dns`（`dns.html`）DNS 泄露检测
  - `/webrtc`（`webrtc.html`）WebRTC 泄露检测
  - `/captcha`（`captcha.html`）人机验证展示
- 每页独立 `<title>`、`<meta description>` 与 `canonical`，只引入本页需要的入口模块（`boot-*.js`）与共享工具 / 引擎模块。
- 服务端路由：`GET /` 与 `GET /index.html` 返回概览页；`GET /:page` 按白名单直出对应 HTML，未知单段路径 404（不回退首页）；`GET /src/:file` 按白名单返回前端模块与样式；`GET /favicon.ico` 直接 204；`GET /api/health` 返回 `{ ok, runtime }`；其余 `/api/*` 404。
- 页面级按需加载：连通性进入该页即启动探测；DNS / WebRTC 进入该页才绑定检测；验证码的 Turnstile / reCAPTCHA SDK 仅在进入验证码页时才加载，其他页面不发起第三方校验脚本请求。

## 本地运行

```bash
npm install
npm run dev          # http://localhost:8090/
# 或指定端口
PORT=3000 npm run dev
```

健康检查：

```bash
curl http://localhost:8090/api/health
# {"ok":true,"runtime":"node"}
```

## 部署

### Cloudflare Workers

```bash
npm run dry:cf       # 只打包不发布，产物在 .wrangler-out/
npm run deploy:cf    # 需先 wrangler login，并在 wrangler.toml 里改 name
```

`wrangler.toml` 把 `main` 指向 `src/worker.js`（`export default { fetch }`），并通过 `[assets] directory="./public"` 绑定前端静态资源。Workers 没有文件系统：`core.js` 读盘失败时走 `c.env.ASSETS` 静态绑定兜底返回。

### Cloudflare Pages

```bash
npm run deploy:pages    # wrangler pages deploy public --project-name net-check
```

静态页面与脚本由 `public/` 直接托管；纯静态 Pages 下 `/api/health` 不可用，但前端各检测功能不依赖该接口。注意：纯静态托管不会跑 `core.js`，无后缀路径（如 `/connectivity`、`/dns`）不会自动映射到同名 `.html`，需要在 Pages 配置 rewrite 规则把各路径重写到对应 HTML（`/connectivity` → `/connectivity.html`，依此类推），否则直达 / 刷新子路径会 404；走上面的 Workers 入口则由 `core.js` 直出对应页面。

### Vercel

```bash
npm run deploy:vercel    # 或直接连接 Git 仓库
```

Vercel 把 `hono` 依赖 + `type: module` 的项目识别为 Hono 后端框架项目，找根目录 `index.js` 作为入口。`index.js` 里那句 `import { Hono } from 'hono'` 不能省——构建器靠它确认入口确实使用了 Hono；只在 `src/core.js` 里引入会报 `No entrypoint found which imports hono`。

## 数据源（均为公开接口，已实测 CORS 开放）

| 用途 | 端点 |
| --- | --- |
| 分栈出口 IPv4（强制 v4） | `https://ipv4.icanhazip.com/` |
| 分栈出口 IPv6（强制 v6） | `https://ipv6.icanhazip.com/` |
| 默认优先栈出口 IP | `https://api64.ipify.org?format=json` |
| 出口 IP 自探测 + 基础归属（备用） | `https://ipwho.is/` |
| 出口 IP 备用 | `https://1.1.1.1/cdn-cgi/trace` |
| Cloudflare 边缘 Trace | `https://cloudflare-ech.com/cdn-cgi/trace` |
| IP 归属 / ASN / 风险画像 | `https://ip.net.coffee/api/ip/lookup/<ip>` |
| DNS 递归解析器采样 | `https://<随机标签>.edns.ip-api.com/json` |
| 连通性站点图标（favicon 代理） | `https://icons.duckduckgo.com/ip3/<host>.ico` |

## 验证码说明

- 前端只持有公开 `sitekey` 渲染 widget 并获取响应 `token`；本页 `sitekey` 取自 mtd-tt 项目线上配置，仅作公开站点密钥使用。
- `secret` 私有密钥与 `siteverify` 校验必须由后端完成，**不得下发到浏览器**；本仓库验证码页仅做接入占位与模式展示，不做令牌校验。
- reCAPTCHA v3 的风险评分 `score`（0.0–1.0）不在前端 `execute` 响应里，只由后端 `siteverify` 返回；前端仅拿到令牌，页面评分行标注"需后端校验"，不展示编造分数。
- 真实 `sitekey` 在厂商后台绑定了对应域名，在其他域名（含 localhost）渲染时可能提示域名未授权；生产环境可替换为自己申请的站点密钥。

## 已知局限

- 连通性测的是 HTTP 层往返（含 DNS + TCP + TLS + 首字节），不是 ICMP ping；拿不到丢包率、traceroute、端口状态。
- `no-cors` 请求读不到响应状态码，TCP/TLS 连通即判可达，403/404 也会算通。
- DNS 采样依赖第三方权威端点，对方限流 / 不可用时该模块无结果；浏览器启用 DoH 时看到的是 DoH 提供商地址。
- 现代浏览器会用 mDNS 掩码 host 候选，WebRTC 正则通常只能取到 srflx 公网候选；代理模式下 UDP 发不出去可能显示"无泄露"的假象，建议在 TUN 模式复测。
- Turnstile / reCAPTCHA 的 SDK 服务器在境外，国内网络可能加载失败，代码已做失败兜底提示。
