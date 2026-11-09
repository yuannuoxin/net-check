// Hono 应用骨架：与 cert-issuer 同一套组织方式。
// - createApp() 返回 Hono 实例，供 Workers/Pages、本地 Node、Vercel 三端入口复用；
// - 本服务只做页面 / 静态脚本 / 样式分发和一个健康检查，不转发任何第三方检测接口，
//   出口、连通性、DNS、WebRTC、验证码仍全部由浏览器直连第三方公开服务。
import { Hono } from 'hono';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// 对外可分发的 /src 白名单。服务端模块 core.js / worker.js 不在其中，不会被静态路由暴露。
const PUBLIC_SRC = new Set([
  'boot-overview.js',
  'boot-connectivity.js',
  'boot-dns.js',
  'boot-webrtc.js',
  'boot-captcha.js',
  'exit.js',
  'trace.js',
  'api.js',
  'connectivity.js',
  'sites.js',
  'dns.js',
  'webrtc.js',
  'captcha.js',
  'ui.js',
  'style.css',
]);

// 常规多页面（MPA）：路径 → 对应 HTML，服务端直出，便于搜索引擎逐页收录
const PAGES = {
  connectivity: 'connectivity.html',
  dns: 'dns.html',
  webrtc: 'webrtc.html',
  captcha: 'captcha.html',
};

const NO_STORE = { 'cache-control': 'no-store' };
const NO_CACHE = { 'cache-control': 'no-cache' };

function detectRuntime(c) {
  const h = c.req.header();
  if (h['x-vercel-id']) return 'vercel';
  if (c.env && c.env.CF_PAGES) return 'cloudflare-pages';
  if (h['cf-ray']) return 'cloudflare-workers';
  if (c.env && c.env.ASSETS) return 'cloudflare-workers';
  return 'node';
}

// 本地 Node / Vercel 运行时按路径读盘（静态文件在 public/）。node:fs / node:path / node:url
// 惰性动态导入，保证 Workers 打包时不把 Node 内置模块强制编进 Worker 产物；Workers 分支走 ASSETS 兜底。
async function readLocal(relPath) {
  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const url = await import('node:url');
    const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', 'public');
    const abs = path.normalize(path.join(root, relPath));
    if (abs !== root && !abs.startsWith(root + path.sep)) return null;
    const body = await fs.readFile(abs);
    return {
      body,
      type: MIME[path.extname(abs)] || 'application/octet-stream',
    };
  } catch {
    return null;
  }
}

// 静态资源解析：先本地读盘，读不到且平台挂了静态资源绑定（Workers/Pages ASSETS）就转发兜底。
async function serveStatic(c, relPath) {
  const local = await readLocal(relPath);
  if (local) {
    return c.body(local.body, 200, { 'content-type': local.type, ...NO_CACHE });
  }
  if (c.env && c.env.ASSETS) {
    const res = await c.env.ASSETS.fetch(c.req.raw);
    if (res && res.status !== 404) return res;
  }
  return c.text('Not Found', 404);
}

export function createApp() {
  const app = new Hono();

  // 首页（/ 与 /index.html 等价，兼容直连与静态托管回退）
  const serveIndex = (c) => serveStatic(c, 'index.html');
  app.get('/', serveIndex);
  app.get('/index.html', serveIndex);

  // 前端 ES 模块与样式（白名单内）
  app.get('/src/:file', (c) => {
    const name = c.req.param('file');
    if (!PUBLIC_SRC.has(name)) return c.text('Not Found', 404);
    return serveStatic(c, `src/${name}`);
  });

  // 没有站点图标：直接 204，避免浏览器反复请求 /favicon.ico 落 404 噪音
  app.get('/favicon.ico', (c) => c.body(null, 204));

  app.get('/api/health', (c) =>
    c.json({ ok: true, runtime: detectRuntime(c) }, 200, NO_STORE)
  );

  app.all('/api/*', (c) => c.json({ error: 'not found' }, 404, NO_STORE));

  // 常规多页面：已知路径直出对应 HTML；兼容 /xxx.html 物理文件名直连；未知路径 404，不回退首页。
  app.get('/:page', (c) => {
    const page = c.req.param('page').replace(/\.html$/, '');
    const html = PAGES[page];
    if (!html) return c.text('Not Found', 404);
    return serveStatic(c, html);
  });

  return app;
}
