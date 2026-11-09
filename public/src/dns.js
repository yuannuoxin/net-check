// DNS 泄露检测：第三方托管权威端点采样递归解析器，与出口归属比对
import { ENDPOINTS, getExitInfo, lookupProfile } from './api.js';
import { esc } from './ui.js';

const SAMPLES = 8;

function randLabel() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(36).padStart(2, '0')).join('');
}

async function sampleResolvers(n = SAMPLES) {
  const map = new Map();
  await Promise.all(Array.from({ length: n }, async () => {
    try {
      const r = await fetch(ENDPOINTS.edns(randLabel()), {
        signal: AbortSignal.timeout(5000),
      });
      const j = await r.json();
      if (j?.dns?.ip) map.set(j.dns.ip, j.dns.geo || '');
    } catch { /* 超时/失败跳过 */ }
  }));
  return [...map].map(([ip, geo]) => ({ ip, geo }));
}

export function setupDns({ btn, verdict, status, table, body }) {
  let testing = false;

  async function run() {
    if (testing) return;
    testing = true;
    btn.disabled = true;
    btn.textContent = '检测中…';
    verdict.innerHTML = '';
    body.innerHTML = '';
    table.hidden = true;
    status.textContent = '正在采样 DNS 解析器…';

    let exit = null;
    try { exit = await getExitInfo(); } catch { /* 出口缺失仍可展示解析器 */ }

    const resolvers = await sampleResolvers();
    status.textContent = `正在查询 ${resolvers.length} 个解析器归属…`;

    const results = [];
    for (const r of resolvers) {
      let profile = null;
      try { profile = await lookupProfile(r.ip); } catch { /* 降级用 geo 字符串 */ }
      const country = profile?.country || '';
      const city = profile?.city || '';
      const isp = profile?.isp || profile?.asOrganization || '';
      const asn = profile?.asn ?? '';
      const cc = profile?.countryCode || '';
      const exitCC = (exit?.countryCode || '').toLowerCase();
      // 与出口国家不一致即判为可疑泄露（统一小写后比较）
      const leaked = !!(exitCC && cc && cc !== exitCC);
      results.push({ ip: r.ip, geo: r.geo, country, city, isp, asn, cc, leaked });
    }

    const leakedCount = results.filter((r) => r.leaked).length;

    if (results.length === 0) {
      verdict.innerHTML = '<div class="verdict safe">✓ 未检测到 DNS 解析器出口 IP，DNS 可能已加密（DoH/DoT）或被拦截。</div>';
    } else if (leakedCount > 0) {
      verdict.innerHTML = `<div class="verdict danger">⚠ 检测到 DNS 泄露：有 ${leakedCount} 个解析器归属与出口位置不一致。</div>`;
    } else {
      verdict.innerHTML = '<div class="verdict safe">✓ 未检测到 DNS 泄露。</div>';
    }

    if (results.length) {
      table.hidden = false;
      body.innerHTML = results.map((r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td style="font-weight:600">${esc(r.ip)}</td>
          <td>${esc([r.country, r.city].filter(Boolean).join(' / ') || r.geo || '—')}</td>
          <td>${esc([r.isp, r.asn].filter(Boolean).join(' · ') || '—')}</td>
          <td>${r.leaked ? '<span class="tag bad">泄露</span>' : '<span class="tag good">正确</span>'}</td>
        </tr>`).join('');
    }

    status.innerHTML = exit
      ? `出口 IP：<strong>${esc(exit.ip)}</strong>（${esc(exit.country || '—')}）· 共检测到 ${results.length} 个解析器`
      : `共检测到 ${results.length} 个解析器`;

    testing = false;
    btn.disabled = false;
    btn.textContent = '开始检测';
  }

  btn.addEventListener('click', run);
}
