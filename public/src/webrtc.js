// WebRTC 泄露检测：多 STUN 收集 ICE 候选，分类并与出口 IP 比对
import { getExitInfo, lookupProfile } from './api.js';
import { esc } from './ui.js';

const STUN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const V4_PRIV = /^(0\.|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|198\.1[89]\.|100\.64\.|0\.0\.0\.0)/;
const V6_PRIV = /^(::1|fe80)/i;

function classify(candidate, ip) {
  if (candidate.includes('relay')) return '中继 (TURN)';
  if (candidate.includes('srflx')) return '公网 (STUN)';
  return ip.includes(':') ? '本地 IPv6' : '本地';
}

async function collectIce(timeoutMs = 6000) {
  const ips = new Map();
  let pc;
  try {
    pc = new RTCPeerConnection({ iceServers: STUN });
    pc.createDataChannel('');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await new Promise((resolve) => {
      const timer = setTimeout(() => { pc.close(); resolve(); }, timeoutMs);
      pc.onicecandidate = (e) => {
        if (!e.candidate) { clearTimeout(timer); pc.close(); resolve(); return; }
        const c = e.candidate.candidate;
        const m4 = c.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);
        if (m4 && !V4_PRIV.test(m4[0])) ips.set(m4[0], classify(c, m4[0]));
        const m6 = c.match(/([a-f0-9]{1,4}:){2,7}[a-f0-9]{1,4}/i);
        if (m6 && !V6_PRIV.test(m6[0])) ips.set(m6[0], classify(c, m6[0]));
      };
    });
  } catch { /* WebRTC 不可用 */ } finally {
    if (pc) pc.close();
  }
  return [...ips.entries()].slice(0, 5).map(([ip, type]) => ({ ip, type }));
}

export function setupWebRTC({ btn, verdict, status, table, body, exitLabel }) {
  let testing = false;
  let exitIP = '';

  // 页面加载即取出口 IP 用于对照
  getExitInfo().then((exit) => {
    exitIP = exit.ip;
    if (exitLabel) exitLabel.textContent = `当前出口 IP：${exit.ip}（${exit.country || '—'}）`;
  }).catch(() => { if (exitLabel) exitLabel.textContent = '出口 IP 获取失败'; });

  async function run() {
    if (testing) return;
    testing = true;
    btn.disabled = true;
    btn.textContent = '检测中…';
    verdict.innerHTML = '';
    body.innerHTML = '';
    table.hidden = true;
    status.textContent = '正在探测 WebRTC ICE 候选…';

    const candidates = await collectIce();

    if (candidates.length === 0) {
      status.innerHTML = '<span class="tag good">已禁用</span>';
      verdict.innerHTML = '<div class="verdict safe">✓ WebRTC 已禁用或未暴露地址，没有泄露。</div>' +
        '<div class="muted" style="margin-top:8px">代理模式下 UDP 可能无法发出，建议在 TUN 模式下复测以获得真实结果。</div>';
      testing = false;
      btn.disabled = false;
      btn.textContent = '重新检测';
      return;
    }

    status.textContent = '正在查询候选地址归属…';
    const results = [];
    for (const c of candidates) {
      let geo = null;
      try { geo = await lookupProfile(c.ip); } catch { /* 降级无归属 */ }
      const leaked = !!(exitIP && c.type.includes('公网') && c.ip !== exitIP);
      results.push({ ...c, geo, leaked });
    }

    const publicIps = [...new Set(results.filter((r) => r.type.includes('公网')).map((r) => r.ip))];
    const multiPublic = publicIps.length > 1;

    if (multiPublic) {
      verdict.innerHTML = '<div class="verdict warn">⚠ 检测到多个不同的公网出口 IP，需关注；若你自行配置了分流规则，请对照出口信息核对。</div>';
    } else {
      verdict.innerHTML = '<div class="verdict safe">✓ 未检测到 WebRTC 泄露。</div>';
    }

    table.hidden = false;
    body.innerHTML = results.map((r, i) => {
      const cc = r.geo?.countryCode || '';
      const geoStr = r.geo ? [r.geo.country, r.geo.city].filter(Boolean).join(' ') : '—';
      let state;
      if (r.type.includes('公网')) {
        state = multiPublic ? '<span class="tag warn">需关注</span>' : '<span class="tag good">正确</span>';
      } else {
        state = '<span class="tag neutral">本地</span>';
      }
      return `
        <tr>
          <td>${i + 1}</td>
          <td style="font-weight:600">${esc(r.ip)}</td>
          <td><span class="tag info">${esc(r.type)}</span></td>
          <td>${esc(geoStr)}</td>
          <td>${state}</td>
        </tr>`;
    }).join('');

    status.textContent = `已启用 · 发现 ${results.length} 个地址`;
    testing = false;
    btn.disabled = false;
    btn.textContent = '重新检测';
  }

  btn.addEventListener('click', run);
}
