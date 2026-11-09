// Cloudflare Workers / Pages 入口：把 Hono 实例接到平台 fetch 事件。
import { createApp } from './core.js';

const app = createApp();

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
};
