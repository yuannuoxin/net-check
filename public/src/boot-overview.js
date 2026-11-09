// 出口概览页入口：加载即渲染双栈出口卡片与 Cloudflare 边缘 trace 卡片
import { renderExit } from './exit.js';
import { renderTrace } from './trace.js';

renderExit(document.getElementById('exitCard'));
renderTrace(document.getElementById('traceCard'));
