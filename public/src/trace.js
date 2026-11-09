// Cloudflare 边缘 Trace 卡片：直连 cloudflare-ech.com/cdn-cgi/trace，解析 key=value 纯文本并展示
import { getTraceText } from './api.js';
import { esc } from './ui.js';

// trace 字段中文标签（未命中的字段按原始键名展示）
const TRACE_LABELS = {
  ip: '出口 IP',
  loc: '国家 / 地区',
  tz: '时区',
  colo: '边缘节点',
  warp: 'WARP',
  gateway: '网关',
  http: '协议',
  tls: 'TLS 版本',
  kex: '密钥交换',
  sni: 'SNI 模式',
  h: '主机',
  visit_scheme: '访问方案',
  fl: '规则 ID',
  sliver: 'Sliver',
  rbi: 'RBI',
  uag: 'User-Agent',
  ts: '时间戳',
  runid: '运行 ID',
  sm: 'SM',
  src: '源',
};

// 优先在指标网格展示的字段（按此顺序），其余收入折叠的原始响应
const PRIMARY = ['ip', 'colo', 'loc', 'http', 'tls', 'sni', 'warp', 'gateway', 'kex', 'h', 'visit_scheme'];
const MONO_KEYS = new Set(['ip', 'h']);

function parseTrace(text) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    rows.push({ k: line.slice(0, idx).trim(), v: line.slice(idx + 1).trim() });
  }
  return rows;
}

function cellHtml(k, v) {
  const label = TRACE_LABELS[k] || k;
  const mono = MONO_KEYS.has(k) ? ' mono' : '';
  return `<div class="trace-cell">
    <div class="trace-cell-k">${esc(label)}</div>
    <div class="trace-cell-v${mono}">${esc(v) || '—'}</div>
  </div>`;
}

export async function renderTrace(container) {
  if (!container) return;
  container.innerHTML = '<div class="loading">正在获取 Cloudflare 边缘 trace…</div>';

  let rows;
  try {
    const text = await getTraceText();
    rows = parseTrace(text);
  } catch (e) {
    container.innerHTML = '<div class="verdict danger">Cloudflare trace 获取失败：当前网络不可达或超时。</div>';
    return;
  }

  if (!rows.length) {
    container.innerHTML = '<div class="verdict danger">trace 响应为空。</div>';
    return;
  }

  const byKey = new Map(rows.map((r) => [r.k, r.v]));
  const primaryCells = PRIMARY.filter((k) => byKey.has(k)).map((k) => cellHtml(k, byKey.get(k)));
  const rawRows = rows.filter((r) => !PRIMARY.includes(r.k));
  const rawText = rows.map((r) => `${r.k}=${r.v}`).join('\n');

  const rawBlock = rawRows.length
    ? `<details class="trace-raw">
        <summary>原始响应（${rawRows.length} 项）</summary>
        <pre>${esc(rawText)}</pre>
      </details>`
    : '';

  container.innerHTML = `
    <div class="trace-head">
      <span class="tag info">Cloudflare</span>
      <h3>边缘 Trace</h3>
      <span class="trace-src">cloudflare-ech.com/cdn-cgi/trace</span>
    </div>
    <div class="trace-grid">${primaryCells.join('')}</div>
    ${rawBlock}`;
}
