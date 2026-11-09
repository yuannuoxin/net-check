// Vercel 入口：Vercel 把本项目识别成 Hono 后端框架项目，走 @vercel/hono 构建器。
// 构建器除了要求根目录有 index.js，还会做静态分析，要求入口文件本身 import 'hono'
// （只 import ./src/core.js 会报「No entrypoint found which imports hono」），
// 所以这里显式引入 Hono 并用它校验 createApp() 的返回值。
import { Hono } from 'hono';
import { createApp } from './src/core.js';

const app = createApp();
if (!(app instanceof Hono)) throw new TypeError('createApp() 必须返回 Hono 实例');

export default app;
