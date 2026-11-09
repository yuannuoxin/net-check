// 本地开发入口。刻意叫 dev.js：根目录的 index.js 专门留给 Vercel
//（Hono 框架项目要求 index.* / app.* / server.* 之一作为入口），本地跑 dev.js 不跟它抢名字。
import { serve } from '@hono/node-server';
import { createApp } from './src/core.js';

const app = createApp();
const port = Number(process.env.PORT || 8090);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`net-check dev server: http://localhost:${info.port}/`);
});
